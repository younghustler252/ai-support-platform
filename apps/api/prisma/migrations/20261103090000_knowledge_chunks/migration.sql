ALTER TABLE "KnowledgeArticle" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX "KnowledgeArticle_applicationId_updatedAt_idx" ON "KnowledgeArticle"("applicationId", "updatedAt");

CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeChunk_articleId_position_key" ON "KnowledgeChunk"("articleId", "position");
CREATE INDEX "KnowledgeChunk_applicationId_idx" ON "KnowledgeChunk"("applicationId");
CREATE INDEX "KnowledgeChunk_search_idx" ON "KnowledgeChunk" USING GIN ("search");

ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KnowledgeArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
