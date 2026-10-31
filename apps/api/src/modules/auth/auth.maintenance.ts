import type { AwilixContainer } from "awilix";

import { authConfig } from "../../config/auth.js";
import { logger } from "../../foundation/logging/logger.js";
import type { AuthMaintenanceService } from "./services/auth-maintenance.service.js";

export function startAuthMaintenance(container: AwilixContainer): () => void {
	const run = async (): Promise<void> => {
		const scope = container.createScope();
		try {
			const result = await scope.resolve<AuthMaintenanceService>("authMaintenanceService").purge();
			logger.info("auth.maintenance.purged", result);
		} catch (error) {
			logger.error("auth.maintenance.failed", { error });
		} finally {
			await scope.dispose();
		}
	};

	const timer = setInterval(() => {
		void run();
	}, authConfig.maintenanceIntervalMs);
	timer.unref();

	return () => clearInterval(timer);
}
