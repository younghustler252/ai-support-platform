import assert from "node:assert/strict";
import test from "node:test";

import type { EmailMessage } from "../src/infrastructure/email/email-transport.js";
import type { NewNotification, NotificationRecipient } from "../src/modules/notifications/notification.types.js";
import type { INotificationRepository } from "../src/modules/notifications/repositories/notification.repository.interface.js";
import { ConversationNotifier } from "../src/modules/notifications/services/conversation-notifier.js";
import {
	GetNotificationPreferencesUseCase,
	MarkNotificationReadUseCase,
	UpdateNotificationPreferencesUseCase,
} from "../src/modules/notifications/usecases/notification-usecases.js";
import { listNotificationsQuerySchema, updatePreferencesSchema } from "../src/modules/notifications/validators/notification.validator.js";

const app = "11111111-1111-4111-8111-111111111111";

function recipient(id: string, emailEnabled = true): NotificationRecipient {
	return { userId: id, email: `${id}@example.com`, displayName: id, emailEnabled };
}

class FakeRepo implements Partial<INotificationRepository> {
	created: NewNotification[] = [];
	admins: NotificationRecipient[] = [];
	users = new Map<string, NotificationRecipient>();
	preferences = new Map<string, boolean>();
	owned = new Set<string>();
	applicationExists = true;

	async createMany(items: NewNotification[]) {
		this.created.push(...items);
	}
	async findApplicationInfo() {
		return this.applicationExists ? { name: "Acme <Help>", organizationId: "org" } : null;
	}
	async findUserRecipient(userId: string) {
		return this.users.get(userId) ?? null;
	}
	async findAdminRecipients() {
		return this.admins;
	}
	async getEmailPreference(userId: string) {
		return this.preferences.get(userId) ?? true;
	}
	async setEmailPreference(userId: string, enabled: boolean) {
		this.preferences.set(userId, enabled);
	}
	async markRead(_userId: string, id: string) {
		return this.owned.has(id);
	}
}

function build(repo: FakeRepo, failEmail = false) {
	const sent: EmailMessage[] = [];
	const emailQueue = {
		enqueue: async (message: EmailMessage) => {
			if (failEmail) throw new Error("queue down");
			sent.push(message);
		},
		drain: async () => {},
	};
	return { sent, notifier: new ConversationNotifier({ notificationRepository: repo as INotificationRepository, emailQueue }) };
}

function conversation(overrides: Record<string, unknown> = {}) {
	return { id: "c1", subject: "Refund <please>", assigneeUserId: "agent", ...overrides } as never;
}

test("assigning a conversation notifies the new assignee in the app and by email", async () => {
	const repo = new FakeRepo();
	repo.users.set("agent", recipient("agent"));
	const { notifier, sent } = build(repo);

	await notifier.conversationEvent(app, conversation(), "assigned");

	assert.deepEqual(repo.created, [{ recipientUserId: "agent", applicationId: app, type: "conversation.assigned", payload: { conversationId: "c1", subject: "Refund <please>" } }]);
	assert.equal(sent.length, 1);
	assert.equal(sent[0]?.to, "agent@example.com");
	assert.ok(sent[0]?.html.includes("&lt;please&gt;"));
	assert.ok(!sent[0]?.html.includes("<please>"));
	assert.ok(sent[0]?.html.includes("Acme &lt;Help&gt;"));
});

test("reassigned and transferred conversations notify, while a self claim does not", async () => {
	for (const [event, expected] of [["reassigned", 1], ["transferred", 1], ["claimed", 0], ["resolved", 0], [null, 0]] as const) {
		const repo = new FakeRepo();
		repo.users.set("agent", recipient("agent"));
		await build(repo).notifier.conversationEvent(app, conversation(), event);
		assert.equal(repo.created.length, expected, String(event));
	}
});

test("an escalation notifies every admin recipient", async () => {
	const repo = new FakeRepo();
	repo.admins = [recipient("a"), recipient("b")];
	const { notifier, sent } = build(repo);
	await notifier.conversationEvent(app, conversation({ assigneeUserId: null }), "escalated");

	assert.deepEqual(repo.created.map((item) => item.recipientUserId), ["a", "b"]);
	assert.ok(repo.created.every((item) => item.type === "conversation.escalated"));
	assert.equal(sent.length, 2);
});

test("users who turned email off still get the in-app notification but no email", async () => {
	const repo = new FakeRepo();
	repo.admins = [recipient("a", false), recipient("b")];
	const { notifier, sent } = build(repo);
	await notifier.conversationEvent(app, conversation({ assigneeUserId: null }), "escalated");

	assert.equal(repo.created.length, 2);
	assert.deepEqual(sent.map((message) => message.to), ["b@example.com"]);
});

test("long subjects are truncated and a missing subject is allowed", async () => {
	const repo = new FakeRepo();
	repo.users.set("agent", recipient("agent"));
	const { notifier } = build(repo);
	await notifier.conversationEvent(app, conversation({ subject: "x".repeat(500) }), "assigned");
	await notifier.conversationEvent(app, conversation({ subject: null }), "assigned");
	assert.equal((repo.created[0]?.payload.subject as string).length, 120);
	assert.equal(repo.created[1]?.payload.subject, null);
});

test("nothing is sent for unknown applications, unassigned or disabled assignees, or when delivery fails", async () => {
	const missing = new FakeRepo();
	missing.applicationExists = false;
	await build(missing).notifier.conversationEvent(app, conversation(), "assigned");
	assert.equal(missing.created.length, 0);

	const unassigned = new FakeRepo();
	await build(unassigned).notifier.conversationEvent(app, conversation({ assigneeUserId: null }), "assigned");
	assert.equal(unassigned.created.length, 0);

	const disabled = new FakeRepo();
	await build(disabled).notifier.conversationEvent(app, conversation(), "assigned");
	assert.equal(disabled.created.length, 0);

	const failing = new FakeRepo();
	failing.users.set("agent", recipient("agent"));
	await assert.doesNotReject(build(failing, true).notifier.conversationEvent(app, conversation(), "assigned"));
	assert.equal(failing.created.length, 1);

	const broken = new FakeRepo();
	broken.findApplicationInfo = async () => {
		throw new Error("db down");
	};
	await assert.doesNotReject(build(broken).notifier.conversationEvent(app, conversation(), "assigned"));
});

test("marking someone else's notification as read looks like it does not exist", async () => {
	const repo = new FakeRepo();
	repo.owned.add("mine");
	const use = new MarkNotificationReadUseCase({ notificationRepository: repo as INotificationRepository });
	await use.execute("u", "mine");
	await assert.rejects(use.execute("u", "theirs"), { code: "NOT_FOUND" });
});

test("email preference defaults to on and can be turned off", async () => {
	const repo = new FakeRepo();
	const get = new GetNotificationPreferencesUseCase({ notificationRepository: repo as INotificationRepository });
	assert.deepEqual(await get.execute("u"), { email: true });
	await new UpdateNotificationPreferencesUseCase({ notificationRepository: repo as INotificationRepository }).execute("u", { email: false });
	assert.deepEqual(await get.execute("u"), { email: false });
});

test("validators accept the documented shapes only", () => {
	assert.equal(listNotificationsQuerySchema.parse({ unread: "true" }).unread, true);
	assert.equal(listNotificationsQuerySchema.parse({}).unread, false);
	assert.equal(listNotificationsQuerySchema.safeParse({ unread: "yes" }).success, false);
	assert.equal(updatePreferencesSchema.safeParse({ email: "no" }).success, false);
	assert.equal(updatePreferencesSchema.safeParse({ email: true, extra: 1 }).success, false);
});
