# elcg-backend-service

Backend for the eLCG (Labour Curve Graph) labour-monitoring product — India + Nepal deployments.

This repository contains **5 independently-deployable services** (not a workspace monorepo — each service has its own `package.json` and is built/deployed on its own).

| Service | Status | Purpose |
|---|---|---|
| `auth-gateway/` | 🟢 Active (Sprint 42) | Authentication, OTP, JWT issuance + validation, RBAC, request proxying |
| `portal/` | ⚪ Stub | Patient / Visit / Encounter / Labour / LCG / Messages / Notifications / Sync |
| `web-rtc/` | ⚪ Stub | LiveKit token issuance + Socket.IO v4 signalling |
| `configuration/` | ⚪ Stub | Master data, feature flags, theme, schemas |
| `pagerduty/` | 🔴 Retired | Replaced by Jira Service Management (Satyadeep review #11) |

## Tech stack (Phase 1 locked)

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript (strict mode)
- **Framework**: Express 4
- **ORM**: Sequelize 6 (MySQL 5.7 — constrained by OpenMRS 2.1.4)
- **Logging**: Pino + pino-http
- **Validation**: Zod
- **Auth**: JWT (RS256) with DB-backed blacklist (Redis deferred to Phase 2)
- **WebSocket**: Socket.IO v4 (in web-rtc)
- **Container**: Docker / Docker Compose (NOT K8s/EKS in Phase 1)
- **Lint/Format**: ESLint + Prettier
- **Tests**: Jest + Supertest

Deferred to Phase 2 per Satyadeep's reviews: NestJS, BullMQ, Redis, AWS Secrets Manager.

## Quick start

```bash
nvm use                                # Node 20
docker compose up -d mysql             # start MySQL 5.7
cd auth-gateway && npm install
cp .env.example .env                   # then edit
npm run dev                            # http://localhost:3001/health
```

## Repository layout

```
elcg-backend-service/
├── auth-gateway/         # independent service
├── portal/               # independent service
├── web-rtc/              # independent service
├── configuration/        # independent service
├── pagerduty/            # RETIRED
├── docs/                 # architecture refs (HLD pointers, ADRs in EZAZI Project dir)
├── docker-compose.yml    # MySQL + all services for local dev
├── .nvmrc, .editorconfig, .gitignore
└── README.md (this)
```

## Authoritative documents

- **HLD**: `~/Documents/EZAZI Project/eZAZI_Tech_Revamp_HLD_v3_3.docx`
- **ADRs**: `~/Documents/EZAZI Project/docs/adrs/`
- **API contracts**: `~/Documents/EZAZI Project/api-docs/openapi.yaml`
- **User stories (backend)**: `~/Documents/EZAZI Project/user-stories/eZAZI_User_Stories_Backend.xlsx`

## Lift-and-shift principle

Replace tech, not behaviour. When porting a legacy module, preserve the current flow exactly — see `MODULE_TEMPLATE.md` §15 Lift-and-Shift Verification in the EZAZI Project docs folder.
