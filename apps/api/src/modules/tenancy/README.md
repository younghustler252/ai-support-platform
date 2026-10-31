# tenancy

Status: IMPLEMENTED — tenant resolution and authorization for organizations and applications.

## Model

- A user can belong to many organizations. Each organization membership has a role: `OWNER`, `ADMIN` or `MEMBER`.
- Organization `OWNER`/`ADMIN` members have implicit access to every application in the organization. `MEMBER`s only see applications they were explicitly added to, with an application-level role of `ADMIN` or `MEMBER`.
- Tenant identifiers in URLs are never trusted. `requireOrganization(action)` and `requireApplication(action)` verify the caller's membership on every request, scope the application lookup to the organization, and populate `requestContext.organizationId` / `applicationId`.
- Callers who are not members get `404`, not `403`, so the existence of other tenants is not revealed. Members lacking a permission get `403`.

## Authorizer

`Authorizer` is the single seam for authorization. The current `RoleAuthorizer` maps actions (`policies.ts`) to a minimum role. Milestone 5 replaces it with dynamic roles and permission scopes without touching controllers or routes.

## Adding a protected route

```ts
router.get(
	"/organizations/:organizationId/things",
	requireAuth,
	requireOrganization("organization.read"),
	delegate("thingController", "list"),
);
```

Repositories must always filter by `organizationId` (and `applicationId` where relevant) in addition to the record id.
