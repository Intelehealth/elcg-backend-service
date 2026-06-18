import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';

const PORT = Number(process.env.PORT ?? 3002);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'portal' },
  ...(NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'portal', timestamp: new Date().toISOString() }),
);
app.get('/ready', (_req, res) => res.json({ ready: true }));

app.listen(PORT, () => logger.info(`🚀 portal listening on :${PORT} (${NODE_ENV})`));
