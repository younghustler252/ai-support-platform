import type { Request, Response } from "express";

import { validatedQuery } from "../../../foundation/http/locals.js";
import { authContext, requestMeta, validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { TransitionInput } from "../usecases/run-transition.js";
import type { AssignConversationUseCase } from "../usecases/assign-conversation.usecase.js";
import type { ClaimConversationUseCase } from "../usecases/claim-conversation.usecase.js";
import type { CloseConversationUseCase } from "../usecases/close-conversation.usecase.js";
import type { GetConversationUseCase } from "../usecases/get-conversation.usecase.js";
import type { ListConversationsUseCase } from "../usecases/list-conversations.usecase.js";
import type { ListMessagesUseCase } from "../usecases/list-messages.usecase.js";
import type { ReleaseConversationUseCase } from "../usecases/release-conversation.usecase.js";
import type { ReopenConversationUseCase } from "../usecases/reopen-conversation.usecase.js";
import type { ResolveConversationUseCase } from "../usecases/resolve-conversation.usecase.js";
import type { SendAgentMessageUseCase } from "../usecases/send-agent-message.usecase.js";
import type { TransferConversationUseCase } from "../usecases/transfer-conversation.usecase.js";
import type {
	AssignConversationInput,
	ConversationParams,
	ListConversationsQuery,
	ListMessagesQuery,
	SendMessageInput,
	TransferConversationInput,
} from "../validators/conversation.validator.js";

interface Dependencies {
	listConversationsUseCase: ListConversationsUseCase;
	getConversationUseCase: GetConversationUseCase;
	listMessagesUseCase: ListMessagesUseCase;
	sendAgentMessageUseCase: SendAgentMessageUseCase;
	claimConversationUseCase: ClaimConversationUseCase;
	assignConversationUseCase: AssignConversationUseCase;
	transferConversationUseCase: TransferConversationUseCase;
	releaseConversationUseCase: ReleaseConversationUseCase;
	resolveConversationUseCase: ResolveConversationUseCase;
	reopenConversationUseCase: ReopenConversationUseCase;
	closeConversationUseCase: CloseConversationUseCase;
}

function actorOf(response: Response) {
	return { id: authContext(response).user.id, grants: tenantContext(response).grants };
}

function transitionInput(response: Response): TransitionInput {
	const { organizationId, applicationId } = tenantContext(response);
	const { conversationId } = validatedParams<ConversationParams>(response);
	return { organizationId, applicationId: applicationId as string, conversationId, actor: actorOf(response) };
}

export class ConversationController {
	constructor(private readonly deps: Dependencies) {}

	list = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const query = validatedQuery<ListConversationsQuery>(response);
		const page = await this.deps.listConversationsUseCase.execute({
			applicationId: applicationId as string,
			actor: actorOf(response),
			...query,
		});
		response.json({ data: { conversations: page.items }, meta: { nextCursor: page.nextCursor } });
	};

	get = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { conversationId } = validatedParams<ConversationParams>(response);
		const conversation = await this.deps.getConversationUseCase.execute({
			applicationId: applicationId as string,
			conversationId,
			actor: actorOf(response),
		});
		response.json({ data: { conversation } });
	};

	listMessages = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { conversationId } = validatedParams<ConversationParams>(response);
		const { limit, cursor } = validatedQuery<ListMessagesQuery>(response);
		const page = await this.deps.listMessagesUseCase.execute({
			applicationId: applicationId as string,
			conversationId,
			actor: actorOf(response),
			limit,
			cursor,
		});
		response.json({ data: { messages: page.items }, meta: { nextCursor: page.nextCursor } });
	};

	sendMessage = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { conversationId } = validatedParams<ConversationParams>(response);
		const { body, internal } = validatedBody<SendMessageInput>(response);
		const message = await this.deps.sendAgentMessageUseCase.execute({
			applicationId: applicationId as string,
			conversationId,
			actor: actorOf(response),
			body,
			internal,
		});
		response.status(201).json({ data: { message } });
	};

	claim = async (request: Request, response: Response): Promise<void> => {
		const conversation = await this.deps.claimConversationUseCase.execute(transitionInput(response), requestMeta(request));
		response.json({ data: { conversation } });
	};

	assign = async (request: Request, response: Response): Promise<void> => {
		const { userId } = validatedBody<AssignConversationInput>(response);
		const conversation = await this.deps.assignConversationUseCase.execute(
			{ ...transitionInput(response), targetUserId: userId },
			requestMeta(request),
		);
		response.json({ data: { conversation } });
	};

	transfer = async (request: Request, response: Response): Promise<void> => {
		const { userId, note } = validatedBody<TransferConversationInput>(response);
		const conversation = await this.deps.transferConversationUseCase.execute(
			{ ...transitionInput(response), targetUserId: userId, note },
			requestMeta(request),
		);
		response.json({ data: { conversation } });
	};

	release = async (request: Request, response: Response): Promise<void> => {
		const conversation = await this.deps.releaseConversationUseCase.execute(transitionInput(response), requestMeta(request));
		response.json({ data: { conversation } });
	};

	resolve = async (request: Request, response: Response): Promise<void> => {
		const conversation = await this.deps.resolveConversationUseCase.execute(transitionInput(response), requestMeta(request));
		response.json({ data: { conversation } });
	};

	reopen = async (request: Request, response: Response): Promise<void> => {
		const conversation = await this.deps.reopenConversationUseCase.execute(transitionInput(response), requestMeta(request));
		response.json({ data: { conversation } });
	};

	close = async (request: Request, response: Response): Promise<void> => {
		const conversation = await this.deps.closeConversationUseCase.execute(transitionInput(response), requestMeta(request));
		response.json({ data: { conversation } });
	};
}
