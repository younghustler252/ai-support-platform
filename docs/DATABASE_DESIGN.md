# Database design

See `apps/api/prisma/schema.prisma` for initial conceptual models: User, Organization, OrganizationMembership, Application, ApplicationMembership, Role, Permission, RolePermission, MembershipRole, ApplicationMembershipRole, PlatformSetting, ApplicationSetting, ApiKey, KnowledgeArticle, Customer, Conversation, Message, ConversationAssignment, Notification, UsageEvent, Plan, Feature, PlanEntitlement, AuditLog.

Schema is provisional; review relations, constraints, migrations, tenancy and indexes before production use.

## Tenancy tables (Milestone 4)

- `Organization`: `createdByUserId`, `updatedAt`, `archivedAt`.
- `OrganizationMembership`: `role` (`TenantRole`: OWNER, ADMIN, MEMBER) and status; at least one active owner is enforced in application code under a row lock on the organization.
- `Invitation`: per-organization email invitation with unique `tokenHash`, `expiresAt`, `acceptedAt`, `revokedAt`.
- `Application`: `description`, `allowedOrigins`, `archivedAt`.
- `ApplicationMembership`: `role` and status.
- `ApiKey`: `name`, `createdByUserId`, `lastUsedAt`, `expiresAt`; only `keyHash` and a display `prefix` are stored.

Migration: `20261031120000_tenancy_foundation`. Dynamic RBAC tables stay provisional until Milestone 5.

## Dynamic RBAC (Milestone 5)

- `Permission`: synced from the code catalog; `delegable` marks permissions custom roles may hold.
- `Role`: protected default roles have a unique `key`, `scopeKey = "system"` and no organization. Custom roles carry `organizationId` (and `applicationId` for application roles). `(scopeKey, nameKey)` is unique, where `nameKey` is the lower-cased name. Organization and application deletion cascades to their roles.
- `RolePermission`: role to permission with a `PermissionScope`.
- `MembershipRole`, `ApplicationMembershipRole`: assignments with `assignedByUserId` and `createdAt`.

Migration: `20261101090000_dynamic_rbac`. The catalog sync runs when the server starts and must have run before roles can be created.

## Customers and conversations (Milestone 6)

- `Customer` is unique per application by `externalId` and carries optional email and flat metadata. Deleting a customer cascades to its conversations.
- `Conversation` stores status, `assigneeUserId`, `lastMessageAt`, `resolvedAt` and `closedAt`, with indexes for the inbox (`applicationId, status, lastMessageAt`), per-agent queues and per-customer lookups.
- `Message` has `senderUserId` and an `internal` flag for private agent notes; messages are paged by `(createdAt, id)`.
- `ConversationAssignment` keeps assignment history with `assignedByUserId` and an `endReason` (REASSIGNED, TRANSFERRED, RELEASED, RESOLVED, CLOSED).
- Every state change locks the conversation row (`SELECT ... FOR UPDATE`) so concurrent claims cannot both succeed.

## Knowledge (Milestone 7)

- `KnowledgeArticle` is a draft until `publishedAt` is set; `updatedAt` orders the article list.
- `KnowledgeChunk` holds roughly 900 character chunks, each prefixed with the article title, and a `tsvector` column (`simple` dictionary, language neutral) kept current by a database trigger, with a GIN index. A trigger is used instead of a generated column because Prisma cannot represent generated columns and would try to drop their default on every `migrate dev`. Chunks are rebuilt whenever title or content change and deleted with the article.
- Only chunks of published articles in the caller's application are searched. Embeddings can be added later as a nullable column without changing the API.
- AI settings live in `ApplicationSetting.config.ai`; AI usage is recorded as `UsageEvent` rows with metric `ai.request`.
