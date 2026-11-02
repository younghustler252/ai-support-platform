import { tenancyConfig } from "../../config/tenancy.js";

const stopWords = new Set([
	"a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at", "for", "with", "by", "from", "as", "is", "are", "was", "were",
	"be", "been", "do", "does", "did", "can", "could", "would", "should", "will", "i", "me", "my", "we", "our", "you", "your", "it", "its",
	"this", "that", "these", "those", "how", "what", "when", "where", "why", "who", "which", "please", "help", "need", "want", "about",
	"le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "mais", "si", "dans", "sur", "pour", "avec", "par", "au", "aux", "en",
	"est", "sont", "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "mon", "ma", "mes", "ton", "ta", "tes", "votre", "vos", "ce",
	"cette", "ces", "comment", "quoi", "quand", "pourquoi", "qui", "que", "quel", "quelle", "puis", "peut", "veux", "besoin",
]);

export function searchTerms(text: string): string[] {
	const seen = new Set<string>();
	const terms: string[] = [];
	for (const match of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
		const term = match[0];
		if (term.length < 2 || stopWords.has(term) || seen.has(term)) continue;
		seen.add(term);
		terms.push(term);
		if (terms.length >= tenancyConfig.knowledge.searchTermLimit) break;
	}
	return terms;
}

export function buildSearchQuery(text: string): string | null {
	const terms = searchTerms(text.slice(0, tenancyConfig.knowledge.searchQueryMaxLength));
	return terms.length > 0 ? terms.join(" | ") : null;
}
