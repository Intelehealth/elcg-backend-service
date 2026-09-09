import { env } from '@/config/env';

/**
 * BE-GW-PROXY-01 — URL-prefix → downstream-service mapping.
 *
 * The gateway inspects the path AFTER `/api/v1/` and forwards to the first
 * downstream whose prefix matches. Path is preserved on forward
 * (e.g. `/api/v1/openmrs/getVisits` → `${PORTAL_URL}/openmrs/getVisits`).
 *
 * Order matters — put more specific prefixes before generic ones.
 */

export type DownstreamName = 'portal' | 'webrtc' | 'configuration';

interface Route {
  prefix: string;              // matched against the path AFTER '/api/v1'
  downstream: DownstreamName;
}

/**
 * Prefix table. When a new prefix needs to be added, add here — do NOT
 * hard-code URLs elsewhere in the proxy.
 */
export const ROUTE_TABLE: readonly Route[] = [
  { prefix: '/openmrs',       downstream: 'portal' },
  { prefix: '/patients',      downstream: 'portal' },
  { prefix: '/visits',        downstream: 'portal' },
  { prefix: '/encounters',    downstream: 'portal' },
  { prefix: '/audit',         downstream: 'portal' },
  { prefix: '/messages',      downstream: 'portal' },
  { prefix: '/notifications', downstream: 'portal' },
  { prefix: '/sync',          downstream: 'portal' },
  { prefix: '/appointments',  downstream: 'portal' },
  { prefix: '/webrtc',        downstream: 'webrtc' },
  { prefix: '/livekit',       downstream: 'webrtc' },
  { prefix: '/config',        downstream: 'configuration' },
  { prefix: '/features',      downstream: 'configuration' },
];

export function downstreamBaseUrl(name: DownstreamName): string {
  switch (name) {
    case 'portal':        return env.PORTAL_URL;
    case 'webrtc':        return env.WEBRTC_URL;
    case 'configuration': return env.CONFIGURATION_URL;
  }
}

/**
 * Resolve which downstream handles `pathAfterV1` (must start with `/`).
 * Returns `null` when no prefix matches — controller maps that to 404.
 */
export function resolveDownstream(pathAfterV1: string): DownstreamName | null {
  for (const r of ROUTE_TABLE) {
    if (pathAfterV1 === r.prefix || pathAfterV1.startsWith(r.prefix + '/')) {
      return r.downstream;
    }
  }
  return null;
}
