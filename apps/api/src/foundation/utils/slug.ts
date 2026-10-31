import { randomBytes } from "node:crypto";

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string, fallback = "item"): string {
	const slug = value
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");
	return slug.length > 0 ? slug : fallback;
}

export function withRandomSuffix(slug: string): string {
	return `${slug}-${randomBytes(3).toString("hex")}`;
}
