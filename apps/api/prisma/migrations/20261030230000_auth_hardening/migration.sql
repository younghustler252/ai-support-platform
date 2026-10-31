-- CreateEnum
CREATE TYPE "SessionRevokeReason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'ROTATED', 'REUSE_DETECTED', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'USER_DISABLED', 'SESSION_LIMIT', 'REVOKED_BY_USER');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "authVersion",
ADD COLUMN     "disabledAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "absoluteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "revokedReason" "SessionRevokeReason";

UPDATE "AuthSession" SET "familyId" = "id", "absoluteExpiresAt" = "expiresAt";

ALTER TABLE "AuthSession" ALTER COLUMN "familyId" SET NOT NULL,
ALTER COLUMN "absoluteExpiresAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AuthSession_familyId_idx" ON "AuthSession"("familyId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
