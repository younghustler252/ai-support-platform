# applications

Status: IMPLEMENTED — applications (websites/products) that belong to an organization.

| Method | Path | Access |
| --- | --- | --- |
| POST | `/organizations/:organizationId/applications` | organization `ADMIN` |
| GET | `/organizations/:organizationId/applications` | organization `MEMBER`; admins see all, members see only applications they were added to |
| GET | `/organizations/:organizationId/applications/:applicationId` | application `MEMBER` |
| PATCH | same | application `ADMIN` |
| DELETE | same | organization `ADMIN` (archive; revokes the application's API keys) |

`allowedOrigins` is a normalised list of exact origins (`https://example.com`, no path) used later for widget and browser-facing checks; it is stored and validated now but not yet enforced. Slugs are unique within an organization (archived applications keep theirs). Each organization has an application limit (`config/tenancy.ts`) that Milestone 9 turns into a plan entitlement.
