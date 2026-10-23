# openmrs module

Read-only visit APIs over the OpenMRS schema, lifted from legacy portal's
`routes/openmrs.route.js` (`controllers/openMrs.controller.js`, `services/openmrs.service.js`,
`controllers/queries.js`). Paths, query params and response bodies are unchanged; only the
base URL moves.

All endpoints require `Authorization: Bearer <access token>` issued by auth-gateway.

| Endpoint | Query | Returns |
|---|---|---|
| `GET /openmrs/getPriorityVisits` | `page`, `limit`, `facilityUuid` | Open visits whose "Visit Risk" score is > 0 |
| `GET /openmrs/getInProgressVisits` | `page`, `limit`, `facilityUuid` | Open visits whose "Visit Risk" score is 0 / missing |
| `GET /openmrs/getCompletedVisits` | `page`, `limit`, `facilityUuid` | Visits with a Visit Complete / Exit Survey encounter, or ended |
| `GET /openmrs/getVisitCounts` | `speciality` | Active-visit counts per status |

- `page` defaults to 1, `limit` to 1000 (capped at 5000). An empty `facilityUuid` means no filter.
- Visit lists: `{ count, totalCount, data: VisitListItem[], success: true }`. `data` is the raw
  OpenMRS visit tree, snake_case as in legacy. See `openmrs.dto.ts`.
- Visit counts: `{ data: [{ Total, Status }], message }`.

## Differences from legacy

Responses are the same. These are the only behaviour changes:

- **Errors** use the service-wide envelope (`{ error: { code, message } }`): 400 for a bad query
  string, 401 for a bad token, 500 for a DB failure. Legacy answered every failure with
  `422 { status: false, message }`.
- **`getVisitCounts` SQL injection fixed.** `speciality` is now a bound replacement, not
  interpolated into the SQL.
- **`facilityUuid` is filtered in SQL**, not in memory after loading every visit.
- **Pagination happens before the visit-tree query**, so only the requested page is loaded.
- **Completed visits skip the per-visit obs scoring** (`getScoreWithFallback`). Legacy computed a
  score for every completed visit and then threw it away; it never reached the response.
- **Visit attributes are merged by `visit_id`**, not by array position.

## Files

- `openmrs.routes.ts`: Express router
- `openmrs.controller.ts`: HTTP layer (query parsing, legacy envelopes)
- `openmrs.service.ts`: classifying visits into priority / in-progress / completed, pagination
- `openmrs.repository.ts`: DB access (Sequelize finders and raw queries)
- `openmrs.queries.ts`: raw SQL
- `openmrs.dto.ts`: Zod schemas and response types
- `models/`: OpenMRS table models (read-only, snake_case attributes)
- `openmrs.test.ts`: Jest + Supertest
