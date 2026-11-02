import { tenancyConfig } from "../../../config/tenancy.js";

interface ChunkOptions {
	target: number;
	max: number;
}

const defaults: ChunkOptions = {
	target: tenancyConfig.knowledge.chunkTargetLength,
	max: tenancyConfig.knowledge.chunkMaxLength,
};

function splitLong(text: string, max: number): string[] {
	if (text.length <= max) return [text];
	const pieces: string[] = [];
	let current = "";
	for (const sentence of text.split(/(?<=[.!?])\s+/)) {
		if (sentence.length > max) {
			if (current) pieces.push(current);
			current = "";
			for (let index = 0; index < sentence.length; index += max) pieces.push(sentence.slice(index, index + max));
			continue;
		}
		if (current && current.length + sentence.length + 1 > max) {
			pieces.push(current);
			current = "";
		}
		current = current ? `${current} ${sentence}` : sentence;
	}
	if (current) pieces.push(current);
	return pieces;
}

export function chunkArticle(title: string, content: string, options: ChunkOptions = defaults): string[] {
	const paragraphs = content
		.replace(/\r\n/g, "\n")
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0);

	const chunks: string[] = [];
	let current = "";
	for (const piece of paragraphs.flatMap((paragraph) => splitLong(paragraph, options.max))) {
		if (current && current.length + piece.length + 2 > options.target) {
			chunks.push(current);
			current = "";
		}
		current = current ? `${current}\n\n${piece}` : piece;
	}
	if (current) chunks.push(current);
	return chunks.map((chunk) => `${title}\n\n${chunk}`);
}
