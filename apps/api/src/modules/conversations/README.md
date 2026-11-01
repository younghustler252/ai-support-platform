# conversations

Status: IMPLEMENTED — conversations, messages, assignment, transfer and resolution, for human agents and for server-to-server callers.

## Agents (signed in)

Routes live under `/organizations/:organizationId/applications/:applicationId/conversations`: list (status, assignee, customer filters, cursor pagination), read, list and post messages (including internal notes), `claim`, `assign`, `transfer`, `release`, `resolve`, `reopen` and `close`. Permissions are `conversation.read|reply|claim|transfer|resolve|assign`. The read, reply, transfer and resolve permissions can be granted at the `ASSIGNED` scope, which limits an agent to conversations currently assigned to them; conversations outside that scope look like they do not exist.

## Servers (API key)

`POST /service/conversations` starts a conversation (upserting the customer by `externalId`), `GET /service/conversations/:id`, `GET|POST /service/conversations/:id/messages` and `POST /service/conversations/:id/escalate`. These never expose internal notes, system events or agent identities.

## State machine

`domain/conversation-state.ts` is a pure function of (status, assignee, command). The repository locks the conversation row, applies the decision and records assignment history plus an internal system message in one transaction, so concurrent claims or transfers cannot both win. Statuses: `AI_ACTIVE`, `WAITING_FOR_AGENT`, `ASSIGNED_TO_AGENT`, `RESOLVED`, `CLOSED` (terminal). A customer message on a resolved conversation reopens it into the agent queue. AI replies arrive in Milestone 7.
