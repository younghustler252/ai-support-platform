import type { CustomerPatch, CustomerView, ICustomerRepository } from "../repositories/customer.repository.interface.js";

export class UpsertServiceCustomerUseCase {
	constructor(private readonly deps: { customerRepository: ICustomerRepository }) {}

	execute(input: { applicationId: string; externalId: string; patch: CustomerPatch }): Promise<CustomerView> {
		return this.deps.customerRepository.upsertByExternalId(input.applicationId, input.externalId, input.patch);
	}
}
