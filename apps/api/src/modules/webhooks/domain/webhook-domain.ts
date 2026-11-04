import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../../config/env.js";
import { isPrivateAddress } from "../../../infrastructure/http/safe-http.js";
import net from "node:net";

export const webhookEvents = [
	"conversation.created",
	"conversation.assigned",
	"conversation.escalated",
	"conversation.reopened",
	"conversation.resolved",
	"conversation.closed",
	"message.created",
] as const;

export type WebhookEvent = (typeof webhookEvents)[number];

const conversationEvents: Record<string, WebhookEvent> = {
	created: "conversation.created",
	claimed: "conversation.assigned",
	assigned: "conversation.assigned",
	reassigned: "conversation.assigned",
	transferred: "conversation.assigned",
	escalated: "conversation.escalated",
	reopened: "conversation.reopened",
	reopened_by_customer: "conversation.reopened",
	resolved: "conversation.resolved",
	closed: "conversation.closed",
};

export function webhookEventFor(internalEvent: string | null): WebhookEvent | null {
	return internalEvent ? (conversationEvents[internalEvent] ?? null) : null;
}

function masterKey(): string {
	return env.WEBHOOK_SIGNING_KEY ?? `webhook:${env.AUTH_JWT_SECRET}`;
}

export function webhookSecret(endpointId: string, version: number, key: string = masterKey()): string {
	return `whsec_${createHmac("sha256", key).update(`${endpointId}:${version}`).digest("base64url")}`;
}

export function signPayload(secret: string, timestamp: number, body: string): string {
	return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifySignature(secret: string, timestamp: number, body: string, signature: string): boolean {
	const expected = Buffer.from(signPayload(secret, timestamp, body));
	const actual = Buffer.from(signature);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function urlProblem(raw: string, allowPrivate: boolean = env.WEBHOOK_ALLOW_PRIVATE_TARGETS === "true"): string | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return "Must be a valid URL";
	}
	if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) return "Must use https";
	if (url.username || url.password) return "Must not contain credentials";
	if (url.hash) return "Must not contain a fragment";
	if (allowPrivate) return null;

	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
		return "Must point to a public host";
	}
	if (net.isIP(host) && isPrivateAddress(host)) return "Must point to a public host";
	return null;
}
