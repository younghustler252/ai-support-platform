# api-keys

Status: IMPLEMENTED — application-scoped API keys for server-to-server access.

## Management (signed-in users)

| Method | Path | Minimum application role |
| --- | --- | --- |
| POST | `/organizations/:organizationId/applications/:applicationId/api-keys` | `ADMIN` |
| GET | same | `ADMIN` (never returns secrets) |
| DELETE | `.../api-keys/:keyId` | `ADMIN` |
| POST | `.../api-keys/:keyId/rotate` | `ADMIN` |

Creation and rotation return the full key exactly once (`Cache-Control: no-store`). Keys look like `sak_<8 chars>_<43 chars>`; only a SHA-256 hash and the display prefix are stored, so a lost key cannot be recovered, only rotated. Scopes come from a fixed catalogue (`config/tenancy.ts`), expiry is optional and capped at two years, and each application has a limit on active keys.

Rotation creates a replacement with the same name, scopes and expiry. The old key keeps working for `graceHours` (default 24, `0` revokes immediately) so deployments can switch over without downtime.

## Authenticating requests with a key

`requireApiKey(scope?)` accepts `Authorization: Bearer sak_...` or `X-API-Key`. It rejects revoked, expired or malformed keys and keys whose application or organization is archived, always with the same `Invalid API key` error. It enforces the optional scope, populates `requestContext.organizationId` / `applicationId`, and exposes the principal through `apiKeyContext(response)`. Requests are rate limited per IP before authentication and per key after it. `lastUsedAt` is updated at most every five minutes.

`GET /api/v1/service/application` returns the identity behind the key and is the reference for protecting future server-to-server endpoints such as chat.

Browser widgets must never embed these keys; they will use short-lived widget tokens in a later milestone.
