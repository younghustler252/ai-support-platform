# SupportAI

Configurable, API-first multi-tenant customer-support platform. **Architecture scaffold, not a completed application.**

## Workspace
- `apps/api` — Express 5, TypeScript, Awilix, PostgreSQL/Prisma
- `apps/dashboard` — Next.js administration UI
- `apps/widget` — future embeddable widget
- `packages/contracts` — shared API contracts
- `packages/sdk` — future developer SDK
- `docs` — design and development rules

## Start
1. `npm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. `npm run db:generate`
4. `npm run dev:api`

Modules marked `PLANNED` are placeholders and must not be registered until implemented. No production-ready authorization or tenant isolation exists yet.
