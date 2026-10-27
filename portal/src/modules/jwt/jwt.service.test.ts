import crypto from 'node:crypto';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '@/app';
import { describePublicKey } from '@/modules/jwt/jwt.service';
import { logger } from '@/utils/logger';
import { OPENMRS_ROUTES } from '../../../tests/helpers/routes';
import { signTestToken } from '../../../tests/helpers/tokens';

const app = createApp();

/* A key pair auth-gateway does not use — what a mismatched keys folder looks like. */
const { privateKey: foreignKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function tokenSignedWith(key: string, issuer = 'elcg-auth-gateway'): string {
  return jwt.sign({ typ: 'access', username: 'nurse01', role: 'Nurse' }, key, {
    algorithm: 'RS256',
    expiresIn: 900,
    issuer,
    audience: 'elcg-clients',
    subject: 'u-1',
  });
}

afterEach(() => jest.restoreAllMocks());

describe('rejected tokens', () => {
  it.each(OPENMRS_ROUTES)(
    '%s: logs why a token signed with another key was refused, without logging the token',
    async (route) => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const token = tokenSignedWith(foreignKey);

      const res = await request(app).get(route).set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'invalid signature' }),
        'Access token rejected',
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
    },
  );

  it('logs the issuer that was presented when it does not match', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    await request(app)
      .get('/openmrs/getVisitCounts')
      .set(
        'Authorization',
        `Bearer ${tokenSignedWith(process.env.TEST_JWT_PRIVATE_KEY as string, 'old-gateway')}`,
      );

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        presented: expect.objectContaining({ iss: 'old-gateway' }),
        expected: expect.objectContaining({ iss: 'elcg-auth-gateway' }),
      }),
      'Access token rejected',
    );
  });
});

describe('describePublicKey', () => {
  it("reports the key's SHA-256 fingerprint so it can be compared with auth-gateway's", () => {
    const pem = fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH as string, 'utf8');

    expect(describePublicKey()).toEqual({
      status: 'ok',
      sha256: crypto.createHash('sha256').update(pem.trim()).digest('hex'),
    });
  });
});

describe('a missing public key file', () => {
  const realPath = process.env.JWT_PUBLIC_KEY_PATH;

  afterEach(() => {
    process.env.JWT_PUBLIC_KEY_PATH = realPath;
  });

  it.each(OPENMRS_ROUTES)(
    '%s: is a 500 deployment fault with the path logged — not a 401 blaming the caller',
    async (route) => {
      process.env.JWT_PUBLIC_KEY_PATH = '/nonexistent/keys/jwt-public.pem';
      let isolatedApp: ReturnType<typeof createApp> | undefined;
      let isolatedLogger: typeof logger | undefined;
      jest.isolateModules(() => {
        /* eslint-disable @typescript-eslint/no-var-requires */
        isolatedApp = require('@/app').createApp();
        isolatedLogger = require('@/utils/logger').logger;
        /* eslint-enable @typescript-eslint/no-var-requires */
      });
      const error = jest.spyOn(isolatedLogger!, 'error').mockImplementation(() => undefined);

      const res = await request(isolatedApp!)
        .get(route)
        .set('Authorization', `Bearer ${signTestToken()}`);

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('AUTH_MISCONFIGURED');
      expect(error).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/nonexistent/keys/jwt-public.pem' }),
        'JWT public key could not be read',
      );

      const health = await request(isolatedApp!).get('/health');
      expect(health.body.checks.jwtPublicKey).toEqual({ status: 'missing' });
      expect(health.body.status).toBe('degraded');
    },
  );
});
