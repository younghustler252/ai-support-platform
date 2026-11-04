ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "applicationId" TEXT;

UPDATE "AuditLog"
SET "organizationId" = "metadata"->>'organizationId'
WHERE "metadata" IS NOT NULL
  AND "metadata"->>'organizationId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE "AuditLog"
SET "applicationId" = "metadata"->>'applicationId'
WHERE "metadata" IS NOT NULL
  AND "metadata"->>'applicationId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

CREATE INDEX "AuditLog_organizationId_createdAt_id_idx" ON "AuditLog"("organizationId", "createdAt", "id");
CREATE INDEX "AuditLog_applicationId_createdAt_idx" ON "AuditLog"("applicationId", "createdAt");
