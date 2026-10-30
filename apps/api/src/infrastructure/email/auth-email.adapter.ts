import { env } from "../../config/env.js";
import type { AuthEmailPort } from "../../modules/auth/services/auth-email.port.js";

export class AuthEmailAdapter implements AuthEmailPort {
	async send(email: string, purpose: "verify" | "reset", token: string): Promise<void> {
		const url = new URL(purpose === "verify" ? "/verify-email" : "/reset-password", env.AUTH_FRONTEND_URL);
		url.searchParams.set("token", token);

		if (!env.AUTH_EMAIL_API_KEY || !env.AUTH_EMAIL_FROM) {
			if (env.NODE_ENV === "production") throw new Error("Authentication email provider is not configured");
			console.info("[auth development email]", email, url.toString());
			return;
		}

		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: { Authorization: `Bearer ${env.AUTH_EMAIL_API_KEY}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				from: env.AUTH_EMAIL_FROM,
				to: [email],
				subject: purpose === "verify" ? "Verify your SupportAI email" : "Reset your SupportAI password",
				html: `<p><a href="${url.toString()}">Continue to SupportAI</a></p>`,
			}),
		});
		if (!response.ok) throw new Error("Authentication email delivery failed");
	}
}
