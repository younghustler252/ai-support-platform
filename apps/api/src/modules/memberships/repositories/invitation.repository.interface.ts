import type { TenantRole } from "../../tenancy/tenancy.types.js";

export interface InvitationView {
	id: string;
	email: string;
	role: TenantRole;
	expiresAt: Date;
	createdAt: Date;
	invitedByUserId: string | null;
}

export interface InvitationLookup {
	id: string;
	organizationId: string;
	organizationName: string;
	organizationArchivedAt: Date | null;
	email: string;
	role: TenantRole;
	expiresAt: Date;
	acceptedAt: Date | null;
	revokedAt: Date | null;
}

export interface NewInvitation {
	organizationId: string;
	email: string;
	role: TenantRole;
	tokenHash: string;
	invitedByUserId: string;
	expiresAt: Date;
}

export interface IInvitationRepository {
	create(input: NewInvitation): Promise<{ invitation: InvitationView; organizationName: string }>;
	countPending(organizationId: string): Promise<number>;
	listPending(organizationId: string): Promise<InvitationView[]>;
	revoke(organizationId: string, invitationId: string): Promise<boolean>;
	isActiveMemberEmail(organizationId: string, email: string): Promise<boolean>;
	findByTokenHash(tokenHash: string): Promise<InvitationLookup | null>;
	accept(input: { invitationId: string; organizationId: string; userId: string; role: TenantRole }): Promise<boolean>;
}
