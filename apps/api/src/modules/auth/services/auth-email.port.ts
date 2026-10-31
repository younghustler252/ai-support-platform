export interface AuthEmailPort {
	sendVerification(email: string, token: string): Promise<void>;
	sendPasswordReset(email: string, token: string): Promise<void>;
	sendPasswordChanged(email: string): Promise<void>;
}
