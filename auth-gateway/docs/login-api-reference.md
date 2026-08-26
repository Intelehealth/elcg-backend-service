# Auth Gateway — Login API Reference

> Working notes from the port reconfiguration + Login API review, kept as a reference for further development.
> Last updated: 2026-08-24

## 1. Service ports (elcg-backend-service)

| Service | Port |
|---|---|
| **auth-gateway** | **3030** |
| portal | 3004 |
| configuration | 4004 |
| web-rtc | 3000 |
| mysql | 3306 (unchanged) |

Changed in: each service's `.env` / `.env.example`, `Dockerfile` (`EXPOSE` + `HEALTHCHECK`), root `docker-compose.yml` port mappings, service READMEs, and every cross-service `AUTH_GATEWAY_URL` reference (portal/web-rtc/configuration all point to `http://localhost:3030`).

If containers are already running, they need `docker compose up -d --build` to pick up new mappings. Local `npm run dev` processes need a manual restart — `tsx watch` reloads on source-file changes but does **not** re-read `.env`, so a port edit only takes effect on a fresh process start.

⚠️ **Gotcha hit during this work:** running `npm run dev` in two terminals (or a leftover background process from a previous session) both try to bind the same port → `EADDRINUSE`. Only one dev instance should be running per port at a time; check with:
```bash
ss -ltnp | grep 3030
```

## 2. Login API

**Endpoint:** `POST http://localhost:3030/auth/login`

Defined in:
- Route: `src/modules/auth/auth.routes.ts:28`
- Controller: `src/modules/auth/auth.controller.ts`
- Schema/DTO: `src/modules/auth/auth.dto.ts`
- Service: `src/modules/auth/auth.service.ts`

### Request body (`LoginRequestSchema`)
```json
{
  "username": "string, required, 1-100 chars",
  "password": "string, required, 1-255 chars",
  "deviceId": "string, optional, max 255 chars",
  "deviceInfo": {
    "platform": "string, optional, max 50",
    "model": "string, optional, max 100",
    "osVersion": "string, optional, max 50",
    "appVersion": "string, optional, max 50"
  }
}
```
- Auth is **username/password** only (no email/phone/OTP for this endpoint).
- `deviceId`/`deviceInfo` are stored against the refresh token for audit/device listing — not an enforcement key.

### Success response — `200 OK`
```json
{
  "tokenType": "Bearer",
  "accessToken": "...",
  "expiresIn": 900,
  "refreshToken": "...",
  "refreshExpiresIn": 604800,
  "user": {
    "uuid": "string",
    "username": "string | null",
    "systemId": "string",
    "personUuid": "string",
    "display": "string",
    "gender": "string | null",
    "birthdate": "string | null",
    "roles": ["string"],
    "privileges": ["string"]
  },
  "provider": {
    "uuid": "string",
    "identifier": "string | null",
    "display": "string | null",
    "attributes": {}
  } // or null
}
```
No cookies are set — tokens come back purely in the JSON body.

### Error responses
| Status | Code | Notes |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod schema validation failed (bad/missing fields) |
| 401 | `INVALID_CREDENTIALS` | Unknown username or wrong password. Timing-safe dummy hash check runs even for unknown usernames so response time doesn't leak user existence. |
| 423 | `ACCOUNT_LOCKED` | Too many failed attempts within the lockout window; body includes `details.retryAfterSeconds` |
| 429 | `RATE_LIMITED` | Per-IP throttle from `credentialRateLimit` middleware (separate from the per-account lockout above) |
| 500 | `INTERNAL_ERROR` | Unhandled error fallback |

All error bodies share the shape `{ "error": { "code": "...", "message": "...", "details"?: {} } }` (from `src/middleware/error-handler.ts`).

### Rate limiting (`credentialRateLimit`, applied to `/login` and `/refresh`)
```js
rateLimit({
  windowMs: env.LOGIN_LOCKOUT_WINDOW_MIN * 60_000,  // default 15 min
  limit: env.LOGIN_LOCKOUT_ATTEMPTS * 10,           // default 3 * 10 = 30 req
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})
```
Env defaults (`src/config/env.ts`): `LOGIN_LOCKOUT_ATTEMPTS=3`, `LOGIN_LOCKOUT_WINDOW_MIN=15`, `JWT_ACCESS_TTL_SECONDS=900`, `JWT_REFRESH_TTL_SECONDS=604800`.

## 3. Postman collection

Location: [`auth-gateway/postman/auth-gateway.postman_collection.json`](../postman/auth-gateway.postman_collection.json)

- Collection variable `base_url` = `http://localhost:3030`
- `username` / `password` variables to fill in per environment
- Test script auto-captures `accessToken` / `refreshToken` into collection variables on a 200 response (for chaining into `/auth/refresh` later)
- Saved example responses for 200 / 400 / 401 / 423 / 429

Import the file directly into Postman; just update `base_url` when pointing at a different environment (e.g. staging/prod).

## 4. Deploying the Login API to a server — checklist

1. **Build artifact:** Dockerfile (multi-stage `npm run build` → `node dist/index.js`), or `npm ci && npm run build && npm start` directly on Node 20.
2. **Environment variables:** all of `.env.example` with real prod values — especially `DB_*`, `OPENMRS_DB_*`, `CORS_ORIGIN` (must list real frontend domain(s), not localhost), `JWT_*`, SMS provider keys if OTP is in scope. Push via secrets manager/CI secrets — don't share the raw `.env` file.
3. **JWT keys (`keys/`):** `jwt-private.pem` is secret — secure secret storage only, never shared in chat/commits. `jwt-public.pem` is safe to share with any service that needs to verify access tokens (portal, web-rtc, etc.).
4. **DB migrations:** run `npm run migrate` (`sequelize-cli db:migrate`) against the prod DB before/during first deploy.
5. **Network/infra:** open port 3030 on the server/load balancer; put TLS termination in a reverse proxy in front (the app itself only sets security headers via `helmet()`, no HTTPS termination); wire health checks to `GET /health`.
6. **Post-deploy testing:** update the Postman collection's `base_url` to the prod URL and re-run the login flow.

## Open follow-ups (not yet done)
- No CI/CD config exists yet in the repo (only `docker-compose.yml` at the root) — could add a GitHub Actions workflow for build/test/deploy.
- Postman collection currently only covers `/auth/login`; could extend with `/auth/refresh`, `/auth/logout`, `/auth/check`.
- No `DEPLOY.md` exists yet — checklist above could be formalized into one if useful.
