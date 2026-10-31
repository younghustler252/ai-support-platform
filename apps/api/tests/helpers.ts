import { createServer, type Server } from "node:http";
import type { Express } from "express";

import type { AuditEvent } from "../src/modules/audit/repositories/audit.repository.interface.js";
import type { AuditRecorder } from "../src/modules/audit/services/audit.service.js";
import type { IAuthRepository } from "../src/modules/auth/repositories/auth.repository.interface.js";
import type { AuthEmailPort } from "../src/modules/auth/services/auth-email.port.js";

export async function withServer(app: Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
	const server: Server = createServer(app);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

	try {
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("No TCP port");
		await run(`http://127.0.0.1:${address.port}`);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}
}

export function authRepository(overrides: Partial<IAuthRepository> = {}): IAuthRepository {
	return {
		findByEmail: async () => null,
		findById: async () => null,
		findToken: async () => null,
		findLatestToken: async () => null,
		register: async () => { throw new Error("unexpected register"); },
		consumeVerification: async () => false,
		replaceToken: async () => { throw new Error("unexpected replaceToken"); },
		resetPassword: async () => false,
		changePassword: async () => { throw new Error("unexpected changePassword"); },
		updatePasswordHash: async () => { throw new Error("unexpected updatePasswordHash"); },
		markLoggedIn: async () => {},
		purgeExpired: async () => ({ sessions: 0, tokens: 0 }),
		...overrides,
	};
}

export function auditSpy(): AuditRecorder & { events: AuditEvent[] } {
	const events: AuditEvent[] = [];
	return {
		events,
		record: async (event) => { events.push(event); },
	};
}

export function emailSpy(): AuthEmailPort & { sent: Array<{ kind: string; email: string; token?: string }> } {
	const sent: Array<{ kind: string; email: string; token?: string }> = [];
	return {
		sent,
		sendVerification: async (email, token) => { sent.push({ kind: "verify", email, token }); },
		sendPasswordReset: async (email, token) => { sent.push({ kind: "reset", email, token }); },
		sendPasswordChanged: async (email) => { sent.push({ kind: "changed", email }); },
	};
}
