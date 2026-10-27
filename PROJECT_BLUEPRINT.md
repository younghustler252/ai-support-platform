# SupportAI — Project Blueprint

**Version:** 1.2 (draft baseline)  
**Status:** Planning  
**Approach:** API-first, multi-tenant, modular monolith  
**Initial implementation:** Backend-first, cost-conscious

## 1. Product brief

SupportAI is the **default, changeable name** of a reusable AI-powered customer-support platform. Developers integrate it through APIs or an optional ready-made website chat widget. The platform combines AI self-service, human support handoff, and an AI copilot for support agents.

**Vision:** One configurable support platform serving many independent applications, each with isolated knowledge, branding, settings, conversations, and agents.

**Initial proving ground:** WifiSpace Networks, without introducing a dependency on WifiSpace-specific code or routes.

### Users
- **Platform owner/admin:** Configures the platform and manages operations.
- **Developer/organization owner:** Registers applications, keys, knowledge, and support teams.
- **Support agent:** Handles assigned conversations with optional AI assistance.
- **End customer:** Receives support through an embedded widget or an app's custom interface.

### Primary use cases
- Guide customers through documented workflows and return verified page links.
- Answer FAQs using the current application's knowledge.
- Escalate unclear, sensitive, or unresolved requests to a human.
- Let agents read the full context and respond through a shared inbox.
- Offer agent-approved reply suggestions, grammar improvements, and conversation summaries.

## 2. Product principles

1. **No hardcoded product identity.** “SupportAI” is a seed/default value, not an assumption in business logic, database schemas, URLs, email templates, or UI copy.
2. **API-first, widget optional.** External apps may use their own UI or the hosted/embeddable widget.
3. **Tenant isolation.** Every application-owned record and operation must be scoped and authorized.
4. **AI is grounded, not omniscient.** No invented buttons, links, policies, payments, or account status.
5. **Human oversight.** AI suggestions are drafts; agents review before sending.
6. **Cost control.** Start with free-tier-compatible providers and enforce usage limits.
7. **Incremental delivery.** Design for handoff and widgets now; implement them after the core API works.

## 3. Scope and delivery stages

### MVP 1 — AI support API
- Developer authentication and application registration.
- Application-scoped API keys, securely hashed at rest, with rotation/revocation.
- CRUD for manually authored, published application knowledge.
- Grounded AI chat, conversation history, and structured, verified links.
- Escalation detection and a `waiting_for_agent` state; no live inbox yet.
- Tenant authorization, rate limits, request validation, and basic usage tracking.
- Platform and application settings with validated defaults and safe public projections.

### MVP 2 — Hybrid human support
- Agent membership/roles and an application-scoped support inbox.
- Agent assignment, message exchange, and handoff lifecycle.
- Real-time delivery (e.g. Socket.IO), with REST history and reconnect handling.
- AI copilot: suggested replies, grammar/tone improvement, and summaries.
- Agent-controlled sending; no automatic sending of copilot drafts.
- Optional embeddable chat widget with secure browser-facing credentials.

### Later
- Website crawling, file ingestion, embeddings/vector search at scale.
- Advanced analytics, multilingual content workflows, agent automation.
- Authenticated account-specific tools/actions, billing, and usage plans.

## 4. Platform settings vs application settings

### PlatformSettings (global, administrator-managed)
- **branding:** displayName (default `SupportAI`), tagline, logo, favicon.
- **localization:** defaultLanguage (initially `en`), supportedLanguages, timezone (default `Africa/Lagos`), date/time formats.
- **support:** contact details and default handoff policies.
- **ai:** selected provider identifier, response tone, fallback behavior, model policy and budget limits.
- **features:** rollout flags for AI chat, handoff, copilot, widget.
- **operations:** public status, limits, retention policy, onboarding defaults.

### ApplicationSettings (tenant-managed)
- Assistant display name, welcome message, colors/logo, widget placement.
- Preferred language, permitted languages, tone, and escalation rules.
- Approved link domains and documented navigation paths.
- Support hours, handoff availability, application-level feature toggles.

**Resolution:** built-in defaults → platform defaults → permitted application overrides. Validate every override; platform-level disabled capabilities cannot be re-enabled by tenants. Define explicit fallback behavior for unsupported languages.

**Security:** Never put Gemini keys, JWT secrets, database URLs, or raw API keys in public settings or ordinary settings responses. Keep secrets in secure server configuration. Split safe public GET responses from privileged administrative read/write APIs. Audit setting changes. Avoid exposing arbitrary configuration values to unauthenticated callers.

## 5. Architecture

- **Backend:** Node.js, Express, JavaScript, Zod.
- **Database:** MongoDB + Mongoose.
- **AI:** provider abstraction; Gemini first, with future Groq/Ollama adapters.
- **Dashboard (later):** Next.js + Tailwind CSS.
- **Real time (MVP 2):** Socket.IO or equivalent.
- **API specification:** OpenAPI.
- **Architecture style:** Modular monolith, with clear service boundaries.

Conceptual flow:

```text
Customer app / optional widget
           |
     Authenticated API
           |
  Tenant + settings resolution
           |
  Conversation orchestration
       /           \
Knowledge retrieval  Escalation routing
       |                  |
   AI provider       Human inbox (MVP 2)
       |                  |
Verified structured reply / Agent-approved reply
           |
       Customer
```

Keep the AI provider behind a narrow interface so a provider change does not require changing controllers or tenant logic.

## 6. Proposed modules

```text
src/
  config/
  modules/
    auth/
    platform-settings/
    applications/
    application-settings/
    api-keys/
    knowledge/
    conversations/
    chat/
    agents/              # MVP 2
    inbox/               # MVP 2
    copilot/             # MVP 2
    widget/              # MVP 2
  ai/
    providers/
    prompts/
    services/
  shared/
    middleware/
    errors/
    utils/
  app.js
  server.js
```

This is a proposed structure, not a requirement to create empty folders immediately.

## 7. Data model outline

- **User:** developer/admin identity and credentials.
- **Application:** owner, name, approved domains, status.
- **ApplicationMember:** user, application, role (owner/admin/agent).
- **ApiKey:** application, hash, prefix, scopes, revocation and usage metadata.
- **PlatformSettings:** singleton or versioned global configuration.
- **ApplicationSettings:** application-scoped overrides.
- **Knowledge:** application, title, category, instructions, approved links, publication status.
- **Conversation:** application, external session identifier, status, assignment, timestamps.
- **Message:** conversation, sender role, content, timestamps.
- **UsageEvent:** application, provider, tokens/requests, latency and outcome.
- **AiSuggestion (MVP 2):** conversation, suggestion type, content, authoring metadata.

Application-scoped queries must enforce tenant ownership; conversation IDs alone are never sufficient authorization. Store only necessary customer data, with configurable retention and deletion.

## 8. Initial API surface (provisional)

```http
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/applications
GET    /api/v1/applications
POST   /api/v1/applications/:id/keys
POST   /api/v1/applications/:id/knowledge
GET    /api/v1/applications/:id/knowledge
PATCH  /api/v1/applications/:id/knowledge/:knowledgeId
DELETE /api/v1/applications/:id/knowledge/:knowledgeId
POST   /api/v1/chat
GET    /api/v1/conversations/:id
GET    /api/v1/platform/public-settings
GET    /api/v1/admin/platform/settings
PATCH  /api/v1/admin/platform/settings
GET    /api/v1/applications/:id/settings
PATCH  /api/v1/applications/:id/settings
```

Admin/developer endpoints use authenticated users and authorization; the server-to-server chat API uses an application API key. Browser widgets **must not embed secret API keys**; use restricted, short-lived widget tokens with origin checks and abuse protections. Origin checks alone are not authentication.

### Example chat response
```json
{
  "conversationId": "conv_example",
  "status": "ai_active",
  "message": "Open your subscription page and select Renew.",
  "links": [
    {"label": "Open subscriptions", "url": "https://example.com/subscriptions"}
  ],
  "handoffOffered": false
}
```

Links must come from authorized knowledge/configuration and pass allowlist validation, not from arbitrary model-generated URLs.

## 9. AI response and escalation policy

1. Authenticate request and resolve the correct application.
2. Load effective, authorized settings.
3. Retrieve relevant published knowledge only from that application.
4. Build the model context with the question and bounded conversation history.
5. Generate a structured answer and validate its claims/links where feasible.
6. Persist the exchange and record usage.
7. Escalate on explicit human requests, missing knowledge, payment/account disputes, sensitive issues, or repeated unsuccessful answers.

Treat retrieved text as untrusted content, not instructions to override system rules. The AI cannot access account balances or perform transactions unless a future authenticated tool integration explicitly allows it.

Conversation lifecycle (initial design): `ai_active` → `waiting_for_agent` → `assigned_to_agent` → `resolved` / `closed`. Define transitions, permissions, and reopen behavior during implementation.

## 10. Human support and copilot (MVP 2)

- Agents see tenant-scoped queues, conversation history, summaries, and assignment status.
- Agent messages are delivered to the customer through real-time transport or a polling-compatible API.
- Copilot actions: **Suggest reply**, **Fix grammar**, **Make professional**, **Make friendly**, **Shorten**, **Summarize**.
- Suggestions preserve factual meaning, clearly distinguish unverified information, and require agent approval.
- AI-to-human handoff includes a concise summary and reason for escalation.
- Support unavailability should be handled gracefully (queue status, support hours, or contact alternative).

## 11. Security and reliability

- Secure password hashing, API-key hashing, rotation, least-privilege scopes.
- Server-side secret management and safe error responses.
- Tenant isolation on every read/write; role-based access control.
- Rate limiting, usage quotas, request size limits, prompt length limits.
- Approved-domain URL validation; prevent malicious redirects.
- Minimize customer PII sent to third-party AI providers; disclose provider data handling.
- Audit important administrative changes and agent actions.
- Explicit retention/deletion policies and basic operational logging.
- Provider timeout, retry policy, graceful failure and human fallback.

## 12. Success criteria

- Two registered demo applications have isolated knowledge and conversations.
- A documented renewal question produces correct steps and a verified link.
- An unknown or account-specific issue triggers a safe handoff offer.
- A follow-up question uses the correct conversation context.
- Invalid/revoked API keys and cross-tenant access are rejected.
- Platform branding and default language can change through settings without source-code edits.
- Usage limits prevent runaway free-tier API consumption.

## 13. Development milestones

1. **Foundation:** repo structure, Node/Express, environment validation, tests, linting.
2. **AI spike:** Gemini provider adapter, one local test endpoint, usage safeguards.
3. **Identity and tenants:** MongoDB, developer auth, application registration, API keys.
4. **Settings:** platform defaults, application overrides, admin/public projections.
5. **Knowledge and grounding:** CRUD, retrieval, structured responses, link validation.
6. **Conversation and escalation:** history, states, tenant-safe persistence.
7. **Hardening:** security tests, OpenAPI docs, rate limits, quotas.
8. **First integration:** WifiSpace Networks via server-to-server API.
9. **Human support:** inbox, agents, assignment, real-time delivery.
10. **Agent copilot:** suggestions, rewriting, summaries.
11. **Widget:** optional embeddable customer chat experience.
12. **Dashboard and refinement:** developer management, analytics, onboarding.

## 14. Open decisions

- Backend/dashboard deployment: separate Express API and Next.js dashboard vs unified deployment.
- Agent identity and multi-application memberships.
- Widget token issuance and session trust model.
- Language fallback and translation strategy.
- Provider selection/quotas under available free tiers.
- Exact initial knowledge retrieval strategy and evaluation dataset.

**Next step:** Approve this blueprint, then decide deployment/repository layout before coding.
