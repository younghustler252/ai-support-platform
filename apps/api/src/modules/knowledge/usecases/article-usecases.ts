import { ConflictError, NotFoundError } from "../../../foundation/errors/app-error.js";
import type { Page } from "../../../foundation/utils/cursor.js";
import { tenancyConfig } from "../../../config/tenancy.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import type { IEntitlementService } from "../../entitlements/services/entitlement.service.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { IRetrievalService } from "../../retrieval/retrieval.service.js";
import { chunkArticle } from "../domain/chunking.js";
import type { ArticleLink, ArticlePatch, ArticleStatus, ArticleSummary, ArticleView, Passage } from "../knowledge.types.js";
import type { IKnowledgeRepository } from "../repositories/knowledge.repository.interface.js";

interface Scope {
	organizationId: string;
	applicationId: string;
	actorId: string;
}

async function audit(auditService: AuditRecorder, scope: Scope, action: string, articleId: string, meta: RequestMeta): Promise<void> {
	await auditService.record({
		actorUserId: scope.actorId,
		action,
		resourceType: "KnowledgeArticle",
		resourceId: articleId,
		metadata: auditMetadata(meta, { organizationId: scope.organizationId, applicationId: scope.applicationId }),
	});
}

export class ListArticlesUseCase {
	constructor(private readonly deps: { knowledgeRepository: IKnowledgeRepository }) {}

	execute(input: { applicationId: string; status?: ArticleStatus; search?: string; limit: number; cursor?: string }): Promise<Page<ArticleSummary>> {
		return this.deps.knowledgeRepository.list(input.applicationId, {
			status: input.status,
			search: input.search,
			limit: input.limit,
			cursor: input.cursor,
		});
	}
}

export class GetArticleUseCase {
	constructor(private readonly deps: { knowledgeRepository: IKnowledgeRepository }) {}

	async execute(applicationId: string, articleId: string): Promise<ArticleView> {
		const article = await this.deps.knowledgeRepository.find(applicationId, articleId);
		if (!article) throw new NotFoundError("Article not found");
		return article;
	}
}

export class CreateArticleUseCase {
	constructor(private readonly deps: {
		knowledgeRepository: IKnowledgeRepository;
		auditService: AuditRecorder;
		entitlementService: IEntitlementService;
	}) {}

	async execute(input: Scope & { title: string; content: string; links?: ArticleLink[] }, meta: RequestMeta = {}): Promise<ArticleView> {
		const { knowledgeRepository, auditService, entitlementService } = this.deps;
		await entitlementService.assertWithin(
			input.organizationId,
			"knowledge_articles",
			await knowledgeRepository.count(input.applicationId),
			tenancyConfig.limits.articlesPerApplication,
		);
		const article = await knowledgeRepository.create(
			input.applicationId,
			{ title: input.title, content: input.content, links: input.links ?? null },
			chunkArticle(input.title, input.content),
		);
		await audit(auditService, input, "knowledge.article.created", article.id, meta);
		return article;
	}
}

export class UpdateArticleUseCase {
	constructor(private readonly deps: { knowledgeRepository: IKnowledgeRepository; auditService: AuditRecorder }) {}

	async execute(input: Scope & { articleId: string; patch: ArticlePatch }, meta: RequestMeta = {}): Promise<ArticleView> {
		const { knowledgeRepository, auditService } = this.deps;
		const current = await knowledgeRepository.find(input.applicationId, input.articleId);
		if (!current) throw new NotFoundError("Article not found");

		const title = input.patch.title ?? current.title;
		const content = input.patch.content ?? current.content;
		const retext = title !== current.title || content !== current.content;
		const article = await knowledgeRepository.update(
			input.applicationId,
			input.articleId,
			input.patch,
			retext ? chunkArticle(title, content) : null,
		);
		if (!article) throw new NotFoundError("Article not found");
		await audit(auditService, input, "knowledge.article.updated", article.id, meta);
		return article;
	}
}

export class SetArticlePublishedUseCase {
	constructor(private readonly deps: { knowledgeRepository: IKnowledgeRepository; auditService: AuditRecorder }) {}

	async execute(input: Scope & { articleId: string; published: boolean }, meta: RequestMeta = {}): Promise<ArticleView> {
		const { knowledgeRepository, auditService } = this.deps;
		const current = await knowledgeRepository.find(input.applicationId, input.articleId);
		if (!current) throw new NotFoundError("Article not found");
		if ((current.status === "PUBLISHED") === input.published) {
			throw new ConflictError(input.published ? "The article is already published" : "The article is not published");
		}
		const article = await knowledgeRepository.setPublished(input.applicationId, input.articleId, input.published);
		if (!article) throw new NotFoundError("Article not found");
		await audit(auditService, input, input.published ? "knowledge.article.published" : "knowledge.article.unpublished", article.id, meta);
		return article;
	}
}

export class DeleteArticleUseCase {
	constructor(private readonly deps: { knowledgeRepository: IKnowledgeRepository; auditService: AuditRecorder }) {}

	async execute(input: Scope & { articleId: string }, meta: RequestMeta = {}): Promise<void> {
		if (!(await this.deps.knowledgeRepository.delete(input.applicationId, input.articleId))) throw new NotFoundError("Article not found");
		await audit(this.deps.auditService, input, "knowledge.article.deleted", input.articleId, meta);
	}
}

export class SearchKnowledgeUseCase {
	constructor(private readonly deps: { retrievalService: IRetrievalService }) {}

	execute(input: { applicationId: string; query: string; limit: number }): Promise<Passage[]> {
		return this.deps.retrievalService.retrieve(input.applicationId, input.query, input.limit);
	}
}
