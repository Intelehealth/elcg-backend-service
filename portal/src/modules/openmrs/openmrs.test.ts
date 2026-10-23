import request from 'supertest';
import { createApp } from '@/app';
import * as openmrsRepository from '@/modules/openmrs/openmrs.repository';
import type { VisitListItem, VisitStatusRow } from '@/modules/openmrs/openmrs.dto';
import { signTestToken } from '../../../tests/helpers/tokens';

jest.mock('@/modules/openmrs/openmrs.repository');

const mockedRepo = jest.mocked(openmrsRepository);
const app = createApp();
const auth = { Authorization: `Bearer ${signTestToken()}` };

function statusRow(visitId: number, Status: VisitStatusRow['Status']): VisitStatusRow {
  return { visit_id: visitId, uuid: `visit-${visitId}`, location_uuid: 'facility-1', Status };
}

function visitTree(visitId: number): Omit<VisitListItem, 'attributes'> {
  return {
    visit_id: visitId,
    uuid: `visit-${visitId}`,
    date_started: new Date('2026-10-01T08:00:00.000Z'),
    date_stopped: null,
    voided: false,
    encounters: [],
    patient: { identifier: `OMRS-${visitId}` },
    patient_name: { given_name: 'Asha', family_name: 'Devi' },
    person: { uuid: `person-${visitId}`, gender: 'F', birthdate: null },
  };
}

/*
 * Visits 5 and 4 are open, 3 is open with no risk attribute, 2 and 1 are completed.
 * Visit 5 is risky (score 2); visit 4's risk value is unparseable, so it scores 0.
 */
const STATUSES: VisitStatusRow[] = [
  statusRow(5, 'Visit In Progress'),
  statusRow(4, 'Visit In Progress'),
  statusRow(3, 'Visit In Progress'),
  statusRow(2, 'Completed Visit'),
  statusRow(1, 'Completed Visit'),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockedRepo.findVisitStatuses.mockResolvedValue(STATUSES);
  mockedRepo.findVisitRiskAttributes.mockResolvedValue([
    { visit_id: 5, value_reference: '2' },
    { visit_id: 5, value_reference: '0' },
    { visit_id: 4, value_reference: 'n/a' },
  ]);
  mockedRepo.findVisitsWithEncounters.mockImplementation(async (ids) => ids.map(visitTree));
  mockedRepo.findVisitAttributesByVisit.mockImplementation(
    async (ids) =>
      new Map(
        ids.map((id) => [
          id,
          [{ value_reference: 'x', uuid: `attr-${id}`, voided: false, attribute_type: null }],
        ]),
      ),
  );
});

describe('auth', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await request(app).get('/openmrs/getPriorityVisits');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(mockedRepo.findVisitStatuses).not.toHaveBeenCalled();
  });

  it('rejects a validly signed token that is not an access token', async () => {
    const res = await request(app)
      .get('/openmrs/getPriorityVisits')
      .set('Authorization', `Bearer ${signTestToken({ typ: 'refresh' })}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token from another issuer', async () => {
    const res = await request(app)
      .get('/openmrs/getPriorityVisits')
      .set('Authorization', `Bearer ${signTestToken({ issuer: 'someone-else' })}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('reports an expired token as TOKEN_EXPIRED', async () => {
    const res = await request(app)
      .get('/openmrs/getPriorityVisits')
      .set('Authorization', `Bearer ${signTestToken({ expiresIn: -10 })}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('GET /openmrs/getPriorityVisits', () => {
  it('returns only open visits with a risk score above 0, in the legacy envelope', async () => {
    const res = await request(app).get('/openmrs/getPriorityVisits').set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 1, totalCount: 1, success: true });
    expect(res.body.data.map((v: VisitListItem) => v.visit_id)).toEqual([5]);
    expect(res.body.data[0].attributes).toEqual([
      { value_reference: 'x', uuid: 'attr-5', voided: false, attribute_type: null },
    ]);
    expect(mockedRepo.findVisitRiskAttributes).toHaveBeenCalledWith([5, 4, 3]);
  });
});

describe('GET /openmrs/getInProgressVisits', () => {
  it('returns open visits whose risk score is 0, missing or unparseable', async () => {
    const res = await request(app).get('/openmrs/getInProgressVisits').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(2);
    expect(res.body.data.map((v: VisitListItem) => v.visit_id)).toEqual([4, 3]);
  });

  it('paginates the id list before loading visit trees', async () => {
    const res = await request(app).get('/openmrs/getInProgressVisits?page=2&limit=1').set(auth);

    expect(res.body).toMatchObject({ count: 1, totalCount: 2 });
    expect(mockedRepo.findVisitsWithEncounters).toHaveBeenCalledWith([3]);
    expect(mockedRepo.findVisitAttributesByVisit).toHaveBeenCalledWith([3]);
  });

  it('skips the visit-tree queries for a page past the end', async () => {
    const res = await request(app).get('/openmrs/getInProgressVisits?page=9&limit=10').set(auth);

    expect(res.body).toEqual({ count: 0, totalCount: 2, data: [], success: true });
    expect(mockedRepo.findVisitsWithEncounters).not.toHaveBeenCalled();
  });
});

describe('GET /openmrs/getCompletedVisits', () => {
  it('returns completed visits without looking up risk scores', async () => {
    const res = await request(app).get('/openmrs/getCompletedVisits').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((v: VisitListItem) => v.visit_id)).toEqual([2, 1]);
    expect(mockedRepo.findVisitRiskAttributes).not.toHaveBeenCalled();
  });
});

describe('visit-list query string', () => {
  it('passes facilityUuid through to the status query', async () => {
    await request(app).get('/openmrs/getCompletedVisits?facilityUuid=facility-1').set(auth);

    expect(mockedRepo.findVisitStatuses).toHaveBeenCalledWith('facility-1');
  });

  it('treats an empty facilityUuid as no filter', async () => {
    await request(app).get('/openmrs/getCompletedVisits?facilityUuid=').set(auth);

    expect(mockedRepo.findVisitStatuses).toHaveBeenCalledWith(undefined);
  });

  it('caps limit at 5000', async () => {
    const ids = Array.from({ length: 6000 }, (_, i) => 6000 - i);
    mockedRepo.findVisitStatuses.mockResolvedValue(
      ids.map((id) => statusRow(id, 'Completed Visit')),
    );

    const res = await request(app).get('/openmrs/getCompletedVisits?limit=10000').set(auth);

    expect(res.body).toMatchObject({ count: 5000, totalCount: 6000 });
  });

  it.each(['page=0', 'page=abc', 'limit=-1'])('rejects %s with a 400', async (query) => {
    const res = await request(app).get(`/openmrs/getCompletedVisits?${query}`).set(auth);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /openmrs/getVisitCounts', () => {
  const counts = [{ Total: 3, Status: 'Visit In Progress' as const }];

  it('uses the General Physician query for speciality=General Physician', async () => {
    mockedRepo.countVisitsForGeneralPhysician.mockResolvedValue(counts);

    const res = await request(app)
      .get('/openmrs/getVisitCounts?speciality=General%20Physician')
      .set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: counts, message: 'Visit count fetched successfully' });
    expect(mockedRepo.countVisitsBySpeciality).not.toHaveBeenCalled();
  });

  it('uses the speciality query for any other speciality', async () => {
    mockedRepo.countVisitsBySpeciality.mockResolvedValue(counts);

    await request(app).get('/openmrs/getVisitCounts?speciality=Gynecologist').set(auth);

    expect(mockedRepo.countVisitsBySpeciality).toHaveBeenCalledWith('Gynecologist');
  });

  it('falls back to the speciality query for General Physician when omitted (legacy quirk)', async () => {
    mockedRepo.countVisitsBySpeciality.mockResolvedValue(counts);

    await request(app).get('/openmrs/getVisitCounts').set(auth);

    expect(mockedRepo.countVisitsBySpeciality).toHaveBeenCalledWith('General Physician');
    expect(mockedRepo.countVisitsForGeneralPhysician).not.toHaveBeenCalled();
  });
});

describe('unexpected failures', () => {
  it('returns the standard 500 envelope when the database errors', async () => {
    mockedRepo.findVisitStatuses.mockRejectedValue(new Error('ER_CON_COUNT_ERROR'));

    const res = await request(app).get('/openmrs/getCompletedVisits').set(auth);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
