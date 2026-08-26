import { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
} from '@/modules/auth/auth.dto';
import * as authService from '@/modules/auth/auth.service';
import type { RequestContext } from '@/modules/auth/auth.service';

function contextFrom(req: Request, deviceId?: string): RequestContext {
  return {
    deviceId: deviceId ?? null,
    userAgent: req.header('User-Agent')?.slice(0, 255) ?? null,
    ipAddress: req.ip ?? null,
  };
}

/** EZ-932 `POST /auth/login` */
export async function login(req: Request, res: Response): Promise<void> {
  const body = LoginRequestSchema.parse(req.body);
  const result = await authService.login(body, contextFrom(req, body.deviceId));
  res.status(200).json(result);
}

/** EZ-942 `POST /auth/refresh` */
export async function refresh(req: Request, res: Response): Promise<void> {
  const body = RefreshRequestSchema.parse(req.body);
  const result = await authService.refresh(body.refreshToken, contextFrom(req));
  res.status(200).json(result);
}

/** `POST /auth/logout` — revokes refresh tokens; the access token expires on its own. */
export async function logout(req: Request, res: Response): Promise<void> {
  const body = LogoutRequestSchema.parse(req.body ?? {});
  const claims = req.user;

  if (!claims) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing or malformed access token');
  }

  await authService.logout(claims.sub, {
    refreshToken: body.refreshToken,
    allDevices: body.allDevices,
  });

  res.status(204).send();
}

/** EZ-920 `GET /auth/check` — splash-screen token validation. */
export function check(req: Request, res: Response): void {
  const claims = req.user;
  if (!claims) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing or malformed access token');
  }
  res.status(200).json({
    valid: true,
    userUuid: claims.sub,
    username: claims.username,
    role: claims.role,
    expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
  });
}
