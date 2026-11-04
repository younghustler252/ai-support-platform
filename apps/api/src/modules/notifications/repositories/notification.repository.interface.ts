import type { Page } from "../../../foundation/utils/cursor.js";
import type { NewNotification, NotificationRecipient, NotificationView } from "../notification.types.js";

export interface INotificationRepository {
	createMany(items: NewNotification[]): Promise<void>;
	list(userId: string, query: { unreadOnly: boolean; limit: number; cursor?: string }): Promise<Page<NotificationView>>;
	countUnread(userId: string): Promise<number>;
	markRead(userId: string, notificationId: string): Promise<boolean>;
	markAllRead(userId: string): Promise<void>;
	getEmailPreference(userId: string): Promise<boolean>;
	setEmailPreference(userId: string, enabled: boolean): Promise<void>;
	findApplicationInfo(applicationId: string): Promise<{ name: string; organizationId: string } | null>;
	findUserRecipient(userId: string): Promise<NotificationRecipient | null>;
	findAdminRecipients(applicationId: string, organizationId: string, limit: number): Promise<NotificationRecipient[]>;
}
