# notifications

In-app and email notifications for conversation events.

- `services/conversation-notifier.ts` is called by the event-publishing conversation repository. A conversation that is assigned, reassigned or transferred notifies the new assignee; a self claim does not. An escalation (AI handoff or customer request) notifies active organization owners and admins and active application owners and admins, up to 20 people.
- Each notification is stored as an `IN_APP` row (conversation id and a truncated subject only, never message text) and, unless the user turned email off, queued on the existing email queue. Failures are logged and never affect the conversation action.
- Users read and manage their own notifications under `/me/...`; no tenant membership is checked because every row belongs to the caller.
- Agents who only hold a custom role are not notified about escalations yet.

See docs/API_DESIGN.md for the endpoints.
