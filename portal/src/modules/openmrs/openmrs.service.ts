import * as openmrsRepository from '@/modules/openmrs/openmrs.repository';
import type {
  VisitCategory,
  VisitCountRow,
  VisitListQuery,
  VisitPage,
  VisitRiskRow,
  VisitStatusRow,
} from '@/modules/openmrs/openmrs.dto';

/** The speciality whose counts also include visits with no speciality attribute. */
export const GENERAL_PHYSICIAN = 'General Physician';

/**
 * Maps each visit to its LCG risk score. Mirrors legacy exactly: the first
 * "Visit Risk" row per visit wins, and a missing or non-numeric value scores 0
 * (`parseFloat`, so "3.5abc" still reads as 3.5).
 */
function buildRiskScores(rows: VisitRiskRow[]): Map<number, number> {
  const scores = new Map<number, number>();
  for (const row of rows) {
    if (scores.has(row.visit_id)) continue;
    const score = row.value_reference ? parseFloat(row.value_reference) : 0;
    scores.set(row.visit_id, Number.isNaN(score) ? 0 : score);
  }
  return scores;
}

/**
 * Resolves which visit ids belong to a dashboard section, newest first.
 *
 *  - completed    — status "Completed Visit".
 *  - priority     — status "Visit In Progress" with a risk score above 0.
 *  - in-progress  — status "Visit In Progress" with a risk score of exactly 0.
 */
async function resolveVisitIds(
  category: VisitCategory,
  statuses: VisitStatusRow[],
): Promise<number[]> {
  if (category === 'completed') {
    return statuses.filter((row) => row.Status === 'Completed Visit').map((row) => row.visit_id);
  }

  const openIds = statuses
    .filter((row) => row.Status === 'Visit In Progress')
    .map((row) => row.visit_id);
  const scores = buildRiskScores(await openmrsRepository.findVisitRiskAttributes(openIds));

  return openIds.filter((visitId) => {
    const score = scores.get(visitId) ?? 0;
    return category === 'priority' ? score > 0 : score === 0;
  });
}

/**
 * One page of a dashboard section. Pagination is applied to the resolved id
 * list before the heavy visit-tree query, so only the requested page is loaded.
 */
export async function listVisits(
  category: VisitCategory,
  { page, limit, facilityUuid }: VisitListQuery,
): Promise<VisitPage> {
  const statuses = await openmrsRepository.findVisitStatuses(facilityUuid);
  const visitIds = await resolveVisitIds(category, statuses);

  const offset = limit * (page - 1);
  const pageIds = visitIds.slice(offset, offset + limit);
  if (pageIds.length === 0) {
    return { totalCount: visitIds.length, currentCount: 0, visits: [] };
  }

  const [visits, attributesByVisit] = await Promise.all([
    openmrsRepository.findVisitsWithEncounters(pageIds),
    openmrsRepository.findVisitAttributesByVisit(pageIds),
  ]);

  return {
    totalCount: visitIds.length,
    currentCount: visits.length,
    visits: visits.map((visit) => ({
      ...visit,
      attributes: attributesByVisit.get(visit.visit_id) ?? [],
    })),
  };
}

/**
 * Active-visit counts per status for a speciality. Legacy quirk kept on purpose:
 * only an explicit "General Physician" uses the GP query (which also counts
 * visits with no speciality); an omitted speciality runs the regular query
 * against "General Physician".
 */
export async function countVisits(speciality?: string): Promise<VisitCountRow[]> {
  if (speciality === GENERAL_PHYSICIAN) {
    return openmrsRepository.countVisitsForGeneralPhysician();
  }
  return openmrsRepository.countVisitsBySpeciality(speciality ?? GENERAL_PHYSICIAN);
}
