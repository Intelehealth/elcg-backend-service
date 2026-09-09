import { Sequelize } from 'sequelize';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/**
 * MySQL for dev + prod; in-memory SQLite for tests so no real DB is required.
 * Model column mappings (underscored: true) are portable across both dialects.
 */
export const sequelize =
  env.NODE_ENV === 'test'
    ? new Sequelize('sqlite::memory:', {
        logging: false,
        define: { underscored: true, timestamps: true },
      })
    : new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
        host: env.DB_HOST,
        port: env.DB_PORT,
        dialect: 'mysql',
        logging: (msg) => logger.debug({ sql: true }, msg),
        pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
        define: { underscored: true, timestamps: true },
      });

export async function connectDb(): Promise<void> {
  await sequelize.authenticate();
  logger.info(`✅ ${env.NODE_ENV === 'test' ? 'SQLite (memory)' : 'MySQL'} connection established`);
}
