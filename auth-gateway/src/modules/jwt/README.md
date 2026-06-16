# jwt module

RS256 JWT issuance + validation + DB-backed blacklist (Redis deferred to Phase 2).

Backs EZ-942 (refresh) + EZ-943 (logout with blacklist) + the gateway middleware that validates JWT on every downstream request.

Files to add:
- `jwt.service.ts` — sign access (15min) + refresh (7d) tokens; verify; rotate
- `token-blacklist.model.ts` — Sequelize (jti, expires_at) — checked on every verify
- `jwt.middleware.ts` — Express middleware to attach `req.user`
