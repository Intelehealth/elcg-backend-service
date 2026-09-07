import { env } from '@/config/env';
import { SmsProvider, SmsProviderError } from '@/modules/otp/providers/types';

/**
 * 2Factor.in — India.
 *
 * Uses `AUTOGEN2`, matching the proven `mindmap-api-NAS` behavior exactly:
 * 2Factor generates the OTP itself and returns it in the response — `localCode`
 * is ignored, and the return value is the code that was actually texted.
 */
export const twoFactorProvider: SmsProvider = {
  async send(phone: string): Promise<string> {
    if (!env.TWOFACTOR_API_KEY) {
      throw new SmsProviderError('2factor', 'TWOFACTOR_API_KEY is not configured');
    }

    // AUTOGEN2 takes just the phone (with country code, no encoding needed —
    // matches the legacy `/SMS/+${countryCode}${phoneNumber}/AUTOGEN2` shape).
    const url = `https://2factor.in/API/V1/${env.TWOFACTOR_API_KEY}/SMS/${phone}/AUTOGEN2`;

    const res = await fetch(url);
    const body = (await res.json().catch(() => null)) as
      | { Status?: string; Details?: string; OTP?: string }
      | null;

    if (!res.ok || body?.Status !== 'Success' || !body.OTP) {
      throw new SmsProviderError(
        '2factor',
        `SMS send failed: ${body?.Details ?? res.statusText ?? 'unknown error'}`,
      );
    }

    return body.OTP;
  },
};
