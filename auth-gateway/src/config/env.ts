import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3030),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('warn'),

  // TLS (production only) — same convention as mindmap-api-NAS/auth-gateway's
  // bin/www: in production the server terminates HTTPS itself using a
  // Let's Encrypt (or other) key/cert pair mounted into the container; every
  // other NODE_ENV serves plain HTTP.
  SSL_KEY_PATH: z.string().optional(),
  SSL_CERT_PATH: z.string().optional(),

  // Gateway-owned tables, hosted in the existing `mindmap_server` schema.
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),

  // OpenMRS schema — the identity source of truth (users / provider / person).
  // Defaults fall back to the DB_* credentials since both schemas normally live
  // on the same MySQL 5.7 instance.
  OPENMRS_DB_HOST: z.string().optional(),
  OPENMRS_DB_PORT: z.coerce.number().int().positive().optional(),
  OPENMRS_DB_NAME: z.string().default('openmrs'),
  OPENMRS_DB_USER: z.string().optional(),
  OPENMRS_DB_PASSWORD: z.string().optional(),

  JWT_ALGORITHM: z.literal('RS256').default('RS256'),
  JWT_PRIVATE_KEY_PATH: z.string(),
  JWT_PUBLIC_KEY_PATH: z.string(),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  JWT_ISSUER: z.string().default('elcg-auth-gateway'),
  JWT_AUDIENCE: z.string().default('elcg-clients'),

  OTP_LENGTH: z.coerce.number().int().positive().default(6),
  /** Matches the proven mindmap-api-NAS window (1 minute) — user_settings.updatedAt is the clock. */
  OTP_EXPIRY_SECONDS: z.coerce.number().int().positive().default(60),
  /** Declared for future use — not enforced today: user_settings has no attempts counter, same as legacy. */
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  OTP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),
  /** TTL of the token verifyOtp hands back for the follow-up resetPassword call. */
  OTP_RESET_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  SMS_PROVIDER_INDIA: z.string().default('2factor'),
  TWOFACTOR_API_KEY: z.string().optional(),
  SMS_PROVIDER_INTL: z.string().default('twilio'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  SMS_PROVIDER_NEPAL: z.string().default('sparrow'),
  SPARROW_API_TOKEN: z.string().optional(),
  /** Sparrow SMS's "identity" (sender id) — required by their API alongside the token. */
  SPARROW_IDENTITY: z.string().optional(),

  LOGIN_LOCKOUT_ATTEMPTS: z.coerce.number().int().positive().default(3),
  LOGIN_LOCKOUT_WINDOW_MIN: z.coerce.number().int().positive().default(15),

  CORS_ORIGIN: z.string().default('*'),

  // resetPassword (EZ-939) writes through OpenMRS's own REST API — same as legacy —
  // so its hashing/history rules apply. Basic Auth, an OpenMRS admin account.
  OPENMRS_REST_BASE_URL: z.string().optional(),
  OPENMRS_ADMIN_USERNAME: z.string().optional(),
  OPENMRS_ADMIN_PASSWORD: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.SSL_KEY_PATH) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SSL_KEY_PATH'], message: 'Required when NODE_ENV=production' });
  }
  if (value.NODE_ENV === 'production' && !value.SSL_CERT_PATH) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SSL_CERT_PATH'], message: 'Required when NODE_ENV=production' });
  }
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
