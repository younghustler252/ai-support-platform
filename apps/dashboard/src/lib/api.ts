import { createClient } from "@platform/sdk";

let expiredHandler: (() => void) | null = null;

export function onSessionExpired(handler: (() => void) | null): void {
	expiredHandler = handler;
}

export const api = createClient({
	baseUrl: "/api/v1",
	onSessionExpired: () => expiredHandler?.(),
});
