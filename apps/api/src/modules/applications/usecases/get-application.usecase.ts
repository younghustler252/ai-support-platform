import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { ApplicationView, IApplicationRepository } from "../repositories/application.repository.interface.js";

export class GetApplicationUseCase {
	constructor(private readonly deps: { applicationRepository: IApplicationRepository }) {}

	async execute(organizationId: string, applicationId: string): Promise<ApplicationView> {
		const application = await this.deps.applicationRepository.findById(organizationId, applicationId);
		if (!application) throw new NotFoundError("Application not found");
		return application;
	}
}
