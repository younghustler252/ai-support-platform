import { asClass, asFunction, type AwilixContainer } from "awilix";

import { createRealtimeBus } from "../../infrastructure/realtime/redis-realtime-bus.js";
import { RealtimeController } from "./controllers/realtime.controller.js";
import { RealtimePublisher } from "./realtime-publisher.js";

export function registerRealtime(container: AwilixContainer): void {
	container.register({
		realtimeBus: asFunction(createRealtimeBus).singleton(),
		realtimePublisher: asClass(RealtimePublisher).scoped(),
		realtimeController: asClass(RealtimeController).scoped(),
	});
}
