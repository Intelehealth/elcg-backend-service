import { Router } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { requireAuth } from '@/modules/jwt/jwt.middleware';
import * as openmrsController from '@/modules/openmrs/openmrs.controller';

/**
 * Read-only visit APIs over the OpenMRS schema, ported from legacy portal's
 * `routes/openmrs.route.js`. Paths are unchanged so clients only swap base URL.
 */
const router = Router();

router.use(requireAuth);

/* GET /openmrs/getVisitCounts?speciality= — active-visit counts per status */
router.get('/getVisitCounts', asyncHandler(openmrsController.getVisitCounts));

/* GET /openmrs/getPriorityVisits?page=&limit=&facilityUuid= — dashboard "Priority" section */
router.get('/getPriorityVisits', asyncHandler(openmrsController.getPriorityVisits));

/* GET /openmrs/getInProgressVisits?page=&limit=&facilityUuid= — dashboard "In progress" section */
router.get('/getInProgressVisits', asyncHandler(openmrsController.getInProgressVisits));

/* GET /openmrs/getCompletedVisits?page=&limit=&facilityUuid= — dashboard "Completed" section */
router.get('/getCompletedVisits', asyncHandler(openmrsController.getCompletedVisits));

export default router;
