# organizations

Status: IMPLEMENTED — organization lifecycle. Members and invitations live in `memberships`; applications in `applications`.

| Method | Path | Minimum role | Purpose |
| --- | --- | --- | --- |
| POST | `/organizations` | signed-in user | Create an organization; the creator becomes `OWNER` |
| GET | `/organizations` | signed-in user | Organizations the caller belongs to, with their role |
| GET | `/organizations/:organizationId` | `MEMBER` | Read one organization |
| PATCH | `/organizations/:organizationId` | `ADMIN` | Rename (slug is immutable) |
| DELETE | `/organizations/:organizationId` | `OWNER` | Archive; revokes pending invitations and stops its API keys authenticating |

Slugs are generated from the name when omitted (a random suffix resolves collisions). Reserved slugs are rejected. Each user can own a limited number of organizations (`config/tenancy.ts`), which Milestone 9 turns into plan entitlements.
