import fs from 'fs';
import path from 'path';
import jwt, { Algorithm, JwtPayload } from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/utils/logger';

/**
 * JWT validation middleware. Portal does NOT issue tokens — only validates
 * tokens signed by auth-gateway, using the same RS256 public key.
 *
 * Claim shape (mirrors auth-gateway/jwt.service.ts):
 *   { jti, exp, iat, iss, aud, data: { sessionId, userId, name } }
 */
export interface JwtClaims {
  jti: string;
  exp: number;
  iat: number;
  iss: string;
  aud: string;
  data: { sessionId: string; userId: string; name: string; roles?: string[] };
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtClaims['data'] & { jti: string; exp: number; roles: string[] };
    accessToken?: string;
  }
}

let publicKey: string | null = null;
function loadPublicKey(): string {
  if (publicKey) return publicKey;
  const abs = path.isAbsolute(env.JWT_PUBLIC_KEY_PATH)
    ? env.JWT_PUBLIC_KEY_PATH
    : path.resolve(process.cwd(), env.JWT_PUBLIC_KEY_PATH);
  publicKey = fs.readFileSync(abs, 'utf8');
  return publicKey;
}

const ALG: Algorithm = env.JWT_ALGORITHM;

export function verifyAccessToken(token: string): JwtClaims | null {
  try {
    const pub = loadPublicKey();
    return jwt.verify(token, pub, {
      algorithms: [ALG],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    }) as JwtPayload & JwtClaims;
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'JWT verify failed');
    return null;
  }
}

/**
 * Bearer JWT guard — rejects missing / invalid / expired tokens.
 *
 * NOTE: Portal does NOT check the blacklist directly. The auth-gateway is the
 * sole place blacklist entries are written; portal trusts the access token's
 * 15-min TTL. When you logout, the token still works on portal until it expires.
 * If we need cross-service revocation faster than 15 min, we'd add a shared
 * Redis (deferred to Phase 2 per Satyadeep #5) OR a portal-side cache of the
 * blacklist table.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) {
    return next(new HttpError(401, 'AUTH_REQUIRED', 'Authorization header missing'));
  }
  const token = header.slice('Bearer '.length).trim();
  const claims = verifyAccessToken(token);
  if (!claims) {
    return next(new HttpError(401, 'AUTH_INVALID_TOKEN', 'Token is invalid or expired'));
  }
  req.user = {
    ...claims.data,
    roles: claims.data.roles ?? [],
    jti: claims.jti,
    exp: claims.exp,
  };
  req.accessToken = token;
  next();
}

/** Soft variant — attaches req.user if a valid token is present; doesn't reject. */
export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('Authorization') ?? '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    const claims = verifyAccessToken(token);
    if (claims) {
      req.user = {
        ...claims.data,
        roles: claims.data.roles ?? [],
        jti: claims.jti,
        exp: claims.exp,
      };
      req.accessToken = token;
    }
  }
  next();
}
