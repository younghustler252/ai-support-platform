export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
	constructor(
		public readonly code: string,
		message: string,
		public readonly statusCode: number = 500,
		public readonly details?: ErrorDetails,
	) {
		super(message);
		this.name = new.target.name;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export class ValidationError extends AppError {
	constructor(message = "Request validation failed", details?: ErrorDetails) {
		super("VALIDATION_ERROR", message, 400, details);
	}
}

export class AuthenticationError extends AppError {
	constructor(message = "Authentication required") {
		super("UNAUTHENTICATED", message, 401);
	}
}

export class ForbiddenError extends AppError {
	constructor(message = "Access denied") {
		super("FORBIDDEN", message, 403);
	}
}

export class NotFoundError extends AppError {
	constructor(message = "Resource not found") {
		super("NOT_FOUND", message, 404);
	}
}

export class ConflictError extends AppError {
	constructor(message = "Resource conflict") {
		super("CONFLICT", message, 409);
	}
}

export class TooManyRequestsError extends AppError {
	constructor(message = "Too many requests") {
		super("RATE_LIMITED", message, 429);
	}
}

export class RefreshConflictError extends AppError {
	constructor() {
		super("REFRESH_CONFLICT", "The refresh token was just rotated. Retry with the latest cookie.", 409);
	}
}

export class EmailNotVerifiedError extends AppError {
	constructor() {
		super("EMAIL_NOT_VERIFIED", "Email verification required", 403);
	}
}
