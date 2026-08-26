# jwt module

RS256 JWT issuance + per-request validation + rotating refresh tokens.

Backs EZ-932 (login) and EZ-942 (refresh), plus the middleware that validates the
access token on every request.

## Current scope

| Concern | Setting |
|---|---|
| Algorithm | RS256 (`keys/jwt-private.pem` signs, `keys/jwt-public.pem` verifies) |
| Access token TTL | 15 min (`JWT_ACCESS_TTL_SECONDS=900`) |
| Refresh token TTL | 7 d (`JWT_REFRESH_TTL_SECONDS=604800`), rotating |
| Access-token validation | Signature + issuer + audience + expiry + `typ`. **No DB round-trip.** |
| Refresh storage | `refresh_tokens` in `mindmap_server`, SHA-256 digest only |

Rotation uses token *families*: every refresh consumes the presented token,
marks it `ROTATED` with a link to its successor, and issues a new pair in the
same family. Replaying an already-rotated token means a copy is circulating, so
the whole family is revoked.

## Files

- `jwt.service.ts` — sign access + refresh, verify, hash, new family
- `jwt.middleware.ts` — `requireAuth`, attaches `req.user`
- `refresh-token.model.ts` / `refresh-token.repository.ts` — rotation store

## Deferred: access-token blacklist (EZ-943)

Out of scope for this ticket. Consequence to be explicit about: an access token
**cannot be revoked early** — after logout it stays valid for up to its 15-minute
TTL. Logout revokes the refresh family, so the session cannot be *extended*, but
the current access token lives out its life.

That is the deliberate trade for keeping validation database-free on every
request. If early revocation is needed later, add a `token_blacklist` table
(jti, expires_at) and a lookup in `jwt.middleware`, or move to Redis in Phase 2.
