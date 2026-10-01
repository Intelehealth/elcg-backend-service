import { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshRequestSchema,
  RequestOtpSchema,
  ResetPasswordSchema,
  ValidateProviderAttributeSchema,
  VerifyOtpSchema,
} from '@/modules/auth/auth.dto';
import * as authService from '@/modules/auth/auth.service';
import * as otpService from '@/modules/otp/otp.service';
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

/**
 * EZ-933 `POST /auth/requestOtp` — always 200; see otp.service.ts for why.
 * `result` only carries userUuid/providerUuid/role/roleUuid for a matched
 * `otpFor: 'password'` account — otherwise it's `{}`.
 */
export async function requestOtp(req: Request, res: Response): Promise<void> {
  const body = RequestOtpSchema.parse(req.body);
  const result = await otpService.requestOtp(body);
  const message =
    result.otpRequired === false
      ? 'OTP not required for doctor on mobile. Login allowed.'
      : 'The OTP has been sent.';
  res.status(200).json({ message, ...result });
}

/** EZ-934 `POST /auth/verifyOtp` */
export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const body = VerifyOtpSchema.parse(req.body);
  const result = await otpService.verifyOtp(body);
  res.status(200).json(result);
}

/** EZ-939 `POST /auth/resetPassword/:userUuid` — gated on verifyOtp's resetToken. */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body = ResetPasswordSchema.parse(req.body);
  await otpService.resetPassword(req.params.userUuid, body.newPassword, body.resetToken);
  res.status(200).json({ message: 'Password reset successful.' });
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

/**
 * `POST /auth/validateProviderAttribute` — ported from legacy
 * (`portal/controllers/auth.controller.js`'s `checkProviderAttribute`),
 * including its unauthenticated access and its `{ success, message, data }`
 * 400 bodies (not the gateway's usual `{ error }` envelope).
 */
export async function validateProviderAttribute(req: Request, res: Response): Promise<void> {
  const parsed = ValidateProviderAttributeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Bad request! Invalid arguments.', data: null });
    return;
  }
  const { attributeType, attributeValue, providerUuid } = parsed.data;
  if (!(authService.PROVIDER_ATTRIBUTE_TYPES as readonly string[]).includes(attributeType)) {
    res
      .status(400)
      .json({ success: false, message: 'Bad request! Attribute type should be emailId/phoneNumber.', data: null });
    return;
  }
  const result = await authService.validateProviderAttribute(attributeType, attributeValue, providerUuid);
  res.status(200).json(result);
}
