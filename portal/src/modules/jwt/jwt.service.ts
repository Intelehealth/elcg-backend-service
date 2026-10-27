import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/utils/logger';

/**
 * Claims of an access token minted by auth-gateway (`signAccessToken`). Kept in
 * sync with auth-gateway's own `AccessTokenClaims` by hand — the services are
 * deployed independently and share no package.
 */
export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  jti: string;
  typ: 'access';
  username: string;
  role: string;
}

let publicKey: string | undefined;

function publicKeyPath(): string {
  return path.resolve(process.cwd(), env.JWT_PUBLIC_KEY_PATH);
}

/**
 * auth-gateway's public key, read once. A missing or unreadable file is a
 * deployment fault (typically the keys folder not mounted into the
 * container), so it surfaces as a 500 with the path in the log — never as a
 * 401, which would wrongly blame the caller's token.
 */
function loadPublicKey(): string {
  if (publicKey) return publicKey;
  try {
    publicKey = fs.readFileSync(publicKeyPath(), 'utf8');
    return publicKey;
  } catch (err) {
    logger.error({ err, path: publicKeyPath() }, 'JWT public key could not be read');
    throw new HttpError(500, 'AUTH_MISCONFIGURED', 'Server authentication is misconfigured');
  }
}

/**
 * Whether the public key is readable, and its SHA-256 fingerprint — for
 * `/health`, so an operator can confirm the portal holds the same key
 * auth-gateway signs with. The key is public; its fingerprint is safe to expose.
 */
export function describePublicKey(): { status: 'ok'; sha256: string } | { status: 'missing' } {
  try {
    const pem = fs.readFileSync(publicKeyPath(), 'utf8');
    return { status: 'ok', sha256: crypto.createHash('sha256').update(pem.trim()).digest('hex') };
  } catch {
    return { status: 'missing' };
  }
}

/*
 * Why a token was refused, for the log. The claims are decoded without
 * verification purely to show what was presented (e.g. a different issuer);
 * the token itself and the subject are never logged.
 */
function logRejection(token: string, reason: string): void {
  const decoded = jwt.decode(token, { complete: true });
  const payload =
    decoded && typeof decoded.payload === 'object' ? (decoded.payload as JwtPayload) : null;
  logger.warn(
    {
      reason,
      presented: {
        alg: decoded?.header.alg,
        iss: payload?.iss,
        aud: payload?.aud,
        typ: payload?.typ,
      },
      expected: { alg: env.JWT_ALGORITHM, iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE },
    },
    'Access token rejected',
  );
}

/**
 * Verifies an auth-gateway access token: RS256 signature, issuer, audience,
 * expiry and token type. A refresh or password-reset token is rejected even
 * though its signature is valid.
 */
export function verifyAccessToken(token: string): AccessTokenClaims {
  const key = loadPublicKey();

  let decoded: JwtPayload | string;
  try {
    decoded = jwt.verify(token, key, {
      algorithms: [env.JWT_ALGORITHM],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    if (!expired) logRejection(token, err instanceof Error ? err.message : String(err));
    throw new HttpError(
      401,
      expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      expired ? 'Token has expired' : 'Token is invalid',
    );
  }

  if (typeof decoded === 'string' || decoded.typ !== 'access') {
    logRejection(token, 'not an access token');
    throw new HttpError(401, 'INVALID_TOKEN', 'Token is invalid');
  }
  return decoded as AccessTokenClaims;
}
