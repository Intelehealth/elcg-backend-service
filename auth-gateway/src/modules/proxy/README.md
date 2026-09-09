# proxy module

**BE-GW-PROXY-01** — auth-gateway forwards validated requests to downstream services.

## What it does

Mounted at `/api/v1/*`. For every incoming request:

1. `requireAuth` validates the JWT signed by this same gateway.
2. `proxy.controller.proxyAll` looks up the path prefix in `router-table.ts` and picks a downstream (`portal` / `webrtc` / `configuration`).
3. `proxy.service.forward` sends the request through an Opossum circuit breaker to the downstream — path preserved, query + body forwarded, hop-by-hop headers stripped.
4. Adds observability headers **from verified sources**:
   - `X-Request-ID` — from `req.id` (per-request UUID from `request-id` middleware)
   - `X-User-Id` — from `req.user.sub` (JWT claim)
   - `X-User-Role` — from `req.user.role` (JWT claim)
   - `Authorization` — original Bearer token (downstream re-verifies)
5. Downstream response headers + body are returned verbatim.

## Route table

| Path prefix (after `/api/v1`) | Downstream |
|---|---|
| `/openmrs/*` | portal |
| `/patients/*` | portal |
| `/visits/*` | portal |
| `/encounters/*` | portal |
| `/audit/*` | portal |
| `/messages/*` | portal |
| `/notifications/*` | portal |
| `/sync/*` | portal |
| `/appointments/*` | portal |
| `/webrtc/*` | webrtc |
| `/livekit/*` | webrtc |
| `/config/*` | configuration |
| `/features/*` | configuration |
| anything else | **404 `PROXY_NO_ROUTE`** |

To add a new prefix, edit `router-table.ts` — do NOT hard-code URLs elsewhere.

## Circuit breaker (Opossum)

One breaker per downstream. Config (env vars):

| Var | Default | Meaning |
|---|---:|---|
| `PROXY_TIMEOUT_MS` | 15000 | axios timeout per request |
| `PROXY_BREAKER_TIMEOUT_MS` | 15000 | breaker treats calls slower than this as failed |
| `PROXY_BREAKER_ERROR_THRESHOLD_PERCENT` | 50 | % of failed calls in rolling window before breaker opens |
| `PROXY_BREAKER_RESET_TIMEOUT_MS` | 30000 | after opening, breaker half-opens (allows one probe) after this |

**What counts as a failure:** network errors, axios timeouts, and 5xx responses from downstream. 4xx responses (400 validation, 401, 403, 404) are legitimate business responses and do NOT trip the breaker — configured via `errorFilter`.

## Downstream URLs

Set per env (`.env` / docker-compose):

| Var | Default | Notes |
|---|---|---|
| `PORTAL_URL` | `http://localhost:3002` | Under docker: `http://portal:3002` |
| `WEBRTC_URL` | `http://localhost:3003` | Under docker: `http://webrtc:3003` |
| `CONFIGURATION_URL` | `http://localhost:3004` | Under docker: `http://configuration:3004` |

## Files

| File | Role |
|---|---|
| `router-table.ts` | Prefix → downstream mapping, `resolveDownstream()` |
| `proxy.service.ts` | axios clients + opossum breakers + `forward()` |
| `proxy.controller.ts` | Thin `proxyAll` handler (resolve + delegate) |
| `proxy.routes.ts` | `router.all('*', ...)` mounted at `/api/v1` in `app.ts` |

## Error codes

| Code | HTTP | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing / bad Bearer token (from `requireAuth`) |
| `PROXY_NO_ROUTE` | 404 | Path doesn't match any prefix in the route table |
| `PROXY_BAD_PATH` | 400 | Path doesn't start with `/` (should never happen via Express) |
| `PROXY_UPSTREAM_ERROR` | 502 | Downstream connection refused / network error |
| `PROXY_DOWNSTREAM_UNAVAILABLE` | 503 | Circuit breaker OPEN — fast-fail while downstream recovers |
| `PROXY_DOWNSTREAM_TIMEOUT` | 504 | Downstream didn't respond within `PROXY_TIMEOUT_MS` |

## Security notes

- **We overwrite** `X-Request-ID`, `X-User-Id`, `X-User-Role`, and `Authorization` outbound — clients cannot inject these to spoof identity.
- **`Host` header is stripped** — axios sets the correct one for the downstream.
- **Hop-by-hop headers** (`Connection`, `Keep-Alive`, `TE`, `Transfer-Encoding`, `Upgrade`, `Proxy-*`, `Content-Length`) are stripped per RFC 7230 § 6.1.
- **JWT is re-verified downstream** — each service holds the same public key. Defense-in-depth: even if someone bypasses the gateway (direct network access to a downstream), they still need a valid signed token.

## Local run

```bash
cd auth-gateway
npm install
cp .env.example .env      # set PORTAL_URL etc.
npm run dev               # http://localhost:3030/api/v1/openmrs/getVisits → portal
npm test -- proxy         # 8+ tests, all green
```
