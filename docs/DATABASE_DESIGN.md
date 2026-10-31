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
