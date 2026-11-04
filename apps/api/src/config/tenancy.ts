const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const apiKeyScopes = [
	"chat",
	"conversations:read",
	"conversations:write",
	"knowledge:read",
	"knowledge:write",
] as const;

export type ApiKeyScope = (typeof apiKeyScopes)[number];

export const reservedSlugs: readonly string[] = [
	"admin",
	"api",
	"app",
	"auth",
	"billing",
	"dashboard",
	"login",
	"settings",
	"support",
	"www",
];

export const tenancyConfig = {
	limits: {
		ownedOrganizationsPerUser: 10,
		applicationsPerOrganization: 25,
		apiKeysPerApplication: 20,
		pendingInvitationsPerOrganization: 50,
		allowedOriginsPerApplication: 20,
		customRolesPerScope: 20,
		rolesPerMembership: 10,
		openConversationsPerCustomer: 5,
		articlesPerApplication: 500,
		webhooksPerApplication: 10,
		aiRepliesPerApplicationPerDay: 2000,
	},
	knowledge: {
		titleMaxLength: 200,
		contentMaxLength: 50_000,
		linksPerArticle: 10,
		chunkTargetLength: 900,
		chunkMaxLength: 1200,
		searchResultLimit: 5,
		searchQueryMaxLength: 500,
		searchTermLimit: 12,
	},
	notifications: { maxRecipients: 20, subjectMaxLength: 120 },
	webhooks: {
		timeoutMs: 8000,
		attempts: 6,
		failureThreshold: 20,
		urlMaxLength: 2000,
		errorMaxLength: 300,
	},
	ai: {
		contextMessages: 12,
		contextCharacters: 6000,
		maxOutputTokens: 600,
		temperature: 0.2,
		instructionsMaxLength: 2000,
		fallbackMessageMaxLength: 500,
		defaultFallbackMessage: "I couldn't find a reliable answer to that, so I'm bringing in a member of our team who will reply shortly.",
	},
	messageBodyMaxLength: 10_000,
	invitationTtlMs: 7 * DAY,
	apiKey: {
		prefix: "sak",
		lastUsedThrottleMs: 5 * MINUTE,
		defaultRotationGraceHours: 24,
		maxRotationGraceHours: 168,
	},
	rateLimits: {
		createOrganization: { limit: 5, windowMs: HOUR },
		createApplication: { limit: 20, windowMs: HOUR },
		createInvitation: { limit: 30, windowMs: HOUR },
		acceptInvitation: { limit: 10, windowMs: 15 * MINUTE },
		manageApiKeys: { limit: 30, windowMs: HOUR },
		manageRoles: { limit: 60, windowMs: HOUR },
		sendAgentMessage: { limit: 120, windowMs: MINUTE },
		sendMessage: { limit: 120, windowMs: MINUTE },
		manageKnowledge: { limit: 120, windowMs: MINUTE },
		manageWebhooks: { limit: 60, windowMs: MINUTE },
		notifications: { limit: 120, windowMs: MINUTE },
		aiReply: { limit: 20, windowMs: MINUTE },
		apiKeyRequests: { limit: 600, windowMs: MINUTE },
		apiKeyIp: { limit: 300, windowMs: MINUTE },
	},
};
