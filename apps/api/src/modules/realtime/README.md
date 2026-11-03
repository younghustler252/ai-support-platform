# realtime

Server-Sent Events. Agents stream `GET /organizations/:o/applications/:a/events` (needs `conversation.read`; assigned-only agents only see their own conversations). Customers stream `GET /service/conversations/:id/events` with an API key scoped `chat`.

Events carry ids and state only (`message.created`, `conversation.updated`); clients refetch the data through the normal endpoints, which keeps authorization in one place. Customer events never mention internal notes, system events or agents. After a reconnect clients should refetch, because missed events are not replayed.

Events are published by `EventPublishingConversationRepository`, so every code path that changes a conversation (agents, customers, AI) notifies listeners. With `REDIS_URL` set, events fan out across API instances through Redis pub/sub.
