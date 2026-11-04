# webhooks

Outbound, signed webhooks for conversation and message events.

- `webhook-dispatcher.ts` is called by the event-publishing conversation repository after each state change and creates one `WebhookDelivery` per subscribed endpoint.
- Deliveries run on the BullMQ `webhooks` queue (worker in `src/worker.ts`); without Redis they are sent once, inline.
- `usecases/deliver-webhook.usecase.ts` signs and posts, classifies the response, and disables endpoints that return 410 or keep failing.
- `domain/webhook-domain.ts` holds the event map, secret derivation, signing and URL rules; `infrastructure/http/safe-http.ts` blocks private targets after DNS resolution.
- Secrets are derived from `WEBHOOK_SIGNING_KEY`, not stored, and are shown only on create and rotate.

See docs/API_DESIGN.md for the public contract.
