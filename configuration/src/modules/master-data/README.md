# master-data module

**BE-CFG-MD-01** — CRUD for three master-data tables.

## Endpoints

All mounted at `/config/*`.

### Specializations

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/config/specializations`       | Bearer | `?isActive=true` (default), `false`, or `all` |
| POST   | `/config/specializations`       | Bearer + Admin | body: `{ name, displayOrder?, isActive? }` |
| PUT    | `/config/specializations/:id`   | Bearer + Admin | body: partial `Specialization` |
| DELETE | `/config/specializations/:id`   | Bearer + Admin | Soft-delete (sets `isActive=false`) |

### Languages

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/config/languages`       | Bearer | `?isActive=true/false/all` |
| POST   | `/config/languages`       | Bearer + Admin | body: `{ code, name, nativeName?, displayOrder?, isActive? }` — `code` is ISO 639-1 |
| PUT    | `/config/languages/:id`   | Bearer + Admin | body: partial `Language` |
| DELETE | `/config/languages/:id`   | Bearer + Admin | Soft-delete |

### Dropdown Values

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET    | `/config/dropdown-values?category=…`  | Bearer | `category` **required** |
| POST   | `/config/dropdown-values`             | Bearer + Admin | body: `{ category, key, label, displayOrder?, isActive? }` |
| PUT    | `/config/dropdown-values/:id`         | Bearer + Admin | body: partial |
| DELETE | `/config/dropdown-values/:id`         | Bearer + Admin | Soft-delete |

## Files

| File | Role |
|---|---|
| `master-data.dto.ts` | Zod schemas for 3 create/update flows + `ListQuery`, `DropdownListQuery`, `IdParam` |
| `master-data.service.ts` | 3 CRUD surfaces (`specializations`, `languages`, `dropdownValues`) — pure DB calls, uniform error mapping |
| `master-data.controller.ts` | 3 thin controllers — Zod parse + delegate |
| `master-data.routes.ts` | Express router with `requireAuth` (all) + `requireRoles('Admin', 'SystemAdministrator')` on writes |
| `../../db/models/mst-{specialization,language,dropdown-value}.model.ts` | Sequelize models |
| `../../db/migrations/2026091000000{1,2,3}-*.cjs` | Table creation migrations |

## Auth model

- **Reads** (`GET`): any authenticated user (Nurse / Doctor / Admin).
- **Writes** (`POST`, `PUT`, `DELETE`): `Admin` or `SystemAdministrator` role required (case-insensitive substring match on the JWT `data.roles` claim).

## Error codes

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Zod parse failed (missing field, wrong type, bad language code, etc.) |
| `AUTH_REQUIRED` | 401 | No Bearer token |
| `AUTH_INVALID_TOKEN` | 401 | JWT invalid or expired |
| `AUTH_FORBIDDEN` | 403 | Writes attempted without Admin role |
| `SPECIALIZATION_NOT_FOUND` / `LANGUAGE_NOT_FOUND` / `DROPDOWN_VALUE_NOT_FOUND` | 404 | `id` doesn't exist |
| `SPECIALIZATION_DUPLICATE` / `LANGUAGE_DUPLICATE` / `DROPDOWN_VALUE_DUPLICATE` | 409 | Unique-constraint violation (name / code / (category,key)) |
| `DB_ERROR` | 500 | Unexpected Sequelize failure |

## Delete semantics

Soft-delete only — endpoint sets `isActive=false`. Master data rows are referenced by
foreign-key-like fields elsewhere (patient forms, provider attributes, sync payloads), so
hard-deletion is deliberately not exposed. To purge for real, run a manual SQL script.

## Local run

```bash
cd configuration
npm install
cp .env.example .env
mkdir -p keys
openssl genrsa -out keys/jwt-private.pem 2048
openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem
( cd .. && docker compose up -d mysql )
npm run migrate       # creates 3 mst_* tables
npm run dev           # http://localhost:3004/health
npm test              # 20+ tests, all green
```
