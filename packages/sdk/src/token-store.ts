export interface AccessToken {
	value: string;
	expiresAt: number;
}

export interface TokenStore {
	get(): AccessToken | null;
	set(token: AccessToken | null): void;
}

export function memoryTokenStore(): TokenStore {
	let current: AccessToken | null = null;
	return {
		get: () => current,
		set: (token) => {
			current = token;
		},
	};
}
