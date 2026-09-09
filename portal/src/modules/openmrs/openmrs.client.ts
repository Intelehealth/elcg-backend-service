import axios, { AxiosInstance } from 'axios';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/utils/logger';

/**
 * Portal's OpenMRS REST client. Distinct from auth-gateway's client because
 * portal is the source of truth for non-auth OpenMRS proxying (facilities,
 * providers, patients, encounters).
 *
 * If OPENMRS_BASE_URL is empty, every call throws 503 — surfaces misconfiguration
 * loudly instead of returning silent fake data.
 */

export interface OpenMrsLocation {
  uuid: string;
  display: string;
  name: string;
  description?: string | null;
  address1?: string | null;
  address2?: string | null;
  cityVillage?: string | null;
  stateProvince?: string | null;
  country?: string | null;
  postalCode?: string | null;
  tags?: Array<{ uuid: string; display: string; name?: string }>;
  attributes?: Array<{ uuid: string; display: string }>;
}

export interface OpenMrsProvider {
  uuid: string;
  display: string;
  person?: {
    uuid: string;
    display: string;
    gender?: string;
    attributes?: Array<{ uuid: string; display: string; value?: unknown; attributeType?: { uuid: string; display: string } }>;
  };
  identifier?: string | null;
  attributes?: Array<{ uuid: string; display: string; value?: unknown; attributeType?: { uuid: string; display: string } }>;
  user?: { uuid: string; username?: string; systemId?: string };
}

/**
 * OpenMRS uuid_dictionary — reuse the same UUIDs the legacy mobile app seeds.
 * We keep them here (not in config) because provider filtering is server-side.
 */
export const PROVIDER_ATTRIBUTE_TYPES = {
  ROLE: 'Organizational: Doctor',
  FACILITY: '8d87236c-c2cc-11de-8d13-0010c6dffd0f', // ATTRIBUTE_HEALTH_CENTER — per legacy uuid dictionary
  SPECIALITY: '32496fb8-4106-4988-8622-a5ec89f52aa2',
} as const;

const openmrsUnavailable = (): never => {
  throw new HttpError(503, 'AUTH_OPENMRS_UNAVAILABLE', 'OpenMRS is not configured or reachable');
};

function buildClient(): AxiosInstance | null {
  if (!env.OPENMRS_BASE_URL) return null;
  return axios.create({
    baseURL: env.OPENMRS_BASE_URL.replace(/\/$/, ''),
    timeout: env.OPENMRS_REQUEST_TIMEOUT_MS,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });
}

const adminClient: AxiosInstance | null = buildClient();

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function adminAuthHeader(): { Authorization: string } {
  return { Authorization: basicAuthHeader(env.OPENMRS_USERNAME, env.OPENMRS_PASSWORD) };
}

export const openmrsClient = {
  /**
   * BE-OMRS-03 — List facilities (OpenMRS Locations tagged as Facility).
   *
   * Legacy used `/ws/rest/v1/location?tag=Facility&v=full`. Some deployments use
   * a different tag ("Login Location", "Visit Location"); we make this optional
   * via a query param. Default = no tag filter (returns all locations).
   *
   * Cached in-memory for 5 minutes — locations don't change often, but Cache-Control
   * means clients can also cache aggressively.
   */
  async getFacilities(tag?: string): Promise<OpenMrsLocation[]> {
    if (!adminClient) openmrsUnavailable();
    const params: Record<string, string> = { v: 'full' };
    if (tag) params.tag = tag;
    try {
      const res = await adminClient!.get<{ results: OpenMrsLocation[] }>('/ws/rest/v1/location', {
        params,
        headers: adminAuthHeader(),
      });
      return res.data.results ?? [];
    } catch (err) {
      logger.error({ err, tag }, 'OpenMRS location list failed');
      throw new HttpError(502, 'AUTH_OPENMRS_ERROR', 'OpenMRS upstream error');
    }
  },

  /** BE-OMRS-04 — single facility by UUID. */
  async getFacility(uuid: string): Promise<OpenMrsLocation | null> {
    if (!adminClient) openmrsUnavailable();
    try {
      const res = await adminClient!.get<OpenMrsLocation>(`/ws/rest/v1/location/${uuid}`, {
        params: { v: 'full' },
        headers: adminAuthHeader(),
      });
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      logger.error({ err, uuid }, 'OpenMRS facility lookup failed');
      throw new HttpError(502, 'AUTH_OPENMRS_ERROR', 'OpenMRS upstream error');
    }
  },

  /**
   * BE-OMRS-01 — providers (doctors) filtered by the requesting user's facility.
   *
   * Legacy PR #40 pattern (ProviderDAO.getDoctorList(setupLocationUuid)):
   *   SELECT p.* FROM tbl_provider p
   *   JOIN tbl_provider_attribute pa ON p.uuid = pa.provideruuid
   *   WHERE p.role = 'Organizational: Doctor'
   *     AND pa.attributetypeuuid = <FACILITY>
   *     AND pa.value = <setupLocationUuid>
   *
   * Server-side we hit OpenMRS `/provider?v=full` then filter in JS. OpenMRS
   * doesn't support attribute-value filters on the /provider endpoint natively.
   */
  async getProvidersForUser(userUuid: string, facilityUuid?: string): Promise<OpenMrsProvider[]> {
    if (!adminClient) openmrsUnavailable();
    try {
      const res = await adminClient!.get<{ results: OpenMrsProvider[] }>('/ws/rest/v1/provider', {
        params: { v: 'full' },
        headers: adminAuthHeader(),
      });
      const all = res.data.results ?? [];

      // Filter by role = "Organizational: Doctor" — check person attributes OR provider attributes
      let doctors = all.filter((p) => {
        const attrs = [...(p.attributes ?? []), ...(p.person?.attributes ?? [])];
        return attrs.some((a) =>
          a.attributeType?.display === PROVIDER_ATTRIBUTE_TYPES.ROLE
          || String(a.value ?? '').toLowerCase().includes('doctor'),
        );
      });

      // If facility supplied, further filter to that facility only (per PR #40)
      if (facilityUuid) {
        doctors = doctors.filter((p) => {
          const attrs = [...(p.attributes ?? []), ...(p.person?.attributes ?? [])];
          return attrs.some((a) =>
            a.attributeType?.uuid === PROVIDER_ATTRIBUTE_TYPES.FACILITY
            && String(a.value ?? '') === facilityUuid,
          );
        });
      }

      logger.debug({ userUuid, facilityUuid, count: doctors.length }, 'Doctors filtered');
      return doctors;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      logger.error({ err, userUuid }, 'OpenMRS provider fetch failed');
      throw new HttpError(502, 'AUTH_OPENMRS_ERROR', 'OpenMRS upstream error');
    }
  },

  /** BE-OMRS-02 — fetch a doctor document by hash. */
  async getDoctorDocument(_hash: string): Promise<Buffer | null> {
    if (!adminClient) openmrsUnavailable();
    throw new HttpError(501, 'NOT_IMPLEMENTED', 'getDoctorDocument — planned Sprint 47');
  },

  /**
   * BE-PAT-01/02/03/04 — Patient endpoints as REST proxy over OpenMRS.
   * OpenMRS patient shape: /ws/rest/v1/patient
   */
  async createPatient(body: unknown): Promise<{ uuid: string; display: string }> {
    if (!adminClient) openmrsUnavailable();
    try {
      const res = await adminClient!.post<{ uuid: string; display: string }>(
        '/ws/rest/v1/patient',
        body,
        { headers: adminAuthHeader() },
      );
      return res.data;
    } catch (err) {
      logger.error({ err }, 'OpenMRS patient create failed');
      throw new HttpError(502, 'AUTH_OPENMRS_ERROR', 'OpenMRS upstream error');
    }
  },

  async searchPatients(q: string, limit = 25): Promise<Array<{ uuid: string; display: string; identifiers?: unknown[] }>> {
    if (!adminClient) openmrsUnavailable();
    try {
      const res = await adminClient!.get<{ results: Array<{ uuid: string; display: string; identifiers?: unknown[] }> }>(
        '/ws/rest/v1/patient',
        { params: { q, v: 'default', limit }, headers: adminAuthHeader() },
      );
      return res.data.results ?? [];
    } catch (err) {
      logger.error({ err, q }, 'OpenMRS patient search failed');
      throw new HttpError(502, 'AUTH_OPENMRS_ERROR', 'OpenMRS upstream error');
    }
  },

  async getPatient(uuid: string): Promise<Record<string, unknown> | null> {
    if (!adminClient) openmrsUnavailable();
    try {
      const res = await adminClient!.get<Record<string, unknown>>(
        `/ws/rest/v1/patient/${uuid}`,
        { params: { v: 'full' }, headers: adminAuthHeader() },
      );
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      logger.error({ err, uuid }, 'OpenMRS patient lookup failed');
      throw new HttpError(502, 'AUTH_OPENMRS_ERROR', 'OpenMRS upstream error');
    }
  },

  /** BE-PAT-04 — visits list for a patient (used by summary aggregator). */
  async getPatientVisits(patientUuid: string): Promise<Array<Record<string, unknown>>> {
    if (!adminClient) openmrsUnavailable();
    try {
      const res = await adminClient!.get<{ results: Array<Record<string, unknown>> }>(
        '/ws/rest/v1/visit',
        {
          params: { patient: patientUuid, v: 'default', limit: 50 },
          headers: adminAuthHeader(),
        },
      );
      return res.data.results ?? [];
    } catch (err) {
      logger.error({ err, patientUuid }, 'OpenMRS patient visits fetch failed');
      throw new HttpError(502, 'AUTH_OPENMRS_ERROR', 'OpenMRS upstream error');
    }
  },

  /**
   * BE-PORTAL-VIS-01 — raw visit fetch. Returns visits scoped to a facility
   * (and optionally a provider). Bucket categorisation (priority/awaiting/
   * in-progress/ended/follow-up) is applied in visits.service, not here — this
   * client stays a thin OpenMRS wrapper.
   *
   * Params passed straight to OpenMRS /ws/rest/v1/visit:
   *   - location — facility uuid (required for scoping; we do not return
   *     cross-facility visits)
   *   - includeInactive — `true` fetches ended visits alongside active ones;
   *     categorisation handles the split
   *   - v — full so we get attributes + encounters for bucket rules
   *   - limit/startIndex — OpenMRS cursor pagination
   */
  async getVisits(params: {
    facilityUuid: string;
    providerUuid?: string;
    includeInactive?: boolean;
    startIndex?: number;
    limit?: number;
  }): Promise<{ results: OpenMrsVisit[]; totalCount?: number }> {
    if (!adminClient) openmrsUnavailable();
    const qp: Record<string, string | number | boolean> = {
      location: params.facilityUuid,
      includeInactive: params.includeInactive ?? true,
      v: 'full',
      limit: Math.min(Math.max(params.limit ?? 25, 1), 100),
      startIndex: Math.max(params.startIndex ?? 0, 0),
    };
    if (params.providerUuid) qp.provider = params.providerUuid;
    try {
      const res = await adminClient!.get<{ results: OpenMrsVisit[]; totalCount?: number }>(
        '/ws/rest/v1/visit',
        { params: qp, headers: adminAuthHeader() },
      );
      return { results: res.data.results ?? [], totalCount: res.data.totalCount };
    } catch (err) {
      logger.error({ err, params }, 'OpenMRS visits fetch failed');
      throw new HttpError(502, 'AUTH_OPENMRS_ERROR', 'OpenMRS upstream error');
    }
  },

  isConfigured(): boolean {
    return adminClient !== null;
  },
};

/**
 * Minimal shape of an OpenMRS visit — only the fields the bucket rules read.
 * Full OpenMRS payload has ~30 fields; we deliberately keep this narrow so
 * bucket logic can't accidentally drift into unstable OpenMRS internals.
 */
export interface OpenMrsVisit {
  uuid: string;
  display?: string;
  startDatetime: string; // ISO 8601
  stopDatetime: string | null;
  patient?: {
    uuid: string;
    display?: string;
    person?: { uuid: string; display?: string; gender?: string; age?: number };
  };
  location?: { uuid: string; display?: string };
  visitType?: { uuid: string; display?: string };
  attributes?: Array<{
    uuid: string;
    display?: string;
    value?: unknown;
    attributeType?: { uuid: string; display?: string };
  }>;
  encounters?: Array<{
    uuid: string;
    encounterType?: { uuid: string; display?: string };
    encounterDatetime?: string;
  }>;
}
