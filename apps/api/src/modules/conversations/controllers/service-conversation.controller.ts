import type { Request, Response } from "express";

import { validatedQuery } from "../../../foundation/http/locals.js";
import { validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import { apiKeyContext } from "../../api-keys/middleware/require-api-key.js";
import type { EscalateConversationUseCase } from "../usecases/escalate-conversation.usecase.js";
import { toPublicConversation, type GetServiceConversationUseCase } from "../usecases/get-service-conversation.usecase.js";
import { toPublicMessage } from "../usecases/public-message.js";
import type { ListServiceMessagesUseCase } from "../usecases/list-service-messages.usecase.js";
import type { SendCustomerMessageUseCase } from "../usecases/send-customer-message.usecase.js";
import type { StartConversationUseCase } from "../usecases/start-conversation.usecase.js";
import type { CustomerMessageInput, ListMessagesQuery, StartConversationInput } from "../validators/conversation.validator.js";

interface Dependencies {
	startConversationUseCase: StartConversationUseCase;
	getServiceConversationUseCase: GetServiceConversationUseCase;
	listServiceMessagesUseCase: ListServiceMessagesUseCase;
	sendCustomerMessageUseCase: SendCustomerMessageUseCase;
	escalateConversationUseCase: EscalateConversationUseCase;
}

const applicationOf = (response: Response): string => apiKeyContext(response).application.id;
const conversationIdOf = (response: Response): string => validatedParams<{ conversationId: string }>(response).conversationId;

export class ServiceConversationController {
	constructor(private readonly deps: Dependencies) {}

	start = async (_request: Request, response: Response): Promise<void> => {
		const input = validatedBody<StartConversationInput>(response);
		const { conversation, message } = await this.deps.startConversationUseCase.execute({
			applicationId: applicationOf(response),
			customer: input.customer,
			subject: input.subject,
			message: input.message,
		});
		response.status(201).json({ data: { conversation: toPublicConversation(conversation), message: toPublicMessage(message) } });
	};

	get = async (_request: Request, response: Response): Promise<void> => {
		const conversation = await this.deps.getServiceConversationUseCase.execute({
			applicationId: applicationOf(response),
			conversationId: conversationIdOf(response),
		});
		response.json({ data: { conversation } });
	};

	listMessages = async (_request: Request, response: Response): Promise<void> => {
		const { limit, cursor } = validatedQuery<ListMessagesQuery>(response);
		const page = await this.deps.listServiceMessagesUseCase.execute({
			applicationId: applicationOf(response),
			conversationId: conversationIdOf(response),
			limit,
			cursor,
		});
		response.json({ data: { messages: page.items.map(toPublicMessage) }, meta: { nextCursor: page.nextCursor } });
	};

	sendMessage = async (_request: Request, response: Response): Promise<void> => {
		const { body } = validatedBody<CustomerMessageInput>(response);
		const result = await this.deps.sendCustomerMessageUseCase.execute({
			applicationId: applicationOf(response),
			conversationId: conversationIdOf(response),
			body,
		});
		response.status(201).json({ data: { message: toPublicMessage(result.message), reopened: result.reopened } });
	};

	escalate = async (_request: Request, response: Response): Promise<void> => {
		const conversation = await this.deps.escalateConversationUseCase.execute({
			applicationId: applicationOf(response),
			conversationId: conversationIdOf(response),
		});
		response.json({ data: { conversation: toPublicConversation(conversation) } });
	};
}
