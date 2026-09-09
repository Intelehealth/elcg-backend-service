/**
 * Jest setup — generates throwaway RSA keys so jwt.middleware can verify in tests.
 * The same keypair would be issued by auth-gateway in production; in tests we
 * sign tokens locally using the private key + verify with the public key.
 */
import fs from 'fs';
import path from 'path';
import { generateKeyPairSync } from 'crypto';

const keysDir = path.resolve(process.cwd(), 'keys');
if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });

const privPath = path.resolve(keysDir, 'jwt-private.pem');
const pubPath = path.resolve(keysDir, 'jwt-public.pem');
if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(privPath, privateKey);
  fs.writeFileSync(pubPath, publicKey);
}
