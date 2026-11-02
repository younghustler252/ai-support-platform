import type { Page } from "../../../foundation/utils/cursor.js";
import type { ArticleLink, ArticlePatch, ArticleStatus, ArticleSummary, ArticleView, Passage } from "../knowledge.types.js";

export interface ArticleListQuery {
	status?: ArticleStatus;
	search?: string;
	limit: number;
	cursor?: string;
}

export interface IKnowledgeRepository {
	list(applicationId: string, query: ArticleListQuery): Promise<Page<ArticleSummary>>;
	find(applicationId: string, articleId: string): Promise<ArticleView | null>;
	count(applicationId: string): Promise<number>;
	create(applicationId: string, input: { title: string; content: string; links: ArticleLink[] | null }, chunks: string[]): Promise<ArticleView>;
	update(applicationId: string, articleId: string, patch: ArticlePatch, chunks: string[] | null): Promise<ArticleView | null>;
	setPublished(applicationId: string, articleId: string, published: boolean): Promise<ArticleView | null>;
	delete(applicationId: string, articleId: string): Promise<boolean>;
	search(applicationId: string, tsquery: string, limit: number): Promise<Passage[]>;
}
