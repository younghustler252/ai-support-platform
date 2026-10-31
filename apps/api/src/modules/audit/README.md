# audit

Status: STARTER — append-only audit writer registered in the container. `AuditService.record` never throws, so a failed audit write cannot break the action being audited.

Currently used by the auth module (`auth.*` actions). Metadata values are limited to strings, numbers, booleans and null; never put secrets, raw tokens or passwords in metadata. Read APIs, tenant scoping, permissions and retention policy are still PLANNED.
