# Multi-tenancy

A user identity may belong to multiple organizations and applications. End customers are distinct from platform users. Shared PostgreSQL tables carry organization and application IDs; tenant identifiers from the client are never trusted on their own.

## Status

Organization and application tenancy is IMPLEMENTED (Milestone 4). Customer and conversation data will reuse the same boundary in Milestone 6.

## How the boundary is enforced

- Every tenant route runs `requireAuth`, then `requireOrganization(action)` or `requireApplication(action)`. These resolve the caller's membership in the database; the path IDs are only lookup keys.
- Non-members, suspended or removed members, archived organizations and applications, and applications that belong to a different organization all return 404, so resource existence is not disclosed. A real member with too low a role gets 403.
- The resolved tenant is stored in `response.locals.tenant` and `requestContext`, and use cases receive IDs from it rather than from the request body.
- Repositories that take an application ID also take its organization ID, or are only reachable after the application was authorized for that organization.

## Memberships

- Organization roles: `OWNER`, `ADMIN`, `MEMBER`. An organization always keeps at least one active owner; changes lock the organization row so concurrent removals cannot orphan it.
- Organization admins and owners reach every application. Plain organization members only see applications they were added to.
- Application roles: `ADMIN`, `MEMBER`. Archiving an application stays an organization-level action.
- Invitations are email based, single use and expire after seven days. Only a hash of the token is stored, and acceptance is an atomic claim.

## API keys

Keys belong to one application, are stored as SHA-256 hashes and are shown once. Authentication rejects revoked, expired or archived-tenant keys with one generic error. See `apps/api/src/modules/api-keys/README.md`.

## Tests

`tests/tenancy-authorizer.test.ts`, `tests/tenancy-http.test.ts` and `tests/tenancy-usecases.test.ts` run without a database. `tests/tenancy-flow.integration.test.ts` runs two real users against Postgres when `TEST_DATABASE_URL` is set.
