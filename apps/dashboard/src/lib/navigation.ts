export function safeNext(search: string): string | null {
	const value = new URLSearchParams(search).get("next");
	if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
	return value;
}
