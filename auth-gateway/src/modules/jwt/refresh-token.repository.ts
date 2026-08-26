import { Op } from 'sequelize';
import { RefreshToken } from '@/modules/jwt/refresh-token.model';

export interface PersistRefreshTokenInput {
  jti: string;
  familyId: string;
  userUuid: string;
  tokenHash: string;
  expiresAt: Date;
  deviceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

export async function persist(input: PersistRefreshTokenInput): Promise<RefreshToken> {
  return RefreshToken.create({
    jti: input.jti,
    familyId: input.familyId,
    userUuid: input.userUuid,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    deviceId: input.deviceId ?? null,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
    revokedAt: null,
    revokedReason: null,
    replacedByJti: null,
  });
}

export async function findByJti(jti: string): Promise<RefreshToken | null> {
  return RefreshToken.findOne({ where: { jti } });
}

/** Marks the presented token as rotated and links it to its successor. */
export async function markRotated(jti: string, replacedByJti: string): Promise<void> {
  await RefreshToken.update(
    { revokedAt: new Date(), revokedReason: 'ROTATED', replacedByJti },
    { where: { jti, revokedAt: null } },
  );
}

/**
 * Reuse detection: a token that was already rotated has been presented again,
 * which means a copy is circulating. Kill every live token in the family.
 */
export async function revokeFamily(familyId: string, reason: string): Promise<number> {
  const [affected] = await RefreshToken.update(
    { revokedAt: new Date(), revokedReason: reason },
    { where: { familyId, revokedAt: null } },
  );
  return affected;
}

export async function revokeAllForUser(userUuid: string, reason: string): Promise<number> {
  const [affected] = await RefreshToken.update(
    { revokedAt: new Date(), revokedReason: reason },
    { where: { userUuid, revokedAt: null } },
  );
  return affected;
}

/** Housekeeping for a future sweep job — rows are useless once past expiry. */
export async function purgeExpired(now = new Date()): Promise<void> {
  await RefreshToken.destroy({ where: { expiresAt: { [Op.lt]: now } } });
}
