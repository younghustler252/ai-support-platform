import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./foundation/logging/logger.js";

createApp().listen(env.PORT, () => {
	logger.info("server.started", { port: env.PORT });
});
