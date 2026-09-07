import { z } from 'zod';

export const DeviceInfoSchema = z
  .object({
    platform: z.string().max(50).optional(),
    model: z.string().max(100).optional(),
    osVersion: z.string().max(50).optional(),
    appVersion: z.string().max(50).optional(),
  })
  .optional();

/** EZ-932 `POST /auth/login` */
export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1, 'username is required').max(100),
  password: z.string().min(1, 'password is required').max(255),
  /**
   * Optional client identifier, stored against the refresh token for audit and
   * device listing. It is deliberately NOT an enforcement key — one-session-per-device
   * (EZ-692) is out of scope here.
   */
  deviceId: z.string().max(255).optional(),
  deviceInfo: DeviceInfoSchema,
});

/** EZ-942 `POST /auth/refresh` */
export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

/** EZ-943 `POST /auth/logout` */
export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  /** When true, every refresh token for the user is revoked, not just this one. */
  allDevices: z.boolean().optional().default(false),
});

/**
 * EZ-933 `POST /auth/requestOtp` — password-reset only (see `otp/README.md`).
 * The real client identifies the account by `phoneNumber`, not username —
 * matches the legacy `mindmap-api-NAS` request shape. `countryCode`/`source`
 * are accepted for contract compatibility; the code is actually sent to
 * whatever phone/country code are on file for the matched account, not these
 * values — see `otp.service.ts`.
 */
export const RequestOtpSchema = z.object({
  otpFor: z.literal('password'),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\d{4,15}$/, 'phoneNumber must be 4-15 digits'),
  countryCode: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, 'countryCode must be digits only')
    .optional(),
  source: z.string().trim().max(20).optional(),
});

/** EZ-934 `POST /auth/verifyOtp` — same phone-based identification as requestOtp. */
export const VerifyOtpSchema = z.object({
  verifyFor: z.literal('password'),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\d{4,15}$/, 'phoneNumber must be 4-15 digits'),
  countryCode: z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, 'countryCode must be digits only')
    .optional(),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,10}$/, 'otp must be 4-10 digits'),
});

/** EZ-939 `POST /auth/resetPassword/:userUuid` — gated on verifyOtp's resetToken. */
export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'newPassword must be at least 8 characters').max(255),
  resetToken: z.string().min(1, 'resetToken is required'),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type RequestOtpRequest = z.infer<typeof RequestOtpSchema>;
export type VerifyOtpRequest = z.infer<typeof VerifyOtpSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordSchema>;

export interface RequestOtpResponse {
  message: string;
}

export interface VerifyOtpResponse {
  verified: true;
  /** The client has no other way to learn this — phone is its only identifier. */
  userUuid: string;
  /** Present to POST /auth/resetPassword/:userUuid as proof the OTP was verified. */
  resetToken: string;
  expiresIn: number;
}

/** Replaces what the legacy `GET /session` returned. */
export interface UserPayload {
  uuid: string;
  username: string | null;
  systemId: string;
  personUuid: string;
  display: string;
  gender: string | null;
  birthdate: string | null;
  roles: string[];
  privileges: string[];
}

/**
 * Replaces what the legacy `GET /provider?user={uuid}&v=custom:(uuid,person:(uuid,
 * display,gender,age,birthdate,preferredName),attributes)` returned. The provider
 * shares `person_id` with the user, so `person` here is the same demographics
 * already resolved for `UserPayload` — no extra OpenMRS round-trip needed.
 */
export interface ProviderPayload {
  uuid: string;
  identifier: string | null;
  display: string | null;
  person: {
    uuid: string;
    display: string;
    gender: string | null;
    age: number | null;
    birthdate: string | null;
    preferredName: string;
  };
  attributes: Record<string, string>;
}

export interface TokenPairPayload {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  /** The new refresh token's `jti` — identifies this login session for clients that track one. */
  sessionId: string;
}

/**
 * The consolidated app-setup payload — replaces the legacy three-call mobile
 * flow (`GET /session` + `POST /auth/login` + `GET /provider?user=…`) with one.
 */
export interface LoginResponse extends TokenPairPayload {
  /** Always `true` on a 200 — a failed login never reaches this shape. */
  authenticated: true;
  user: UserPayload;
  provider: ProviderPayload | null;
}
