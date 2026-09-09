import { Router } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { requireAuth } from '@/modules/jwt/jwt.middleware';
import {
  getPriorityVisits,
  getAwaitingVisits,
  getInProgressVisits,
  getEndedVisits,
  getFollowUpVisits,
  getVisitCountsCtl,
} from './visits.controller';

/**
 * BE-PORTAL-VIS-01 — mounted at `/openmrs` from app.ts to preserve legacy URLs
 * mobile already speaks. All endpoints require a valid access token issued by
 * auth-gateway; no role check — Nurses AND Doctors both read visit lists.
 */
const router = Router();

router.get('/getPriorityVisits',   requireAuth, asyncHandler(getPriorityVisits));
router.get('/getAwaitingVisits',   requireAuth, asyncHandler(getAwaitingVisits));
router.get('/getInProgressVisits', requireAuth, asyncHandler(getInProgressVisits));
router.get('/getEndedVisits',      requireAuth, asyncHandler(getEndedVisits));
router.get('/getFollowUpVisits',   requireAuth, asyncHandler(getFollowUpVisits));
router.get('/getVisitCounts',      requireAuth, asyncHandler(getVisitCountsCtl));

export default router;
