import { Sequelize } from 'sequelize';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/**
 * Second connection, pointed at the OpenMRS schema.
 *
 * OpenMRS owns identity: `users`, `provider`, `person`, `person_name`, `user_role`.
 * We treat it as read-only with one deliberate exception — the `user_property`
 * rows OpenMRS itself uses for lockout (`loginAttempts`, `lockoutTimestamp`) are
 * written so the two systems share one counter instead of drifting apart.
 *
 * Its `define` options intentionally differ from the `mindmap_server` connection:
 * the OpenMRS schema has no created_at/updated_at columns and its table names
 * are fixed.
 */
export const openmrsSequelize = new Sequelize(
  env.OPENMRS_DB_NAME,
  env.OPENMRS_DB_USER ?? env.DB_USER,
  env.OPENMRS_DB_PASSWORD ?? env.DB_PASSWORD,
  {
    host: env.OPENMRS_DB_HOST ?? env.DB_HOST,
    port: env.OPENMRS_DB_PORT ?? env.DB_PORT,
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
