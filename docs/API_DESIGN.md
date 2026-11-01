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

## Roles (Milestone 5)

The same routes exist under `/organizations/:organizationId` for organization roles and under `/organizations/:organizationId/applications/:applicationId` for application roles.

| Method | Path | Action |
| --- | --- | --- |
| GET | `.../roles/permissions` | permissions that can be put in a role of this realm |
| GET, POST | `.../roles` | list (default and custom), create |
| GET, PATCH, DELETE | `.../roles/:roleId` | read, update, delete (custom roles only) |
| GET | `.../roles/:roleId/members` | members holding the role |
| PUT, DELETE | `.../roles/:roleId/members/:userId` | assign, unassign |

Creating a role takes `{ name, description?, permissions: string[] }`. The scope of each permission is decided by the role's realm and is not client-supplied.

## Customers and conversations (Milestone 6)

Agent endpoints live under `/organizations/:organizationId/applications/:applicationId` and use the user session.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/customers` (`q`, `limit`, `cursor`) | `customer.read` |
| GET, PATCH | `/customers/:customerId` | `customer.read`, `customer.manage` |
| GET | `/conversations` (`status`, `assignee=me\|unassigned\|<uuid>`, `customerId`, `limit`, `cursor`) | `conversation.read` |
| GET | `/conversations/:conversationId` | `conversation.read` |
| GET, POST | `/conversations/:conversationId/messages` (`internal: true` posts a private note) | `conversation.read`, `conversation.reply` |
| POST | `/conversations/:conversationId/claim` | `conversation.claim` |
| POST | `/conversations/:conversationId/assign` | `conversation.assign` |
| POST | `/conversations/:conversationId/transfer`, `/release` | `conversation.transfer` |
| POST | `/conversations/:conversationId/resolve`, `/reopen`, `/close` | `conversation.resolve` |

Service endpoints use an API key and never expose internal notes, system events or agent identities.

| Method | Path | Key scope |
| --- | --- | --- |
| PUT | `/service/customers/:externalId` | `conversations:write` |
| POST | `/service/conversations` | `conversations:write` |
| GET | `/service/conversations/:conversationId`, `/messages` | `conversations:read` |
| POST | `/service/conversations/:conversationId/messages`, `/escalate` | `chat` |

Lists use keyset pagination: pass the returned `nextCursor` as `cursor`. State changes that conflict with the conversation's current state return 409.
