export interface NotificationView {
	id: string;
	applicationId: string | null;
	type: string;
	payload: unknown;
	readAt: Date | null;
	createdAt: Date;
}

export interface NotificationRecipient {
	userId: string;
	email: string;
	displayName: string | null;
	emailEnabled: boolean;
}

export interface NewNotification {
	recipientUserId: string;
	applicationId: string;
	type: string;
	payload: Record<string, string | null>;
}
