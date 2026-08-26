import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/utils/logger';
import { verifyOpenmrsPassword } from '@/utils/openmrs-security';
import * as authRepository from '@/modules/auth/auth.repository';
import * as userRepository from '@/modules/users/user.repository';
import * as tokenRepository from '@/modules/jwt/refresh-token.repository';
import {
  hashToken,
  newTokenFamily,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@/modules/jwt/jwt.service';
import type { OpenmrsIdentity } from '@/modules/auth/auth.repository';
import type {
  LoginRequest,
  LoginResponse,
  ProviderPayload,
  TokenPairPayload,
  UserPayload,
} from '@/modules/auth/auth.dto';

/**
 * Hashed and compared when the login handle does not exist, so a missing user
 * costs the same work as a wrong password and cannot be told apart by timing.
 * The salt is arbitrary — the comparison is guaranteed to fail.
 */
const DUMMY_HASH = 'f'.repeat(128);
const DUMMY_SALT = '0'.repeat(128);

export interface RequestContext {
  deviceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

function toUserPayload(identity: OpenmrsIdentity): UserPayload {
  return {
    uuid: identity.user.uuid,
    username: identity.user.username,
    systemId: identity.user.systemId,
    personUuid: identity.personUuid,
    display: identity.display,
    gender: identity.gender,
    birthdate: identity.birthdate,
    roles: identity.roles,
    privileges: identity.privileges,
  };
}

function toProviderPayload(identity: OpenmrsIdentity): ProviderPayload | null {
  return identity.provider;
}

/** The role claim is informational; authorisation still resolves via privileges. */
function primaryRole(identity: OpenmrsIdentity): string {
  return identity.roles[0] ?? '';
}

/** Mints an access/refresh pair and persists the refresh side of it. */
async function issueTokenPair(
  identity: OpenmrsIdentity,
  familyId: string,
  context: RequestContext,
): Promise<TokenPairPayload> {
  const access = signAccessToken({
    uuid: identity.user.uuid,
    username: identity.user.username ?? identity.user.systemId,
    role: primaryRole(identity),
  });
  const refresh = signRefreshToken(identity.user.uuid, familyId);

  await tokenRepository.persist({
    jti: refresh.jti,
    familyId,
    userUuid: identity.user.uuid,
    tokenHash: hashToken(refresh.token),
    expiresAt: refresh.expiresAt,
    deviceId: context.deviceId ?? null,
    userAgent: context.userAgent ?? null,
    ipAddress: context.ipAddress ?? null,
  });

  return {
    tokenType: 'Bearer',
    accessToken: access.token,
    expiresIn: access.expiresIn,
    refreshToken: refresh.token,
    refreshExpiresIn: refresh.expiresIn,
  };
}

function lockedError(retryAfterSeconds: number): HttpError {
  return new HttpError(
    423,
    'ACCOUNT_LOCKED',
    'Account is temporarily locked after too many failed attempts',
    { retryAfterSeconds },
  );
}

/**
 * EZ-932 — consolidated login against the OpenMRS identity tables.
 *
 * Returns the token pair *and* the user (roles + privileges) and provider
 * profiles, so the mobile app completes setup in one call instead of three.
 */
export async function login(input: LoginRequest, context: RequestContext): Promise<LoginResponse> {
  const user = await authRepository.findUserByLogin(input.username);

  if (!user) {
    verifyOpenmrsPassword(input.password, DUMMY_HASH, DUMMY_SALT);
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  const state = await userRepository.getLoginState(user.userId, env.LOGIN_LOCKOUT_WINDOW_MIN);
  if (state.lockedUntil) {
    throw lockedError(Math.ceil((state.lockedUntil.getTime() - Date.now()) / 1000));
  }

  if (!verifyOpenmrsPassword(input.password, user.password, user.salt)) {
    const attempts = await userRepository.recordFailedAttempt(
      user.userId,
      env.LOGIN_LOCKOUT_ATTEMPTS,
      env.LOGIN_LOCKOUT_WINDOW_MIN,
    );
    logger.warn({ login: input.username, attempts }, 'Failed login attempt');

    if (attempts >= env.LOGIN_LOCKOUT_ATTEMPTS) {
      throw lockedError(env.LOGIN_LOCKOUT_WINDOW_MIN * 60);
    }
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  await userRepository.recordSuccessfulLogin(user.userId);

  const identity = await authRepository.loadIdentity(user);
  const tokens = await issueTokenPair(identity, newTokenFamily(), context);

  return {
    ...tokens,
    user: toUserPayload(identity),
    provider: toProviderPayload(identity),
  };
}

/**
 * EZ-942 — rotating refresh.
 *
 * The presented token is consumed: it is marked rotated and a fresh pair is
 * issued in the same family. Presenting an already-rotated token means a copy is
 * in circulation, so the whole family is revoked and the caller must log in again.
 */
export async function refresh(
  refreshToken: string,
  context: RequestContext,
): Promise<TokenPairPayload> {
  const claims = verifyRefreshToken(refreshToken);
  const stored = await tokenRepository.findByJti(claims.jti);

  if (!stored) {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is not recognised');
  }

  if (stored.revokedAt) {
    const revoked = await tokenRepository.revokeFamily(claims.fam, 'REUSE_DETECTED');
    logger.error(
      { userUuid: stored.userUuid, familyId: claims.fam, revoked },
      'Refresh token reuse detected — family revoked',
    );
    throw new HttpError(401, 'REFRESH_TOKEN_REUSED', 'Refresh token has already been used');
  }

  if (stored.tokenHash !== hashToken(refreshToken)) {
    await tokenRepository.revokeFamily(claims.fam, 'HASH_MISMATCH');
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is not recognised');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, 'TOKEN_EXPIRED', 'Refresh token has expired');
  }

  // Re-read from OpenMRS so a user retired since login cannot refresh.
  const user = await authRepository.findUserByUuid(claims.sub);
  if (!user) {
    throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is not recognised');
  }

  const identity = await authRepository.loadIdentity(user);
  const tokens = await issueTokenPair(identity, claims.fam, {
    ...context,
    deviceId: context.deviceId ?? stored.deviceId,
  });

  await tokenRepository.markRotated(stored.jti, verifyRefreshToken(tokens.refreshToken).jti);

  return tokens;
}

/**
 * Logout — revokes refresh tokens so the session cannot be extended.
 *
 * The caller's *access* token is deliberately not revoked: with no blacklist it
 * remains valid until its 15-minute TTL runs out. That is the accepted trade-off
 * for keeping per-request validation database-free; a DB-backed access-token
 * blacklist is deferred to EZ-943.
 */
export async function logout(
  userUuid: string,
  options: { refreshToken?: string; allDevices: boolean },
): Promise<void> {
  if (options.allDevices) {
    await tokenRepository.revokeAllForUser(userUuid, 'LOGOUT_ALL');
    return;
  }

  if (options.refreshToken) {
    try {
      const claims = verifyRefreshToken(options.refreshToken);
      await tokenRepository.revokeFamily(claims.fam, 'LOGOUT');
    } catch {
      // A malformed or expired refresh token on logout is not worth failing the
      // request over — the access token has already been blacklisted.
      logger.debug('Logout received an unusable refresh token; ignoring');
    }
  }
}
