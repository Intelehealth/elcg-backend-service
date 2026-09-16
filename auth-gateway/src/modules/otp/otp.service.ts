import crypto from 'node:crypto';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/utils/logger';
import * as authRepository from '@/modules/auth/auth.repository';
import type { AccountContact } from '@/modules/auth/auth.repository';
import * as userSettingsRepository from '@/modules/otp/user-settings.repository';
import { selectProvider, SmsProviderError } from '@/modules/otp/providers';
import { sendOtpEmail, sendUsernameEmail, EmailProviderError } from '@/modules/otp/email';
import { signPasswordResetToken, verifyPasswordResetToken } from '@/modules/jwt/jwt.service';
import type { RequestOtpRequest, VerifyOtpRequest, VerifyOtpResponse } from '@/modules/auth/auth.dto';

/** `user_settings.otpFor` — matches the legacy ENUM('U','P','A') exactly. 'A' (login step-up) is not implemented here. */
const OTP_FOR_USERNAME_RECOVERY = 'U';
const OTP_FOR_PASSWORD_RESET = 'P';

function generateCode(length: number): string {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

/**
 * Sends `localCode` by SMS, routed by country code (see providers/index.ts),
 * returning whatever code was actually sent — 2Factor's AUTOGEN2 (India)
 * substitutes its own, vendor-generated one; persist/reuse THIS value, not
 * `localCode`. Real data has inconsistent countryCode formatting ("91" vs
 * "+91" — verified directly against the DB), normalized here so the
 * destination is never double-prefixed.
 */
async function sendSms(phoneNumber: string, countryCode: string, localCode: string): Promise<string> {
  const cc = countryCode.replace(/^\+/, '');
  const provider = selectProvider(cc);
  const expiryMinutes = Math.max(1, Math.round(env.OTP_EXPIRY_SECONDS / 60));
  return provider.send(`+${cc}${phoneNumber}`, localCode, expiryMinutes);
}

function logDeliveryFailure(channel: 'sms' | 'email', err: unknown, userUuid: string): void {
  const providerName =
    err instanceof SmsProviderError ? err.provider : err instanceof EmailProviderError ? 'email' : 'unknown';
  logger.error({ err, userUuid, channel, provider: providerName }, `requestOtp: ${channel} delivery failed`);
}

/**
 * Resolves the account for either endpoint, per `otp/README.md`'s request
 * contract: `username` (only meaningful for `otpFor/verifyFor: 'password'`)
 * takes priority when given, matching legacy's own `if (username) {...} else
 * if (phoneNumber || email) {...}` branch; otherwise falls back to the
 * combined phone-or-email lookup `otpFor: 'username'` always uses (it has no
 * username to look up by in the first place).
 */
async function findAccount(input: RequestOtpRequest | VerifyOtpRequest): Promise<AccountContact | null> {
  if (input.username) return authRepository.findAccountByUsername(input.username);
  const contact = input.phoneNumber ?? input.email;
  // Unreachable in practice — RequestOtpSchema/VerifyOtpSchema's `.refine`
  // already requires one of phoneNumber/email/username.
  if (!contact) return null;
  return authRepository.findAccountByContact(contact);
}

/**
 * `otpFor: 'username'` — sends via whichever channel the client actually
 * supplied (a phoneNumber request texts it, an email request emails it),
 * matching legacy's own per-row `attributeTypeName` branch (which in
 * practice tracks the field the client sent, since a single value only ever
 * matches the attribute type it belongs to).
 */
async function requestUsernameRecoveryOtp(account: AccountContact, input: RequestOtpRequest): Promise<void> {
  const localCode = generateCode(env.OTP_LENGTH);
  const userUuid = account.user.uuid;

  if (input.phoneNumber) {
    if (!account.phoneNumber || !account.countryCode) {
      logger.warn({ userUuid }, 'requestOtp(username): no phone on file for account');
      return;
    }
    try {
      const sentCode = await sendSms(account.phoneNumber, account.countryCode, localCode);
      await userSettingsRepository.saveOtp(userUuid, sentCode, OTP_FOR_USERNAME_RECOVERY);
    } catch (err) {
      logDeliveryFailure('sms', err, userUuid);
    }
    return;
  }

  if (input.email) {
    if (!account.email) {
      logger.warn({ userUuid }, 'requestOtp(username): no email on file for account');
      return;
    }
    try {
      await sendOtpEmail(account.email, localCode, 'forgot username');
      await userSettingsRepository.saveOtp(userUuid, localCode, OTP_FOR_USERNAME_RECOVERY);
    } catch (err) {
      logDeliveryFailure('email', err, userUuid);
    }
  }
}

/**
 * `otpFor: 'password'` — sends to BOTH phone and email when both are on
 * file (the same code, matching legacy's reuse of the SMS-returned/generated
 * value for the email too), or to email alone with a freshly generated code
 * when there's no phone on file. Matches legacy's exact `if (phoneNumber &&
 * countryCode) {…if (email) {…}} else if (email) {…}` structure.
 *
 * Deliberate deviation from legacy: a failed email send after a *successful*
 * SMS send is logged, not thrown — legacy's own `.catch(error => { throw
 * error })` there would surface as an overall `resolves: false` even though
 * the SMS OTP was already sent and saved, discarding a real success over an
 * unrelated channel's failure. It would also break this service's own
 * already-established "no signal leaks whether an account matched" design
 * (see the module doc below) by making resolution depend on ambient email
 * infra health. Every channel here is independent best-effort; the OTP that
 * was actually, successfully sent is always what gets persisted/usable.
 */
async function requestPasswordResetOtp(account: AccountContact): Promise<void> {
  const localCode = generateCode(env.OTP_LENGTH);
  const userUuid = account.user.uuid;

  if (account.phoneNumber && account.countryCode) {
    try {
      const sentCode = await sendSms(account.phoneNumber, account.countryCode, localCode);
      await userSettingsRepository.saveOtp(userUuid, sentCode, OTP_FOR_PASSWORD_RESET);
      if (account.email) {
        try {
          await sendOtpEmail(account.email, sentCode, 'forgot password');
        } catch (err) {
          logDeliveryFailure('email', err, userUuid);
        }
      }
    } catch (err) {
      logDeliveryFailure('sms', err, userUuid);
    }
    return;
  }

  if (account.email) {
    try {
      await sendOtpEmail(account.email, localCode, 'forgot password');
      await userSettingsRepository.saveOtp(userUuid, localCode, OTP_FOR_PASSWORD_RESET);
    } catch (err) {
      logDeliveryFailure('email', err, userUuid);
    }
    return;
  }

  logger.warn({ userUuid }, 'requestOtp(password): no phone or email on file for account');
}

/**
 * EZ-933 — requests an OTP for either `otpFor: 'username'` (forgot-username)
 * or `otpFor: 'password'` (password reset) — see `otp/README.md`.
 *
 * The response is identical regardless of what happens here — no account
 * match, no contact info on file, or a fully successful send all resolve the
 * same way — no signal an attacker could use to enumerate accounts (a
 * deliberate strengthening over legacy, whose messages do differ per case).
 */
export async function requestOtp(input: RequestOtpRequest): Promise<void> {
  const account = await findAccount(input);
  if (!account) {
    logger.warn({ otpFor: input.otpFor }, 'requestOtp: no account matched');
    return;
  }

  if (input.otpFor === 'username') {
    await requestUsernameRecoveryOtp(account, input);
  } else {
    await requestPasswordResetOtp(account);
  }
}

const INVALID_OTP = (): HttpError => new HttpError(401, 'INVALID_OTP', 'Invalid or expired code');

/**
 * EZ-934 — verifies an OTP for either purpose.
 *
 * `verifyFor: 'password'` hands back the account's `userUuid` plus a
 * short-lived token for the follow-up `POST /auth/resetPassword/:userUuid`
 * call — necessary since the client never had a username to begin with;
 * legacy's own verify response includes it for the same reason.
 *
 * `verifyFor: 'username'` has no follow-up call: on success the username is
 * emailed directly (see `sendUsernameEmail`), never returned in the
 * response — matching legacy's own delivery-not-response design. Legacy's
 * phone-delivery branch for this is never actually reproduced here: it's a
 * commented-out, unfinished 2Factor transactional-SMS call in the source
 * this was ported from, so only the email delivery legacy actually ships is
 * implemented — this is legacy's real, current behavior, not a scope cut.
 *
 * Legacy checks expiry (`updatedAt` within 1 minute) but never clears the OTP
 * row on success, so the same code can be replayed for the rest of that
 * window. Clearing it here on a successful verify is a deliberate improvement,
 * not a legacy behavior being mirrored.
 */
export async function verifyOtp(input: VerifyOtpRequest): Promise<VerifyOtpResponse> {
  const account = await findAccount(input);
  if (!account) throw INVALID_OTP();
  const userUuid = account.user.uuid;

  const purpose = input.verifyFor === 'username' ? OTP_FOR_USERNAME_RECOVERY : OTP_FOR_PASSWORD_RESET;
  const row = await userSettingsRepository.findOtp(userUuid, input.otp, purpose);
  if (!row) throw INVALID_OTP();

  const ageMs = Date.now() - row.updatedAt.getTime();
  if (ageMs >= env.OTP_EXPIRY_SECONDS * 1000) {
    throw new HttpError(401, 'OTP_EXPIRED', 'Code has expired — request a new one');
  }

  await userSettingsRepository.clearOtp(userUuid);

  if (input.verifyFor === 'username') {
    if (account.email) {
      await sendUsernameEmail(account.email, account.user.username ?? account.user.systemId).catch((err) =>
        logger.error({ err, userUuid }, 'verifyOtp(username): failed to email the recovered username'),
      );
    }
    return { verified: true };
  }

  const resetToken = signPasswordResetToken(userUuid);
  return {
    verified: true,
    userUuid,
    resetToken: resetToken.token,
    expiresIn: resetToken.expiresIn,
  };
}

/**
 * EZ-939 — updates the password through OpenMRS's own REST API (Basic Auth,
 * admin credentials), same as legacy — password hashing/history rules live in
 * OpenMRS, not here. Gated on `resetToken` (minted only by a successful
 * verifyOtp) rather than legacy's check, which only confirms *some* OTP row
 * exists for this user with `otpFor: 'P'` — not that it was ever correctly
 * verified, or still unexpired. That gap is not reproduced here.
 */
export async function resetPassword(
  userUuid: string,
  newPassword: string,
  resetToken: string,
): Promise<void> {
  const claims = verifyPasswordResetToken(resetToken);
  if (claims.sub !== userUuid) {
    throw new HttpError(401, 'INVALID_RESET_TOKEN', 'Reset token does not match this account');
  }

  if (!env.OPENMRS_REST_BASE_URL || !env.OPENMRS_ADMIN_USERNAME || !env.OPENMRS_ADMIN_PASSWORD) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'Password reset is not configured');
  }

  const auth = Buffer.from(`${env.OPENMRS_ADMIN_USERNAME}:${env.OPENMRS_ADMIN_PASSWORD}`).toString(
    'base64',
  );
  const res = await fetch(`${env.OPENMRS_REST_BASE_URL}/openmrs/ws/rest/v1/password/${userUuid}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    logger.error({ status: res.status, detail, userUuid }, 'resetPassword: OpenMRS update failed');
    throw new HttpError(502, 'OPENMRS_ERROR', 'Failed to update password');
  }
}
