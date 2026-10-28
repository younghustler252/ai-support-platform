# Architecture

## Decision
Monorepo with independent Express TypeScript API, Next.js dashboard, optional widget and shared packages. PostgreSQL/Prisma; Awilix dependency injection; modular monolith.

## Module flow
Route → Controller → Use case → Repository. Domain policy lives in use cases/foundation, not controllers. Infrastructure adapters encapsulate database, AI, queues and delivery providers.

## Awilix
Register modules explicitly in `src/container/index.ts`. Use request scopes for user/tenant-specific dependencies; singleton services must not hold request state. Register only implemented modules.

## Processing
API handles synchronous requests. Worker handles asynchronous notifications and ingestion once queue infrastructure is implemented.

## Status
This repository is a scaffold. It is not a production-ready application.
