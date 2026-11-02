export interface AiChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface AiCompletionRequest {
	messages: AiChatMessage[];
	maxTokens: number;
	temperature: number;
}

export interface AiCompletion {
	text: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
}

export interface IAiProvider {
	readonly configured: boolean;
	complete(request: AiCompletionRequest): Promise<AiCompletion>;
}

export class AiProviderError extends Error {
	constructor(message: string, readonly status?: number) {
		super(message);
		this.name = "AiProviderError";
	}
}

export interface AiSettings {
	enabled: boolean;
	instructions: string;
	fallbackMessage: string | null;
}
