import crypto from 'node:crypto';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/utils/logger';
import * as authRepository from '@/modules/auth/auth.repository';
import * as userSettingsRepository from '@/modules/otp/user-settings.repository';
import { selectProvider, SmsProviderError } from '@/modules/otp/providers';
import { signPasswordResetToken, verifyPasswordResetToken } from '@/modules/jwt/jwt.service';
import type { RequestOtpRequest, VerifyOtpRequest, VerifyOtpResponse } from '@/modules/auth/auth.dto';

/** `user_settings.otpFor` — matches the legacy ENUM('U','P','A') exactly. Only 'P' is wired up here. */
const OTP_FOR_PASSWORD_RESET = 'P';

function generateCode(length: number): string {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

/**
 * EZ-933 — sends a password-reset OTP.
 *
 * The account is identified by `phoneNumber` (the real client has no
 * username/email at this point — see `otp/README.md`), matching legacy's
 * phone-based lookup exactly (`provider_attribute` where `phoneNumber` matches
 * the given value). The code is sent to whatever phone/country code are
 * actually on file for that account, not the request's own `countryCode` —
 * legacy re-derives both from the DB the same way. The response is identical
 * whether the phone doesn't match any account, the account has no phone on
 * file, or the code was sent successfully — no signal an attacker could use to
 * enumerate accounts (a deliberate strengthening; legacy's own messages do
 * differ in this case).
 */
export async function requestOtp(input: RequestOtpRequest): Promise<void> {
  const account = await authRepository.findAccountByPhoneNumber(input.phoneNumber);
  if (!account) {
    logger.warn('requestOtp: no account for the given phone number');
    return;
  }
  if (!account.phoneNumber || !account.countryCode) {
    logger.warn({ userUuid: account.user.uuid }, 'requestOtp: no phone on file for account');
    return;
  }

  // Real data is inconsistent — some provider_attribute rows store countryCode
  // as "91", others as "+91" (verified directly against the DB) — normalize so
  // the destination is never double-prefixed ("++91…").
  const countryCode = account.countryCode.replace(/^\+/, '');
  const localCode = generateCode(env.OTP_LENGTH);
  const fullPhone = `+${countryCode}${account.phoneNumber}`;
  const expiryMinutes = Math.max(1, Math.round(env.OTP_EXPIRY_SECONDS / 60));

  try {
    const provider = selectProvider(countryCode);
    // The code actually sent — for 2Factor's AUTOGEN2 this is vendor-generated,
    // not `localCode`. Persist whatever was really texted.
    const sentCode = await provider.send(fullPhone, localCode, expiryMinutes);
    await userSettingsRepository.saveOtp(account.user.uuid, sentCode, OTP_FOR_PASSWORD_RESET);
  } catch (err) {
    // Nothing is persisted on a send failure — matches legacy (saveOtp only
    // runs after a successful provider call) — but it must be logged loudly:
    // an SMS provider outage silently breaking password reset is an incident.
    const providerName = err instanceof SmsProviderError ? err.provider : 'unknown';
    logger.error(
      { err, userUuid: account.user.uuid, provider: providerName },
      'requestOtp: SMS delivery failed',
    );
  }
}

const INVALID_OTP = (): HttpError => new HttpError(401, 'INVALID_OTP', 'Invalid or expired code');

/**
 * EZ-934 — verifies a password-reset OTP and hands back the account's
 * `userUuid` plus a short-lived token for the follow-up
 * `POST /auth/resetPassword/:userUuid` call. `userUuid` is necessary here: the
 * client only ever supplied a phone number, so this is its only way to learn
 * the id that endpoint's URL requires — legacy's own verify response includes
 * it for the same reason.
 *
 * Legacy checks expiry (`updatedAt` within 1 minute) but never clears the OTP
 * row on success, so the same code can be replayed for the rest of that
 * window. Clearing it here on a successful verify is a deliberate improvement,
 * not a legacy behavior being mirrored.
 */
export async function verifyOtp(input: VerifyOtpRequest): Promise<VerifyOtpResponse> {
  const account = await authRepository.findAccountByPhoneNumber(input.phoneNumber);
  if (!account) throw INVALID_OTP();
  const userUuid = account.user.uuid;

  const row = await userSettingsRepository.findOtp(userUuid, input.otp, OTP_FOR_PASSWORD_RESET);
  if (!row) throw INVALID_OTP();

  const ageMs = Date.now() - row.updatedAt.getTime();
  if (ageMs >= env.OTP_EXPIRY_SECONDS * 1000) {
    throw new HttpError(401, 'OTP_EXPIRED', 'Code has expired — request a new one');
  }

  await userSettingsRepository.clearOtp(userUuid);

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
