import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import * as authController from '@/modules/auth/auth.controller';

/**
 * Unit-level coverage for the `if (!claims) throw ...` guards in `logout`
 * and `check` — both routes sit behind `requireAuth` (see auth.routes.ts),
 * which always populates `req.user` or throws before either handler runs,
 * so this branch is unreachable through the real route. It exists purely
 * because `req.user` is typed optional; calling the handlers directly with
 * no `user` is the only way to exercise it.
 */
describe('auth.controller — missing req.user guard', () => {
  it('logout throws 401 UNAUTHORIZED when req.user is absent', async () => {
    const req = { body: {} } as unknown as Request;
    const res = {} as Response;

    await expect(authController.logout(req, res)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    } satisfies Partial<HttpError>);
  });

  it('check throws 401 UNAUTHORIZED when req.user is absent', () => {
    const req = {} as Request;
    const res = {} as Response;

    expect(() => authController.check(req, res)).toThrow(
      expect.objectContaining({ status: 401, code: 'UNAUTHORIZED' }),
    );
  });
});

describe('auth.controller — check()', () => {
  it('reports expiresAt: null when the access token claims carry no exp', () => {
    // jsonwebtoken always sets `exp` on tokens signed with `expiresIn`, so this
    // only arises from `verifyAccessToken`'s claims type being `exp?: number`.
    const req = {
      user: { sub: 'user-uuid', username: 'nurse01', role: 'Organizational: Nurse' },
    } as unknown as Request;
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json } as unknown as Response;

    authController.check(req, res);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null }));
  });
});
