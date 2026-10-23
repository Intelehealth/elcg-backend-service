# portal

eLCG portal service — Patient / Visit / Encounter / Labour / LCG / Prolonged-Labour-Alert / Shift / Delivery-Outcome / Messages / Notifications / Appointment (minimal) / Prescription / Sync / OpenMRS-Proxy / Audit.

**Status: in progress.** Modules are added sprint by sprint.

Port: `3004`. Modules planned: see `~/Documents/EZAZI Project/user-stories/eZAZI_User_Stories_Backend.xlsx` → `portal` tab (~20 stories).

## Modules

| Module | Endpoints | Status |
|---|---|---|
| `health` | `GET /health`, `GET /ready` | Done |
| `openmrs` | `GET /openmrs/getVisitCounts`, `getPriorityVisits`, `getInProgressVisits`, `getCompletedVisits` | Done. See [`src/modules/openmrs/README.md`](src/modules/openmrs/README.md) |

## Auth

The portal does not issue tokens. It verifies auth-gateway's RS256 access tokens with the gateway's
**public** key (`JWT_PUBLIC_KEY_PATH`), and `JWT_ISSUER`/`JWT_AUDIENCE` must match the gateway's.

## Quick start

```bash
nvm use                      # Node 20
npm install
cp .env.example .env         # then edit: OpenMRS DB + path to auth-gateway's jwt-public.pem
npm run dev                  # http://localhost:3004/health
```

`npm test` needs no database or keys. The test setup generates a throwaway key pair, and the
repository layer is mocked.
