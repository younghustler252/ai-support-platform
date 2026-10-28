# Multi-tenancy

A user identity may belong to multiple organizations and applications. End customers are distinct from platform users. Use shared PostgreSQL tables with organization/application IDs, validated context, authorization filters, and compound indexes. Do not trust client-supplied tenant identifiers. Tenant enforcement is PLANNED.
