import { Router } from 'express';
import { openmrsSequelize } from '@/db/openmrs';

const router = Router();

/** Liveness + OpenMRS DB reachability. Always 200; `status` says whether the DB is up. */
router.get('/health', async (_req, res) => {
  let openmrsDb: 'up' | 'down' = 'down';
  try {
    await openmrsSequelize.authenticate();
    openmrsDb = 'up';
  } catch {
    openmrsDb = 'down';
  }
  res.json({
    status: openmrsDb === 'up' ? 'ok' : 'degraded',
    service: 'portal',
    timestamp: new Date().toISOString(),
    checks: { openmrsDb },
  });
});

router.get('/ready', (_req, res) => res.json({ ready: true }));

export default router;
