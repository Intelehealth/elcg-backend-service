/**
 * BE-CFG-MD-01 tests — full CRUD × 3 master types, with role gating and
 * conflict / not-found handling. Uses in-memory SQLite so no MySQL is required.
 */
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '@/app';
import { sequelize } from '@/db/sequelize';

const privateKey = fs.readFileSync(path.resolve(process.cwd(), 'keys', 'jwt-private.pem'), 'utf8');
const app = createApp();

function tokenFor(roles: string[]): string {
  return jwt.sign(
    { data: { sessionId: 'sess', userId: 'user-1', name: 'Test', roles } },
    privateKey,
    { algorithm: 'RS256', expiresIn: '15m', issuer: 'elcg-auth-gateway', audience: 'elcg-clients', jwtid: 'jti' },
  );
}
const nurse = () => `Bearer ${tokenFor(['Nurse'])}`;
const admin = () => `Bearer ${tokenFor(['Admin'])}`;

beforeAll(async () => {
  // sync the in-memory sqlite schema from model definitions
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  await sequelize.truncate({ cascade: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH GATE
// ═══════════════════════════════════════════════════════════════════════════
describe('BE-CFG-MD-01 · auth gate', () => {
  it('401 without Bearer on list', async () => {
    const res = await request(app).get('/config/specializations');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('403 when Nurse tries to write', async () => {
    const res = await request(app)
      .post('/config/specializations')
      .set('Authorization', nurse())
      .send({ name: 'Obstetrics' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
  });

  it('201 when Admin writes', async () => {
    const res = await request(app)
      .post('/config/specializations')
      .set('Authorization', admin())
      .send({ name: 'Obstetrics' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Obstetrics');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIZATIONS CRUD
// ═══════════════════════════════════════════════════════════════════════════
describe('BE-CFG-MD-01 · specializations', () => {
  it('full CRUD lifecycle', async () => {
    // create
    const create = await request(app)
      .post('/config/specializations')
      .set('Authorization', admin())
      .send({ name: 'Obstetrics', displayOrder: 1 });
    expect(create.status).toBe(201);
    const id = create.body.id;

    // list (default isActive=true)
    const list = await request(app).get('/config/specializations').set('Authorization', nurse());
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].name).toBe('Obstetrics');

    // update
    const upd = await request(app)
      .put(`/config/specializations/${id}`)
      .set('Authorization', admin())
      .send({ displayOrder: 5 });
    expect(upd.status).toBe(200);
    expect(upd.body.displayOrder).toBe(5);

    // soft-delete
    const del = await request(app)
      .delete(`/config/specializations/${id}`)
      .set('Authorization', admin());
    expect(del.status).toBe(200);
    expect(del.body.isActive).toBe(false);

    // now hidden from default list
    const list2 = await request(app).get('/config/specializations').set('Authorization', nurse());
    expect(list2.body.items).toHaveLength(0);

    // ?isActive=all surfaces soft-deleted rows
    const listAll = await request(app)
      .get('/config/specializations?isActive=all')
      .set('Authorization', nurse());
    expect(listAll.body.items).toHaveLength(1);
  });

  it('409 on duplicate name', async () => {
    await request(app)
      .post('/config/specializations')
      .set('Authorization', admin())
      .send({ name: 'Obstetrics' });
    const dup = await request(app)
      .post('/config/specializations')
      .set('Authorization', admin())
      .send({ name: 'Obstetrics' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('SPECIALIZATION_DUPLICATE');
  });

  it('404 on unknown id update', async () => {
    const res = await request(app)
      .put('/config/specializations/00000000-0000-0000-0000-000000000999')
      .set('Authorization', admin())
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SPECIALIZATION_NOT_FOUND');
  });

  it('400 on missing name at create', async () => {
    const res = await request(app)
      .post('/config/specializations')
      .set('Authorization', admin())
      .send({ displayOrder: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGES CRUD
// ═══════════════════════════════════════════════════════════════════════════
describe('BE-CFG-MD-01 · languages', () => {
  it('accepts ISO 639-1 codes and rejects garbage', async () => {
    const ok = await request(app)
      .post('/config/languages')
      .set('Authorization', admin())
      .send({ code: 'ne', name: 'Nepali', nativeName: 'नेपाली' });
    expect(ok.status).toBe(201);
    expect(ok.body.nativeName).toBe('नेपाली');

    const bad = await request(app)
      .post('/config/languages')
      .set('Authorization', admin())
      .send({ code: 'ENGLISH', name: 'English' });
    expect(bad.status).toBe(400);
  });

  it('unique code enforced', async () => {
    await request(app).post('/config/languages').set('Authorization', admin())
      .send({ code: 'en', name: 'English' });
    const dup = await request(app).post('/config/languages').set('Authorization', admin())
      .send({ code: 'en', name: 'English (US)' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('LANGUAGE_DUPLICATE');
  });

  it('nativeName defaults to null when omitted', async () => {
    const res = await request(app).post('/config/languages').set('Authorization', admin())
      .send({ code: 'hi', name: 'Hindi' });
    expect(res.status).toBe(201);
    expect(res.body.nativeName).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DROPDOWN VALUES CRUD
// ═══════════════════════════════════════════════════════════════════════════
describe('BE-CFG-MD-01 · dropdown-values', () => {
  it('list requires category', async () => {
    const res = await request(app).get('/config/dropdown-values').set('Authorization', nurse());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('list filters by category', async () => {
    await request(app).post('/config/dropdown-values').set('Authorization', admin())
      .send({ category: 'province', key: 'koshi', label: 'Koshi' });
    await request(app).post('/config/dropdown-values').set('Authorization', admin())
      .send({ category: 'province', key: 'bagmati', label: 'Bagmati' });
    await request(app).post('/config/dropdown-values').set('Authorization', admin())
      .send({ category: 'risk_factor', key: 'prev_lscs', label: 'Previous LSCS' });

    const provinces = await request(app)
      .get('/config/dropdown-values?category=province')
      .set('Authorization', nurse());
    expect(provinces.status).toBe(200);
    expect(provinces.body.category).toBe('province');
    expect(provinces.body.items).toHaveLength(2);

    const risks = await request(app)
      .get('/config/dropdown-values?category=risk_factor')
      .set('Authorization', nurse());
    expect(risks.body.items).toHaveLength(1);
    expect(risks.body.items[0].label).toBe('Previous LSCS');
  });

  it('409 on duplicate (category, key)', async () => {
    await request(app).post('/config/dropdown-values').set('Authorization', admin())
      .send({ category: 'province', key: 'koshi', label: 'Koshi' });
    const dup = await request(app).post('/config/dropdown-values').set('Authorization', admin())
      .send({ category: 'province', key: 'koshi', label: 'Koshi (dup)' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DROPDOWN_VALUE_DUPLICATE');
  });

  it('same key under a DIFFERENT category is allowed', async () => {
    await request(app).post('/config/dropdown-values').set('Authorization', admin())
      .send({ category: 'province', key: 'other', label: 'Other' });
    const ok = await request(app).post('/config/dropdown-values').set('Authorization', admin())
      .send({ category: 'risk_factor', key: 'other', label: 'Other' });
    expect(ok.status).toBe(201);
  });

  it('rejects category with uppercase or spaces', async () => {
    const res = await request(app).post('/config/dropdown-values').set('Authorization', admin())
      .send({ category: 'Risk Factors', key: 'x', label: 'X' });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ID PARAM VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
describe('BE-CFG-MD-01 · id param validation', () => {
  it('400 when :id is not a UUID', async () => {
    const res = await request(app)
      .put('/config/languages/not-a-uuid')
      .set('Authorization', admin())
      .send({ name: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
