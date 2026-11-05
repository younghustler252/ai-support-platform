import type { HttpClient } from "./http";
import type {
	Application,
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
