import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';

const PORT = Number(process.env.PORT ?? 3003);
const NODE_ENV = process.env.NODE_ENV ?? 'development';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'web-rtc' },
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
  res.json({ status: 'ok', service: 'web-rtc', timestamp: new Date().toISOString() }),
);
app.get('/ready', (_req, res) => res.json({ ready: true }));

// TODO: Socket.IO v4 server + LiveKit token endpoint (R-01 auth-checked)

app.listen(PORT, () => logger.info(`🚀 web-rtc listening on :${PORT} (${NODE_ENV})`));
