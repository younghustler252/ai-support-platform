import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import { decodeCursor, toPage, type Page } from "../../../foundation/utils/cursor.js";
import type { NewNotification, NotificationRecipient, NotificationView } from "../notification.types.js";
import type { INotificationRepository } from "./notification.repository.interface.js";

const recipientSelect = {
	id: true,
	email: true,
	displayName: true,
	notificationPreference: { select: { emailEnabled: true } },
} as const;

function toRecipient(user: {
	id: string;
	email: string;
	displayName: string | null;
	notificationPreference: { emailEnabled: boolean } | null;
}): NotificationRecipient {
	return {
		userId: user.id,
		email: user.email,
		displayName: user.displayName,
		emailEnabled: user.notificationPreference?.emailEnabled ?? true,
	};
}

export class NotificationRepositoryImpl implements INotificationRepository {
	constructor(private readonly deps: { prisma: PrismaClient }) {}

	async createMany(items: NewNotification[]): Promise<void> {
		if (items.length === 0) return;
		await this.deps.prisma.notification.createMany({
			data: items.map((item) => ({
				recipientUserId: item.recipientUserId,
				applicationId: item.applicationId,
				channel: "IN_APP" as const,
				type: item.type,
				payload: item.payload,
			})),
		});
	}

	async list(userId: string, query: { unreadOnly: boolean; limit: number; cursor?: string }): Promise<Page<NotificationView>> {
		const cursor = decodeCursor(query.cursor);
		const and: Prisma.NotificationWhereInput[] = [];
		if (cursor) and.push({ OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] });
		const rows = await this.deps.prisma.notification.findMany({
			where: { recipientUserId: userId, channel: "IN_APP", readAt: query.unreadOnly ? null : undefined, AND: and },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			take: query.limit + 1,
		});
		return toPage(
			rows.map((row) => ({
				id: row.id,
				applicationId: row.applicationId,
				type: row.type,
				payload: row.payload,
				readAt: row.readAt,
				createdAt: row.createdAt,
			})),
			query.limit,
			(row) => ({ at: row.createdAt, id: row.id }),
		);
	}

	countUnread(userId: string): Promise<number> {
		return this.deps.prisma.notification.count({ where: { recipientUserId: userId, channel: "IN_APP", readAt: null } });
	}

	async markRead(userId: string, notificationId: string): Promise<boolean> {
		const owned = await this.deps.prisma.notification.findFirst({
			where: { id: notificationId, recipientUserId: userId, channel: "IN_APP" },
			select: { id: true },
		});
		if (!owned) return false;
		await this.deps.prisma.notification.updateMany({ where: { id: notificationId, readAt: null }, data: { readAt: new Date() } });
		return true;
	}

	async markAllRead(userId: string): Promise<void> {
		await this.deps.prisma.notification.updateMany({
			where: { recipientUserId: userId, channel: "IN_APP", readAt: null },
			data: { readAt: new Date() },
		});
	}

	async getEmailPreference(userId: string): Promise<boolean> {
		const row = await this.deps.prisma.notificationPreference.findUnique({ where: { userId } });
		return row?.emailEnabled ?? true;
	}

	async setEmailPreference(userId: string, enabled: boolean): Promise<void> {
		await this.deps.prisma.notificationPreference.upsert({
			where: { userId },
			create: { userId, emailEnabled: enabled },
			update: { emailEnabled: enabled },
		});
	}

	async findApplicationInfo(applicationId: string): Promise<{ name: string; organizationId: string } | null> {
		return this.deps.prisma.application.findUnique({ where: { id: applicationId }, select: { name: true, organizationId: true } });
	}

	async findUserRecipient(userId: string): Promise<NotificationRecipient | null> {
		const user = await this.deps.prisma.user.findFirst({ where: { id: userId, disabledAt: null }, select: recipientSelect });
		return user ? toRecipient(user) : null;
	}

	async findAdminRecipients(applicationId: string, organizationId: string, limit: number): Promise<NotificationRecipient[]> {
		const users = await this.deps.prisma.user.findMany({
			where: {
				disabledAt: null,
				OR: [
					{ organizations: { some: { organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } } } },
					{ applications: { some: { applicationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } } } },
				],
			},
			select: recipientSelect,
			orderBy: { id: "asc" },
			take: limit,
		});
		return users.map(toRecipient);
	}
}
