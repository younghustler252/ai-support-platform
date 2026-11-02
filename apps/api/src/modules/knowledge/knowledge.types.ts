export type ArticleStatus = "DRAFT" | "PUBLISHED";

export interface ArticleLink {
	label: string;
	url: string;
}

export interface ArticleSummary {
	id: string;
	applicationId: string;
	title: string;
	status: ArticleStatus;
	publishedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface ArticleView extends ArticleSummary {
	content: string;
	links: ArticleLink[] | null;
}

export interface ArticlePatch {
	title?: string;
	content?: string;
	links?: ArticleLink[] | null;
}

export interface Passage {
	articleId: string;
	title: string;
	content: string;
	score: number;
}
