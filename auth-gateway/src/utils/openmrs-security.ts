import crypto from 'node:crypto';

/**
 * OpenMRS-compatible password verification.
 *
 * OpenMRS stores `SHA-512(password + salt)` as lowercase hex in `users.password`,
 * with the per-user salt in `users.salt`. Its own `Security.hashMatches` accepts
 * three encodings, so we do the same:
 *
 *  1. SHA-512, zero-padded hex          — current encoding (all 389 rows in this DB)
 *  2. SHA-512, non-padded hex           — the historical `incorrectlyEncodeString`
 *     bug, where a digest with leading zero bytes lost them via BigInteger
 *  3. SHA-1, zero-padded hex            — pre-2.x records
 *
 * Verification only — we never write passwords here. Password reset (EZ-939) must
 * go through OpenMRS so its own hashing and history rules apply.
 */

function digestHex(algorithm: 'sha512' | 'sha1', value: string): string {
  return crypto.createHash(algorithm).update(value, 'utf8').digest('hex');
}

/** Mirrors OpenMRS' legacy BigInteger-based hex, which drops leading zeros. */
function unpaddedHex(hex: string): string {
  const stripped = hex.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : '0';
}

/** Constant-time compare that does not leak which candidate matched. */
function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase(), 'utf8');
  const right = Buffer.from(b.toLowerCase(), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyOpenmrsPassword(
  plainPassword: string,
  storedHash: string | null,
  salt: string | null,
): boolean {
  if (!storedHash) return false;

  const candidate = `${plainPassword}${salt ?? ''}`;
  const sha512 = digestHex('sha512', candidate);

  // Every branch is evaluated so a match on the first encoding is not faster
  // than a match on the third.
  const matches = [
    safeEquals(storedHash, sha512),
    safeEquals(storedHash, unpaddedHex(sha512)),
    safeEquals(storedHash, digestHex('sha1', candidate)),
  ];

  return matches.some(Boolean);
}
