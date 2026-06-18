import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),

  JWT_ALGORITHM: z.literal('RS256').default('RS256'),
  JWT_PRIVATE_KEY_PATH: z.string(),
  JWT_PUBLIC_KEY_PATH: z.string(),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  JWT_ISSUER: z.string().default('elcg-auth-gateway'),
  JWT_AUDIENCE: z.string().default('elcg-clients'),

  OTP_LENGTH: z.coerce.number().int().positive().default(6),
  OTP_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  OTP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),

  SMS_PROVIDER_INDIA: z.string().default('2factor'),
  TWOFACTOR_API_KEY: z.string().optional(),
  SMS_PROVIDER_INTL: z.string().default('twilio'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  SMS_PROVIDER_NEPAL: z.string().default('sparrow'),
  SPARROW_API_TOKEN: z.string().optional(),

  LOGIN_LOCKOUT_ATTEMPTS: z.coerce.number().int().positive().default(3),
  LOGIN_LOCKOUT_WINDOW_MIN: z.coerce.number().int().positive().default(15),

  CORS_ORIGIN: z.string().default('*'),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
