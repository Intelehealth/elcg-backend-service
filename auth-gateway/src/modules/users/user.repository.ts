import {
  LOCKOUT_TIMESTAMP_PROPERTY,
  LOGIN_ATTEMPTS_PROPERTY,
  UserProperty,
} from '@/modules/users/user-property.model';

/**
 * Lockout state, stored in OpenMRS' own `user_property` rows.
 *
 * OpenMRS core already writes `loginAttempts` and `lockoutTimestamp` here (63 and
 * 30 rows respectively in the current database), so eLCG reuses the same keys.
 * A failed attempt through either front door increments one shared counter.
 *
 * Note the thresholds themselves come from eLCG config (`LOGIN_LOCKOUT_ATTEMPTS`,
 * `LOGIN_LOCKOUT_WINDOW_MIN`), which may differ from the OpenMRS webapp's own
 * setting — worth aligning the two before go-live.
 */

export interface LoginState {
  attempts: number;
  lockedUntil: Date | null;
}

async function readProperty(userId: number, property: string): Promise<string | null> {
  const row = await UserProperty.findOne({ where: { userId, property } });
  return row?.propertyValue ?? null;
}

async function writeProperty(userId: number, property: string, value: string): Promise<void> {
  await UserProperty.upsert({ userId, property, propertyValue: value });
}

export async function getLoginState(userId: number, windowMinutes: number): Promise<LoginState> {
  const [rawAttempts, rawLockout] = await Promise.all([
    readProperty(userId, LOGIN_ATTEMPTS_PROPERTY),
    readProperty(userId, LOCKOUT_TIMESTAMP_PROPERTY),
  ]);

  const attempts = Number.parseInt(rawAttempts ?? '0', 10);
  // OpenMRS writes epoch milliseconds here (Java System.currentTimeMillis()).
  const lockedAt = Number.parseInt(rawLockout ?? '', 10);

  let lockedUntil: Date | null = null;
  if (Number.isFinite(lockedAt) && lockedAt > 0) {
    const until = new Date(lockedAt + windowMinutes * 60_000);
    if (until.getTime() > Date.now()) lockedUntil = until;
  }

  return { attempts: Number.isFinite(attempts) ? attempts : 0, lockedUntil };
}

/** Increments the shared counter and stamps the lockout once the limit is hit. */
export async function recordFailedAttempt(
  userId: number,
  maxAttempts: number,
  windowMinutes: number,
): Promise<number> {
  const { attempts } = await getLoginState(userId, windowMinutes);
  const next = attempts + 1;

  await writeProperty(userId, LOGIN_ATTEMPTS_PROPERTY, String(next));
  if (next >= maxAttempts) {
    await writeProperty(userId, LOCKOUT_TIMESTAMP_PROPERTY, String(Date.now()));
  }

  return next;
}

/** Clears both counters — OpenMRS blanks the lockout stamp rather than deleting it. */
export async function recordSuccessfulLogin(userId: number): Promise<void> {
  await Promise.all([
    writeProperty(userId, LOGIN_ATTEMPTS_PROPERTY, '0'),
    writeProperty(userId, LOCKOUT_TIMESTAMP_PROPERTY, ''),
  ]);
}
