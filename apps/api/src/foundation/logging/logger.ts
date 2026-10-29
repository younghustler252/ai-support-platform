type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const REDACTED_KEYS = new Set([
	"authorization",
	"cookie",
	"password",
	"passwordhash",
	"token",
	"accesstoken",
	"refreshtoken",
	"apikey",
	"keyhash",
	"secret",
	"databaseurl",
	"clientsecret",
	"privatekey",
	"setcookie",
]);

function sanitize(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
	if (depth > 6) return "[MaxDepth]";
	if (value instanceof Error) {
		return { name: value.name, message: value.message };
	}
	if (value === null || typeof value !== "object") return value;
	if (seen.has(value)) return "[Circular]";
	seen.add(value);
	if (Array.isArray(value)) return value.map((item) => sanitize(item, seen, depth + 1));
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			key,
			REDACTED_KEYS.has(key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()) ? "[REDACTED]" : sanitize(item, seen, depth + 1),
		]),
	);
}

export class Logger {
	constructor(private readonly context: LogFields = {}) {}

	child(context: LogFields): Logger {
		return new Logger({ ...this.context, ...context });
	}

	log(level: LogLevel, message: string, fields: LogFields = {}): void {
		const entry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			...sanitize({ ...this.context, ...fields }) as LogFields,
		};

		const output = JSON.stringify(entry);
		if (level === "error") console.error(output);
		else if (level === "warn") console.warn(output);
		else console.log(output);
	}

	debug(message: string, fields?: LogFields): void { this.log("debug", message, fields); }
	info(message: string, fields?: LogFields): void { this.log("info", message, fields); }
	warn(message: string, fields?: LogFields): void { this.log("warn", message, fields); }
	error(message: string, fields?: LogFields): void { this.log("error", message, fields); }
}

export const logger = new Logger({ service: "supportai-api" });
