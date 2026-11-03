import type { Request, Response } from "express";

import { NotFoundError } from "../../../foundation/errors/app-error.js";
import { acquireStream, openEventStream } from "../../../foundation/http/sse.js";
import type { RealtimeBus } from "../../../infrastructure/realtime/realtime-bus.js";
import { apiKeyContext } from "../../api-keys/middleware/require-api-key.js";
import { authContext, validatedParams } from "../../auth/http/auth-http.js";
import type { IConversationRepository } from "../../conversations/repositories/conversation.repository.interface.js";
import { restrictedTo } from "../../conversations/usecases/conversation-access.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import { applicationChannel, conversationChannel, type AgentEvent } from "../realtime.types.js";

const MAX_AGENT_STREAMS = 10;
const MAX_KEY_STREAMS = 100;

interface Dependencies {
	realtimeBus: RealtimeBus;
	conversationRepository: IConversationRepository;
}

export class RealtimeController {
	constructor(private readonly deps: Dependencies) {}

	agentEvents = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { applicationId, grants } = tenantContext(response);
		const onlyFor = restrictedTo({ id: user.id, grants }, "conversation.read");

		const release = acquireStream(`agent:${user.id}`, MAX_AGENT_STREAMS);
		const stream = openEventStream(request, response);
		stream.onClose(release);

		const unsubscribe = await this.deps.realtimeBus.subscribe(applicationChannel(applicationId as string), (payload) => {
			const event = payload as AgentEvent;
			if (onlyFor && event.assigneeUserId !== onlyFor) return;
			stream.send(event.type, event);
		});
		stream.onClose(() => void unsubscribe());
	};

	customerEvents = async (request: Request, response: Response): Promise<void> => {
		const principal = apiKeyContext(response);
		const { conversationId } = validatedParams<{ conversationId: string }>(response);
		const conversation = await this.deps.conversationRepository.find(principal.application.id, conversationId);
		if (!conversation) throw new NotFoundError("Conversation not found");

		const release = acquireStream(`key:${principal.keyId}`, MAX_KEY_STREAMS);
		const stream = openEventStream(request, response);
		stream.onClose(release);

		const unsubscribe = await this.deps.realtimeBus.subscribe(conversationChannel(conversationId), (payload) => {
			stream.send((payload as { type: string }).type, payload);
		});
		stream.onClose(() => void unsubscribe());
	};
}
