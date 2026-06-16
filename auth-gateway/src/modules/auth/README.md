# auth module

Endpoints for EZ Sprint 42 stories.

| Story | Endpoint | Status |
|---|---|---|
| EZ-920 | `GET /auth/check` (token validation for splash routing) | TODO |
| EZ-928 | `GET /openmrs/getFacilityContacts` (proxy — first-run setup) | TODO |
| EZ-932 | `POST /auth/login` | TODO |
| EZ-933 | `POST /auth/requestOtp` | TODO |
| EZ-934 | `POST /auth/verifyOtp` | TODO |
| EZ-939 | `POST /auth/resetPassword/{userUuid}` | TODO |
| EZ-941 | `POST /audit` (consent log — privacy notice) | TODO |
| EZ-942 | `POST /auth/refresh` | TODO |
| EZ-943 | `POST /auth/logout` (DB blacklist) | TODO |

Stretch (defer if pressed):
- EZ-940 Biometric is local-only on mobile — backend impact is **none** beyond JWT validation working correctly.

Files inside this module (create as you implement):
- `auth.controller.ts` — HTTP layer
- `auth.service.ts` — business logic
- `auth.repository.ts` — DB access via Sequelize
- `auth.routes.ts` — Express router
- `auth.dto.ts` — Zod schemas
- `auth.test.ts` — Jest + Supertest
