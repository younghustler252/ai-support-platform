import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { Page } from "../../../foundation/utils/cursor.js";
import type { NotificationView } from "../notification.types.js";
import type { INotificationRepository } from "../repositories/notification.repository.interface.js";

export class ListNotificationsUseCase {
	constructor(private readonly deps: { notificationRepository: INotificationRepository }) {}

	async execute(input: {
		userId: string;
		unreadOnly: boolean;
		limit: number;
		cursor?: string;
	}): Promise<Page<NotificationView> & { unreadCount: number }> {
		const { notificationRepository } = this.deps;
		const [page, unreadCount] = await Promise.all([
			notificationRepository.list(input.userId, { unreadOnly: input.unreadOnly, limit: input.limit, cursor: input.cursor }),
			notificationRepository.countUnread(input.userId),
		]);
		return { ...page, unreadCount };
	}
}

export class MarkNotificationReadUseCase {
	constructor(private readonly deps: { notificationRepository: INotificationRepository }) {}

	async execute(userId: string, notificationId: string): Promise<void> {
		if (!(await this.deps.notificationRepository.markRead(userId, notificationId))) throw new NotFoundError("Notification not found");
	}
}

export class MarkAllNotificationsReadUseCase {
	constructor(private readonly deps: { notificationRepository: INotificationRepository }) {}

	execute(userId: string): Promise<void> {
		return this.deps.notificationRepository.markAllRead(userId);
	}
}

export class GetNotificationPreferencesUseCase {
	constructor(private readonly deps: { notificationRepository: INotificationRepository }) {}

	async execute(userId: string): Promise<{ email: boolean }> {
		return { email: await this.deps.notificationRepository.getEmailPreference(userId) };
	}
}

export class UpdateNotificationPreferencesUseCase {
	constructor(private readonly deps: { notificationRepository: INotificationRepository }) {}

	async execute(userId: string, input: { email: boolean }): Promise<{ email: boolean }> {
		await this.deps.notificationRepository.setEmailPreference(userId, input.email);
		return { email: input.email };
	}
}
