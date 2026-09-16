import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '@/app';
import { env } from '@/config/env';
import * as authController from '@/modules/auth/auth.controller';
import * as authRepository from '@/modules/auth/auth.repository';
import * as userRepository from '@/modules/users/user.repository';
import * as tokenRepository from '@/modules/jwt/refresh-token.repository';

jest.mock('@/modules/auth/auth.repository');
jest.mock('@/modules/users/user.repository');
jest.mock('@/modules/jwt/refresh-token.repository');

const mockedAuthRepo = jest.mocked(authRepository);
const mockedUserRepo = jest.mocked(userRepository);
const mockedTokenRepo = jest.mocked(tokenRepository);

const PASSWORD = 'Secret123!';
const SALT = 'a'.repeat(128);
const USER_UUID = '11111111-1111-4111-8111-111111111111';
const app = createApp();

/** Mirrors an OpenMRS `users` row: SHA-512(password + salt) as padded hex. */
function buildOpenmrsUser(overrides: Record<string, unknown> = {}) {
  return {
    userId: 42,
    systemId: 'nurse01-1',
    username: 'nurse01',
    password: crypto
      .createHash('sha512')
      .update(PASSWORD + SALT, 'utf8')
      .digest('hex'),
    salt: SALT,
    personId: 7,
    retired: false,
    uuid: USER_UUID,
    ...overrides,
  };
}

function buildIdentity(overrides: Record<string, unknown> = {}) {
  return {
    user: buildOpenmrsUser(),
    display: 'Asha Devi',
    personUuid: '33333333-3333-4333-8333-333333333333',
    gender: 'F',
    birthdate: '1990-04-01',
    roles: ['Organizational: Nurse', 'Provider'],
    privileges: ['View Patients', 'Add Encounters'],
    provider: {
      uuid: '22222222-2222-4222-8222-222222222222',
      identifier: 'NUR-001',
      display: 'Asha Devi',
      person: {
        uuid: '33333333-3333-4333-8333-333333333333',
        display: 'Asha Devi',
        gender: 'F',
        age: 36,
        birthdate: '1990-04-01',
        preferredName: 'Asha Devi',
      },
      attributes: { 'Phone Number': '9999999999' },
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUserRepo.getLoginState.mockResolvedValue({ attempts: 0, lockedUntil: null });
  mockedUserRepo.recordSuccessfulLogin.mockResolvedValue(undefined);
  mockedAuthRepo.loadIdentity.mockResolvedValue(buildIdentity() as never);
  mockedTokenRepo.persist.mockResolvedValue(undefined as never);
  mockedTokenRepo.revokeFamily.mockResolvedValue(1);
  mockedTokenRepo.revokeAllForUser.mockResolvedValue(1);
});

describe('POST /auth/login', () => {
  it('rejects a request missing credentials with 400', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'nurse01' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when the login handle does not exist', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(null);

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'ghost', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 and increments the OpenMRS attempt counter on a wrong password', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    mockedUserRepo.recordFailedAttempt.mockResolvedValue(1);

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(mockedUserRepo.recordFailedAttempt).toHaveBeenCalledWith(
      42,
      env.LOGIN_LOCKOUT_ATTEMPTS,
      env.LOGIN_LOCKOUT_WINDOW_MIN,
    );
  });

  it('returns 423 once the attempt threshold is reached', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    mockedUserRepo.recordFailedAttempt.mockResolvedValue(env.LOGIN_LOCKOUT_ATTEMPTS);

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: 'wrong-password' });

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses a still-locked account without checking the password', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    mockedUserRepo.getLoginState.mockResolvedValue({
      attempts: 3,
      lockedUntil: new Date(Date.now() + 60_000),
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(mockedTokenRepo.persist).not.toHaveBeenCalled();
  });

  it('verifies the OpenMRS SHA-512 hash and returns tokens, user and provider at once', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: PASSWORD, deviceId: 'device-abc' });

    expect(res.status).toBe(200);
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.expiresIn).toBe(900); // 15 min
    expect(res.body.refreshExpiresIn).toBe(604800); // 7 d
    expect(res.body.authenticated).toBe(true);
    expect(res.body.sessionId).toEqual(expect.any(String));

    // The whole point of the consolidation: no follow-up session/provider calls.
    expect(res.body.user).toMatchObject({
      uuid: USER_UUID,
      username: 'nurse01',
      display: 'Asha Devi',
      roles: ['Organizational: Nurse', 'Provider'],
      privileges: ['View Patients', 'Add Encounters'],
    });
    expect(res.body.provider).toMatchObject({
      uuid: expect.any(String),
      identifier: 'NUR-001',
      person: {
        display: 'Asha Devi',
        gender: 'F',
        age: 36,
        birthdate: '1990-04-01',
        preferredName: 'Asha Devi',
      },
    });

    expect(mockedUserRepo.recordSuccessfulLogin).toHaveBeenCalledWith(42);
    expect(mockedTokenRepo.persist).toHaveBeenCalledWith(
      expect.objectContaining({ userUuid: USER_UUID, deviceId: 'device-abc' }),
    );
    // Only the digest is persisted, never the token itself.
    const persisted = mockedTokenRepo.persist.mock.calls[0][0];
    expect(persisted.tokenHash).toHaveLength(64);
    expect(persisted.tokenHash).not.toContain(res.body.refreshToken);
  });

  it('authenticates by system_id as well as username', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01-1', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(mockedAuthRepo.findUserByLogin).toHaveBeenCalledWith('nurse01-1');
  });

  it('returns provider: null when the user has no provider row', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    mockedAuthRepo.loadIdentity.mockResolvedValue(buildIdentity({ provider: null }) as never);

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBeNull();
  });

  it('signs the access token with system_id and an empty role when the identity has neither a username nor any roles', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    mockedAuthRepo.loadIdentity.mockResolvedValue(
      buildIdentity({
        user: { ...buildOpenmrsUser(), username: null },
        roles: [],
      }) as never,
    );

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: PASSWORD });

    expect(res.status).toBe(200);
    const claims = jwt.decode(res.body.accessToken as string) as { username: string; role: string };
    expect(claims.username).toBe('nurse01-1'); // falls back to systemId
    expect(claims.role).toBe(''); // no roles to draw a primary one from
  });
});

describe('auth.controller.login — request-context extraction', () => {
  it('falls back to a null ipAddress when req.ip is unavailable', async () => {
    // supertest/Express always populate req.ip for a real connection, so the
    // controller's `req.ip ?? null` fallback (and the same fallback one layer
    // down in auth.service's issueTokenPair) can only be reached by calling
    // the controller directly with a request object that omits it.
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);

    const req = {
      body: { username: 'nurse01', password: PASSWORD },
      ip: undefined,
      header: () => undefined,
    } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;

    await authController.login(req, res);

    expect(mockedTokenRepo.persist).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: null }),
    );
  });
});

describe('POST /auth/refresh', () => {
  async function loginAndGetRefreshToken(): Promise<string> {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: PASSWORD });
    return res.body.refreshToken as string;
  }

  it('rotates the token and marks the old one replaced', async () => {
    const refreshToken = await loginAndGetRefreshToken();
    const issued = mockedTokenRepo.persist.mock.calls[0][0];

    mockedTokenRepo.findByJti.mockResolvedValue({
      jti: issued.jti,
      userUuid: USER_UUID,
      tokenHash: issued.tokenHash,
      deviceId: null,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    } as never);
    mockedAuthRepo.findUserByUuid.mockResolvedValue(buildOpenmrsUser() as never);

    const res = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(refreshToken);
    expect(mockedTokenRepo.markRotated).toHaveBeenCalledWith(issued.jti, expect.any(String));
  });

  it('revokes the whole family when an already-rotated token is replayed', async () => {
    const refreshToken = await loginAndGetRefreshToken();
    const issued = mockedTokenRepo.persist.mock.calls[0][0];

    mockedTokenRepo.findByJti.mockResolvedValue({
      jti: issued.jti,
      userUuid: USER_UUID,
      tokenHash: issued.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    } as never);

    const res = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    expect(mockedTokenRepo.revokeFamily).toHaveBeenCalledWith(expect.any(String), 'REUSE_DETECTED');
  });

  it('refuses to refresh for a user retired since login', async () => {
    const refreshToken = await loginAndGetRefreshToken();
    const issued = mockedTokenRepo.persist.mock.calls[0][0];

    mockedTokenRepo.findByJti.mockResolvedValue({
      jti: issued.jti,
      userUuid: USER_UUID,
      tokenHash: issued.tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    } as never);
    mockedAuthRepo.findUserByUuid.mockResolvedValue(null);

    const res = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('refuses an access token presented as a refresh token', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    const login = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: PASSWORD });

    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.accessToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a well-formed refresh token whose jti is not on record', async () => {
    const refreshToken = await loginAndGetRefreshToken();
    mockedTokenRepo.findByJti.mockResolvedValue(null);

    const res = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('revokes the family and rejects when the presented token does not match the stored hash', async () => {
    const refreshToken = await loginAndGetRefreshToken();
    const issued = mockedTokenRepo.persist.mock.calls[0][0];
    mockedTokenRepo.findByJti.mockResolvedValue({
      jti: issued.jti,
      userUuid: USER_UUID,
      // A stored hash that cannot match the real token — e.g. a stale/tampered record.
      tokenHash: 'f'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    } as never);

    const res = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(mockedTokenRepo.revokeFamily).toHaveBeenCalledWith(expect.any(String), 'HASH_MISMATCH');
  });

  it('rejects a refresh token past its stored expiry', async () => {
    const refreshToken = await loginAndGetRefreshToken();
    const issued = mockedTokenRepo.persist.mock.calls[0][0];
    mockedTokenRepo.findByJti.mockResolvedValue({
      jti: issued.jti,
      userUuid: USER_UUID,
      tokenHash: issued.tokenHash,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    } as never);

    const res = await request(app).post('/auth/refresh').send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });
});

describe('POST /auth/logout', () => {
  it('revokes the refresh family but leaves the access token valid until it expires', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    const login = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: PASSWORD });

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken });

    expect(res.status).toBe(204);
    expect(mockedTokenRepo.revokeFamily).toHaveBeenCalledWith(expect.any(String), 'LOGOUT');

    // No blacklist by design: the access token keeps working for the rest of its
    // 15-minute TTL. Documented trade-off, asserted so it cannot regress silently.
    const check = await request(app)
      .get('/auth/check')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(check.status).toBe(200);
    expect(check.body.valid).toBe(true);
  });

  it('revokes every token for the user when allDevices is set', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    const login = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: PASSWORD });

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ allDevices: true });

    expect(res.status).toBe(204);
    expect(mockedTokenRepo.revokeAllForUser).toHaveBeenCalledWith(USER_UUID, 'LOGOUT_ALL');
  });

  it('rejects logout without an access token', async () => {
    const res = await request(app).post('/auth/logout').send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('ignores an unusable refresh token rather than failing the request', async () => {
    mockedAuthRepo.findUserByLogin.mockResolvedValue(buildOpenmrsUser() as never);
    const login = await request(app)
      .post('/auth/login')
      .send({ username: 'nurse01', password: PASSWORD });

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: 'not-a-real-token' });

    expect(res.status).toBe(204);
    expect(mockedTokenRepo.revokeFamily).not.toHaveBeenCalled();
  });

  it('treats a missing req.body as {} rather than throwing', async () => {
    // Unreachable through the real app: express.json()/urlencoded() always
    // initialise req.body to {} before this handler runs, even with no
    // content-type or payload sent (see the body-less request above). The
    // `req.body ?? {}` fallback only guards against a body-parser-less
    // context, e.g. this handler mounted directly without that middleware —
    // exercised here by calling it with a bare Request.
    const req = {
      body: undefined,
      user: { sub: USER_UUID, username: 'nurse01', role: 'Organizational: Nurse' },
    } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as Response;

    await authController.logout(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(mockedTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });
});
