import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { CustomerView, ICustomerRepository } from "../repositories/customer.repository.interface.js";

export class GetCustomerUseCase {
	constructor(private readonly deps: { customerRepository: ICustomerRepository }) {}

	async execute(applicationId: string, customerId: string): Promise<CustomerView> {
		const customer = await this.deps.customerRepository.find(applicationId, customerId);
		if (!customer) throw new NotFoundError("Customer not found");
		return customer;
	}
}
