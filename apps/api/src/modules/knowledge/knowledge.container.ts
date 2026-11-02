import { asClass, type AwilixContainer } from "awilix";

import { RetrievalService } from "../retrieval/retrieval.service.js";
import { KnowledgeController } from "./controllers/knowledge.controller.js";
import { KnowledgeRepositoryImpl } from "./repositories/knowledge.repository.impl.js";
import {
	CreateArticleUseCase,
	DeleteArticleUseCase,
	GetArticleUseCase,
	ListArticlesUseCase,
	SearchKnowledgeUseCase,
	SetArticlePublishedUseCase,
	UpdateArticleUseCase,
} from "./usecases/article-usecases.js";

export function registerKnowledge(container: AwilixContainer): void {
	container.register({
		knowledgeRepository: asClass(KnowledgeRepositoryImpl).scoped(),
		retrievalService: asClass(RetrievalService).scoped(),
		listArticlesUseCase: asClass(ListArticlesUseCase).scoped(),
		getArticleUseCase: asClass(GetArticleUseCase).scoped(),
		createArticleUseCase: asClass(CreateArticleUseCase).scoped(),
		updateArticleUseCase: asClass(UpdateArticleUseCase).scoped(),
		setArticlePublishedUseCase: asClass(SetArticlePublishedUseCase).scoped(),
		deleteArticleUseCase: asClass(DeleteArticleUseCase).scoped(),
		searchKnowledgeUseCase: asClass(SearchKnowledgeUseCase).scoped(),
		knowledgeController: asClass(KnowledgeController).scoped(),
	});
}
