import { z } from 'zod';

/**
 * BE-PORTAL-VIS-01 — request DTOs for visit listing + counts.
 *
 * All list endpoints share the same query shape: facility (required for scoping),
 * optional provider filter, and cursor pagination. Cursor is opaque base64 —
 * decoded server-side into a startIndex.
 */

export const ListVisitsQuery = z.object({
  facilityUuid: z.string().uuid('facilityUuid must be a UUID'),
  providerUuid: z.string().uuid('providerUuid must be a UUID').optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListVisitsQuery = z.infer<typeof ListVisitsQuery>;

export const VisitCountsQuery = z.object({
  facilityUuid: z.string().uuid('facilityUuid must be a UUID'),
  providerUuid: z.string().uuid('providerUuid must be a UUID').optional(),
});
export type VisitCountsQuery = z.infer<typeof VisitCountsQuery>;

export const VisitBucketEnum = z.enum([
  'priority',
  'awaiting',
  'inProgress',
  'ended',
  'followUp',
]);
export type VisitBucket = z.infer<typeof VisitBucketEnum>;

/**
 * Normalised visit projection returned to mobile. Deliberately smaller than the
 * raw OpenMRS payload — mobile doesn't need every attribute, and shrinking the
 * response reduces sync traffic.
 */
export interface VisitCard {
  uuid: string;
  patientUuid: string;
  patientName: string | null;
  patientGender: string | null;
  patientAge: number | null;
  locationUuid: string | null;
  locationName: string | null;
  visitTypeUuid: string | null;
  startDatetime: string;
  stopDatetime: string | null;
  riskScore: number | null;
  stage: 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'outcomePending' | 'ended' | null;
  bucket: VisitBucket;
}

export interface ListVisitsResponse {
  bucket: VisitBucket;
  count: number;
  nextCursor: string | null;
  hasMore: boolean;
  visits: VisitCard[];
}

export interface VisitCountsResponse {
  facilityUuid: string;
  providerUuid: string | null;
  counts: Record<VisitBucket, number>;
  cachedAt: string; // ISO — so mobile knows how stale the number is
}
