import { ApiError } from "@platform/sdk";

export function describeError(error: unknown, fallback = "Something went wrong. Please try again."): string {
	if (!(error instanceof ApiError)) return fallback;
	if (error.isNetworkError) return "Could not reach the server. Check your connection and try again.";
	if (error.status === 429) return "Too many attempts. Please wait a moment and try again.";
	if (error.status >= 500) return fallback;
	return error.message;
}
