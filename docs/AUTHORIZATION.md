# Authorization

Default deny. Tenant ownership and entitlement checks are distinct from permission checks. Organization and application realms are enforced independently; the platform realm is not exposed yet.

## Model (Milestone 5)

Every route names an action such as `api-key.manage`. The `PermissionAuthorizer` turns a member's grants into a map of permission code to scope and allows the action only when the scope covers what the permission requires.

Grants come from two places and are combined by taking the widest scope per permission:

1. The member's built-in tier (`OWNER`, `ADMIN`, `MEMBER`) in the organization and, if any, in the application. `policies.ts` holds the minimum tier of every action, so the tiers behave as before.
2. Custom roles assigned to the membership. Custom roles only add permissions; they never remove what a tier gives.

The permission catalog (`modules/rbac/permission-catalog.ts`) is the single source of truth. It is synced to the `Permission` and `Role` tables at boot, including the protected default roles (`organization-owner`, `organization-admin`, `organization-member`, `application-admin`, `application-member`). Default roles are read-only and mirror the tiers.

## Scopes

`OWN < ASSIGNED < TEAM < APPLICATION < ORGANIZATION < ALL`. A grant covers a requirement when its scope is the same or wider. An organization role grants every permission at `ORGANIZATION`, which for an application permission means every application in that organization. An application role grants at `APPLICATION`, meaning that one application. `OWN`, `ASSIGNED` and `TEAM` are reserved for resource checks on conversations and customers in Milestone 6.

## Custom roles

- Organization roles live at `/organizations/:organizationId/roles`, application roles at `.../applications/:applicationId/roles`.
- Names are unique per organization or application, ignoring case. At most 20 custom roles per scope and 10 roles per member.
- `organization.archive` and `application.archive` cannot be delegated.
- Application roles can only hold application permissions.

## Least privilege rules

- Not found beats forbidden: non-members and cross-tenant IDs get 404.
- A user can only put permissions into a role, change a role, delete it, or assign or unassign it, if they hold every permission involved at at least the same scope. This stops a role manager from granting themselves or others more than they have.
- Default roles cannot be edited, deleted or assigned. Changing a member's built-in tier stays a separate action (`member.manage`).
- Deleting a role removes its assignments in the same transaction.
- Every create, update, delete, assign and unassign is audited.
