# SupportAI Development Roadmap

Status legend: [x] implemented and confirmed; [ ] pending; [~] implemented but awaiting local verification.

## Milestone 1 — Project Foundation (complete)
- [x] npm workspaces, Express API, Next.js dashboard, widget, SDK and contracts scaffolds
- [x] PostgreSQL 16 and Redis 7 running through Docker Compose
- [x] Prisma 7 schema, initial migration and generated client
- [x] TypeScript checks across workspaces
- [x] HTTP /health and PostgreSQL /ready checks

## Milestone 2 — Backend Foundation (complete; verified 2026-10-29)
- [x] Shared Prisma Client registered in Awilix
- [x] Basic error middleware and database readiness endpoint
- [x] Typed HTTP/application errors (previous unit tests passed)
- [x] Request context and per-request Awilix scope (HTTP isolation tests passed)
- [x] Request ID and JSON structured logging (redaction tests passed)
- [x] Zod request body validation helper (previous unit tests passed)
- [x] Abstract base repository dependency contract (typecheck passed)
- [x] Foundation unit tests (previous 5/5 passed)
- [x] Verified typecheck across workspaces and API tests (9/9 passed)
- [x] Add consistent validation for params and query strings (integration tests passed)
- [x] Reserve null identity and tenant fields in request context; trusted identity population belongs to Milestone 3/4
- [x] HTTP integration tests for request-scope isolation, validation, error responses, logging redaction and health (passed)

## Milestone 3 — Authentication and Identity
- [~] Registration, password hashing, login and protected routes
- [~] Refresh token rotation with reuse detection, logout, session list and revocation
- [~] Email verification, password recovery and password change
- [~] Audit events, rate limits, absolute session lifetime, disabled-user enforcement
- [~] Authentication unit, HTTP and Postgres integration tests (awaiting local verification)
- [ ] Google sign-in (schema reserved)

## Milestone 4 — Organizations and Applications
- [ ] Organization creation, membership and invitations
- [ ] Application creation, membership and configuration
- [ ] API key issuance, hashing and revocation
- [ ] Tenant boundary integration tests

## Milestone 5 — Dynamic RBAC
- [ ] Permission catalog and protected default roles
- [ ] Custom roles and membership role assignments
- [ ] Permission scope evaluation
- [ ] Cross-tenant and least-privilege tests

## Milestone 6 — Customers and Conversations
- [ ] Application-scoped customers and conversations
- [ ] Messages, assignment, transfer and resolution
- [ ] Human support API and isolation tests

## Milestone 7 — Knowledge and AI
- [ ] Knowledge management and retrieval
- [ ] AI provider abstraction and application configuration
- [ ] AI response generation, escalation, usage and safety checks

## Milestone 8 — Redis, Jobs and Real-Time
- [ ] Redis integration, BullMQ and worker
- [ ] Reliable retries and asynchronous processing
- [ ] Real-time messages, presence and rate limiting

## Milestone 9 — Platform Services
- [ ] Notifications, email and webhooks
- [ ] Settings, plans, entitlements, usage and audit logs

## Milestone 10 — Developer Dashboard
- [ ] Authentication, organization and application management
- [ ] Agent inbox, knowledge and AI configuration
- [ ] Usage and administration interfaces

## Milestone 11 — SDK and Widget
- [ ] API contracts, TypeScript SDK and integration examples
- [ ] Secure customer identity and embeddable widget

## Milestone 12 — Hardening and Deployment
- [ ] Comprehensive unit, integration and end-to-end tests
- [ ] Security and tenant isolation review
- [ ] CI/CD, production deployment, observability, backup and recovery

## Engineering conventions
- TypeScript uses tabs; Prisma uses its formatter.
- Use Awilix request scopes for request-specific services and a single shared Prisma Client.
- Never trust tenant IDs from clients without authorization.
- Avoid global unscoped repository helpers that could leak tenant data.
- Mark a task [x] only after verification; keep unverified changes [~].
- Provide a commit message for every implementation change.
