import { tenancyConfig } from "../../config/tenancy.js";
import type { Passage } from "../knowledge/knowledge.types.js";
import type { IKnowledgeRepository } from "../knowledge/repositories/knowledge.repository.interface.js";
import { buildSearchQuery } from "./search-query.js";

export interface IRetrievalService {
	retrieve(applicationId: string, question: string, limit?: number): Promise<Passage[]>;
}

export class RetrievalService implements IRetrievalService {
	constructor(private readonly deps: { knowledgeRepository: IKnowledgeRepository }) {}

	async retrieve(applicationId: string, question: string, limit: number = tenancyConfig.knowledge.searchResultLimit): Promise<Passage[]> {
		const query = buildSearchQuery(question);
		if (!query) return [];
		return this.deps.knowledgeRepository.search(applicationId, query, limit);
	}
}
