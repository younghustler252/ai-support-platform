import { asClass, type AwilixContainer } from "awilix";

import { NotificationController } from "./controllers/notification.controller.js";
import { NotificationRepositoryImpl } from "./repositories/notification.repository.impl.js";
import { ConversationNotifier } from "./services/conversation-notifier.js";
import {
	GetNotificationPreferencesUseCase,
	ListNotificationsUseCase,
	MarkAllNotificationsReadUseCase,
	MarkNotificationReadUseCase,
	UpdateNotificationPreferencesUseCase,
} from "./usecases/notification-usecases.js";

export function registerNotifications(container: AwilixContainer): void {
	container.register({
		notificationRepository: asClass(NotificationRepositoryImpl).scoped(),
		conversationNotifier: asClass(ConversationNotifier).scoped(),
		listNotificationsUseCase: asClass(ListNotificationsUseCase).scoped(),
		markNotificationReadUseCase: asClass(MarkNotificationReadUseCase).scoped(),
		markAllNotificationsReadUseCase: asClass(MarkAllNotificationsReadUseCase).scoped(),
		getNotificationPreferencesUseCase: asClass(GetNotificationPreferencesUseCase).scoped(),
		updateNotificationPreferencesUseCase: asClass(UpdateNotificationPreferencesUseCase).scoped(),
		notificationController: asClass(NotificationController).scoped(),
	});
}
