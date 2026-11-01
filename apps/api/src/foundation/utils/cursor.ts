import { ValidationError } from "../errors/app-error.js";

export interface PageCursor {
	at: Date;
	id: string;
}

export interface Page<T> {
	items: T[];
	nextCursor: string | null;
}

export function encodeCursor(at: Date, id: string): string {
	return Buffer.from(JSON.stringify({ t: at.toISOString(), i: id })).toString("base64url");
}

export function decodeCursor(value: string | undefined): PageCursor | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { t?: unknown; i?: unknown };
		if (typeof parsed.t !== "string" || typeof parsed.i !== "string") throw new Error("shape");
		const at = new Date(parsed.t);
		if (Number.isNaN(at.getTime()) || parsed.i.length === 0 || parsed.i.length > 64) throw new Error("value");
		return { at, id: parsed.i };
	} catch {
		throw new ValidationError("Invalid cursor");
	}
}

export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => { at: Date; id: string }): Page<T> {
	const items = rows.slice(0, limit);
	const last = items.at(-1);
	const hasMore = rows.length > limit && last !== undefined;
	return { items, nextCursor: hasMore ? encodeCursor(cursorOf(last).at, cursorOf(last).id) : null };
}
