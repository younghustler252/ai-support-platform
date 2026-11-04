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

## Knowledge and AI (Milestone 7)

Agent endpoints under `/organizations/:organizationId/applications/:applicationId`:

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/knowledge/articles` (`status`, `q`, `limit`, `cursor`) | `knowledge.read` |
| GET | `/knowledge/articles/:articleId` | `knowledge.read` |
| POST | `/knowledge/articles` | `knowledge.manage` |
| PATCH, DELETE | `/knowledge/articles/:articleId` | `knowledge.manage` |
| POST | `/knowledge/articles/:articleId/publish`, `/unpublish` | `knowledge.manage` |
| GET | `/ai/settings` | `application.read` |
| PUT | `/ai/settings` (`enabled`, `instructions`, `fallbackMessage`) | `application.update` |

Service endpoints (API key):

| Method | Path | Key scope |
| --- | --- | --- |
| GET | `/service/knowledge/search?q=` | `knowledge:read` |
| POST | `/service/conversations/:conversationId/ai-reply` | `chat` |

`ai-reply` answers the latest customer message from published articles and returns `outcome` (`replied`, `escalated` with a `reason`, or `skipped`). Service message payloads expose only `id`, `sender`, `body` and `createdAt`.

## Real-time events (Milestone 8)

Server-Sent Events, no extra client library needed (`EventSource` or `fetch` streaming).

| Path | Auth | Events |
| --- | --- | --- |
| `GET /organizations/:organizationId/applications/:applicationId/events` | session, `conversation.read` | `conversation.updated`, `message.created` with ids, status, sender and assignee |
| `GET /service/conversations/:conversationId/events` | API key scope `chat` | `conversation.updated` (status), `message.created` (ids only) |

Events carry no message text; fetch the data through the normal endpoints. Internal notes and system events are never sent to customers. Assigned-only agents only receive events for conversations assigned to them. Events are not replayed, so clients refetch after reconnecting. Each user may hold 10 agent streams and each API key 100 customer streams per API instance.

## Plans and limits (Milestone 9)

`GET /organizations/:organizationId/plan` (`organization.read`) returns the plan and, for each feature, whether it is enabled, its limit and current usage where it is counted per organization. Features: `applications`, `knowledge_articles` (per application), `ai_assistant` and `ai_replies_monthly`. Exceeding a plan limit returns 403 `LIMIT_EXCEEDED` with a message naming the limit; when the monthly AI allowance is used up, conversations hand over to human agents instead of failing. Organizations without a plan use `free`. Plans cannot be changed through the API yet.

## Outbound webhooks (Milestone 9)

Base path `/organizations/:organizationId/applications/:applicationId/webhooks`. Reads need `webhook.read` (MEMBER), changes need `webhook.manage` (ADMIN).

| Method | Path | Notes |
| --- | --- | --- |
| GET, POST | `/` | create takes `url` (https), `events`, `description`; the signing `secret` is returned only on create |
| GET, PATCH, DELETE | `/:endpointId` | PATCH accepts `url`, `events`, `description`, `enabled`; re-enabling clears the failure counter |
| POST | `/:endpointId/rotate-secret` | returns the new `secret` once |
| POST | `/:endpointId/test` | queues a `webhook.test` event |
| GET | `/:endpointId/deliveries` | cursor paged delivery log |
| POST | `/:endpointId/deliveries/:deliveryId/redeliver` | resets and resends a finished delivery |

Events: `conversation.created`, `conversation.assigned`, `conversation.escalated`, `conversation.reopened`, `conversation.resolved`, `conversation.closed`, `message.created`. Internal notes and system messages are never sent.

Each delivery is a POST with a JSON body `{id, type, createdAt, applicationId, data}` and headers `X-SupportAI-Event`, `X-SupportAI-Delivery`, `X-SupportAI-Timestamp` and `X-SupportAI-Signature: v1=<hex>`, where the signature is HMAC-SHA256 of `${timestamp}.${rawBody}` with the endpoint secret. Verify it and reject old timestamps to stop replays. Respond with any 2xx within 8 seconds. Network errors, 408, 429 and 5xx are retried up to 6 times with exponential backoff; other 4xx fail at once. A 410 response, or 20 consecutive failed deliveries, disables the endpoint. Each application can have 10 endpoints. Targets must be public https hosts; redirects are not followed and private addresses are blocked, including after DNS resolution.

## Audit log (Milestone 9)

`GET /organizations/:organizationId/audit-logs` (`audit.read`, ADMIN) returns `{ logs, meta.nextCursor }` newest first. Filters: `applicationId`, `actorUserId`, `action` (prefix such as `role.` or `webhook.`), `from`, `to` (ISO dates), `limit`, `cursor`. Each entry has `id`, `action`, `resourceType`, `resourceId`, `applicationId`, `actor` (`id`, `email`, `displayName`, or null), `metadata` and `createdAt`. Only events that belong to the organization appear; sign-in and other account events are not included.
