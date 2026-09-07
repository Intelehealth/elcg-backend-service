import { env } from '@/config/env';
import { sparrowProvider } from '@/modules/otp/providers/sparrow';
import { twilioProvider } from '@/modules/otp/providers/twilio';
import { twoFactorProvider } from '@/modules/otp/providers/twofactor';
import { SmsProvider } from '@/modules/otp/providers/types';

const REGISTRY: Record<string, SmsProvider> = {
  '2factor': twoFactorProvider,
  twilio: twilioProvider,
  sparrow: sparrowProvider,
};

/**
 * Routes by country code: India → SMS_PROVIDER_INDIA, Nepal → SMS_PROVIDER_NEPAL,
 * everything else → SMS_PROVIDER_INTL. The env var (not a hardcoded provider
 * name) is what's keyed off region, so swapping a region's vendor later is a
 * config change, not a code change.
 */
export function selectProvider(countryCode: string): SmsProvider {
  const cc = countryCode.replace(/^\+/, '');
  const providerName =
    cc === '91' ? env.SMS_PROVIDER_INDIA : cc === '977' ? env.SMS_PROVIDER_NEPAL : env.SMS_PROVIDER_INTL;

  const provider = REGISTRY[providerName];
  if (!provider) {
    throw new Error(`No SMS provider registered for "${providerName}" (country code +${cc})`);
  }
  return provider;
}

export { SmsProviderError } from '@/modules/otp/providers/types';
export type { SmsProvider } from '@/modules/otp/providers/types';
