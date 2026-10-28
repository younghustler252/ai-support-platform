# API design

Version routes under `/api/v1`. Use Zod request validation, consistent errors, OpenAPI, tenant-scoped authorization and rate limits. API keys must be hashed at rest and never shipped to browser widgets. Widget access requires scoped short-lived tokens. These features are PLANNED except the public settings starter endpoint.
