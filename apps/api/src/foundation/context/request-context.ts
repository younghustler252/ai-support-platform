import { randomUUID } from "node:crypto";

export interface RequestContext {
	requestId: string;
	startedAt: number;
	userId: string | null;
	organizationId: string | null;
	applicationId: string | null;
}

export function createRequestContext(): RequestContext {
	return {
		requestId: randomUUID(),
		startedAt: Date.now(),
		userId: null,
		organizationId: null,
		applicationId: null,
	};
}
