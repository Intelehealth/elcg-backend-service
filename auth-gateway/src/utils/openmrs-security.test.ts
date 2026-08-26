import crypto from 'node:crypto';
import { verifyOpenmrsPassword } from '@/utils/openmrs-security';

const hex = (algorithm: 'sha512' | 'sha1', value: string): string =>
  crypto.createHash(algorithm).update(value, 'utf8').digest('hex');

const SALT = 'a'.repeat(128);
const PASSWORD = 'Secret123!';

describe('verifyOpenmrsPassword', () => {
  it('accepts the current OpenMRS encoding: SHA-512(password + salt) as padded hex', () => {
    // This is the encoding every non-retired row in the live OpenMRS schema uses.
    expect(verifyOpenmrsPassword(PASSWORD, hex('sha512', PASSWORD + SALT), SALT)).toBe(true);
  });

  it('accepts the legacy non-padded hex produced by OpenMRS incorrectlyEncodeString', () => {
    const unpadded = hex('sha512', PASSWORD + SALT).replace(/^0+/, '');
    expect(verifyOpenmrsPassword(PASSWORD, unpadded, SALT)).toBe(true);
  });

  it('accepts pre-2.x SHA-1 records', () => {
    expect(verifyOpenmrsPassword(PASSWORD, hex('sha1', PASSWORD + SALT), SALT)).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyOpenmrsPassword('wrong', hex('sha512', PASSWORD + SALT), SALT)).toBe(false);
  });

  it('rejects when the salt does not match', () => {
    expect(verifyOpenmrsPassword(PASSWORD, hex('sha512', PASSWORD + SALT), 'b'.repeat(128))).toBe(
      false,
    );
  });

  it('rejects a user row with no stored hash', () => {
    expect(verifyOpenmrsPassword(PASSWORD, null, SALT)).toBe(false);
  });

  it('handles a null salt without throwing', () => {
    expect(verifyOpenmrsPassword(PASSWORD, hex('sha512', PASSWORD), null)).toBe(true);
  });
});
