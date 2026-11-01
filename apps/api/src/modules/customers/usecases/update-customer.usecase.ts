import { NotFoundError } from "../../../foundation/errors/app-error.js";
import type { AuditRecorder } from "../../audit/services/audit.service.js";
import type { RequestMeta } from "../../auth/auth.types.js";
import { auditMetadata } from "../../tenancy/tenancy.audit.js";
import type { CustomerPatch, CustomerView, ICustomerRepository } from "../repositories/customer.repository.interface.js";

interface Input {
	organizationId: string;
	applicationId: string;
	customerId: string;
	actorId: string;
	patch: CustomerPatch;
}

export class UpdateCustomerUseCase {
	constructor(private readonly deps: { customerRepository: ICustomerRepository; auditService: AuditRecorder }) {}

	async execute(input: Input, meta: RequestMeta = {}): Promise<CustomerView> {
		const customer = await this.deps.customerRepository.update(input.applicationId, input.customerId, input.patch);
		if (!customer) throw new NotFoundError("Customer not found");

		await this.deps.auditService.record({
			actorUserId: input.actorId,
			action: "customer.updated",
			resourceType: "Customer",
			resourceId: customer.id,
			metadata: auditMetadata(meta, {
				organizationId: input.organizationId,
				applicationId: input.applicationId,
				fields: Object.keys(input.patch).join(","),
			}),
		});
		return customer;
	}
}
