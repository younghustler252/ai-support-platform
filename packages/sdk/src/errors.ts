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
