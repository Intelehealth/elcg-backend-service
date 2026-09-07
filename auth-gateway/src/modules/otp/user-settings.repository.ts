import { UserSettings } from '@/modules/otp/user-settings.model';

export type OtpPurpose = 'U' | 'P' | 'A';

/** Mirrors legacy `auth.service.js`'s `saveOtp` — one row per user, upserted. */
export async function saveOtp(userUuid: string, otp: string, otpFor: OtpPurpose): Promise<void> {
  const existing = await UserSettings.findOne({ where: { userUuid } });
  if (existing) {
    existing.otp = otp;
    existing.otpFor = otpFor;
    await existing.save();
  } else {
    await UserSettings.create({ userUuid, otp, otpFor });
  }
}

export async function findOtp(
  userUuid: string,
  otp: string,
  otpFor: OtpPurpose,
): Promise<UserSettings | null> {
  return UserSettings.findOne({ where: { userUuid, otp, otpFor } });
}

/**
 * Consumes the OTP once verified. Legacy leaves the row live for the rest of
 * its 1-minute window — allowing a replay within that window — this closes
 * that gap; it's a deliberate improvement, not a legacy behavior being mirrored.
 */
export async function clearOtp(userUuid: string): Promise<void> {
  await UserSettings.update({ otp: null, otpFor: null }, { where: { userUuid } });
}
