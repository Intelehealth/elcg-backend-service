import type { AccessTokenClaims } from '@/modules/jwt/jwt.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth` once the access token has been verified. */
      user?: AccessTokenClaims;
    }
  }
}

export {};
