import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class BlockedTargetError extends Error {
	constructor(message = "Target address is not allowed") {
		super(message);
		this.name = "BlockedTargetError";
	}
}

function ipv4Blocked(parts: number[]): boolean {
	const [a = 0, b = 0, c = 0] = parts;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 0 && c === 0) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19))
	);
}

export function isPrivateAddress(address: string): boolean {
	const family = net.isIP(address);
	if (family === 4) return ipv4Blocked(address.split(".").map(Number));
	if (family !== 6) return true;

	const value = address.toLowerCase();
	const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped?.[1]) return ipv4Blocked(mapped[1].split(".").map(Number));
	if (value === "::" || value === "::1") return true;
	return /^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith("ff");
}

export interface PostOptions {
	headers: Record<string, string>;
	body: string;
	timeoutMs: number;
	allowPrivate: boolean;
}

export function postJson(rawUrl: string, options: PostOptions): Promise<{ status: number }> {
	return new Promise((resolve, reject) => {
		let url: URL;
		try {
			url = new URL(rawUrl);
		} catch {
			reject(new BlockedTargetError("Invalid URL"));
			return;
		}
		const host = url.hostname.replace(/^\[|\]$/g, "");
		if (!options.allowPrivate && net.isIP(host) && isPrivateAddress(host)) {
			reject(new BlockedTargetError());
			return;
		}

		const client = url.protocol === "https:" ? https : http;
		const request = client.request(
			url,
			{
				method: "POST",
				headers: { ...options.headers, "Content-Length": Buffer.byteLength(options.body) },
				timeout: options.timeoutMs,
				lookup: (hostname, lookupOptions, callback) => {
					dns.lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
						if (error) return callback(error, "", 4);
						const list = addresses as dns.LookupAddress[];
						if (!options.allowPrivate && list.some((item) => isPrivateAddress(item.address))) {
							return callback(new BlockedTargetError(), "", 4);
						}
						if (lookupOptions.all) return callback(null, list);
						const first = list[0];
						return first ? callback(null, first.address, first.family) : callback(new Error("No address"), "", 4);
					});
				},
			},
			(response) => {
				response.resume();
				response.on("end", () => resolve({ status: response.statusCode ?? 0 }));
				response.on("error", reject);
			},
		);
		request.on("timeout", () => request.destroy(new Error("Request timed out")));
		request.on("error", reject);
		request.end(options.body);
	});
}
