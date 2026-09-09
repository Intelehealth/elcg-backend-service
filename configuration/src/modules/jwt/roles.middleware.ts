import { NextFunction, Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';

/**
 * OR-logic role guard — user must hold at least one of the listed roles.
 * Case-insensitive substring match on the role display or name.
 *
 * Apply AFTER requireAuth so req.user is populated. Roles come from the
 * JWT `data.roles` claim, populated by auth-gateway from the OpenMRS user's
 * role list at login time.
 *
 * Usage:
 *   router.post('/thing', requireAuth, requireRoles('Admin', 'SystemAdministrator'), handler);
 */
export function requireRoles(...allowed: string[]) {
  const needles = allowed.map((r) => r.toLowerCase());
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userRoles = req.user?.roles ?? [];
    const has = userRoles.some((r) =>
      needles.some((n) => r.toLowerCase().includes(n)),
    );
    if (!has) {
      return next(
        new HttpError(
          403,
          'AUTH_FORBIDDEN',
          `Access requires one of: ${allowed.join(', ')}`,
        ),
      );
    }
    next();
  };
}
