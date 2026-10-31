# auth

Status: IMPLEMENTED — email/password identity, sessions and account recovery. Authorization (RBAC, tenant scoping) is Milestone 4/5.

Flow: route → controller → use case → repository, with per-request Awilix scopes.

## Endpoints (`/api/v1/auth`)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/register` | none | Create an account and send a verification email |
| POST | `/verify-email` | token | Consume a verification token |
| POST | `/resend-verification` | none | Request a new verification email (always `202`) |
| POST | `/forgot-password` | none | Request a reset email (always `202`) |
| POST | `/reset-password` | token | Set a new password; revokes every session |
| POST | `/login` | none | Returns an access token and sets the refresh cookie |
| POST | `/refresh` | cookie | Rotates the refresh token |
| POST | `/logout` | cookie | Revokes the current session |
| POST | `/logout-all` | bearer | Revokes every session |
| GET | `/me` | bearer | Current user |
| POST | `/change-password` | bearer | Change password; keeps only the current session |
| GET | `/sessions` | bearer | Active sessions with device, IP and `current` flag |
| DELETE | `/sessions/:sessionId` | bearer | Revoke one of your own sessions |

## Tokens and sessions

- Access token: 15 minute HS256 JWT bound to a session id (`sid`) with a `kid` header, so the signing secret can be rotated by setting `AUTH_JWT_PREVIOUS_SECRET`. Every request checks the session is active and the user is not disabled.
- Refresh token: random 256-bit value stored only as a SHA-256 hash, delivered in an `httpOnly`, `SameSite=Lax` cookie scoped to `/api/v1/auth` (`__Secure-` prefixed in production).
- Rotation keeps a `familyId`. Presenting a rotated token inside the grace window returns `409 REFRESH_CONFLICT` so multi-tab races do not sign users out. Presenting it after the grace window revokes the whole family and is audited.
- Sessions have a sliding refresh lifetime and an absolute maximum lifetime, and the number of active sessions per user is capped.
- Cookie endpoints (`login`, `refresh`, `logout`, `logout-all`) reject untrusted `Origin` headers.

## Hardening

- Argon2id hashing with transparent rehash on login, and a dummy hash for unknown accounts to equalise timing.
- Account-existence is not revealed by register-adjacent flows (forgot/resend always return `202`, with a per-email cooldown).
- Rate limits (see `config/auth.ts`) per IP, per IP+email and per user, behind the `rateLimiter` port. The in-memory implementation is single-process; swap in a Redis implementation in Milestone 8.
- Emails go through an in-process queue with retries and a delivery timeout. Tokens are placed in the URL fragment so they do not reach server logs or referrers. The queue sits behind `AuthEmailPort`, so moving to BullMQ is an adapter change.
- Auth events are written to `AuditLog` (`auth.*`). Failed audit writes never break the request.
- Expired sessions and tokens are purged hourly while the server runs.
- Disabling a user (`User.disabledAt`) blocks login, refresh and access tokens immediately.

## Configuration

See `.env.example` and `src/config/auth.ts`. Production requires an email provider, an https frontend URL and explicit https CORS origins.
