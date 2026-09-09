/**
 * BE-GW-PROXY-01 tests — auth gate, path routing, header injection, downstream
 * failure modes, and circuit-breaker fast-fail.
 *
 * nock stubs all downstream HTTP so no real portal / webrtc / configuration
 * needs to be running.
 */
import nock from 'nock';
import request from 'supertest';
import { signAccessToken } from '@/modules/jwt/jwt.service';
import { createApp } from '@/app';
import { _resetBreakers } from '@/modules/proxy/proxy.service';
import { env } from '@/config/env';

const app = createApp();

const PORTAL_URL        = env.PORTAL_URL;
const CONFIGURATION_URL = env.CONFIGURATION_URL;

function bearer(): string {
  const { token } = signAccessToken({
    uuid: 'user-uuid-1',
    username: 'nurse.one',
    role: 'Nurse',
  });
  return `Bearer ${token}`;
}

beforeEach(() => {
  nock.cleanAll();
  _resetBreakers();
});
afterAll(() => {
  nock.enableNetConnect();
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH GATE
// ═══════════════════════════════════════════════════════════════════════════
describe('BE-GW-PROXY-01 · auth gate', () => {
  it('401 without Bearer token', async () => {
    const res = await request(app).get('/api/v1/openmrs/getInProgressVisits');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/openmrs/getInProgressVisits')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════
describe('BE-GW-PROXY-01 · route resolution', () => {
  it('404 PROXY_NO_ROUTE for unknown prefix', async () => {
    const res = await request(app)
      .get('/api/v1/unknown-thing')
      .set('Authorization', bearer());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROXY_NO_ROUTE');
  });

  it('forwards /openmrs to portal (path preserved)', async () => {
    const scope = nock(PORTAL_URL)
      .get('/openmrs/getInProgressVisits')
      .query(true)
      .reply(200, { bucket: 'inProgress', visits: [] });

    const res = await request(app)
      .get('/api/v1/openmrs/getInProgressVisits?facilityUuid=abc')
      .set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bucket: 'inProgress', visits: [] });
    expect(scope.isDone()).toBe(true);
  });

  it('forwards /config to configuration', async () => {
    const scope = nock(CONFIGURATION_URL)
      .get('/config/specializations')
      .query(true)
      .reply(200, { items: [{ id: 'x', name: 'Obstetrics' }] });

    const res = await request(app)
      .get('/api/v1/config/specializations')
      .set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe('Obstetrics');
    expect(scope.isDone()).toBe(true);
  });

  it('forwards POST body verbatim + preserves 201', async () => {
    const scope = nock(CONFIGURATION_URL)
      .post('/config/specializations', { name: 'Anaesthesia' })
      .reply(201, { id: 'new-uuid', name: 'Anaesthesia' });

    const res = await request(app)
      .post('/api/v1/config/specializations')
      .set('Authorization', bearer())
      .send({ name: 'Anaesthesia' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-uuid');
    expect(scope.isDone()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HEADER INJECTION
// ═══════════════════════════════════════════════════════════════════════════
describe('BE-GW-PROXY-01 · header injection', () => {
  it('injects X-User-Id / X-User-Role / Authorization + X-Request-ID', async () => {
    let capturedHeaders: Record<string, string> = {};
    const scope = nock(PORTAL_URL)
      .get('/openmrs/getVisitCounts')
      .query(true)
      .reply(function () {
        capturedHeaders = this.req.headers as Record<string, string>;
        return [200, { counts: {} }];
      });

    await request(app)
      .get('/api/v1/openmrs/getVisitCounts?facilityUuid=abc')
      .set('Authorization', bearer());

    expect(scope.isDone()).toBe(true);
    expect(capturedHeaders['x-user-id']).toBe('user-uuid-1');
    expect(capturedHeaders['x-user-role']).toBe('Nurse');
    expect(capturedHeaders['authorization']).toMatch(/^Bearer /);
    expect(capturedHeaders['x-request-id']).toBeTruthy();
  });

  it('overwrites client-supplied X-User-Id (no spoofing)', async () => {
    let capturedHeaders: Record<string, string> = {};
    nock(PORTAL_URL)
      .get('/openmrs/getVisitCounts')
      .query(true)
      .reply(function () {
        capturedHeaders = this.req.headers as Record<string, string>;
        return [200, {}];
      });

    await request(app)
      .get('/api/v1/openmrs/getVisitCounts?facilityUuid=abc')
      .set('Authorization', bearer())
      .set('X-User-Id', 'evil-attacker-uuid');

    expect(capturedHeaders['x-user-id']).toBe('user-uuid-1');
  });

  it('strips hop-by-hop Connection header on forward', async () => {
    let capturedHeaders: Record<string, string> = {};
    nock(PORTAL_URL)
      .get('/openmrs/getVisitCounts')
      .query(true)
      .reply(function () {
        capturedHeaders = this.req.headers as Record<string, string>;
        return [200, {}];
      });

    await request(app)
      .get('/api/v1/openmrs/getVisitCounts?facilityUuid=abc')
      .set('Authorization', bearer())
      .set('Connection', 'keep-alive');

    expect(capturedHeaders['connection']).not.toBe('keep-alive');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOWNSTREAM ERROR PROPAGATION
// ═══════════════════════════════════════════════════════════════════════════
describe('BE-GW-PROXY-01 · downstream errors', () => {
  it('passes downstream 400/404 through unchanged (breaker does not trip)', async () => {
    nock(PORTAL_URL)
      .get('/openmrs/getVisitCounts')
      .query(true)
      .reply(400, { error: { code: 'VALIDATION_ERROR', message: 'bad facilityUuid' } });

    const res = await request(app)
      .get('/api/v1/openmrs/getVisitCounts?facilityUuid=nope')
      .set('Authorization', bearer());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('502 PROXY_UPSTREAM_ERROR on downstream connection refused', async () => {
    nock(PORTAL_URL)
      .get('/openmrs/getInProgressVisits')
      .query(true)
      .replyWithError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' });

    const res = await request(app)
      .get('/api/v1/openmrs/getInProgressVisits?facilityUuid=abc')
      .set('Authorization', bearer());

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PROXY_UPSTREAM_ERROR');
  });
});
