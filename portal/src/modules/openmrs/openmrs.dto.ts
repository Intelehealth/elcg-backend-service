import { z } from 'zod';

/** Upper bound on `limit` — legacy's cap, protects the DB from unbounded pages. */
export const MAX_PAGE_SIZE = 5000;

/** Legacy's default page size when the client sends no `limit`. */
export const DEFAULT_PAGE_SIZE = 1000;

/**
 * Query string of `GET /openmrs/get{Priority,InProgress,Completed}Visits`.
 *
 * `facilityUuid` — when present, only visits at that location are returned. An
 * empty value (`?facilityUuid=`, which the dashboard sends when the provider has
 * no facility) means "no filter", same as legacy's `|| null`.
 */
export const VisitListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_PAGE_SIZE)
    .transform((value) => Math.min(value, MAX_PAGE_SIZE)),
  facilityUuid: z
    .string()
    .trim()
    .max(38)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/** Query string of `GET /openmrs/getVisitCounts`. */
export const VisitCountQuerySchema = z.object({
  speciality: z.string().trim().max(255).optional(),
});

export type VisitListQuery = z.infer<typeof VisitListQuerySchema>;
export type VisitCountQuery = z.infer<typeof VisitCountQuerySchema>;

/** The three dashboard sections a visit can fall into. */
export type VisitCategory = 'priority' | 'in-progress' | 'completed';

/** A row of `visitStatusQuery` — only the columns the service reads. */
export interface VisitStatusRow {
  visit_id: number;
  uuid: string;
  location_uuid: string | null;
  Status: 'Completed Visit' | 'Visit In Progress';
}

/** A row of the visit-count queries. `Status` is null for visits in no known bucket. */
export interface VisitCountRow {
  Total: number;
  Status: 'Completed Visit' | 'Visit In Progress' | 'Priority' | 'Awaiting Consult' | null;
}

/** A visit's raw "Visit Risk" attribute value, as stored by the mobile app. */
export interface VisitRiskRow {
  visit_id: number;
  value_reference: string | null;
}

/*
 * ── Visit-list payload ────────────────────────────────────────────────────────
 * The raw OpenMRS visit tree, unchanged from legacy so existing dashboard
 * parsing (stage, alerts, provider, birth outcome …) keeps working.
 */

export interface PersonNamePayload {
  given_name: string | null;
  family_name: string | null;
}

export interface ObsPayload {
  value_text: string | null;
  value_numeric: number | null;
  /** LCG alert flag — 'R' (red) or 'Y' (yellow) when the reading is out of range. */
  comments: string | null;
  uuid: string;
  voided: boolean;
  concept: {
    uuid: string;
    concept_name: { name: string; voided: boolean }[];
  } | null;
}

export interface EncounterPayload {
  encounter_datetime: Date;
  uuid: string;
  voided: boolean;
  obs: ObsPayload[];
  type: { name: string } | null;
  encounter_provider: {
    uuid: string;
    voided: boolean;
    provider: {
      identifier: string | null;
      uuid: string;
      person: { gender: string | null; person_name: PersonNamePayload | null } | null;
    } | null;
  } | null;
}

export interface VisitAttributePayload {
  value_reference: string | null;
  uuid: string;
  voided: boolean;
  attribute_type: { name: string; uuid: string } | null;
}

export interface VisitListItem {
  visit_id: number;
  uuid: string;
  date_started: Date;
  date_stopped: Date | null;
  voided: boolean;
  encounters: EncounterPayload[];
  patient: { identifier: string } | null;
  patient_name: PersonNamePayload | null;
  person: { uuid: string; gender: string | null; birthdate: Date | null } | null;
  attributes: VisitAttributePayload[];
}

/** One page of a visit list, as returned by the service layer. */
export interface VisitPage {
  /** Visits in the whole category (all pages), for the paginator. */
  totalCount: number;
  /** Visits on this page. */
  currentCount: number;
  visits: VisitListItem[];
}

/** Legacy response envelope of the visit-list endpoints. */
export interface VisitListResponse {
  count: number;
  totalCount: number;
  data: VisitListItem[];
  success: true;
}

/** Legacy response envelope of `GET /openmrs/getVisitCounts`. */
export interface VisitCountResponse {
  data: VisitCountRow[];
  message: string;
}
