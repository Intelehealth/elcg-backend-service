import { env } from '@/config/env';
import { buildMessage, SmsProvider, SmsProviderError } from '@/modules/otp/providers/types';

/**
 * Sparrow SMS — Nepal (+977). `SPARROW_IDENTITY` is the registered sender id
 * Sparrow requires alongside the API token. Like Twilio, Sparrow has no
 * OTP-generation endpoint, so it sends `localCode` and echoes it back unchanged.
 */
export const sparrowProvider: SmsProvider = {
  async send(phone: string, localCode: string, expiryMinutes: number): Promise<string> {
    if (!env.SPARROW_API_TOKEN || !env.SPARROW_IDENTITY) {
      throw new SmsProviderError('sparrow', 'Sparrow SMS credentials are not configured');
    }

    const url = new URL('https://api.sparrowsms.com/v2/sms/');
    url.searchParams.set('token', env.SPARROW_API_TOKEN);
    url.searchParams.set('from', env.SPARROW_IDENTITY);
    // Sparrow expects the local number without the country code.
    url.searchParams.set('to', phone.replace(/^\+?977/, ''));
    url.searchParams.set('text', buildMessage(localCode, expiryMinutes));

    const res = await fetch(url.toString());
    const body = (await res.json().catch(() => null)) as {
      response_code?: number;
      response?: string;
    } | null;

    if (!res.ok || body?.response_code !== 200) {
      throw new SmsProviderError(
        'sparrow',
        `SMS send failed: ${body?.response ?? res.statusText ?? 'unknown error'}`,
      );
    }

    return localCode;
  },
};
