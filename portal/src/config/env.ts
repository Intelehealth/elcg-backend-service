import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),

  // JWT validation only — we don't issue tokens; auth-gateway does.
  JWT_ALGORITHM: z.literal('RS256').default('RS256'),
  JWT_PUBLIC_KEY_PATH: z.string(),
  JWT_ISSUER: z.string().default('elcg-auth-gateway'),
  JWT_AUDIENCE: z.string().default('elcg-clients'),

  AUTH_GATEWAY_URL: z.string().default('http://host.docker.internal:3001'),

  OPENMRS_BASE_URL: z.string().default(''),
  OPENMRS_USERNAME: z.string().default(''),
  OPENMRS_PASSWORD: z.string().default(''),
  OPENMRS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

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
