# audit

Append-only audit trail with a read API for organization admins.

- `AuditService.record` never throws, so a failed audit write cannot break the action being audited.
- Writes lift `organizationId` and `applicationId` from the event metadata into indexed columns (only when they are valid UUIDs), so no call site changes. Events without an organization, such as `auth.*`, are never visible through the tenant API.
- `GET /organizations/:organizationId/audit-logs` needs `audit.read` (ADMIN) and supports `applicationId`, `actorUserId`, `action` (prefix), `from`, `to`, `limit` and `cursor`, newest first.
- Metadata values are limited to strings, numbers, booleans and null; never put secrets, raw tokens or passwords in metadata.

Retention and export are still planned.
