import type { Request, Response } from "express";

import { validatedQuery } from "../../../foundation/http/locals.js";
import { apiKeyContext } from "../../api-keys/middleware/require-api-key.js";
import { authContext, requestMeta, validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type {
	CreateArticleUseCase,
	DeleteArticleUseCase,
	GetArticleUseCase,
	ListArticlesUseCase,
	SearchKnowledgeUseCase,
	SetArticlePublishedUseCase,
	UpdateArticleUseCase,
} from "../usecases/article-usecases.js";
import type {
	ArticleParams,
	CreateArticleInput,
	ListArticlesQuery,
	SearchKnowledgeQuery,
	UpdateArticleInput,
} from "../validators/knowledge.validator.js";

interface Dependencies {
	listArticlesUseCase: ListArticlesUseCase;
	getArticleUseCase: GetArticleUseCase;
	createArticleUseCase: CreateArticleUseCase;
	updateArticleUseCase: UpdateArticleUseCase;
	setArticlePublishedUseCase: SetArticlePublishedUseCase;
	deleteArticleUseCase: DeleteArticleUseCase;
	searchKnowledgeUseCase: SearchKnowledgeUseCase;
}

function scopeOf(response: Response) {
	const { user } = authContext(response);
	const { organizationId, applicationId } = tenantContext(response);
	return { organizationId, applicationId: applicationId as string, actorId: user.id };
}

export class KnowledgeController {
	constructor(private readonly deps: Dependencies) {}

	list = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { status, q, limit, cursor } = validatedQuery<ListArticlesQuery>(response);
		const page = await this.deps.listArticlesUseCase.execute({ applicationId: applicationId as string, status, search: q, limit, cursor });
		response.json({ data: { articles: page.items }, meta: { nextCursor: page.nextCursor } });
	};

	get = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { articleId } = validatedParams<ArticleParams>(response);
		response.json({ data: { article: await this.deps.getArticleUseCase.execute(applicationId as string, articleId) } });
	};

	create = async (request: Request, response: Response): Promise<void> => {
		const input = validatedBody<CreateArticleInput>(response);
		const article = await this.deps.createArticleUseCase.execute({ ...scopeOf(response), ...input }, requestMeta(request));
		response.status(201).json({ data: { article } });
	};

	update = async (request: Request, response: Response): Promise<void> => {
		const { articleId } = validatedParams<ArticleParams>(response);
		const patch = validatedBody<UpdateArticleInput>(response);
		const article = await this.deps.updateArticleUseCase.execute({ ...scopeOf(response), articleId, patch }, requestMeta(request));
		response.json({ data: { article } });
	};

	publish = async (request: Request, response: Response): Promise<void> => {
		const { articleId } = validatedParams<ArticleParams>(response);
		const article = await this.deps.setArticlePublishedUseCase.execute({ ...scopeOf(response), articleId, published: true }, requestMeta(request));
		response.json({ data: { article } });
	};

	unpublish = async (request: Request, response: Response): Promise<void> => {
		const { articleId } = validatedParams<ArticleParams>(response);
		const article = await this.deps.setArticlePublishedUseCase.execute({ ...scopeOf(response), articleId, published: false }, requestMeta(request));
		response.json({ data: { article } });
	};

	remove = async (request: Request, response: Response): Promise<void> => {
		const { articleId } = validatedParams<ArticleParams>(response);
		await this.deps.deleteArticleUseCase.execute({ ...scopeOf(response), articleId }, requestMeta(request));
		response.status(204).end();
	};

	searchService = async (_request: Request, response: Response): Promise<void> => {
		const { q, limit } = validatedQuery<SearchKnowledgeQuery>(response);
		const passages = await this.deps.searchKnowledgeUseCase.execute({
			applicationId: apiKeyContext(response).application.id,
			query: q,
			limit,
		});
		response.json({ data: { passages } });
	};
}
