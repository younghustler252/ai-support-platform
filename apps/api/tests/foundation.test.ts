import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import {
	AppError,
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../src/foundation/errors/app-error.js";
import { createRequestContext } from "../src/foundation/context/request-context.js";
import { parseInput } from "../src/foundation/validation/validate.js";
import { Logger } from "../src/foundation/logging/logger.js";

test("typed errors expose stable HTTP status and codes", () => {
	assert.equal(new ForbiddenError().statusCode, 403);
	assert.equal(new NotFoundError().code, "NOT_FOUND");
	assert.ok(new ValidationError() instanceof AppError);
});

test("request contexts have unique IDs and no inherited identity", () => {
	const first = createRequestContext();
	const second = createRequestContext();

	assert.notEqual(first.requestId, second.requestId);
	assert.equal(first.userId, null);
	assert.equal(second.organizationId, null);
});

test("parseInput returns typed validated data", () => {
	const schema = z.object({ count: z.coerce.number().int().positive() });
	assert.deepEqual(parseInput(schema, { count: "3" }), { count: 3 });
	assert.throws(() => parseInput(schema, { count: "-1" }), ValidationError);
});

test("logger child preserves parent fields without changing the parent", () => {
	const parent = new Logger({ service: "test" });
	const child = parent.child({ requestId: "request-1" });

	assert.notEqual(parent, child);
	assert.ok(child instanceof Logger);
});
