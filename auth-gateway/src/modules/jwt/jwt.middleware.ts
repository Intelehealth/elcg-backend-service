import { NextFunction, Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import { verifyAccessToken } from '@/modules/jwt/jwt.service';

/**
 * Validates the `Authorization: Bearer <access token>` header on every request
 * and attaches the claims to `req.user`.
 *
 * Validation is purely cryptographic — signature, issuer, audience, expiry and
 * token type — with no database round-trip, which is what keeps it cheap enough
 * to run per request. The trade-off is that an access token cannot be revoked
 * early; it stays valid for at most its 15-minute TTL. Revocation lives on the
 * refresh side instead (see `auth.service.logout`), and a DB-backed access-token
 * blacklist is deferred (EZ-943).
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing or malformed Authorization header');
    }

    req.user = verifyAccessToken(header.slice('Bearer '.length).trim());
    next();
  } catch (err) {
    next(err);
  }
}
