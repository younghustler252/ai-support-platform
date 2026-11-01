ALTER TABLE "Customer"
	ADD COLUMN "email" TEXT,
	ADD COLUMN "metadata" JSONB,
	ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Customer" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE INDEX "Customer_applicationId_createdAt_idx" ON "Customer"("applicationId", "createdAt");

ALTER TABLE "Conversation"
	ADD COLUMN "subject" TEXT,
	ADD COLUMN "assigneeUserId" TEXT,
	ADD COLUMN "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	ADD COLUMN "resolvedAt" TIMESTAMP(3),
	ADD COLUMN "closedAt" TIMESTAMP(3);

UPDATE "Conversation" SET "lastMessageAt" = "updatedAt";

DROP INDEX "Conversation_applicationId_status_updatedAt_idx";
CREATE INDEX "Conversation_applicationId_status_lastMessageAt_idx" ON "Conversation"("applicationId", "status", "lastMessageAt");
CREATE INDEX "Conversation_applicationId_assigneeUserId_status_idx" ON "Conversation"("applicationId", "assigneeUserId", "status");
CREATE INDEX "Conversation_customerId_status_idx" ON "Conversation"("customerId", "status");

ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_customerId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
	ADD COLUMN "senderUserId" TEXT,
	ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;
DROP INDEX "Message_conversationId_createdAt_idx";
CREATE INDEX "Message_conversationId_createdAt_id_idx" ON "Message"("conversationId", "createdAt", "id");

ALTER TABLE "ConversationAssignment"
	ADD COLUMN "assignedByUserId" TEXT,
	ADD COLUMN "endReason" TEXT;
CREATE INDEX "ConversationAssignment_agentUserId_endedAt_idx" ON "ConversationAssignment"("agentUserId", "endedAt");
