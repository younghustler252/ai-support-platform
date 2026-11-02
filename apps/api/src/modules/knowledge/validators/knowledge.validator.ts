import { z } from "zod";

import { tenancyConfig } from "../../../config/tenancy.js";
import { cursorSchema, limitSchema } from "../../../foundation/validation/fields.js";

const { titleMaxLength, contentMaxLength, linksPerArticle, searchQueryMaxLength } = tenancyConfig.knowledge;

const title = z.string().trim().min(1).max(titleMaxLength);
const content = z.string().trim().min(1).max(contentMaxLength);

const link = z.strictObject({
	label: z.string().trim().min(1).max(100),
	url: z
		.url()
		.max(2000)
		.refine((value) => /^https?:\/\//i.test(value), "Must be an http or https URL"),
});
const links = z.array(link).max(linksPerArticle);

export const listArticlesQuerySchema = z.object({
	status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
	q: z.string().trim().min(1).max(100).optional(),
	limit: limitSchema,
	cursor: cursorSchema,
});

export const articleParamsSchema = z.object({
	organizationId: z.uuid(),
	applicationId: z.uuid(),
	articleId: z.uuid(),
});

export const createArticleSchema = z.strictObject({ title, content, links: links.optional() });

export const updateArticleSchema = z
	.strictObject({ title: title.optional(), content: content.optional(), links: links.nullable().optional() })
	.refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const searchKnowledgeQuerySchema = z.object({
	q: z.string().trim().min(1).max(searchQueryMaxLength),
	limit: z.coerce.number().int().min(1).max(10).default(tenancyConfig.knowledge.searchResultLimit),
});

export type ListArticlesQuery = z.output<typeof listArticlesQuerySchema>;
export type ArticleParams = z.output<typeof articleParamsSchema>;
export type CreateArticleInput = z.output<typeof createArticleSchema>;
export type UpdateArticleInput = z.output<typeof updateArticleSchema>;
export type SearchKnowledgeQuery = z.output<typeof searchKnowledgeQuerySchema>;
