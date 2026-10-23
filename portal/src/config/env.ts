import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3004),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('warn'),

    /*
     * TLS (production only) — same convention as auth-gateway: in production the
     * server terminates HTTPS itself using a key/cert pair mounted into the
     * container; every other NODE_ENV serves plain HTTP.
     */
    SSL_KEY_PATH: z.string().optional(),
    SSL_CERT_PATH: z.string().optional(),

    /*
     * OpenMRS schema — the source of truth for visits, encounters and obs.
     * The portal only ever reads from it.
     */
    OPENMRS_DB_HOST: z.string(),
    OPENMRS_DB_PORT: z.coerce.number().int().positive().default(3306),
    OPENMRS_DB_NAME: z.string().default('openmrs'),
    OPENMRS_DB_USER: z.string(),
    OPENMRS_DB_PASSWORD: z.string(),

    /*
     * Access tokens are issued by auth-gateway. The portal only verifies them,
     * so it needs the gateway's public key and the same issuer/audience — never
     * the private key.
     */
    JWT_ALGORITHM: z.literal('RS256').default('RS256'),
    JWT_PUBLIC_KEY_PATH: z.string(),
    JWT_ISSUER: z.string().default('elcg-auth-gateway'),
    JWT_AUDIENCE: z.string().default('elcg-clients'),

    CORS_ORIGIN: z.string().default('*'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.SSL_KEY_PATH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SSL_KEY_PATH'],
        message: 'Required when NODE_ENV=production',
      });
    }
    if (value.NODE_ENV === 'production' && !value.SSL_CERT_PATH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SSL_CERT_PATH'],
        message: 'Required when NODE_ENV=production',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  /* eslint-disable-next-line no-console */
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
