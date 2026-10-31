import { z } from "zod";

import { reservedSlugs } from "../../config/tenancy.js";
import { SLUG_PATTERN } from "../utils/slug.js";

export const slugSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(3)
	.max(40)
	.regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens")
	.refine((value) => !reservedSlugs.includes(value), "This slug is reserved");

export function normalizeOrigin(value: string): string | null {
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
		return url.origin;
	} catch {
		return null;
	}
}

export const originSchema = z
	.string()
	.trim()
	.max(255)
	.transform((value, context) => {
		const origin = normalizeOrigin(value);
		if (!origin) {
			context.addIssue({ code: "custom", message: "Must be an origin such as https://example.com" });
			return z.NEVER;
		}
		return origin;
	});
