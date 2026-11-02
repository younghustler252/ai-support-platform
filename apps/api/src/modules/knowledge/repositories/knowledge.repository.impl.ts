import { Prisma, type PrismaClient } from "../../../generated/prisma/client.js";
import { decodeCursor, toPage, type Page } from "../../../foundation/utils/cursor.js";
import type { ArticleLink, ArticlePatch, ArticleSummary, ArticleView, Passage } from "../knowledge.types.js";
import type { ArticleListQuery, IKnowledgeRepository } from "./knowledge.repository.interface.js";

const summarySelect = { id: true, applicationId: true, title: true, publishedAt: true, createdAt: true, updatedAt: true } as const;
const viewSelect = { ...summarySelect, content: true, links: true } as const;

interface SummaryRow {
	id: string;
	applicationId: string;
	title: string;
	publishedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

interface ViewRow extends SummaryRow {
	content: string;
	links: unknown;
}

function toSummary(row: SummaryRow): ArticleSummary {
	return { ...row, status: row.publishedAt ? "PUBLISHED" : "DRAFT" };
}

function toView(row: ViewRow): ArticleView {
	return { ...toSummary(row), content: row.content, links: (row.links as ArticleLink[] | null) ?? null };
}

function jsonLinks(links: ArticleLink[]): Prisma.InputJsonValue {
	return links as unknown as Prisma.InputJsonValue;
}

export class KnowledgeRepositoryImpl implements IKnowledgeRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async list(applicationId: string, query: ArticleListQuery): Promise<Page<ArticleSummary>> {
		const cursor = decodeCursor(query.cursor);
		const conditions = [
			...(query.status === "PUBLISHED" ? [{ publishedAt: { not: null } }] : []),
			...(query.status === "DRAFT" ? [{ publishedAt: null }] : []),
			...(query.search ? [{ title: { contains: query.search, mode: "insensitive" as const } }] : []),
			...(cursor ? [{ OR: [{ updatedAt: { lt: cursor.at } }, { updatedAt: cursor.at, id: { lt: cursor.id } }] }] : []),
		];
		const rows = await this.deps.prisma.knowledgeArticle.findMany({
			where: { applicationId, ...(conditions.length > 0 ? { AND: conditions } : {}) },
			select: summarySelect,
			orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
			take: query.limit + 1,
		});
		return toPage(rows.map(toSummary), query.limit, (row) => ({ at: row.updatedAt, id: row.id }));
	}

	async find(applicationId: string, articleId: string): Promise<ArticleView | null> {
		const row = await this.deps.prisma.knowledgeArticle.findFirst({ where: { id: articleId, applicationId }, select: viewSelect });
		return row ? toView(row) : null;
	}

	count(applicationId: string): Promise<number> {
		return this.deps.prisma.knowledgeArticle.count({ where: { applicationId } });
	}

	create(applicationId: string, input: { title: string; content: string; links: ArticleLink[] | null }, chunks: string[]): Promise<ArticleView> {
		return this.deps.prisma.$transaction(async (tx) => {
			const article = await tx.knowledgeArticle.create({
				data: {
					applicationId,
					title: input.title,
					content: input.content,
					...(input.links ? { links: jsonLinks(input.links) } : {}),
				},
				select: viewSelect,
			});
			await tx.knowledgeChunk.createMany({
				data: chunks.map((content, position) => ({ articleId: article.id, applicationId, position, content })),
			});
			return toView(article);
		});
	}

	update(applicationId: string, articleId: string, patch: ArticlePatch, chunks: string[] | null): Promise<ArticleView | null> {
		return this.deps.prisma.$transaction(async (tx) => {
			const owned = await tx.knowledgeArticle.updateMany({
				where: { id: articleId, applicationId },
				data: {
					...(patch.title !== undefined ? { title: patch.title } : {}),
					...(patch.content !== undefined ? { content: patch.content } : {}),
					...(patch.links !== undefined ? { links: patch.links === null ? Prisma.DbNull : jsonLinks(patch.links) } : {}),
					updatedAt: new Date(),
				},
			});
			if (owned.count === 0) return null;
			if (chunks) {
				await tx.knowledgeChunk.deleteMany({ where: { articleId, applicationId } });
				await tx.knowledgeChunk.createMany({
					data: chunks.map((content, position) => ({ articleId, applicationId, position, content })),
				});
			}
			const row = await tx.knowledgeArticle.findFirst({ where: { id: articleId, applicationId }, select: viewSelect });
			return row ? toView(row) : null;
		});
	}

	async setPublished(applicationId: string, articleId: string, published: boolean): Promise<ArticleView | null> {
		const result = await this.deps.prisma.knowledgeArticle.updateMany({
			where: { id: articleId, applicationId },
			data: { publishedAt: published ? new Date() : null, updatedAt: new Date() },
		});
		return result.count > 0 ? this.find(applicationId, articleId) : null;
	}

	async delete(applicationId: string, articleId: string): Promise<boolean> {
		const result = await this.deps.prisma.knowledgeArticle.deleteMany({ where: { id: articleId, applicationId } });
		return result.count > 0;
	}

	async search(applicationId: string, tsquery: string, limit: number): Promise<Passage[]> {
		const rows = await this.deps.prisma.$queryRaw<Array<{ articleId: string; title: string; content: string; score: number }>>`
			SELECT c."articleId" AS "articleId", a."title" AS "title", c."content" AS "content", ts_rank_cd(c."search", q.query)::float8 AS "score"
			FROM "KnowledgeChunk" c
			JOIN "KnowledgeArticle" a ON a."id" = c."articleId"
			CROSS JOIN (SELECT to_tsquery('simple', ${tsquery}) AS query) q
			WHERE c."applicationId" = ${applicationId}
				AND a."applicationId" = ${applicationId}
				AND a."publishedAt" IS NOT NULL
				AND c."search" @@ q.query
			ORDER BY "score" DESC, c."articleId", c."position"
			LIMIT ${limit}
		`;
		return rows.map((row) => ({ ...row, score: Number(row.score) }));
	}
}
