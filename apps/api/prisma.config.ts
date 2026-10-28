import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";
import { fileURLToPath } from "node:url";

const rootEnvPath = fileURLToPath(
	new URL("../../.env", import.meta.url),
);

loadEnv({
	path: rootEnvPath,
});

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: env("DATABASE_URL"),
	},
});
