# entitlements

Plans and per-plan limits. The code catalog in `entitlement-catalog.ts` is synced to the `Plan`, `Feature` and `PlanEntitlement` tables at boot. An organization without a plan uses the `free` plan. Limits are enforced with `EntitlementService.assertWithin` (applications, knowledge articles) and `canUseAi` (monthly AI requests); the plan limit never exceeds the platform hard caps in `config/tenancy.ts`.

`GET /organizations/:id/plan` returns the plan, its limits and current usage. There is no endpoint to change plans yet: that belongs to billing and a platform admin realm.
