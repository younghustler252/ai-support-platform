export type RealtimeListener = (payload: unknown) => void;
export type Unsubscribe = () => Promise<void>;

export interface RealtimeBus {
	publish(channel: string, payload: unknown): Promise<void>;
	subscribe(channel: string, listener: RealtimeListener): Promise<Unsubscribe>;
	close(): Promise<void>;
}

export class InProcessRealtimeBus implements RealtimeBus {
	private readonly listeners = new Map<string, Set<RealtimeListener>>();

	async publish(channel: string, payload: unknown): Promise<void> {
		for (const listener of [...(this.listeners.get(channel) ?? [])]) listener(JSON.parse(JSON.stringify(payload)));
	}

	async subscribe(channel: string, listener: RealtimeListener): Promise<Unsubscribe> {
		const set = this.listeners.get(channel) ?? new Set<RealtimeListener>();
		set.add(listener);
		this.listeners.set(channel, set);
		return async () => {
			set.delete(listener);
			if (set.size === 0) this.listeners.delete(channel);
		};
	}

	async close(): Promise<void> {
		this.listeners.clear();
	}
}
