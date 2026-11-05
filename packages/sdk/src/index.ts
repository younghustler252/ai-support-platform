import { applicationsApi, authApi, invitationsApi, organizationsApi } from "./endpoints";
import { HttpClient, type ClientConfig } from "./http";

export function createClient(config: ClientConfig) {
	const http = new HttpClient(config);
	return {
		http,
		auth: authApi(http),
		organizations: organizationsApi(http),
		applications: applicationsApi(http),
		invitations: invitationsApi(http),
	};
}

export type Client = ReturnType<typeof createClient>;

export { ApiError, fieldErrors, isApiError } from "./errors";
export { memoryTokenStore } from "./token-store";
export type { AccessToken, TokenStore } from "./token-store";
export type { ClientConfig, RequestOptions } from "./http";
export * from "./types";