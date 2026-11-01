import type { Page } from "../../../foundation/utils/cursor.js";

export type CustomerMetadata = Record<string, string | number | boolean | null>;

export interface CustomerView {
	id: string;
	applicationId: string;
	externalId: string | null;
	displayName: string | null;
	email: string | null;
	metadata: CustomerMetadata | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface CustomerPatch {
	displayName?: string | null;
	email?: string | null;
	metadata?: CustomerMetadata;
}

export interface ICustomerRepository {
	list(applicationId: string, query: { search?: string; limit: number; cursor?: string }): Promise<Page<CustomerView>>;
	find(applicationId: string, customerId: string): Promise<CustomerView | null>;
	update(applicationId: string, customerId: string, patch: CustomerPatch): Promise<CustomerView | null>;
	upsertByExternalId(applicationId: string, externalId: string, patch: CustomerPatch): Promise<CustomerView>;
}
