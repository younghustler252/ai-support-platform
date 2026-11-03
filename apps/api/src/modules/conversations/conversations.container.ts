import { asClass, type AwilixContainer } from "awilix";

import { ConversationController } from "./controllers/conversation.controller.js";
import { ServiceConversationController } from "./controllers/service-conversation.controller.js";
import { EventPublishingConversationRepository } from "./repositories/event-publishing-conversation.repository.js";
import { ConversationRepositoryImpl } from "./repositories/conversation.repository.impl.js";
import { AssignConversationUseCase } from "./usecases/assign-conversation.usecase.js";
import { ClaimConversationUseCase } from "./usecases/claim-conversation.usecase.js";
import { CloseConversationUseCase } from "./usecases/close-conversation.usecase.js";
import { EscalateConversationUseCase } from "./usecases/escalate-conversation.usecase.js";
import { GetConversationUseCase } from "./usecases/get-conversation.usecase.js";
import { GetServiceConversationUseCase } from "./usecases/get-service-conversation.usecase.js";
import { ListConversationsUseCase } from "./usecases/list-conversations.usecase.js";
import { ListMessagesUseCase } from "./usecases/list-messages.usecase.js";
import { ListServiceMessagesUseCase } from "./usecases/list-service-messages.usecase.js";
import { ReleaseConversationUseCase } from "./usecases/release-conversation.usecase.js";
import { ReopenConversationUseCase } from "./usecases/reopen-conversation.usecase.js";
import { ResolveConversationUseCase } from "./usecases/resolve-conversation.usecase.js";
import { SendAgentMessageUseCase } from "./usecases/send-agent-message.usecase.js";
import { SendCustomerMessageUseCase } from "./usecases/send-customer-message.usecase.js";
import { StartConversationUseCase } from "./usecases/start-conversation.usecase.js";
import { TransferConversationUseCase } from "./usecases/transfer-conversation.usecase.js";

export function registerConversations(container: AwilixContainer): void {
	container.register({
		conversationRepositoryImpl: asClass(ConversationRepositoryImpl).scoped(),
		conversationRepository: asClass(EventPublishingConversationRepository).scoped(),
		listConversationsUseCase: asClass(ListConversationsUseCase).scoped(),
		getConversationUseCase: asClass(GetConversationUseCase).scoped(),
		listMessagesUseCase: asClass(ListMessagesUseCase).scoped(),
		sendAgentMessageUseCase: asClass(SendAgentMessageUseCase).scoped(),
		claimConversationUseCase: asClass(ClaimConversationUseCase).scoped(),
		assignConversationUseCase: asClass(AssignConversationUseCase).scoped(),
		transferConversationUseCase: asClass(TransferConversationUseCase).scoped(),
		releaseConversationUseCase: asClass(ReleaseConversationUseCase).scoped(),
		resolveConversationUseCase: asClass(ResolveConversationUseCase).scoped(),
		reopenConversationUseCase: asClass(ReopenConversationUseCase).scoped(),
		closeConversationUseCase: asClass(CloseConversationUseCase).scoped(),
		startConversationUseCase: asClass(StartConversationUseCase).scoped(),
		getServiceConversationUseCase: asClass(GetServiceConversationUseCase).scoped(),
		listServiceMessagesUseCase: asClass(ListServiceMessagesUseCase).scoped(),
		sendCustomerMessageUseCase: asClass(SendCustomerMessageUseCase).scoped(),
		escalateConversationUseCase: asClass(EscalateConversationUseCase).scoped(),
		conversationController: asClass(ConversationController).scoped(),
		serviceConversationController: asClass(ServiceConversationController).scoped(),
	});
}
