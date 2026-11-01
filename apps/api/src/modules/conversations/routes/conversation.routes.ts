import { Router, type RequestHandler } from "express";

import { tenancyConfig } from "../../../config/tenancy.js";
import { delegate } from "../../../foundation/http/locals.js";
import { noStore } from "../../../foundation/middleware/no-store.js";
import { clientIp, rateLimit } from "../../../foundation/middleware/rate-limit.js";
import { validateBody, validateParams, validateQuery } from "../../../foundation/validation/validate.js";
import { apiKeyRateKey, requireApiKey } from "../../api-keys/middleware/require-api-key.js";
import { requireAuth } from "../../auth/middleware/require-auth.js";
import { userRateKey } from "../../tenancy/http/tenant-http.js";
import { requireApplication } from "../../tenancy/middleware/tenant-access.js";
import type { ConversationController } from "../controllers/conversation.controller.js";
import type { ServiceConversationController } from "../controllers/service-conversation.controller.js";
import {
	assignConversationSchema,
	conversationParamsSchema,
	customerMessageSchema,
	listConversationsQuerySchema,
	listMessagesQuerySchema,
	sendMessageSchema,
	serviceConversationParamsSchema,
	startConversationSchema,
	transferConversationSchema,
} from "../validators/conversation.validator.js";

const handle = (method: Parameters<typeof delegate<ConversationController>>[1]) =>
	delegate<ConversationController>("conversationController", method);
const handleService = (method: Parameters<typeof delegate<ServiceConversationController>>[1]) =>
	delegate<ServiceConversationController>("serviceConversationController", method);

const agentMessageLimit = rateLimit({
	name: "conversation:message:user",
	...tenancyConfig.rateLimits.sendAgentMessage,
	key: userRateKey,
});
const serviceIpLimit = rateLimit({ name: "api-key:ip", ...tenancyConfig.rateLimits.apiKeyIp, key: (request) => clientIp(request) });
const serviceKeyLimit = rateLimit({ name: "api-key:requests", ...tenancyConfig.rateLimits.apiKeyRequests, key: apiKeyRateKey });

export function conversationRouter(): Router {
	const router = Router();
	const base = "/organizations/:organizationId/applications/:applicationId/conversations";
	const item = `${base}/:conversationId`;
	const guard = (action: Parameters<typeof requireApplication>[0]): RequestHandler => requireApplication(action);

	router.get(base, requireAuth, guard("conversation.read"), validateQuery(listConversationsQuerySchema), handle("list"));
	router.get(item, requireAuth, guard("conversation.read"), validateParams(conversationParamsSchema), handle("get"));
	router.get(
		`${item}/messages`,
		requireAuth,
		guard("conversation.read"),
		validateParams(conversationParamsSchema),
		validateQuery(listMessagesQuerySchema),
		handle("listMessages"),
	);
	router.post(
		`${item}/messages`,
		requireAuth,
		guard("conversation.reply"),
		validateParams(conversationParamsSchema),
		validateBody(sendMessageSchema),
		agentMessageLimit,
		handle("sendMessage"),
	);
	router.post(`${item}/claim`, requireAuth, guard("conversation.claim"), validateParams(conversationParamsSchema), handle("claim"));
	router.post(
		`${item}/assign`,
		requireAuth,
		guard("conversation.assign"),
		validateParams(conversationParamsSchema),
		validateBody(assignConversationSchema),
		handle("assign"),
	);
	router.post(
		`${item}/transfer`,
		requireAuth,
		guard("conversation.transfer"),
		validateParams(conversationParamsSchema),
		validateBody(transferConversationSchema),
		handle("transfer"),
	);
	router.post(`${item}/release`, requireAuth, guard("conversation.transfer"), validateParams(conversationParamsSchema), handle("release"));
	router.post(`${item}/resolve`, requireAuth, guard("conversation.resolve"), validateParams(conversationParamsSchema), handle("resolve"));
	router.post(`${item}/reopen`, requireAuth, guard("conversation.resolve"), validateParams(conversationParamsSchema), handle("reopen"));
	router.post(`${item}/close`, requireAuth, guard("conversation.resolve"), validateParams(conversationParamsSchema), handle("close"));

	const service = "/service/conversations";
	const serviceItem = `${service}/:conversationId`;
	router.post(
		service,
		noStore,
		serviceIpLimit,
		requireApiKey("conversations:write"),
		serviceKeyLimit,
		validateBody(startConversationSchema),
		handleService("start"),
	);
	router.get(
		serviceItem,
		noStore,
		serviceIpLimit,
		requireApiKey("conversations:read"),
		serviceKeyLimit,
		validateParams(serviceConversationParamsSchema),
		handleService("get"),
	);
	router.get(
		`${serviceItem}/messages`,
		noStore,
		serviceIpLimit,
		requireApiKey("conversations:read"),
		serviceKeyLimit,
		validateParams(serviceConversationParamsSchema),
		validateQuery(listMessagesQuerySchema),
		handleService("listMessages"),
	);
	router.post(
		`${serviceItem}/messages`,
		noStore,
		serviceIpLimit,
		requireApiKey("chat"),
		serviceKeyLimit,
		validateParams(serviceConversationParamsSchema),
		validateBody(customerMessageSchema),
		handleService("sendMessage"),
	);
	router.post(
		`${serviceItem}/escalate`,
		noStore,
		serviceIpLimit,
		requireApiKey("chat"),
		serviceKeyLimit,
		validateParams(serviceConversationParamsSchema),
		handleService("escalate"),
	);

	return router;
}
