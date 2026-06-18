# auth-gateway

eLCG authentication, OTP, JWT, RBAC. Sprint 42 primary service.

## Run locally

```bash
nvm use                 # node 20
npm install
cp .env.example .env    # edit DB + SMS keys
# generate JWT keys (one-time)
mkdir -p keys
openssl genrsa -out keys/jwt-private.pem 2048
openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem
# start MySQL via root docker-compose
( cd .. && docker compose up -d mysql )
npm run dev             # http://localhost:3001/health
```

## Scripts

- `npm run dev` — tsx watch
- `npm run build` — TS → `dist/`
- `npm start` — production
- `npm run typecheck`
- `npm run lint` / `lint:fix`
- `npm test` — Jest + Supertest
- `npm run migrate` / `seed`

## Module map (Sprint 42)

```
src/
├── app.ts           # Express composition
├── index.ts         # entrypoint
├── config/env.ts    # Zod-validated env
├── db/sequelize.ts  # MySQL connection
├── middleware/      # request-id, error-handler
├── modules/
│   ├── health/      # /health + /ready
│   ├── auth/        # EZ-920/932/933/934/939/942/943
│   ├── users/       # user model + repo
│   ├── otp/         # 2Factor + Twilio + Sparrow
│   └── jwt/         # RS256 + DB blacklist
└── utils/logger.ts  # pino
```

See each module's `README.md` for ticket↔file mapping.
