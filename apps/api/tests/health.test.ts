import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";

import { createApp } from "../src/app.js";

test("GET /health returns a real HTTP 200 response with request ID", async () => {
	const server = createServer(createApp());
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

	try {
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("No TCP port");

		const response = await fetch(`http://127.0.0.1:${address.port}/health`);
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { status: "ok" });
		assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
		});
	}
});
