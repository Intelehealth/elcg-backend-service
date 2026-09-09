/**
 * BE-PORTAL-VIS-01 tests — bucket categorisation, cursor pagination, counts cache.
 *
 * openmrs.client is jest-mocked so no network call is made. JWTs are signed with
 * the throwaway keys from tests/setup.ts.
 */
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { OpenMrsVisit } from '@/modules/openmrs/openmrs.client';

// Mock the OpenMRS client — every visits.service call is intercepted here.
jest.mock('@/modules/openmrs/openmrs.client', () => {
  const actual = jest.requireActual('@/modules/openmrs/openmrs.client');
  return {
    ...actual,
    openmrsClient: {
      getVisits: jest.fn(),
      isConfigured: () => true,
    },
  };
});

import { openmrsClient } from '@/modules/openmrs/openmrs.client';
import { _resetCountsCache } from '@/modules/visits/visits.service';
import { createApp } from '@/app';

const getVisitsMock = openmrsClient.getVisits as jest.MockedFunction<typeof openmrsClient.getVisits>;
const app = createApp();

// ── JWT helpers ────────────────────────────────────────────────────────────
const privateKey = fs.readFileSync(path.resolve(process.cwd(), 'keys', 'jwt-private.pem'), 'utf8');
const signToken = (overrides: Partial<{ userId: string; sessionId: string; name: string; roles: string[] }> = {}): string => {
  return jwt.sign(
    {
      data: {
        sessionId: overrides.sessionId ?? 'sess-1',
        userId:    overrides.userId    ?? 'user-uuid-1',
        name:      overrides.name      ?? 'Test Nurse',
        roles:     overrides.roles     ?? ['Nurse'],
      },
    },
    privateKey,
    { algorithm: 'RS256', expiresIn: '15m', issuer: 'elcg-auth-gateway', audience: 'elcg-clients', jwtid: 'jti-1' },
  );
};
const auth = () => `Bearer ${signToken()}`;

// ── fixtures ───────────────────────────────────────────────────────────────
const F = '00000000-0000-0000-0000-000000000001'; // facility uuid used across tests

function makeVisit(overrides: Partial<OpenMrsVisit> & { bucket?: 'priority'|'awaiting'|'inProgress'|'ended'|'followUp' } = {}): OpenMrsVisit {
  const base: OpenMrsVisit = {
    uuid: `v-${Math.random().toString(36).slice(2, 10)}`,
    startDatetime: '2026-09-09T08:00:00.000Z',
    stopDatetime: null,
    patient: { uuid: 'pt-1', display: 'Test Patient', person: { uuid: 'p-1', display: 'Test Patient', gender: 'F', age: 28 } },
    location: { uuid: F, display: 'Test Facility' },
    visitType: { uuid: 'vt-1', display: 'Labour' },
    attributes: [],
    encounters: [],
  };
  if (overrides.bucket === 'priority') {
    base.attributes = [{ uuid: 'a1', attributeType: { uuid: 'at1', display: 'riskScore' }, value: 5.2 }];
  } else if (overrides.bucket === 'awaiting') {
    base.attributes = [{ uuid: 'a1', attributeType: { uuid: 'at1', display: 'labourStageEnded' }, value: true }];
  } else if (overrides.bucket === 'ended') {
    base.stopDatetime = '2026-09-09T14:00:00.000Z';
  } else if (overrides.bucket === 'followUp') {
    base.attributes = [{ uuid: 'a1', attributeType: { uuid: 'at1', display: 'followUp' }, value: true }];
  }
  // strip helper key + merge caller overrides
  const { bucket: _drop, ...rest } = overrides;
  return { ...base, ...rest };
}

beforeEach(() => {
  getVisitsMock.mockReset();
  _resetCountsCache();
});

// ── AUTH gate ──────────────────────────────────────────────────────────────
describe('BE-PORTAL-VIS-01 · auth gate', () => {
  it('401 when no Bearer token', async () => {
    const res = await request(app).get('/openmrs/getInProgressVisits').query({ facilityUuid: F });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('401 when token signature is bad', async () => {
    const res = await request(app)
      .get('/openmrs/getInProgressVisits')
      .query({ facilityUuid: F })
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });
});

// ── VALIDATION ─────────────────────────────────────────────────────────────
describe('BE-PORTAL-VIS-01 · validation', () => {
  it('400 when facilityUuid is missing', async () => {
    const res = await request(app).get('/openmrs/getInProgressVisits').set('Authorization', auth());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 when facilityUuid is not a UUID', async () => {
    const res = await request(app)
      .get('/openmrs/getInProgressVisits')
      .query({ facilityUuid: 'not-a-uuid' })
      .set('Authorization', auth());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 when cursor is malformed', async () => {
    getVisitsMock.mockResolvedValue({ results: [] });
    const res = await request(app)
      .get('/openmrs/getInProgressVisits')
      .query({ facilityUuid: F, cursor: '!!!not-base64!!!' })
      .set('Authorization', auth());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VISITS_BAD_CURSOR');
  });
});

// ── BUCKET CLASSIFICATION ──────────────────────────────────────────────────
describe('BE-PORTAL-VIS-01 · bucket classification', () => {
  it('priority = risk score > 3.5', async () => {
    getVisitsMock.mockResolvedValue({
      results: [
        makeVisit({ bucket: 'priority' }),
        makeVisit({ bucket: 'inProgress' }),
        makeVisit({ bucket: 'priority' }),
      ],
    });
    const res = await request(app)
      .get('/openmrs/getPriorityVisits')
      .query({ facilityUuid: F })
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.bucket).toBe('priority');
    expect(res.body.count).toBe(2);
    expect(res.body.visits.every((v: { bucket: string }) => v.bucket === 'priority')).toBe(true);
    expect(res.body.visits[0].riskScore).toBe(5.2);
  });

  it('inProgress excludes priority + awaiting + ended', async () => {
    getVisitsMock.mockResolvedValue({
      results: [
        makeVisit({ bucket: 'inProgress' }),
        makeVisit({ bucket: 'priority' }),
        makeVisit({ bucket: 'awaiting' }),
        makeVisit({ bucket: 'ended' }),
      ],
    });
    const res = await request(app)
      .get('/openmrs/getInProgressVisits')
      .query({ facilityUuid: F })
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.visits[0].bucket).toBe('inProgress');
  });

  it('awaiting = labourStageEnded && no outcome encounter', async () => {
    getVisitsMock.mockResolvedValue({ results: [makeVisit({ bucket: 'awaiting' })] });
    const res = await request(app)
      .get('/openmrs/getAwaitingVisits')
      .query({ facilityUuid: F })
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('ended = stopDatetime not null (regardless of attributes)', async () => {
    getVisitsMock.mockResolvedValue({
      results: [
        makeVisit({ bucket: 'ended' }),
        makeVisit({ bucket: 'ended', attributes: [{ uuid: 'a', attributeType: { uuid: 'at', display: 'riskScore' }, value: 9.9 }] }),
      ],
    });
    const res = await request(app)
      .get('/openmrs/getEndedVisits')
      .query({ facilityUuid: F })
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.visits.every((v: { bucket: string }) => v.bucket === 'ended')).toBe(true);
  });

  it('followUp = followUp attribute truthy', async () => {
    getVisitsMock.mockResolvedValue({ results: [makeVisit({ bucket: 'followUp' })] });
    const res = await request(app)
      .get('/openmrs/getFollowUpVisits')
      .query({ facilityUuid: F })
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

// ── CURSOR PAGINATION ──────────────────────────────────────────────────────
describe('BE-PORTAL-VIS-01 · cursor pagination', () => {
  it('nextCursor present when OpenMRS returns a full page', async () => {
    // fetchLimit is limit*4 (capped at 100). limit=5 → fetch 20. Return exactly 20.
    const twenty = Array.from({ length: 20 }, () => makeVisit({ bucket: 'inProgress' }));
    getVisitsMock.mockResolvedValue({ results: twenty });
    const res = await request(app)
      .get('/openmrs/getInProgressVisits')
      .query({ facilityUuid: F, limit: 5 })
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.nextCursor).toBeTruthy();
    expect(res.body.count).toBe(5);
  });

  it('nextCursor null when OpenMRS returns fewer than fetchLimit', async () => {
    getVisitsMock.mockResolvedValue({ results: [makeVisit({ bucket: 'inProgress' })] });
    const res = await request(app)
      .get('/openmrs/getInProgressVisits')
      .query({ facilityUuid: F, limit: 25 })
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.nextCursor).toBeNull();
  });

  it('valid cursor is forwarded to OpenMRS as startIndex', async () => {
    getVisitsMock.mockResolvedValue({ results: [] });
    const cursor = Buffer.from(JSON.stringify({ s: 50 })).toString('base64url');
    await request(app)
      .get('/openmrs/getInProgressVisits')
      .query({ facilityUuid: F, cursor })
      .set('Authorization', auth());
    expect(getVisitsMock).toHaveBeenCalledWith(expect.objectContaining({ startIndex: 50 }));
  });
});

// ── COUNTS + CACHE ─────────────────────────────────────────────────────────
describe('BE-PORTAL-VIS-01 · getVisitCounts', () => {
  it('returns counts across all 5 buckets', async () => {
    getVisitsMock.mockResolvedValue({
      results: [
        makeVisit({ bucket: 'priority' }),
        makeVisit({ bucket: 'awaiting' }),
        makeVisit({ bucket: 'inProgress' }),
        makeVisit({ bucket: 'inProgress' }),
        makeVisit({ bucket: 'ended' }),
        makeVisit({ bucket: 'followUp' }),
      ],
    });
    const res = await request(app)
      .get('/openmrs/getVisitCounts')
      .query({ facilityUuid: F })
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({
      priority: 1, awaiting: 1, inProgress: 2, ended: 1, followUp: 1,
    });
    expect(res.body.cachedAt).toEqual(expect.any(String));
  });

  it('second call within 60s hits cache (only 1 OpenMRS fetch)', async () => {
    getVisitsMock.mockResolvedValue({ results: [makeVisit({ bucket: 'inProgress' })] });
    await request(app).get('/openmrs/getVisitCounts').query({ facilityUuid: F }).set('Authorization', auth());
    await request(app).get('/openmrs/getVisitCounts').query({ facilityUuid: F }).set('Authorization', auth());
    expect(getVisitsMock).toHaveBeenCalledTimes(1);
  });

  it('different providerUuid uses separate cache entry', async () => {
    getVisitsMock.mockResolvedValue({ results: [] });
    const p1 = '11111111-1111-1111-1111-111111111111';
    const p2 = '22222222-2222-2222-2222-222222222222';
    await request(app).get('/openmrs/getVisitCounts').query({ facilityUuid: F, providerUuid: p1 }).set('Authorization', auth());
    await request(app).get('/openmrs/getVisitCounts').query({ facilityUuid: F, providerUuid: p2 }).set('Authorization', auth());
    expect(getVisitsMock).toHaveBeenCalledTimes(2);
  });
});

// ── UPSTREAM ERROR PROPAGATION ─────────────────────────────────────────────
describe('BE-PORTAL-VIS-01 · upstream error', () => {
  it('OpenMRS 502 propagates as 502', async () => {
    const err = new Error('bad gateway') as Error & { status?: number; code?: string };
    err.status = 502;
    err.code = 'AUTH_OPENMRS_ERROR';
    getVisitsMock.mockRejectedValue(Object.assign(err, { name: 'HttpError' }));
    // The service throws HttpError which the error handler must expose as-is.
    // We simulate by making the mock throw the same HttpError the real client does.
    const { HttpError } = jest.requireActual('@/middleware/error-handler');
    getVisitsMock.mockRejectedValue(new HttpError(502, 'AUTH_OPENMRS_ERROR', 'OpenMRS upstream error'));
    const res = await request(app)
      .get('/openmrs/getInProgressVisits')
      .query({ facilityUuid: F })
      .set('Authorization', auth());
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('AUTH_OPENMRS_ERROR');
  });
});
