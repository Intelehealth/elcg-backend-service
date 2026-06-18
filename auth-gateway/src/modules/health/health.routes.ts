import { Router } from 'express';
import { sequelize } from '@/db/sequelize';

const router = Router();

router.get('/health', async (_req, res) => {
  let db: 'up' | 'down' = 'down';
  try {
    await sequelize.authenticate();
    db = 'up';
  } catch {
    db = 'down';
  }
  res.json({
    status: db === 'up' ? 'ok' : 'degraded',
    service: 'auth-gateway',
    timestamp: new Date().toISOString(),
    checks: { db },
  });
});

router.get('/ready', (_req, res) => res.json({ ready: true }));

export default router;
