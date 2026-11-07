import type { HttpClient } from "./http";
import type {
	AgentEvent,
	Application,
	ApplicationMember,
	Conversation,
	ConversationAction,
	ListConversationsQuery,
	Message,
	Page,
	CreateApplicationInput,
	LoginInput,
	Organization,
	OrganizationWithRole,
	RegisterInput,
	TenantRole,
	UpdateApplicationInput,
	User,
} from "./types";

export function authApi(http: HttpClient) {
	return {
		register: (input: RegisterInput) =>
			http.post<{ user: User; verificationRequired: boolean }>("/auth/register", input, { auth: false }),
		verifyEmail: (token: string) => http.post<{ verified: boolean }>("/auth/verify-email", { token }, { auth: false }),
		resendVerification: (email: string) => http.post<unknown>("/auth/resend-verification", { email }, { auth: false }),
		forgotPassword: (email: string) => http.post<unknown>("/auth/forgot-password", { email }, { auth: false }),
		resetPassword: (token: string, password: string) =>
			http.post<unknown>("/auth/reset-password", { token, password }, { auth: false }),
		async login(input: LoginInput): Promise<User> {
			const result = await http.post<{ user: User; accessToken: string; expiresIn: number }>("/auth/login", input, { auth: false });
			http.setAccessToken(result);
			return result.user;
		},
		async logout(): Promise<void> {
			try {
				await http.post<unknown>("/auth/logout", undefined, { auth: false });
			} finally {
				http.setAccessToken(null);
			}
		},
		async logoutAll(): Promise<void> {
			try {
				await http.post<unknown>("/auth/logout-all");
			} finally {
				http.setAccessToken(null);
			}
		},
		async me(): Promise<User> {
			return (await http.get<{ user: User }>("/auth/me")).user;
		},
		async restore(): Promise<User | null> {
			if (!http.hasAccessToken() && !(await http.refresh())) return null;
			return (await http.get<{ user: User }>("/auth/me")).user;
		},
		changePassword: (currentPassword: string, newPassword: string) =>
			http.post<unknown>("/auth/change-password", { currentPassword, newPassword }),
	};
}

export function organizationsApi(http: HttpClient) {
	return {
		async list(): Promise<OrganizationWithRole[]> {
			return (await http.get<{ organizations: OrganizationWithRole[] }>("/organizations")).organizations;
		},
		async create(input: { name: string; slug?: string }): Promise<Organization> {
			return (await http.post<{ organization: Organization }>("/organizations", input)).organization;
		},
		async get(organizationId: string): Promise<Organization> {
			return (await http.get<{ organization: Organization }>(`/organizations/${organizationId}`)).organization;
		},
		async update(organizationId: string, input: { name: string }): Promise<Organization> {
			return (await http.patch<{ organization: Organization }>(`/organizations/${organizationId}`, input)).organization;
		},
	};
}

export function applicationsApi(http: HttpClient) {
	const base = (organizationId: string) => `/organizations/${organizationId}/applications`;
	return {
		async list(organizationId: string): Promise<Application[]> {
			return (await http.get<{ applications: Application[] }>(base(organizationId))).applications;
		},
		async create(organizationId: string, input: CreateApplicationInput): Promise<Application> {
			return (await http.post<{ application: Application }>(base(organizationId), input)).application;
		},
		async get(organizationId: string, applicationId: string): Promise<Application> {
			return (await http.get<{ application: Application }>(`${base(organizationId)}/${applicationId}`)).application;
		},
		async update(organizationId: string, applicationId: string, input: UpdateApplicationInput): Promise<Application> {
			return (await http.patch<{ application: Application }>(`${base(organizationId)}/${applicationId}`, input)).application;
		},
	};
}

export function invitationsApi(http: HttpClient) {
	return {
		accept: (token: string) =>
			http.post<{ organization: { id: string; name: string }; role: TenantRole }>("/invitations/accept", { token }),
	};
}

export function conversationsApi(http: HttpClient) {
	const base = (organizationId: string, applicationId: string) =>
		`/organizations/${organizationId}/applications/${applicationId}/conversations`;

	async function act(organizationId: string, applicationId: string, conversationId: string, path: string, body?: unknown) {
		return (await http.post<{ conversation: Conversation }>(`${base(organizationId, applicationId)}/${conversationId}/${path}`, body))
			.conversation;
	}

	return {
		async list(organizationId: string, applicationId: string, query: ListConversationsQuery = {}): Promise<Page<Conversation>> {
			const result = await http.requestPage<{ conversations: Conversation[] }>(base(organizationId, applicationId), {
				query: { ...query, status: query.status?.join(",") },
			});
			return { items: result.data.conversations, nextCursor: result.nextCursor };
		},
		async get(organizationId: string, applicationId: string, conversationId: string): Promise<Conversation> {
			return (await http.get<{ conversation: Conversation }>(`${base(organizationId, applicationId)}/${conversationId}`)).conversation;
		},
		async messages(
			organizationId: string,
			applicationId: string,
			conversationId: string,
			query: { limit?: number; cursor?: string } = {},
		): Promise<Page<Message>> {
			const result = await http.requestPage<{ messages: Message[] }>(
				`${base(organizationId, applicationId)}/${conversationId}/messages`,
				{ query },
			);
			return { items: result.data.messages, nextCursor: result.nextCursor };
		},
		async send(
			organizationId: string,
			applicationId: string,
			conversationId: string,
			input: { body: string; internal?: boolean },
		): Promise<Message> {
			return (await http.post<{ message: Message }>(`${base(organizationId, applicationId)}/${conversationId}/messages`, input)).message;
		},
		perform: (organizationId: string, applicationId: string, conversationId: string, action: ConversationAction) =>
			act(organizationId, applicationId, conversationId, action),
		assign: (organizationId: string, applicationId: string, conversationId: string, userId: string) =>
			act(organizationId, applicationId, conversationId, "assign", { userId }),
		transfer: (organizationId: string, applicationId: string, conversationId: string, userId: string, note?: string) =>
			act(organizationId, applicationId, conversationId, "transfer", { userId, note }),
	};
}

export interface EventSubscription {
	close(): void;
}

export function eventsApi(http: HttpClient) {
	const RECONNECT_MIN_MS = 1000;
	const RECONNECT_MAX_MS = 15000;

	return {
		subscribe(
			organizationId: string,
			applicationId: string,
			handlers: { onEvent: (event: AgentEvent) => void; onStatus?: (connected: boolean) => void },
		): EventSubscription {
			const controller = new AbortController();
			const path = `/organizations/${organizationId}/applications/${applicationId}/events`;

			async function run(): Promise<void> {
				let delay = RECONNECT_MIN_MS;
				while (!controller.signal.aborted) {
					try {
						handlers.onStatus?.(true);
						await http.stream(
							path,
							(message) => {
								delay = RECONNECT_MIN_MS;
								if (message.event !== "message.created" && message.event !== "conversation.updated") return;
								try {
									handlers.onEvent(JSON.parse(message.data) as AgentEvent);
								} catch {
									return;
								}
							},
							controller.signal,
						);
					} catch {
						if (controller.signal.aborted) return;
					}
					if (controller.signal.aborted) return;
					handlers.onStatus?.(false);
					await new Promise((resolve) => setTimeout(resolve, delay));
					delay = Math.min(delay * 2, RECONNECT_MAX_MS);
				}
			}

			void run();
			return { close: () => controller.abort() };
		},
	};
}

export function membersApi(http: HttpClient) {
	return {
		async listForApplication(organizationId: string, applicationId: string): Promise<ApplicationMember[]> {
			return (
				await http.get<{ members: ApplicationMember[] }>(`/organizations/${organizationId}/applications/${applicationId}/members`)
			).members;
		},
	};
}
