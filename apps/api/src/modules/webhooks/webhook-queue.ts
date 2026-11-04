export interface WebhookQueue {
	enqueue(deliveryId: string): Promise<void>;
	close?(): Promise<void>;
}

export interface WebhookHttpClient {
	post(url: string, options: { headers: Record<string, string>; body: string; timeoutMs: number }): Promise<{ status: number }>;
}
