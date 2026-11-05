export interface ApiErrorInit {
	status: number;
	code: string;
	message: string;
	details?: unknown;
	requestId?: string;
}

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly details?: unknown;
	readonly requestId?: string;

	constructor(init: ApiErrorInit) {
		super(init.message);
		this.name = "ApiError";
		this.status = init.status;
		this.code = init.code;
		this.details = init.details;
		this.requestId = init.requestId;
	}

	get isNetworkError(): boolean {
		return this.status === 0;
	}
}

export function isApiError(value: unknown): value is ApiError {
	return value instanceof ApiError;
}

export function fieldErrors(error: unknown): Record<string, string> {
	if (!(error instanceof ApiError) || typeof error.details !== "object" || error.details === null) return {};
	const issues = (error.details as { issues?: unknown }).issues;
	if (!Array.isArray(issues)) return {};
	const result: Record<string, string> = {};
	for (const issue of issues as Array<{ path?: unknown; message?: unknown }>) {
		if (typeof issue.path === "string" && typeof issue.message === "string" && !(issue.path in result)) result[issue.path] = issue.message;
	}
	return result;
}
