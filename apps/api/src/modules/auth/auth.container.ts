import { asClass, type AwilixContainer } from "awilix";
import { AuthController } from "./controllers/auth.controller.js";
import { PasswordService } from "./services/password.service.js";
import { RegisterUseCase } from "./usecases/register.usecase.js";

export function registerAuth(container: AwilixContainer): void {
	container.register({
		passwordService: asClass(PasswordService).singleton(),
		registerUseCase: asClass(RegisterUseCase).scoped(),
		authController: asClass(AuthController).scoped(),
	});
}
