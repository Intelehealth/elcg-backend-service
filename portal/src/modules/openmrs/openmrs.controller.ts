import { Request, Response } from 'express';
import {
  VisitCountQuerySchema,
  VisitListQuerySchema,
  type VisitCategory,
  type VisitCountResponse,
  type VisitListResponse,
} from '@/modules/openmrs/openmrs.dto';
import * as openmrsService from '@/modules/openmrs/openmrs.service';

/**
 * Shared body of the three visit-list endpoints. The `{ count, totalCount, data,
 * success }` envelope is legacy's, kept so the dashboard's parsing is unchanged.
 */
async function sendVisitPage(req: Request, res: Response, category: VisitCategory): Promise<void> {
  const query = VisitListQuerySchema.parse(req.query);
  const page = await openmrsService.listVisits(category, query);
  const body: VisitListResponse = {
    count: page.currentCount,
    totalCount: page.totalCount,
    data: page.visits,
    success: true,
  };
  res.status(200).json(body);
}

/** `GET /openmrs/getPriorityVisits` — open visits with a risk score above 0. */
export async function getPriorityVisits(req: Request, res: Response): Promise<void> {
  await sendVisitPage(req, res, 'priority');
}

/** `GET /openmrs/getInProgressVisits` — open visits with no risk score. */
export async function getInProgressVisits(req: Request, res: Response): Promise<void> {
  await sendVisitPage(req, res, 'in-progress');
}

/** `GET /openmrs/getCompletedVisits` — visits that are completed or ended. */
export async function getCompletedVisits(req: Request, res: Response): Promise<void> {
  await sendVisitPage(req, res, 'completed');
}

/** `GET /openmrs/getVisitCounts` — active-visit counts per status for a speciality. */
export async function getVisitCounts(req: Request, res: Response): Promise<void> {
  const { speciality } = VisitCountQuerySchema.parse(req.query);
  const body: VisitCountResponse = {
    data: await openmrsService.countVisits(speciality),
    message: 'Visit count fetched successfully',
  };
  res.status(200).json(body);
}
