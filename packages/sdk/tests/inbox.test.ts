import assert from "node:assert/strict";
import test from "node:test";

import { createClient, createSseParser } from "../src/index";

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stream(chunks: string[]): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
				controller.close();
			},
		}),
		{ status: 200, headers: { "content-type": "text/event-stream" } },
	);
}

function authedClient(fetchImpl: typeof fetch) {
	const client = createClient({ baseUrl: "https://api.test/api/v1", fetch: fetchImpl, now: () => 1_000_000 });
	client.http.setAccessToken({ accessToken: "tok", expiresIn: 900 });
	return client;
}

test("sse parser joins data lines and ignores comments across chunks", () => {
	const seen: Array<{ event: string; data: string }> = [];
	const parser = createSseParser((message) => seen.push(message));
	parser.push(": connected\n\nevent: message.created\nda");
	parser.push('ta: {"a":1}\ndata: two\n\n');
	parser.push("data: plain\n\n");
	assert.deepEqual(seen, [
		{ event: "message.created", data: '{"a":1}\ntwo' },
		{ event: "message", data: "plain" },
	]);
});

test("conversations.list sends joined status filter and returns the cursor", async () => {
	let url = "";
	const client = authedClient(async (input) => {
		url = String(input);
		return json(200, { data: { conversations: [{ id: "c1" }] }, meta: { nextCursor: "next" } });
	});
	const page = await client.conversations.list("o1", "a1", { status: ["WAITING_FOR_AGENT", "ASSIGNED_TO_AGENT"], assignee: "me", limit: 20 });
	assert.equal(page.items.length, 1);
	assert.equal(page.nextCursor, "next");
	const parsed = new URL(url);
	assert.equal(parsed.pathname, "/api/v1/organizations/o1/applications/a1/conversations");
	assert.equal(parsed.searchParams.get("status"), "WAITING_FOR_AGENT,ASSIGNED_TO_AGENT");
	assert.equal(parsed.searchParams.get("assignee"), "me");
});

test("conversation actions post to the action path", async () => {
	const calls: Array<{ url: string; method: string; body?: string }> = [];
	const client = authedClient(async (input, init) => {
		calls.push({ url: String(input), method: init?.method ?? "GET", body: init?.body as string | undefined });
		return json(200, { data: { conversation: { id: "c1", status: "RESOLVED" } } });
	});
	const result = await client.conversations.perform("o1", "a1", "c1", "resolve");
	assert.equal(result.status, "RESOLVED");
	await client.conversations.assign("o1", "a1", "c1", "u2");
	assert.ok(calls[0]!.url.endsWith("/conversations/c1/resolve"));
	assert.ok(calls[1]!.url.endsWith("/conversations/c1/assign"));
	assert.equal(calls[1]!.body, JSON.stringify({ userId: "u2" }));
});

test("events.subscribe authenticates, parses events and reconnects", async () => {
	const headers: string[] = [];
	let opened = 0;
	const client = authedClient(async (_input, init) => {
		headers.push((init?.headers as Record<string, string>).Authorization ?? "");
		opened += 1;
		if (opened === 1) {
			return stream([': connected\n\nevent: conversation.updated\ndata: {"type":"conversation.updated","conversationId":"c1","status":"RESOLVED","assigneeUserId":null,"event":"resolve"}\n\n']);
		}
		return new Promise<Response>(() => undefined);
	});
	const events: unknown[] = [];
	const subscription = client.events.subscribe("o1", "a1", { onEvent: (event) => events.push(event) });
	await new Promise((resolve) => setTimeout(resolve, 50));
	subscription.close();
	assert.equal(events.length, 1);
	assert.equal(headers[0], "Bearer tok");
});

test("members.listForApplication unwraps the member list", async () => {
	let url = "";
	const client = authedClient(async (input) => {
		url = String(input);
		return json(200, { data: { members: [{ userId: "u1", email: "a@example.com", displayName: null, role: "MEMBER", addedAt: "2026-01-01" }] } });
	});
	const members = await client.members.listForApplication("o1", "a1");
	assert.equal(members[0]!.userId, "u1");
	assert.ok(url.endsWith("/organizations/o1/applications/a1/members"));
});
