# customers

Status: IMPLEMENTED — application-scoped end customers.

Agents with `customer.read` / `customer.manage` list (search and cursor pagination), read and edit customers under `/organizations/:organizationId/applications/:applicationId/customers`. Server-to-server callers upsert a customer by their own identifier with `PUT /service/customers/:externalId` (API key scope `conversations:write`). Customers are unique per application by `externalId`, never shared across applications, and have a bounded flat `metadata` object.
