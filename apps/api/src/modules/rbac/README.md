# rbac

Status: IMPLEMENTED — permission catalog, protected default roles, custom roles and role assignments.

`permission-catalog.ts` defines every permission, its realm, whether it can be delegated and the default roles. `services/catalog-sync.ts` writes it to the database at boot under an advisory lock. Authorization itself lives in `modules/tenancy` (`PermissionAuthorizer`, `effective-grants.ts`).

Routes are mounted for both realms by `routes/role.routes.ts`. Use cases receive a `RoleTarget` (organization or application) and the actor's effective grants, and refuse to grant, edit, delete or assign anything the actor does not hold themselves (`services/grant-guard.ts`). See `docs/AUTHORIZATION.md`.
