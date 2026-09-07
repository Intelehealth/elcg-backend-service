/**
 * One adapter per SMS vendor — otp.service.ts only ever talks to this shape.
 *
 * `localCode` is a pre-generated fallback for providers that can't generate
 * their own (Twilio, Sparrow) — they send it and return it unchanged. 2Factor's
 * AUTOGEN2 (India) ignores it and generates its own, so the return value is
 * what must actually be persisted/verified — never assume it equals `localCode`.
 */
export interface SmsProvider {
  /**
   * @param phone E.164-ish, digits only with a leading `+` (e.g. `+919876543210`).
   * @param localCode Pre-generated OTP digits, used by providers without their own generator.
   * @param expiryMinutes How long the code is valid for, for providers that compose their own text.
   * @returns The code that was actually sent — persist/verify against this, not `localCode`.
   */
  send(phone: string, localCode: string, expiryMinutes: number): Promise<string>;
}

export class SmsProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
  ) {
    super(message);
  }
}

export function buildMessage(code: string, expiryMinutes: number): string {
  return `Your eLCG verification code is ${code}. It expires in ${expiryMinutes} minute(s). Do not share this code with anyone.`;
}
