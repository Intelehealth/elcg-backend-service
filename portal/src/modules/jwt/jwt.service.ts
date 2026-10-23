import fs from 'node:fs';
import path from 'node:path';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';

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

function loadPublicKey(): string {
  publicKey ??= fs.readFileSync(path.resolve(process.cwd(), env.JWT_PUBLIC_KEY_PATH), 'utf8');
  return publicKey;
}

/**
 * Verifies an auth-gateway access token: RS256 signature, issuer, audience,
 * expiry and token type. A refresh or password-reset token is rejected even
 * though its signature is valid.
 */
export function verifyAccessToken(token: string): AccessTokenClaims {
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

  if (typeof decoded === 'string' || decoded.typ !== 'access') {
    throw new HttpError(401, 'INVALID_TOKEN', 'Token is invalid');
  }
  return decoded as AccessTokenClaims;
}
