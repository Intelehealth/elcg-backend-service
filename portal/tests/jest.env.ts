import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Runs before any module is imported (`setupFiles`), so `config/env.ts` parses
 * this environment instead of a developer's `.env`.
 *
 * A throwaway RSA key pair stands in for auth-gateway's: the public half is
 * written where the portal reads it, the private half is handed to tests via
 * `TEST_JWT_PRIVATE_KEY` so they can mint access tokens.
 */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-test-keys-'));
const publicKeyPath = path.join(keyDir, 'jwt-public.pem');
fs.writeFileSync(publicKeyPath, publicKey);

Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  OPENMRS_DB_HOST: '127.0.0.1',
  OPENMRS_DB_PORT: '3306',
  OPENMRS_DB_NAME: 'openmrs',
  OPENMRS_DB_USER: 'test',
  OPENMRS_DB_PASSWORD: 'test',
  JWT_PUBLIC_KEY_PATH: publicKeyPath,
  JWT_ISSUER: 'elcg-auth-gateway',
  JWT_AUDIENCE: 'elcg-clients',
  TEST_JWT_PRIVATE_KEY: privateKey,
});
