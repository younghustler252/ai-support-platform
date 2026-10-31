import { logger } from "../../foundation/logging/logger.js";
import { EmailDeliveryError, type EmailMessage, type EmailTransport } from "./email-transport.js";

export interface EmailQueue {
	enqueue(message: EmailMessage): Promise<void>;
	drain(timeoutMs: number): Promise<void>;
}

interface Job {
	message: EmailMessage;
	attempt: number;
}

const CONCURRENCY = 4;
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

function maskEmail(email: string): string {
	const [local = "", domain = ""] = email.split("@");
	return `${local.slice(0, 1)}***@${domain}`;
}

export class InProcessEmailQueue implements EmailQueue {
	private readonly jobs: Job[] = [];
	private readonly retryTimers = new Set<ReturnType<typeof setTimeout>>();
	private running = 0;
	private closed = false;

	constructor(private readonly deps: { emailTransport: EmailTransport }) {}

	async enqueue(message: EmailMessage): Promise<void> {
		if (this.closed) throw new Error("Email queue is shutting down");
		this.jobs.push({ message, attempt: 0 });
		this.pump();
	}

	async drain(timeoutMs: number): Promise<void> {
		this.closed = true;
		if (this.retryTimers.size > 0) {
			logger.warn("email.retries_dropped", { count: this.retryTimers.size });
			for (const timer of this.retryTimers) clearTimeout(timer);
			this.retryTimers.clear();
		}
		const deadline = Date.now() + timeoutMs;
		while ((this.running > 0 || this.jobs.length > 0) && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	private pump(): void {
		while (this.running < CONCURRENCY && this.jobs.length > 0) {
			const job = this.jobs.shift();
			if (!job) return;
			this.running += 1;
			void this.run(job).finally(() => {
				this.running -= 1;
				this.pump();
			});
		}
	}

	private async run(job: Job): Promise<void> {
		try {
			await this.deps.emailTransport.deliver(job.message);
		} catch (error) {
			const retryable = !(error instanceof EmailDeliveryError) || error.retryable;
			const attempts = job.attempt + 1;
			const fields = { to: maskEmail(job.message.to), subject: job.message.subject, attempts, error };

			if (!retryable || attempts >= MAX_ATTEMPTS || this.closed) {
				logger.error("email.delivery_failed", fields);
				return;
			}

			logger.warn("email.delivery_retry", fields);
			const delay = BASE_DELAY_MS * 2 ** job.attempt + Math.floor(Math.random() * 250);
			const timer = setTimeout(() => {
				this.retryTimers.delete(timer);
				this.jobs.push({ message: job.message, attempt: attempts });
				this.pump();
			}, delay);
			timer.unref();
			this.retryTimers.add(timer);
		}
	}
}
