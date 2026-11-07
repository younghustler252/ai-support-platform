export interface SseMessage {
	event: string;
	data: string;
}

export function createSseParser(onMessage: (message: SseMessage) => void) {
	let buffer = "";
	let event = "message";
	let data: string[] = [];

	function dispatch(): void {
		if (data.length > 0) onMessage({ event, data: data.join("\n") });
		event = "message";
		data = [];
	}

	function line(text: string): void {
		if (text === "") return dispatch();
		if (text.startsWith(":")) return;
		const separator = text.indexOf(":");
		const field = separator === -1 ? text : text.slice(0, separator);
		let value = separator === -1 ? "" : text.slice(separator + 1);
		if (value.startsWith(" ")) value = value.slice(1);
		if (field === "event") event = value;
		else if (field === "data") data.push(value);
	}

	return {
		push(chunk: string): void {
			const parts = (buffer + chunk).split(/\r\n|\n|\r/);
			buffer = parts.pop() ?? "";
			for (const part of parts) line(part);
		},
	};
}
