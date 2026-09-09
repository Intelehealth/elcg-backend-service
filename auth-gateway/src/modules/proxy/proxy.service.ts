import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import CircuitBreaker from 'opossum';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/utils/logger';
import { DownstreamName, downstreamBaseUrl } from './router-table';

/**
 * BE-GW-PROXY-01 — one Axios request per downstream, wrapped in an Opossum
 * circuit breaker. When a downstream fails repeatedly, its breaker trips open
 * and subsequent requests fast-fail with 503 for `resetTimeout`, protecting
 * both the gateway (thread starvation) and the downstream (thundering herd).
 */

export interface ForwardInput {
  downstream: DownstreamName;
  method: string;
  pathAfterV1: string;              // starts with '/', e.g. '/openmrs/getVisits'
  query: Record<string, unknown>;
  body: unknown;
  headers: Record<string, string>;
  requestId: string;
  userId?: string;
  userRole?: string;
  authorization?: string;           // original Bearer token
}

export interface ForwardResult {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

// ── Axios client per downstream (keep-alive + one connection pool) ────────
const clients: Record<DownstreamName, ReturnType<typeof axios.create>> = {
  portal:        axios.create({ baseURL: downstreamBaseUrl('portal'),        timeout: env.PROXY_TIMEOUT_MS }),
  webrtc:        axios.create({ baseURL: downstreamBaseUrl('webrtc'),        timeout: env.PROXY_TIMEOUT_MS }),
  configuration: axios.create({ baseURL: downstreamBaseUrl('configuration'), timeout: env.PROXY_TIMEOUT_MS }),
};

// ── One circuit breaker per downstream ────────────────────────────────────
type BreakerFn = (config: AxiosRequestConfig, name: DownstreamName) => Promise<AxiosResponse>;

async function rawForward(config: AxiosRequestConfig, name: DownstreamName): Promise<AxiosResponse> {
  return clients[name].request({
    ...config,
    // We want to look at 4xx and 5xx bodies ourselves — never throw on them
    // inside axios (breakers only care about network / timeout / 5xx).
    validateStatus: () => true,
  });
}

function makeBreaker(name: DownstreamName): CircuitBreaker<Parameters<BreakerFn>, AxiosResponse> {
  const b = new CircuitBreaker<Parameters<BreakerFn>, AxiosResponse>(rawForward, {
    timeout: env.PROXY_BREAKER_TIMEOUT_MS,
    errorThresholdPercentage: env.PROXY_BREAKER_ERROR_THRESHOLD_PERCENT,
    resetTimeout: env.PROXY_BREAKER_RESET_TIMEOUT_MS,
    // Treat only 5xx responses as failures for breaker purposes; a 404 or 400
    // from downstream is a legitimate business response and should NOT trip.
    errorFilter: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      return typeof status === 'number' && status < 500;
    },
  });
  b.on('open',      () => logger.warn({ downstream: name }, 'circuit breaker OPEN'));
  b.on('halfOpen',  () => logger.info({ downstream: name }, 'circuit breaker HALF-OPEN'));
  b.on('close',     () => logger.info({ downstream: name }, 'circuit breaker CLOSED'));
  return b;
}

const breakers: Record<DownstreamName, CircuitBreaker<Parameters<BreakerFn>, AxiosResponse>> = {
  portal:        makeBreaker('portal'),
  webrtc:        makeBreaker('webrtc'),
  configuration: makeBreaker('configuration'),
};

/** Test helper — reset all breakers to CLOSED between tests. */
export function _resetBreakers(): void {
  for (const b of Object.values(breakers)) b.close();
}

// ── Header sanitisation — hop-by-hop headers per RFC 7230 § 6.1 ───────────
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',    // axios re-computes from body
]);

function sanitizeInbound(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

function sanitizeOutbound(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────

export async function forward(input: ForwardInput): Promise<ForwardResult> {
  const config: AxiosRequestConfig = {
    method: input.method,
    url: input.pathAfterV1,
    params: input.query,
    data: input.body,
    headers: {
      ...sanitizeInbound(input.headers),
      // Overwrite any inbound observability headers with our verified values.
      'X-Request-ID': input.requestId,
      ...(input.userId ? { 'X-User-Id': input.userId } : {}),
      ...(input.userRole ? { 'X-User-Role': input.userRole } : {}),
      ...(input.authorization ? { Authorization: input.authorization } : {}),
    },
  };

  try {
    const res = await breakers[input.downstream].fire(config, input.downstream);
    return {
      status: res.status,
      headers: sanitizeOutbound(res.headers as Record<string, string | string[] | undefined>),
      data: res.data,
    };
  } catch (err) {
    // Opossum's own errors: EOPENBREAKER (circuit open), ETIMEDOUT (breaker timeout).
    const code = (err as { code?: string }).code;
    if (code === 'EOPENBREAKER') {
      throw new HttpError(503, 'PROXY_DOWNSTREAM_UNAVAILABLE',
        `Downstream ${input.downstream} is temporarily unavailable (circuit open)`);
    }
    if (code === 'ETIMEDOUT') {
      throw new HttpError(504, 'PROXY_DOWNSTREAM_TIMEOUT',
        `Downstream ${input.downstream} did not respond within ${env.PROXY_TIMEOUT_MS}ms`);
    }
    // Anything else — axios network error, downstream connection refused, etc.
    const axiosErr = err as AxiosError;
    logger.error({
      err: axiosErr.message,
      code: axiosErr.code,
      downstream: input.downstream,
      requestId: input.requestId,
    }, 'proxy forward failed');
    throw new HttpError(502, 'PROXY_UPSTREAM_ERROR', `Downstream ${input.downstream} failed`);
  }
}
