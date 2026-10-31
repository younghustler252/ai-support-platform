import { authConfig } from "../../config/auth.js";
import { platformDefaults } from "../../config/defaults.js";

export interface EmailContent {
	subject: string;
	html: string;
	text: string;
}

interface Layout {
	subject: string;
	heading: string;
	paragraphs: string[];
	action?: { label: string; url: string };
}

const brand = platformDefaults.branding.displayName;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function actionUrl(path: string, token: string): string {
	const url = new URL(path, authConfig.frontendUrl);
	url.hash = new URLSearchParams({ token }).toString();
	return url.toString();
}

function durationLabel(ms: number): string {
	const minutes = Math.round(ms / 60000);
	if (minutes >= 60 && minutes % 60 === 0) {
		const hours = minutes / 60;
		return hours === 1 ? "1 hour" : `${hours} hours`;
	}
	return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

function render(layout: Layout): EmailContent {
	const paragraphs = layout.paragraphs
		.map((paragraph) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(paragraph)}</p>`)
		.join("");
	const action = layout.action
		? `<p style="margin:24px 0"><a href="${escapeHtml(layout.action.url)}" style="background:#111827;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(layout.action.label)}</a></p><p style="font-size:13px;color:#6b7280;word-break:break-all">${escapeHtml(layout.action.url)}</p>`
		: "";
	const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:520px;margin:0 auto;padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(layout.heading)}</h1>${paragraphs}${action}<p style="font-size:12px;color:#6b7280;margin-top:32px">${escapeHtml(brand)}</p></body></html>`;
	const text = [
		layout.heading,
		"",
		...layout.paragraphs,
		...(layout.action ? ["", `${layout.action.label}: ${layout.action.url}`] : []),
		"",
		brand,
	].join("\n");

	return { subject: layout.subject, html, text };
}

export function verificationEmail(token: string): EmailContent {
	return render({
		subject: `Verify your ${brand} email`,
		heading: "Verify your email address",
		paragraphs: [
			`Confirm your email address to finish setting up your ${brand} account.`,
			`This link expires in ${durationLabel(authConfig.verifyTtlMs)}. If you did not create an account, you can ignore this message.`,
		],
		action: { label: "Verify email", url: actionUrl("/verify-email", token) },
	});
}

export function passwordResetEmail(token: string): EmailContent {
	return render({
		subject: `Reset your ${brand} password`,
		heading: "Reset your password",
		paragraphs: [
			`We received a request to reset the password for your ${brand} account.`,
			`This link expires in ${durationLabel(authConfig.resetTtlMs)}. If you did not request a reset, you can ignore this message and your password will stay the same.`,
		],
		action: { label: "Choose a new password", url: actionUrl("/reset-password", token) },
	});
}

export function passwordChangedEmail(): EmailContent {
	return render({
		subject: `Your ${brand} password was changed`,
		heading: "Your password was changed",
		paragraphs: [
			`The password for your ${brand} account was just changed and you were signed out of your other devices.`,
			"If this was not you, reset your password immediately and contact support.",
		],
	});
}
