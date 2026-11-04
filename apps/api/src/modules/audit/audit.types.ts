export interface AuditLogView {
	id: string;
	action: string;
	resourceType: string;
	resourceId: string | null;
	applicationId: string | null;
	actor: { id: string; email: string; displayName: string | null } | null;
	metadata: unknown;
	createdAt: Date;
}

export interface AuditLogQuery {
	organizationId: string;
	applicationId?: string;
	actorUserId?: string;
	action?: string;
	from?: Date;
	to?: Date;
	limit: number;
	cursor?: string;
}
