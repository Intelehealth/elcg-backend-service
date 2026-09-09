import { Request, Response } from 'express';
import { ListVisitsQuery, VisitCountsQuery, VisitBucket } from './visits.dto';
import { listVisitsByBucket, getVisitCounts } from './visits.service';

/**
 * BE-PORTAL-VIS-01 — one thin handler per bucket. Zod parse + delegate. All
 * heavy lifting (filtering, cursor, cache) lives in visits.service.
 */

function listBucket(bucket: VisitBucket) {
  return async (req: Request, res: Response): Promise<void> => {
    const q = ListVisitsQuery.parse(req.query);
    const body = await listVisitsByBucket(bucket, q);
    res.json(body);
  };
}

export const getPriorityVisits   = listBucket('priority');
export const getAwaitingVisits   = listBucket('awaiting');
export const getInProgressVisits = listBucket('inProgress');
export const getEndedVisits      = listBucket('ended');
export const getFollowUpVisits   = listBucket('followUp');

export async function getVisitCountsCtl(req: Request, res: Response): Promise<void> {
  const q = VisitCountsQuery.parse(req.query);
  const body = await getVisitCounts(q);
  res.json(body);
}
