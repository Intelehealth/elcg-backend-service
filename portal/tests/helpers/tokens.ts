import jwt from 'jsonwebtoken';

/**
 * Mints a token the way auth-gateway's `signAccessToken` does, signed with the
 * throwaway key from `jest.env.ts`. `overrides` lets a test break one property
 * (type, issuer, expiry …) to exercise a rejection path.
 */
export function signTestToken(
  overrides: { typ?: string; issuer?: string; expiresIn?: number } = {},
): string {
  return jwt.sign(
    { typ: overrides.typ ?? 'access', username: 'nurse01', role: 'Organizational: Nurse' },
    process.env.TEST_JWT_PRIVATE_KEY as string,
    {
      algorithm: 'RS256',
      expiresIn: overrides.expiresIn ?? 900,
      issuer: overrides.issuer ?? 'elcg-auth-gateway',
      audience: 'elcg-clients',
      subject: '11111111-1111-4111-8111-111111111111',
      jwtid: 'test-jti',
    },
  );
}
