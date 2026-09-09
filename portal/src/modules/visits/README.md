# visits module

**BE-PORTAL-VIS-01** — visit lifecycle endpoints.

## Endpoints

| Method | Path | Bucket rule | Notes |
|---|---|---|---|
| GET | `/openmrs/getPriorityVisits` | risk score attribute > 3.5 (IHRDMP-592) | Bearer required |
| GET | `/openmrs/getAwaitingVisits` | labourStageEnded attribute truthy AND no outcome encounter | Bearer required |
| GET | `/openmrs/getInProgressVisits` | active visit not in priority/awaiting | Bearer required |
| GET | `/openmrs/getEndedVisits` | `stopDatetime` not null | Bearer required |
| GET | `/openmrs/getFollowUpVisits` | `followUp` attribute truthy | Bearer required |
| GET | `/openmrs/getVisitCounts` | counts across all 5 buckets | Bearer required, cached 60s |

Every list endpoint accepts:
- `facilityUuid` (**required**, UUID) — scopes the query to one facility
- `providerUuid` (optional, UUID) — further scopes to one provider
- `limit` (1–100, default 25)
- `cursor` (opaque base64 from a prior `nextCursor`)

Response shape (`ListVisitsResponse`):
```json
{
  "bucket": "inProgress",
  "count": 25,
  "nextCursor": "eyJzIjoyNX0",
  "hasMore": true,
  "visits": [ /* VisitCard[] */ ]
}
```

Counts response:
```json
{
  "facilityUuid": "…",
  "providerUuid": null,
  "counts": { "priority": 2, "awaiting": 4, "inProgress": 12, "ended": 88, "followUp": 3 },
  "cachedAt": "2026-09-09T09:04:12.104Z"
}
```

## Files

| File | Role |
|---|---|
| `visits.dto.ts` | Zod schemas + response types (`ListVisitsQuery`, `VisitCountsQuery`, `VisitCard`) |
| `visits.service.ts` | Bucket rules, cursor codec, in-memory counts cache. Pure functions where possible |
| `visits.controller.ts` | HTTP layer — Zod parse + delegate |
| `visits.routes.ts` | Express router with `requireAuth` on every endpoint |
| `../openmrs/openmrs.client.ts` | `getVisits(...)` — raw OpenMRS `/ws/rest/v1/visit` proxy |

## Bucket rule attribute names

Attribute-type + encounter-type display names come from the mobile app's
`uuidDictionary` seed. Matching is **case-insensitive substring** to survive
minor OpenMRS deployment differences (`RiskScore` vs `cumulativeRiskScore` vs
`weightedRiskScore` — all match).

The exact display strings we look for:

```
risk score:        riskScore | cumulativeRiskScore | weightedRiskScore
labour ended:      labourStageEnded | labourEnded | stageEnded
follow-up:         followUp | followup | requiresFollowUp
outcome encounter: visit complete | outcome | delivery outcome
stage 1 enc:       partogram_stage1 | stage 1 | stage1
stage 2 enc:       partogram_stage2 | stage 2 | stage2
stage 3 enc:       stage 3 | stage3 | delivery outcome
stage 4 enc:       stage 4 | stage4 | postpartum
```

These need **sign-off from Satyadeep + the real OpenMRS instance** before we
merge to `dev-master`. If names drift, bucket counts will misreport silently.

## Caveats + TODOs

- **Counts under-report at >100 visits/facility** — a warn-log fires. If any
  facility genuinely runs >100 concurrent visits, switch to server-side bucket
  filtering via OpenMRS `visitAttribute` params.
- **Cursor is opaque base64** wrapping `startIndex`. Do not decode client-side.
- **No live OpenMRS in this branch's tests** — nock stubs the client. Integration
  tests against real OpenMRS come after the Nepal team hands us `OPENMRS_BASE_URL`.
- **Attribute-name heuristics** are the biggest risk. First integration test
  should print unmatched attribute names for tuning.

## Error codes

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod parse failed (bad facilityUuid, cursor, limit) |
| `VISITS_BAD_CURSOR` | 400 | Cursor base64 could not be decoded |
| `AUTH_REQUIRED` | 401 | No Bearer token |
| `AUTH_INVALID_TOKEN` | 401 | Token expired or signature bad |
| `AUTH_OPENMRS_UNAVAILABLE` | 503 | `OPENMRS_BASE_URL` env var empty |
| `AUTH_OPENMRS_ERROR` | 502 | OpenMRS upstream returned 5xx |

## Local run

```bash
cd portal
npm install
cp .env.example .env
mkdir -p keys
openssl genrsa -out keys/jwt-private.pem 2048
openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem
npm run dev             # http://localhost:3002/health
npm test -- visits      # 6+ tests, all green
```
