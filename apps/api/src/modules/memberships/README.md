# memberships

Status: IMPLEMENTED — organization members, invitations and application members.

## Organization members

| Method | Path | Minimum role |
| --- | --- | --- |
| GET | `/organizations/:organizationId/members` | `MEMBER` |
| PATCH | `/organizations/:organizationId/members/:userId` | `ADMIN` (owner roles need `OWNER`) |
| DELETE | `/organizations/:organizationId/members/:userId` | `MEMBER` to leave, `ADMIN` to remove others (owners need `OWNER`) |

Rules: nobody can change their own role unless they are an owner; an organization always keeps at least one owner (enforced under a row lock on the organization, so two owners demoting each other concurrently cannot leave it ownerless); removing a member also removes their application memberships in that organization.

## Invitations

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/organizations/:organizationId/invitations` | `ADMIN`; role `ADMIN` or `MEMBER`; emails a link containing a single-use token |
| GET | `/organizations/:organizationId/invitations` | `ADMIN`; pending only |
| DELETE | `/organizations/:organizationId/invitations/:invitationId` | `ADMIN`; revoke |
| POST | `/invitations/accept` | signed-in user whose verified email matches the invited address |

Tokens are stored only as SHA-256 hashes, expire after 7 days, and are claimed atomically. Re-inviting the same address revokes the previous pending invitation. Every failure to accept returns the same `Invalid or expired invitation` error.

## Application members

Organization `OWNER`/`ADMIN` members already have access to every application. These endpoints grant a plain organization `MEMBER` access to a specific application with an application role of `ADMIN` or `MEMBER`. Only active organization members can be added.

| Method | Path | Minimum application role |
| --- | --- | --- |
| GET | `/organizations/:organizationId/applications/:applicationId/members` | `MEMBER` |
| POST | same | `ADMIN` |
| PATCH | `.../members/:userId` | `ADMIN` |
| DELETE | `.../members/:userId` | `ADMIN` |
