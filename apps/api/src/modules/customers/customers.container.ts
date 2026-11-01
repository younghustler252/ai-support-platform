import { asClass, type AwilixContainer } from "awilix";

import { CustomerController } from "./controllers/customer.controller.js";
import { CustomerRepositoryImpl } from "./repositories/customer.repository.impl.js";
import { GetCustomerUseCase } from "./usecases/get-customer.usecase.js";
import { ListCustomersUseCase } from "./usecases/list-customers.usecase.js";
import { UpdateCustomerUseCase } from "./usecases/update-customer.usecase.js";
import { UpsertServiceCustomerUseCase } from "./usecases/upsert-service-customer.usecase.js";

export function registerCustomers(container: AwilixContainer): void {
	container.register({
		customerRepository: asClass(CustomerRepositoryImpl).scoped(),
		listCustomersUseCase: asClass(ListCustomersUseCase).scoped(),
		getCustomerUseCase: asClass(GetCustomerUseCase).scoped(),
		updateCustomerUseCase: asClass(UpdateCustomerUseCase).scoped(),
		upsertServiceCustomerUseCase: asClass(UpsertServiceCustomerUseCase).scoped(),
		customerController: asClass(CustomerController).scoped(),
	});
}
