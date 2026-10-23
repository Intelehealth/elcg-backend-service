import { NextFunction, Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import { verifyAccessToken } from '@/modules/jwt/jwt.service';

/**
 * Validates the `Authorization: Bearer <access token>` header and attaches the
 * claims to `req.user`. Replaces legacy portal's `middleware/auth.js`.
 *
 * Validation is purely cryptographic against auth-gateway's public key — no
 * database round-trip — so it is cheap enough to run on every request.
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
