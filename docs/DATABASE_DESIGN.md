# Database design

See `apps/api/prisma/schema.prisma` for initial conceptual models: User, Organization, OrganizationMembership, Application, ApplicationMembership, Role, Permission, RolePermission, MembershipRole, ApplicationMembershipRole, PlatformSetting, ApplicationSetting, ApiKey, KnowledgeArticle, Customer, Conversation, Message, ConversationAssignment, Notification, UsageEvent, Plan, Feature, PlanEntitlement, AuditLog.

Schema is provisional; review relations, constraints, migrations, tenancy and indexes before production use.
