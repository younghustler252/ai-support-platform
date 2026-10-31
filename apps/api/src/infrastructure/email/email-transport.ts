import { env } from "../../config/env.js";

export interface EmailMessage {
	to: string;
	subject: string;
	html: string;
	text: string;
}

export interface EmailTransport {
	deliver(message: EmailMessage): Promise<void>;
}

export class EmailDeliveryError extends Error {
	constructor(message: string, public readonly retryable: boolean) {
		super(message);
		this.name = "EmailDeliveryError";
	}
}

const DELIVERY_TIMEOUT_MS = 8000;

class ResendTransport implements EmailTransport {
	constructor(private readonly apiKey: string, private readonly from: string) {}

	async deliver(message: EmailMessage): Promise<void> {
		let response: Awaited<ReturnType<typeof fetch>>;
		try {
			response = await fetch("https://api.resend.com/emails", {
				method: "POST",
				headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
				body: JSON.stringify({
					from: this.from,
					to: [message.to],
					subject: message.subject,
					html: message.html,
					text: message.text,
				}),
				signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
			});
		} catch {
			throw new EmailDeliveryError("Email provider unreachable", true);
		}
		if (response.ok) return;
		throw new EmailDeliveryError(
			`Email provider responded with status ${response.status}`,
			response.status === 429 || response.status >= 500,
		);
	}
}

class ConsoleTransport implements EmailTransport {
	async deliver(message: EmailMessage): Promise<void> {
		if (env.NODE_ENV !== "development") return;
		console.info(`[dev email] to=${message.to} subject="${message.subject}"\n${message.text}`);
	}
}

export function createEmailTransport(): EmailTransport {
	if (env.AUTH_EMAIL_API_KEY && env.AUTH_EMAIL_FROM) {
		return new ResendTransport(env.AUTH_EMAIL_API_KEY, env.AUTH_EMAIL_FROM);
	}
	return new ConsoleTransport();
}
