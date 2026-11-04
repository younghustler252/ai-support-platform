import type { Request, Response } from "express";

import { validatedQuery } from "../../../foundation/http/locals.js";
import { authContext, validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import type {
	GetNotificationPreferencesUseCase,
	ListNotificationsUseCase,
	MarkAllNotificationsReadUseCase,
	MarkNotificationReadUseCase,
	UpdateNotificationPreferencesUseCase,
} from "../usecases/notification-usecases.js";
import type { ListNotificationsQuery, NotificationParams, UpdatePreferencesInput } from "../validators/notification.validator.js";

interface Dependencies {
	listNotificationsUseCase: ListNotificationsUseCase;
	markNotificationReadUseCase: MarkNotificationReadUseCase;
	markAllNotificationsReadUseCase: MarkAllNotificationsReadUseCase;
	getNotificationPreferencesUseCase: GetNotificationPreferencesUseCase;
	updateNotificationPreferencesUseCase: UpdateNotificationPreferencesUseCase;
}

export class NotificationController {
	constructor(private readonly deps: Dependencies) {}

	list = async (_request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { limit, cursor, unread } = validatedQuery<ListNotificationsQuery>(response);
		const page = await this.deps.listNotificationsUseCase.execute({ userId: user.id, unreadOnly: unread, limit, cursor });
		response.json({ data: { notifications: page.items }, meta: { nextCursor: page.nextCursor, unreadCount: page.unreadCount } });
	};

	markRead = async (_request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { notificationId } = validatedParams<NotificationParams>(response);
		await this.deps.markNotificationReadUseCase.execute(user.id, notificationId);
		response.status(204).end();
	};

	markAllRead = async (_request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		await this.deps.markAllNotificationsReadUseCase.execute(user.id);
		response.status(204).end();
	};

	getPreferences = async (_request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		response.json({ data: { preferences: await this.deps.getNotificationPreferencesUseCase.execute(user.id) } });
	};

	updatePreferences = async (_request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const input = validatedBody<UpdatePreferencesInput>(response);
		response.json({ data: { preferences: await this.deps.updateNotificationPreferencesUseCase.execute(user.id, input) } });
	};
}
