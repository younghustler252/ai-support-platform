ALTER TABLE "KnowledgeChunk" ALTER COLUMN "search" DROP EXPRESSION;

UPDATE "KnowledgeChunk" SET "search" = to_tsvector('simple', "content");

CREATE TRIGGER "KnowledgeChunk_search_update"
BEFORE INSERT OR UPDATE OF "content" ON "KnowledgeChunk"
FOR EACH ROW EXECUTE FUNCTION tsvector_update_trigger("search", 'pg_catalog.simple', "content");
