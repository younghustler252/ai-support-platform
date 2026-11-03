# infrastructure

Shared adapters. `database` holds the Prisma client, `email` the transports and the in-process queue, and `queue` the BullMQ queues used when `REDIS_URL` is set.

Run the worker next to the API with `npm run dev:worker`. It processes the `email` queue (retried with exponential backoff; permanent delivery errors are not retried) and the `ai` queue (one AI reply per customer message, deduplicated by message id). Email jobs contain the rendered message, including links with tokens, so protect Redis like a credential store.
