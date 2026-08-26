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

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

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

/** Replaces what the legacy `GET /provider?user={uuid}` returned. */
export interface ProviderPayload {
  uuid: string;
  identifier: string | null;
  display: string | null;
  attributes: Record<string, string>;
}

export interface TokenPairPayload {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

/** The consolidated app-setup payload — replaces login + session + provider. */
export interface LoginResponse extends TokenPairPayload {
  user: UserPayload;
  provider: ProviderPayload | null;
}
