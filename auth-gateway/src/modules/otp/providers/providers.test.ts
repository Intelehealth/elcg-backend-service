import { selectProvider } from '@/modules/otp/providers';
import { twoFactorProvider } from '@/modules/otp/providers/twofactor';
import { twilioProvider } from '@/modules/otp/providers/twilio';
import { sparrowProvider } from '@/modules/otp/providers/sparrow';
import { SmsProviderError } from '@/modules/otp/providers/types';
import { env } from '@/config/env';

describe('selectProvider', () => {
  it('routes +91 to the configured India provider', () => {
    expect(selectProvider('91')).toBe(twoFactorProvider);
    expect(selectProvider('+91')).toBe(twoFactorProvider);
  });

  it('routes +977 to the configured Nepal provider', () => {
    expect(selectProvider('977')).toBe(sparrowProvider);
  });

  it('falls back to the international provider for any other country code', () => {
    expect(selectProvider('1')).toBe(twilioProvider);
    expect(selectProvider('44')).toBe(twilioProvider);
  });

  it('throws when the configured provider name is not registered', () => {
    const original = env.SMS_PROVIDER_INTL;
    env.SMS_PROVIDER_INTL = 'not-a-real-provider';
    expect(() => selectProvider('1')).toThrow(/No SMS provider registered/);
    env.SMS_PROVIDER_INTL = original;
  });
});

describe('twoFactorProvider (AUTOGEN2)', () => {
  const originalFetch = global.fetch;
  const originalKey = env.TWOFACTOR_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    env.TWOFACTOR_API_KEY = originalKey;
  });

  it('throws SmsProviderError when TWOFACTOR_API_KEY is not configured', async () => {
    env.TWOFACTOR_API_KEY = undefined;
    await expect(twoFactorProvider.send('+919876543210', '123456', 1)).rejects.toBeInstanceOf(
      SmsProviderError,
    );
  });

  it('calls the AUTOGEN2 endpoint and returns the vendor-generated OTP, ignoring localCode', async () => {
    env.TWOFACTOR_API_KEY = 'test-key';
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ Status: 'Success', OTP: '654321' }) });
    global.fetch = fetchMock as never;

    const result = await twoFactorProvider.send('+919876543210', '111111', 1);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://2factor.in/API/V1/test-key/SMS/+919876543210/AUTOGEN2');
    // The vendor's OTP wins, not the localCode we passed in.
    expect(result).toBe('654321');
  });

  it('throws SmsProviderError when 2Factor reports failure', async () => {
    env.TWOFACTOR_API_KEY = 'test-key';
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ Status: 'Error', Details: 'bad number' }) }) as never;

    await expect(twoFactorProvider.send('+919876543210', '123456', 1)).rejects.toThrow(
      /bad number/,
    );
  });
});

describe('twilioProvider', () => {
  const originalFetch = global.fetch;
  const originalSid = env.TWILIO_ACCOUNT_SID;
  const originalToken = env.TWILIO_AUTH_TOKEN;
  const originalFrom = env.TWILIO_FROM_NUMBER;

  afterEach(() => {
    global.fetch = originalFetch;
    env.TWILIO_ACCOUNT_SID = originalSid;
    env.TWILIO_AUTH_TOKEN = originalToken;
    env.TWILIO_FROM_NUMBER = originalFrom;
  });

  it('echoes localCode back unchanged on success', async () => {
    env.TWILIO_ACCOUNT_SID = 'AC123';
    env.TWILIO_AUTH_TOKEN = 'token';
    env.TWILIO_FROM_NUMBER = '+15005550006';
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;

    const result = await twilioProvider.send('+15551234567', '424242', 1);

    expect(result).toBe('424242');
  });
});
