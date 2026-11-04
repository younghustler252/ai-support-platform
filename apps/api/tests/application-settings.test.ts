import assert from "node:assert/strict";
import test from "node:test";

import { AiSettingsRepositoryImpl } from "../src/modules/ai/repositories/ai.repositories.js";
import type { IApplicationConfigStore } from "../src/modules/application-settings/application-config.store.js";
import { SettingsRepositoryImpl } from "../src/modules/application-settings/repositories/settings.repository.js";
import { GetWidgetConfigUseCase, UpdateApplicationSettingsUseCase } from "../src/modules/application-settings/usecases/settings-usecases.js";
import { updateSettingsSchema } from "../src/modules/application-settings/validators/settings.validator.js";
import { auditSpy } from "./helpers.js";

const app = "11111111-1111-4111-8111-111111111111";

class MemoryStore implements IApplicationConfigStore {
	config: Record<string, unknown> = {};
	async read() {
		return this.config;
	}
	async update<T>(_applicationId: string, section: string, mutate: (current: unknown) => T): Promise<T> {
		const next = mutate(this.config[section]);
		this.config = { ...this.config, [section]: next };
		return next;
	}
}

test("settings fall back to defaults when nothing is stored", async () => {
	const settings = await new SettingsRepositoryImpl({ applicationConfigStore: new MemoryStore() }).get(app);
	assert.deepEqual(settings, {
		timezone: "UTC",
		widget: { title: null, welcomeMessage: null, primaryColor: "#111827", position: "right" },
	});
});

test("a partial widget patch keeps the other widget fields and other config sections", async () => {
	const store = new MemoryStore();
	store.config = { ai: { enabled: false, instructions: "Be brief" } };
	const repo = new SettingsRepositoryImpl({ applicationConfigStore: store });

	await repo.save(app, { widget: { primaryColor: "#ff0000" } });
	const second = await repo.save(app, { widget: { welcomeMessage: "Hi!" }, timezone: "Africa/Lagos" });

	assert.equal(second.widget.primaryColor, "#ff0000");
	assert.equal(second.widget.welcomeMessage, "Hi!");
	assert.equal(second.timezone, "Africa/Lagos");
	assert.deepEqual(store.config.ai, { enabled: false, instructions: "Be brief" });
});

test("a nullable widget field can be cleared again", async () => {
	const repo = new SettingsRepositoryImpl({ applicationConfigStore: new MemoryStore() });
	await repo.save(app, { widget: { welcomeMessage: "Hi!" } });
	const cleared = await repo.save(app, { widget: { welcomeMessage: null } });
	assert.equal(cleared.widget.welcomeMessage, null);
});

test("AI and widget settings share one config row without overwriting each other", async () => {
	const store = new MemoryStore();
	const ai = new AiSettingsRepositoryImpl({ applicationConfigStore: store });
	const settings = new SettingsRepositoryImpl({ applicationConfigStore: store });

	await ai.save(app, { instructions: "Be kind" });
	await settings.save(app, { widget: { position: "left" } });
	await ai.save(app, { enabled: false });

	assert.deepEqual(await ai.get(app), { enabled: false, instructions: "Be kind", fallbackMessage: null });
	assert.equal((await settings.get(app)).widget.position, "left");
});

test("updating settings is audited with the changed keys only", async () => {
	const audit = auditSpy();
	const use = new UpdateApplicationSettingsUseCase({ settingsRepository: new SettingsRepositoryImpl({ applicationConfigStore: new MemoryStore() }), auditService: audit });
	await use.execute({ organizationId: "o", applicationId: app, actorId: "u", patch: { timezone: "UTC", widget: { title: "Help", primaryColor: "#000000" } } });

	assert.equal(audit.events[0]?.action, "application.settings.updated");
	assert.equal(audit.events[0]?.metadata?.changed, "timezone,widget.title,widget.primaryColor");
	assert.ok(!JSON.stringify(audit.events).includes("Help"));
});

test("the public widget config uses the application name by default and reports whether AI is on", async () => {
	const store = new MemoryStore();
	const settingsRepository = new SettingsRepositoryImpl({ applicationConfigStore: store });
	const aiSettingsRepository = new AiSettingsRepositoryImpl({ applicationConfigStore: store });
	const use = new GetWidgetConfigUseCase({ settingsRepository, aiSettingsRepository });

	assert.deepEqual(await use.execute({ id: app, name: "Acme" }), {
		title: "Acme",
		welcomeMessage: null,
		primaryColor: "#111827",
		position: "right",
		aiEnabled: true,
	});

	await settingsRepository.save(app, { widget: { title: "Acme Help", welcomeMessage: "Ask us" } });
	await aiSettingsRepository.save(app, { enabled: false });
	const config = await use.execute({ id: app, name: "Acme" });
	assert.equal(config.title, "Acme Help");
	assert.equal(config.welcomeMessage, "Ask us");
	assert.equal(config.aiEnabled, false);
	assert.deepEqual(Object.keys(config).sort(), ["aiEnabled", "position", "primaryColor", "title", "welcomeMessage"]);
});

test("the validator accepts good settings and rejects bad ones", () => {
	const ok = updateSettingsSchema.safeParse({ timezone: "Africa/Lagos", widget: { primaryColor: "#1A73E8", position: "left", title: null } });
	assert.ok(ok.success);
	assert.equal(ok.success && ok.data.widget?.primaryColor, "#1a73e8");

	for (const bad of [
		{},
		{ widget: {} },
		{ timezone: "Mars/Olympus" },
		{ widget: { primaryColor: "red" } },
		{ widget: { primaryColor: "#fff" } },
		{ widget: { position: "top" } },
		{ widget: { title: "" } },
		{ widget: { title: "x".repeat(61) } },
		{ widget: { welcomeMessage: "x".repeat(301) } },
		{ widget: { unknown: 1 } },
		{ other: 1 },
	]) {
		assert.equal(updateSettingsSchema.safeParse(bad).success, false, JSON.stringify(bad));
	}
});
