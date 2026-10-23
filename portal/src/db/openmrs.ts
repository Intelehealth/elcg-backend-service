import { Sequelize } from 'sequelize';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/**
 * Connection to the OpenMRS schema — the portal's only database today.
 *
 * Treated as strictly read-only: visits, encounters and obs are written by the
 * mobile app through OpenMRS's own REST API, never by this service.
 *
 * `define` matches the OpenMRS schema: no created_at/updated_at columns and
 * fixed (singular, snake_case) table names.
 */
export const openmrsSequelize = new Sequelize(
  env.OPENMRS_DB_NAME,
  env.OPENMRS_DB_USER,
  env.OPENMRS_DB_PASSWORD,
  {
    host: env.OPENMRS_DB_HOST,
    port: env.OPENMRS_DB_PORT,
    dialect: 'mysql',
    logging: (msg) => logger.debug({ sql: true, schema: 'openmrs' }, msg),
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
    define: { timestamps: false, freezeTableName: true, underscored: false },
  },
);

export async function connectOpenmrsDb(): Promise<void> {
  await openmrsSequelize.authenticate();
  logger.info('✅ OpenMRS MySQL connection established');
}
