import { logger } from "../../foundation/logging/logger.js";

export function logEmailFailure(action: string): (error: unknown) => void {
	return (error) => {
		logger.error("auth.email_enqueue_failed", { action, error });
	};
}

export function isUniqueViolation(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export function truncate(value: string | undefined, length: number): string | undefined {
	return value === undefined ? undefined : value.slice(0, length);
}
