import { openmrsClient, type OpenMrsVisit } from '@/modules/openmrs/openmrs.client';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/utils/logger';
import type {
  ListVisitsQuery,
  ListVisitsResponse,
  VisitBucket,
  VisitCard,
  VisitCountsQuery,
  VisitCountsResponse,
} from './visits.dto';

/**
 * BE-PORTAL-VIS-01 — bucket rules + cursor pagination + counts cache.
 *
 * Bucket rules (approximated from IHRDMP-592 + legacy conventions — needs sign-off
 * with real OpenMRS instance):
 *   priority   → risk score attribute > 3.5 (IHRDMP-592)
 *   awaiting   → active visit + labour-ended attribute + no outcome encounter
 *   inProgress → active visit (stopDatetime null) not in priority/awaiting
 *   ended      → stopDatetime not null
 *   followUp   → follow-up attribute truthy
 *
 * Attribute-type + encounter-type display names come from the OpenMRS
 * uuid_dictionary the mobile app seeds. Names are matched case-insensitively.
 */

const RISK_ATTR_KEYS       = ['riskScore', 'cumulativeRiskScore', 'weightedRiskScore'];
const LABOUR_ENDED_KEYS    = ['labourStageEnded', 'labourEnded', 'stageEnded'];
const FOLLOWUP_KEYS        = ['followUp', 'followup', 'requiresFollowUp'];
const OUTCOME_ENCOUNTER    = ['visit complete', 'outcome', 'delivery outcome'];
const STAGE1_ENCOUNTER     = ['partogram_stage1', 'stage 1', 'stage1'];
const STAGE2_ENCOUNTER     = ['partogram_stage2', 'stage 2', 'stage2'];
const STAGE3_ENCOUNTER     = ['stage 3', 'stage3', 'delivery outcome'];
const STAGE4_ENCOUNTER     = ['stage 4', 'stage4', 'postpartum'];

const RISK_HIGH_THRESHOLD = 3.5;

// ── attribute readers ──────────────────────────────────────────────────────
function readAttr(v: OpenMrsVisit, keys: string[]): unknown {
  if (!v.attributes) return undefined;
  const lowerKeys = keys.map((k) => k.toLowerCase());
  const hit = v.attributes.find((a) => {
    const name = (a.attributeType?.display ?? a.display ?? '').toLowerCase();
    return lowerKeys.some((k) => name.includes(k.toLowerCase()));
  });
  return hit?.value;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', 'yes', '1'].includes(v.toLowerCase());
  return false;
}

function hasEncounter(v: OpenMrsVisit, needles: string[]): boolean {
  if (!v.encounters) return false;
  const lowered = needles.map((n) => n.toLowerCase());
  return v.encounters.some((e) => {
    const name = (e.encounterType?.display ?? '').toLowerCase();
    return lowered.some((n) => name.includes(n));
  });
}

// ── categorisation ─────────────────────────────────────────────────────────
export function classifyBucket(v: OpenMrsVisit): VisitBucket {
  if (v.stopDatetime) return 'ended';
  const risk = toNumber(readAttr(v, RISK_ATTR_KEYS));
  if (risk !== null && risk > RISK_HIGH_THRESHOLD) return 'priority';
  const labourEnded = toBool(readAttr(v, LABOUR_ENDED_KEYS));
  const hasOutcome  = hasEncounter(v, OUTCOME_ENCOUNTER);
  if (labourEnded && !hasOutcome) return 'awaiting';
  if (toBool(readAttr(v, FOLLOWUP_KEYS))) return 'followUp';
  return 'inProgress';
}

export function classifyStage(v: OpenMrsVisit): VisitCard['stage'] {
  if (v.stopDatetime) return 'ended';
  if (hasEncounter(v, OUTCOME_ENCOUNTER) && toBool(readAttr(v, LABOUR_ENDED_KEYS))) {
    return 'outcomePending';
  }
  if (hasEncounter(v, STAGE4_ENCOUNTER)) return 'stage4';
  if (hasEncounter(v, STAGE3_ENCOUNTER)) return 'stage3';
  if (hasEncounter(v, STAGE2_ENCOUNTER)) return 'stage2';
  if (hasEncounter(v, STAGE1_ENCOUNTER)) return 'stage1';
  return null;
}

export function toCard(v: OpenMrsVisit): VisitCard {
  return {
    uuid: v.uuid,
    patientUuid:   v.patient?.uuid ?? '',
    patientName:   v.patient?.display ?? v.patient?.person?.display ?? null,
    patientGender: v.patient?.person?.gender ?? null,
    patientAge:    typeof v.patient?.person?.age === 'number' ? v.patient.person.age : null,
    locationUuid:  v.location?.uuid ?? null,
    locationName:  v.location?.display ?? null,
    visitTypeUuid: v.visitType?.uuid ?? null,
    startDatetime: v.startDatetime,
    stopDatetime:  v.stopDatetime,
    riskScore:     toNumber(readAttr(v, RISK_ATTR_KEYS)),
    stage:         classifyStage(v),
    bucket:        classifyBucket(v),
  };
}

// ── cursor encoding (opaque base64) ────────────────────────────────────────
export function encodeCursor(startIndex: number): string {
  return Buffer.from(JSON.stringify({ s: startIndex })).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const s = Number(parsed?.s);
    return Number.isInteger(s) && s >= 0 ? s : 0;
  } catch {
    throw new HttpError(400, 'VISITS_BAD_CURSOR', 'cursor is not a valid pagination token');
  }
}

// ── counts cache (in-memory, 60s) ──────────────────────────────────────────
interface CountsCacheEntry {
  counts: Record<VisitBucket, number>;
  cachedAt: number;
}
const COUNTS_TTL_MS = 60_000;
const countsCache = new Map<string, CountsCacheEntry>();

function cacheKey(q: VisitCountsQuery): string {
  return `${q.facilityUuid}::${q.providerUuid ?? '*'}`;
}

/** Test helper — reset the cache between tests. Never called in prod. */
export function _resetCountsCache(): void {
  countsCache.clear();
}

// ── public service surface ─────────────────────────────────────────────────

/**
 * List visits for a single bucket. Returns cards + cursor for the next page.
 *
 * Fetches an oversized page from OpenMRS (limit × 4) so bucket filtering has
 * a good chance of returning `limit` matching visits in one round-trip.
 * `hasMore` is set based on whether OpenMRS returned any results at the tail.
 */
export async function listVisitsByBucket(
  bucket: VisitBucket,
  q: ListVisitsQuery,
): Promise<ListVisitsResponse> {
  const startIndex = decodeCursor(q.cursor);
  const fetchLimit = Math.min(q.limit * 4, 100);

  const { results } = await openmrsClient.getVisits({
    facilityUuid: q.facilityUuid,
    providerUuid: q.providerUuid,
    includeInactive: bucket === 'ended',
    startIndex,
    limit: fetchLimit,
  });

  const cards: VisitCard[] = [];
  for (const raw of results) {
    const card = toCard(raw);
    if (card.bucket === bucket) cards.push(card);
    if (cards.length >= q.limit) break;
  }

  const consumed = Math.min(results.length, q.limit === 0 ? 0 : results.length);
  const hasMore = results.length === fetchLimit; // OpenMRS returned a full page → more possible
  const nextCursor = hasMore ? encodeCursor(startIndex + consumed) : null;

  return {
    bucket,
    count: cards.length,
    nextCursor,
    hasMore,
    visits: cards,
  };
}

/**
 * Counts across all 5 buckets. One OpenMRS fetch (up to 500 visits per facility),
 * cached for 60 seconds. If a facility has >500 active visits the counts will
 * under-report — flag for tuning post-integration with real data.
 */
export async function getVisitCounts(q: VisitCountsQuery): Promise<VisitCountsResponse> {
  const key = cacheKey(q);
  const now = Date.now();
  const cached = countsCache.get(key);
  if (cached && now - cached.cachedAt < COUNTS_TTL_MS) {
    return {
      facilityUuid: q.facilityUuid,
      providerUuid: q.providerUuid ?? null,
      counts: cached.counts,
      cachedAt: new Date(cached.cachedAt).toISOString(),
    };
  }

  const { results } = await openmrsClient.getVisits({
    facilityUuid: q.facilityUuid,
    providerUuid: q.providerUuid,
    includeInactive: true,
    startIndex: 0,
    limit: 100,
  });

  const counts: Record<VisitBucket, number> = {
    priority: 0,
    awaiting: 0,
    inProgress: 0,
    ended: 0,
    followUp: 0,
  };
  for (const raw of results) counts[classifyBucket(raw)] += 1;

  countsCache.set(key, { counts, cachedAt: now });
  if (results.length === 100) {
    logger.warn({ facilityUuid: q.facilityUuid }, 'visit counts may under-report (>=100 visits)');
  }

  return {
    facilityUuid: q.facilityUuid,
    providerUuid: q.providerUuid ?? null,
    counts,
    cachedAt: new Date(now).toISOString(),
  };
}
