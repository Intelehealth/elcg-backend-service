import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { createApp } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { connectOpenmrsDb, openmrsSequelize } from '@/db/openmrs';

/**
 * Production terminates TLS itself — same convention as auth-gateway — reading
 * a key/cert pair mounted into the container. Every other NODE_ENV serves plain
 * HTTP, e.g. behind a reverse proxy that already terminates TLS, or local dev.
 */
function createServer(app: http.RequestListener): http.Server | https.Server {
  if (env.NODE_ENV === 'production') {
    const options = {
      key: fs.readFileSync(env.SSL_KEY_PATH as string),
      cert: fs.readFileSync(env.SSL_CERT_PATH as string),
    };
    return https.createServer(options, app);
  }
  return http.createServer(app);
}

async function main(): Promise<void> {
  const app = createApp();

  try {
    await connectOpenmrsDb();
  } catch (err) {
    /*
     * Every portal API reads OpenMRS, so they will fail until it is reachable —
     * but the process still boots so /health can report it rather than
     * crash-looping.
     */
    logger.warn(
      { err },
      'OpenMRS DB not reachable on boot — continuing; /health will report degraded.',
    );
  }

  const server = createServer(app).listen(env.PORT, () => {
    const protocol = env.NODE_ENV === 'production' ? 'https' : 'http';
    logger.info(`🚀 portal listening on ${protocol}://0.0.0.0:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down…');
    server.close(() => logger.info('HTTP server closed'));
    await openmrsSequelize.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
