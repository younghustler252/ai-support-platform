import type { Request, Response } from "express";

import { validatedQuery } from "../../../foundation/http/locals.js";
import { authContext, requestMeta, validatedBody, validatedParams } from "../../auth/http/auth-http.js";
import { apiKeyContext } from "../../api-keys/middleware/require-api-key.js";
import { tenantContext } from "../../tenancy/http/tenant-http.js";
import type { GetCustomerUseCase } from "../usecases/get-customer.usecase.js";
import type { ListCustomersUseCase } from "../usecases/list-customers.usecase.js";
import type { UpdateCustomerUseCase } from "../usecases/update-customer.usecase.js";
import type { UpsertServiceCustomerUseCase } from "../usecases/upsert-service-customer.usecase.js";
import type {
	CustomerParams,
	ListCustomersQuery,
	UpdateCustomerInput,
	UpsertServiceCustomerInput,
} from "../validators/customer.validator.js";

interface Dependencies {
	listCustomersUseCase: ListCustomersUseCase;
	getCustomerUseCase: GetCustomerUseCase;
	updateCustomerUseCase: UpdateCustomerUseCase;
	upsertServiceCustomerUseCase: UpsertServiceCustomerUseCase;
}

export class CustomerController {
	constructor(private readonly deps: Dependencies) {}

	list = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { q, limit, cursor } = validatedQuery<ListCustomersQuery>(response);
		const page = await this.deps.listCustomersUseCase.execute({ applicationId: applicationId as string, search: q, limit, cursor });
		response.json({ data: { customers: page.items }, meta: { nextCursor: page.nextCursor } });
	};

	get = async (_request: Request, response: Response): Promise<void> => {
		const { applicationId } = tenantContext(response);
		const { customerId } = validatedParams<CustomerParams>(response);
		response.json({ data: { customer: await this.deps.getCustomerUseCase.execute(applicationId as string, customerId) } });
	};

	update = async (request: Request, response: Response): Promise<void> => {
		const { user } = authContext(response);
		const { organizationId, applicationId } = tenantContext(response);
		const { customerId } = validatedParams<CustomerParams>(response);
		const patch = validatedBody<UpdateCustomerInput>(response);
		const customer = await this.deps.updateCustomerUseCase.execute(
			{ organizationId, applicationId: applicationId as string, customerId, actorId: user.id, patch },
			requestMeta(request),
		);
		response.json({ data: { customer } });
	};

	upsertService = async (_request: Request, response: Response): Promise<void> => {
		const principal = apiKeyContext(response);
		const { externalId } = validatedParams<{ externalId: string }>(response);
		const patch = validatedBody<UpsertServiceCustomerInput>(response);
		const customer = await this.deps.upsertServiceCustomerUseCase.execute({
			applicationId: principal.application.id,
			externalId,
			patch,
		});
		response.json({ data: { customer } });
	};
}
