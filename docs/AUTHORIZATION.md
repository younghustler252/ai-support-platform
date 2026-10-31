# Authorization

Default deny. Tenant ownership and entitlement checks are distinct from permission checks. Enforce platform, organization and application realms independently.

## Current model (Milestone 4)

Authorization is role based through the `Authorizer` interface (`RoleAuthorizer`). Routes declare an action; `policies.ts` maps each action to the minimum role.

| Realm | Roles | Source of truth |
| --- | --- | --- |
| Organization | `OWNER` > `ADMIN` > `MEMBER` | `OrganizationMembership.role` |
| Application | `ADMIN` > `MEMBER` | `ApplicationMembership.role`, or organization `ADMIN`/`OWNER` |

Organization admins and owners act as application admins everywhere in their organization. `application.archive` always requires an organization-level role.

## Dynamic RBAC (Milestone 5)

Permissions will be registered capabilities and configurable roles will group them. Resource scopes include OWN, ASSIGNED, TEAM, APPLICATION, ORGANIZATION and ALL. Because routes depend only on the `Authorizer` interface and named actions, the permission-based implementation replaces `RoleAuthorizer` without touching controllers.
