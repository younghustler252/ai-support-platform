ALTER TABLE "Permission" ADD COLUMN "delegable" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Role"
	ADD COLUMN "key" TEXT,
	ADD COLUMN "nameKey" TEXT NOT NULL DEFAULT '',
	ADD COLUMN "scopeKey" TEXT NOT NULL DEFAULT 'system',
	ADD COLUMN "description" TEXT,
	ADD COLUMN "createdByUserId" TEXT,
	ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Role"
SET "nameKey" = lower("name"),
	"scopeKey" = COALESCE("applicationId", "organizationId", 'system');

ALTER TABLE "Role" ALTER COLUMN "nameKey" DROP DEFAULT;
ALTER TABLE "Role" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");
CREATE UNIQUE INDEX "Role_scopeKey_nameKey_key" ON "Role"("scopeKey", "nameKey");

ALTER TABLE "Role" DROP CONSTRAINT "Role_organizationId_fkey";
ALTER TABLE "Role" DROP CONSTRAINT "Role_applicationId_fkey";
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Role" ADD CONSTRAINT "Role_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipRole"
	ADD COLUMN "assignedByUserId" TEXT,
	ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "MembershipRole_roleId_idx" ON "MembershipRole"("roleId");

ALTER TABLE "ApplicationMembershipRole"
	ADD COLUMN "assignedByUserId" TEXT,
	ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "ApplicationMembershipRole_roleId_idx" ON "ApplicationMembershipRole"("roleId");
