import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';

export type TokenType = 'access' | 'refresh';

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  jti: string;
  typ: 'access';
  username: string;
  role: string;
}

export interface RefreshTokenClaims extends JwtPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
  /** Rotation family — shared by every token descended from one login. */
  fam: string;
}

export interface IssuedToken {
  token: string;
  jti: string;
  expiresAt: Date;
  expiresIn: number;
}

let privateKey: string | undefined;
let publicKey: string | undefined;

function loadPrivateKey(): string {
  privateKey ??= fs.readFileSync(path.resolve(process.cwd(), env.JWT_PRIVATE_KEY_PATH), 'utf8');
  return privateKey;
}

function loadPublicKey(): string {
  publicKey ??= fs.readFileSync(path.resolve(process.cwd(), env.JWT_PUBLIC_KEY_PATH), 'utf8');
  return publicKey;
}

/** Refresh tokens are persisted as a digest, never in the clear. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sign(
  payload: Record<string, unknown>,
  subject: string,
  jti: string,
  ttlSeconds: number,
): IssuedToken {
  const token = jwt.sign(payload, loadPrivateKey(), {
    algorithm: env.JWT_ALGORITHM,
    expiresIn: ttlSeconds,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    subject,
    jwtid: jti,
  });
  return {
    token,
    jti,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    expiresIn: ttlSeconds,
  };
}

/** Access token — short-lived (JWT_ACCESS_TTL_SECONDS, default 900s / 15min). */
export function signAccessToken(user: {
  uuid: string;
  username: string;
  role: string;
}): IssuedToken {
  return sign(
    { typ: 'access', username: user.username, role: user.role },
    user.uuid,
    uuidv4(),
    env.JWT_ACCESS_TTL_SECONDS,
  );
}

/** Refresh token — long-lived (JWT_REFRESH_TTL_SECONDS, default 604800s / 7d). */
export function signRefreshToken(userUuid: string, familyId: string): IssuedToken {
  return sign({ typ: 'refresh', fam: familyId }, userUuid, uuidv4(), env.JWT_REFRESH_TTL_SECONDS);
}

function verify<T extends JwtPayload>(token: string, expected: TokenType): T {
  let decoded: JwtPayload | string;
  try {
    decoded = jwt.verify(token, loadPublicKey(), {
      algorithms: [env.JWT_ALGORITHM],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    throw new HttpError(
      401,
      expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      expired ? 'Token has expired' : 'Token is invalid',
    );
  }

  if (typeof decoded === 'string' || decoded.typ !== expected) {
    // An access token presented to /auth/refresh (or vice versa) must not be honoured.
    throw new HttpError(401, 'INVALID_TOKEN', 'Token is invalid');
  }
  return decoded as T;
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return verify<AccessTokenClaims>(token, 'access');
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  return verify<RefreshTokenClaims>(token, 'refresh');
}

export function newTokenFamily(): string {
  return uuidv4();
}
