import type { Page } from "../../../foundation/utils/cursor.js";
import type { CustomerView, ICustomerRepository } from "../repositories/customer.repository.interface.js";

export class ListCustomersUseCase {
	constructor(private readonly deps: { customerRepository: ICustomerRepository }) {}

	execute(input: { applicationId: string; search?: string; limit: number; cursor?: string }): Promise<Page<CustomerView>> {
		return this.deps.customerRepository.list(input.applicationId, { search: input.search, limit: input.limit, cursor: input.cursor });
	}
}
