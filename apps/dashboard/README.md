# dashboard

Next.js (App Router) web app for business owners and support agents.

- `next.config.ts` forwards `/api/v1/*` to `API_ORIGIN` (default `http://localhost:4000`), so the browser talks to one origin: the refresh cookie works in production without CORS or cookie-domain settings. The API still checks the `Origin` header against `CORS_ORIGINS`.
- All API access goes through `@platform/sdk` (`src/lib/api.ts`). The access token lives in memory only; the session is restored on load from the httpOnly refresh cookie.
- `src/lib/session.tsx` holds the signed-in user; `(auth)` routes redirect signed-in users away and `(app)` routes redirect anonymous users to `/login`.
- Email links carry their token in the URL hash (`/verify-email#token=...`), which the page reads and removes from the address bar.
- Styling is plain CSS with design tokens in `src/app/globals.css` (light and dark).

Implemented: sign in, register, verify email, forgot and reset password, organization list and creation. Next: applications, conversations inbox, knowledge, settings, webhooks.
