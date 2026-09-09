import { Router } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { requireAuth } from '@/modules/jwt/jwt.middleware';
import { proxyAll } from './proxy.controller';

/**
 * BE-GW-PROXY-01 — mounted at `/api/v1` from app.ts.
 * Every method + every sub-path goes through requireAuth first, then the
 * catch-all controller resolves the downstream and forwards.
 */
const router = Router();

router.use(requireAuth);
router.all('*', asyncHandler(proxyAll));

export default router;
