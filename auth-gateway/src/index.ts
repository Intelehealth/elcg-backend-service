import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { connectDb, sequelize } from '@/db/sequelize';
import { connectOpenmrsDb, openmrsSequelize } from '@/db/openmrs';
async function main(): Promise<void> {
  const app = createApp();

  try {
    await connectDb();
  } catch (err) {
    logger.warn({ err }, 'DB not reachable on boot — continuing; /health will report degraded.');
  }

  try {
    await connectOpenmrsDb();
  } catch (err) {
    // Without OpenMRS there is no identity source, so login will fail — but the
    // process still boots so /health can report it rather than crash-looping.
    logger.warn({ err }, 'OpenMRS DB not reachable on boot — login will be unavailable.');
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 auth-gateway listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down…');
    server.close(() => logger.info('HTTP server closed'));
    await Promise.all([sequelize.close(), openmrsSequelize.close()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
