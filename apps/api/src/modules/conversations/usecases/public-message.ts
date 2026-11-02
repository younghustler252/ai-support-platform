import type { MessageView } from "../conversation.types.js";

export interface PublicMessage {
	id: string;
	sender: "CUSTOMER" | "AI" | "AGENT";
	body: string;
	createdAt: Date;
}

export function toPublicMessage(message: MessageView): PublicMessage {
	return { id: message.id, sender: message.sender === "SYSTEM" ? "AGENT" : message.sender, body: message.body, createdAt: message.createdAt };
}
