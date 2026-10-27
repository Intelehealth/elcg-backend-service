import pino from 'pino';
import { env } from '@/config/env';

const prettyLoggerEnabled =
  env.NODE_ENV === 'development' &&
  (() => {
    try {
      require.resolve('pino-pretty');
      return true;
    } catch {
      return false;
    }
  })();

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(prettyLoggerEnabled
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      }
    : {}),
  base: { service: 'portal' },
  redact: ['req.headers.authorization'],
});
