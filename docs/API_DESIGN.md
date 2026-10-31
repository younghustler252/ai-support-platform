# API design

Version routes under `/api/v1`. Use Zod request validation, consistent errors, OpenAPI, tenant-scoped authorization and rate limits. API keys must be hashed at rest and never shipped to browser widgets. Widget access requires scoped short-lived tokens. These features are PLANNED except the public settings starter endpoint.

## Tenancy endpoints (Milestone 4)

All paths are under `/api/v1` and require a bearer access token unless noted.

| Method | Path | Action |
| --- | --- | --- |
| POST, GET | `/organizations` | create, list own |
| GET, PATCH, DELETE | `/organizations/:organizationId` | read, update, archive |
| GET | `/organizations/:organizationId/members` | list members |
| PATCH, DELETE | `/organizations/:organizationId/members/:userId` | change role, remove (or leave) |
| POST, GET | `/organizations/:organizationId/invitations` | invite, list pending |
| DELETE | `/organizations/:organizationId/invitations/:invitationId` | revoke |
| POST | `/invitations/accept` | accept with the emailed token |
| POST, GET | `/organizations/:organizationId/applications` | create, list visible |
| GET, PATCH, DELETE | `.../applications/:applicationId` | read, update, archive |
| GET, POST | `.../applications/:applicationId/members` | list, add |
| PATCH, DELETE | `.../applications/:applicationId/members/:userId` | change role, remove |
| POST, GET | `.../applications/:applicationId/api-keys` | issue (shown once), list |
| DELETE | `.../api-keys/:keyId` | revoke |
| POST | `.../api-keys/:keyId/rotate` | rotate with grace period |
| GET | `/service/application` | API key authenticated identity check |

Non-members receive 404, members without sufficient role 403, exceeded plan-independent limits 403 `LIMIT_EXCEEDED`.
