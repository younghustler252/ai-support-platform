export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterMs: number;
}

export interface RateLimiter {
	consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

interface Bucket {
	count: number;
	resetAt: number;
}

const SWEEP_INTERVAL_MS = 60_000;

export class MemoryRateLimiter implements RateLimiter {
	private readonly buckets = new Map<string, Bucket>();
	private lastSweep = 0;

	constructor(
		private readonly now: () => number = Date.now,
		private readonly maxKeys = 100_000,
	) {}

	async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
		const now = this.now();
		this.sweep(now);

		const existing = this.buckets.get(key);
		const bucket: Bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };
		bucket.count += 1;

		if (!existing && this.buckets.size >= this.maxKeys) {
			const oldest = this.buckets.keys().next();
			if (!oldest.done) this.buckets.delete(oldest.value);
		}
		this.buckets.set(key, bucket);

		const allowed = bucket.count <= limit;
		return {
			allowed,
			remaining: Math.max(0, limit - bucket.count),
			retryAfterMs: allowed ? 0 : Math.max(0, bucket.resetAt - now),
		};
	}

	private sweep(now: number): void {
		if (now - this.lastSweep < SWEEP_INTERVAL_MS && this.buckets.size < this.maxKeys) return;
		this.lastSweep = now;
		for (const [key, bucket] of this.buckets) {
			if (bucket.resetAt <= now) this.buckets.delete(key);
		}
	}
}
