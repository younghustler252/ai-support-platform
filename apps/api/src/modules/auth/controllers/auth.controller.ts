import type { Request, Response } from "express";
import type { RegisterUseCase } from "../usecases/register.usecase.js";
import type { RegisterInput } from "../validators/auth.validator.js";

interface Dependencies {
	registerUseCase: RegisterUseCase;
}

export class AuthController {
	constructor(private readonly deps: Dependencies) {}

	register = async (_request: Request, response: Response): Promise<void> => {
		const input = response.locals.validatedBody as RegisterInput;
		const result = await this.deps.registerUseCase.execute(input);

		response.status(201).json({
			data: {
				user: result.user,
				verificationRequired: result.verificationRequired,
			},
		});
	};
}
