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
	},
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
		apiKeyRequests: { limit: 600, windowMs: MINUTE },
		apiKeyIp: { limit: 300, windowMs: MINUTE },
	},
};
