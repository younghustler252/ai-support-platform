import { env } from "../../../config/env.js";
import { AiProviderError, type AiCompletion, type AiCompletionRequest, type IAiProvider } from "../ai.types.js";

interface ProviderConfig {
	apiKey: string;
	baseUrl: string;
	model: string;
	timeoutMs: number;
	fetchImpl?: typeof fetch;
}

interface ChatResponse {
	model?: unknown;
	choices?: Array<{ message?: { content?: unknown } }>;
	usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

export class OpenAiCompatibleProvider implements IAiProvider {
	readonly configured = true;

	constructor(private readonly config: ProviderConfig) {}

	async complete(request: AiCompletionRequest): Promise<AiCompletion> {
		const { apiKey, baseUrl, model, timeoutMs, fetchImpl = fetch } = this.config;
		let response: Response;
		try {
			response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
				body: JSON.stringify({
					model,
					messages: request.messages,
					max_tokens: request.maxTokens,
					temperature: request.temperature,
				}),
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch {
			throw new AiProviderError("The AI provider could not be reached");
		}
		if (!response.ok) throw new AiProviderError(`The AI provider returned status ${response.status}`, response.status);

		let payload: ChatResponse;
		try {
			payload = (await response.json()) as ChatResponse;
		} catch {
			throw new AiProviderError("The AI provider returned an unreadable response");
		}
		const text = payload.choices?.[0]?.message?.content;
		if (typeof text !== "string") throw new AiProviderError("The AI provider returned no content");
		return {
			text,
			model: typeof payload.model === "string" ? payload.model : model,
			inputTokens: count(payload.usage?.prompt_tokens),
			outputTokens: count(payload.usage?.completion_tokens),
		};
	}
}

export class UnconfiguredAiProvider implements IAiProvider {
	readonly configured = false;

	async complete(): Promise<AiCompletion> {
		throw new AiProviderError("No AI provider is configured");
	}
}

export function createAiProvider(): IAiProvider {
	if (!env.AI_API_KEY) return new UnconfiguredAiProvider();
	return new OpenAiCompatibleProvider({
		apiKey: env.AI_API_KEY,
		baseUrl: env.AI_BASE_URL,
		model: env.AI_MODEL,
		timeoutMs: env.AI_TIMEOUT_MS,
	});
}
