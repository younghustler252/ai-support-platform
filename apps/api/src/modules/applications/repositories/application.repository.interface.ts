export interface ApplicationView {
	id: string;
	organizationId: string;
	name: string;
	slug: string;
	description: string | null;
	allowedOrigins: string[];
	createdAt: Date;
	updatedAt: Date;
}

export interface NewApplication {
	organizationId: string;
	name: string;
	slug: string;
	description?: string;
	allowedOrigins: string[];
}

export interface ApplicationPatch {
	name?: string;
	description?: string | null;
	allowedOrigins?: string[];
}

export interface IApplicationRepository {
	create(input: NewApplication): Promise<ApplicationView>;
	countActive(organizationId: string): Promise<number>;
	listVisible(organizationId: string, userId: string, seesAll: boolean): Promise<ApplicationView[]>;
	findById(organizationId: string, applicationId: string): Promise<ApplicationView | null>;
	update(organizationId: string, applicationId: string, patch: ApplicationPatch): Promise<ApplicationView | null>;
	archive(organizationId: string, applicationId: string): Promise<boolean>;
}
