export interface AuthEmailPort {
	send(email: string, purpose: "verify" | "reset", token: string): Promise<void>;
}
