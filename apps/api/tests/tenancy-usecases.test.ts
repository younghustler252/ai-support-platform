import assert from "node:assert/strict";
import { test } from "node:test";

import { tenancyConfig } from "../src/config/tenancy.js";
import { ConflictError, ForbiddenError, LimitExceededError, NotFoundError, ValidationError } from "../src/foundation/errors/app-error.js";
import { CreateApplicationUseCase } from "../src/modules/applications/usecases/create-application.usecase.js";
import { ListApplicationsUseCase } from "../src/modules/applications/usecases/list-applications.usecase.js";
import type { IApplicationRepository } from "../src/modules/applications/repositories/application.repository.interface.js";
import type { IInvitationRepository, InvitationLookup } from "../src/modules/memberships/repositories/invitation.repository.interface.js";
import type { IMembershipRepository } from "../src/modules/memberships/repositories/membership.repository.interface.js";
import { AcceptInvitationUseCase } from "../src/modules/memberships/usecases/accept-invitation.usecase.js";
import { AddApplicationMemberUseCase } from "../src/modules/memberships/usecases/add-application-member.usecase.js";
import { ChangeOrganizationMemberRoleUseCase } from "../src/modules/memberships/usecases/change-organization-member-role.usecase.js";
import { CreateInvitationUseCase } from "../src/modules/memberships/usecases/create-invitation.usecase.js";
import { RemoveOrganizationMemberUseCase } from "../src/modules/memberships/usecases/remove-organization-member.usecase.js";
import type { IOrganizationRepository } from "../src/modules/organizations/repositories/organization.repository.interface.js";
import { CreateOrganizationUseCase } from "../src/modules/organizations/usecases/create-organization.usecase.js";
import { TokenService } from "../src/modules/auth/services/token.service.js";
import { auditSpy } from "./helpers.js";

const unexpected = (name: string) => async (): Promise<never> => { throw new Error(`unexpected ${name}`); };
const uniqueViolation = () => Object.assign(new Error("unique"), { code: "P2002" });

function organizationRepository(overrides: Partial<IOrganizationRepository> = {}): IOrganizationRepository {
	return {
		createWithOwner: async (input) => ({ id: "org-1", name: input.name, slug: input.slug, createdAt: new Date() }),
		countOwnedBy: async () => 0,
		listForUser: unexpected("listForUser"),
		findById: unexpected("findById"),
		update: unexpected("update"),
		archive: unexpected("archive"),
		...overrides,
	};
}

test("creating an organization makes the creator an owner and audits it", async () => {
	const audit = auditSpy();
	const useCase = new CreateOrganizationUseCase({ organizationRepository: organizationRepository(), auditService: audit });
	const organization = await useCase.execute({ userId: "user-1", name: "Acme Support" });

	assert.equal(organization.role, "OWNER");
	assert.equal(organization.slug, "acme-support");
	assert.equal(audit.events[0]?.action, "organization.created");
});

test("organization creation enforces the per-user ownership limit", async () => {
	const useCase = new CreateOrganizationUseCase({
		organizationRepository: organizationRepository({ countOwnedBy: async () => tenancyConfig.limits.ownedOrganizationsPerUser }),
		auditService: auditSpy(),
	});
	await assert.rejects(useCase.execute({ userId: "user-1", name: "One too many" }), LimitExceededError);
});

test("generated slugs retry on collisions but explicit slugs report a conflict", async () => {
	const attempted: string[] = [];
	const colliding = organizationRepository({
		createWithOwner: async (input) => {
			attempted.push(input.slug);
			if (attempted.length === 1) throw uniqueViolation();
			return { id: "org-1", name: input.name, slug: input.slug, createdAt: new Date() };
		},
	});
	const generated = await new CreateOrganizationUseCase({ organizationRepository: colliding, auditService: auditSpy() })
		.execute({ userId: "user-1", name: "Acme" });
	assert.equal(attempted[0], "acme");
	assert.match(generated.slug, /^acme-[0-9a-f]{6}$/);

	const always = organizationRepository({ createWithOwner: async () => { throw uniqueViolation(); } });
	await assert.rejects(
		new CreateOrganizationUseCase({ organizationRepository: always, auditService: auditSpy() })
			.execute({ userId: "user-1", name: "Acme", slug: "taken" }),
		ConflictError,
	);
});

test("generated slugs never use reserved words", async () => {
	let slug = "";
	const useCase = new CreateOrganizationUseCase({
		organizationRepository: organizationRepository({
			createWithOwner: async (input) => {
				slug = input.slug;
				return { id: "org-1", name: input.name, slug: input.slug, createdAt: new Date() };
			},
		}),
		auditService: auditSpy(),
	});
	await useCase.execute({ userId: "user-1", name: "Admin" });
	assert.match(slug, /^admin-[0-9a-f]{6}$/);
});

function applicationRepository(overrides: Partial<IApplicationRepository> = {}): IApplicationRepository {
	return {
		create: async (input) => ({
			id: "app-1",
			organizationId: input.organizationId,
			name: input.name,
			slug: input.slug,
			description: input.description ?? null,
			allowedOrigins: input.allowedOrigins,
			createdAt: new Date(),
			updatedAt: new Date(),
		}),
		countActive: async () => 0,
		listVisible: async () => [],
		findById: unexpected("findById"),
		update: unexpected("update"),
		archive: unexpected("archive"),
		...overrides,
	};
}

test("application creation enforces the organization limit and slug uniqueness", async () => {
	const full = new CreateApplicationUseCase({
		applicationRepository: applicationRepository({ countActive: async () => tenancyConfig.limits.applicationsPerOrganization }),
		auditService: auditSpy(),
	});
	await assert.rejects(
		full.execute({ organizationId: "org-1", actorId: "user-1", name: "Site", allowedOrigins: [] }),
		LimitExceededError,
	);

	const duplicate = new CreateApplicationUseCase({
		applicationRepository: applicationRepository({ create: async () => { throw uniqueViolation(); } }),
		auditService: auditSpy(),
	});
	await assert.rejects(
		duplicate.execute({ organizationId: "org-1", actorId: "user-1", name: "Site", slug: "site", allowedOrigins: [] }),
		ConflictError,
	);
});

test("only organization admins see every application", async () => {
	const seen: boolean[] = [];
	const useCase = new ListApplicationsUseCase({
		applicationRepository: applicationRepository({
			listVisible: async (_org, _user, seesAll) => { seen.push(seesAll); return []; },
		}),
	});
	await useCase.execute({ organizationId: "org-1", userId: "user-1", role: "MEMBER" });
	await useCase.execute({ organizationId: "org-1", userId: "user-1", role: "ADMIN" });
	await useCase.execute({ organizationId: "org-1", userId: "user-1", role: "OWNER" });
	assert.deepEqual(seen, [false, true, true]);
});

function membershipRepository(overrides: Partial<IMembershipRepository> = {}): IMembershipRepository {
	return {
		listOrganizationMembers: unexpected("listOrganizationMembers"),
		findOrganizationMember: async (_org, userId) => ({ userId, role: "MEMBER" }),
		changeOrganizationMemberRole: async () => "updated",
		removeOrganizationMember: async () => "removed",
		listApplicationMembers: unexpected("listApplicationMembers"),
		addApplicationMember: async () => "added",
		changeApplicationMemberRole: unexpected("changeApplicationMemberRole"),
		removeApplicationMember: unexpected("removeApplicationMember"),
		...overrides,
	};
}

function roleChange(repository: IMembershipRepository, audit = auditSpy()) {
	return new ChangeOrganizationMemberRoleUseCase({ membershipRepository: repository, auditService: audit });
}

test("admins can move members between admin and member and the change is audited", async () => {
	const audit = auditSpy();
	const result = await roleChange(membershipRepository(), audit).execute({
		organizationId: "org-1", actorId: "admin-1", actorRole: "ADMIN", targetUserId: "user-2", role: "ADMIN",
	});
	assert.deepEqual(result, { userId: "user-2", role: "ADMIN" });
	assert.equal(audit.events[0]?.action, "organization.member.role_changed");
	assert.equal(audit.events[0]?.metadata?.from, "MEMBER");
	assert.equal(audit.events[0]?.metadata?.to, "ADMIN");
});

test("role changes protect owners and self-promotion", async () => {
	const base = { organizationId: "org-1", targetUserId: "user-2" };
	const ownerTarget = membershipRepository({ findOrganizationMember: async (_o, userId) => ({ userId, role: "OWNER" }) });

	await assert.rejects(
		roleChange(membershipRepository()).execute({ ...base, actorId: "admin-1", actorRole: "ADMIN", role: "OWNER" }),
		ForbiddenError,
	);
	await assert.rejects(
		roleChange(ownerTarget).execute({ ...base, actorId: "admin-1", actorRole: "ADMIN", role: "MEMBER" }),
		ForbiddenError,
	);
	await assert.rejects(
		roleChange(membershipRepository()).execute({ ...base, targetUserId: "admin-1", actorId: "admin-1", actorRole: "ADMIN", role: "OWNER" }),
		ForbiddenError,
	);
});

test("an organization cannot lose its last owner", async () => {
	const lastOwner = membershipRepository({
		findOrganizationMember: async (_o, userId) => ({ userId, role: "OWNER" }),
		changeOrganizationMemberRole: async () => "last_owner",
	});
	await assert.rejects(
		roleChange(lastOwner).execute({
			organizationId: "org-1", actorId: "owner-1", actorRole: "OWNER", targetUserId: "owner-1", role: "ADMIN",
		}),
		ConflictError,
	);
});

test("role changes to the same role are no-ops and unknown members are not found", async () => {
	let called = false;
	const repository = membershipRepository({ changeOrganizationMemberRole: async () => { called = true; return "updated"; } });
	await roleChange(repository).execute({
		organizationId: "org-1", actorId: "admin-1", actorRole: "ADMIN", targetUserId: "user-2", role: "MEMBER",
	});
	assert.equal(called, false);

	const missing = membershipRepository({ findOrganizationMember: async () => null });
	await assert.rejects(
		roleChange(missing).execute({ organizationId: "org-1", actorId: "admin-1", actorRole: "ADMIN", targetUserId: "ghost", role: "ADMIN" }),
		NotFoundError,
	);
});

function removal(repository: IMembershipRepository, audit = auditSpy()) {
	return new RemoveOrganizationMemberUseCase({ membershipRepository: repository, auditService: audit });
}

test("members can leave but cannot remove other people", async () => {
	const audit = auditSpy();
	await removal(membershipRepository(), audit).execute({
		organizationId: "org-1", actorId: "user-1", actorRole: "MEMBER", targetUserId: "user-1",
	});
	assert.equal(audit.events[0]?.action, "organization.member.left");

	await assert.rejects(
		removal(membershipRepository()).execute({ organizationId: "org-1", actorId: "user-1", actorRole: "MEMBER", targetUserId: "user-2" }),
		ForbiddenError,
	);
});

test("only owners can remove owners and the last owner can never leave", async () => {
	const ownerTarget = membershipRepository({ findOrganizationMember: async (_o, userId) => ({ userId, role: "OWNER" }) });
	await assert.rejects(
		removal(ownerTarget).execute({ organizationId: "org-1", actorId: "admin-1", actorRole: "ADMIN", targetUserId: "owner-2" }),
		ForbiddenError,
	);
	const audit = auditSpy();
	await removal(ownerTarget, audit).execute({ organizationId: "org-1", actorId: "owner-1", actorRole: "OWNER", targetUserId: "owner-2" });
	assert.equal(audit.events[0]?.action, "organization.member.removed");

	const lastOwner = membershipRepository({
		findOrganizationMember: async (_o, userId) => ({ userId, role: "OWNER" }),
		removeOrganizationMember: async () => "last_owner",
	});
	await assert.rejects(
		removal(lastOwner).execute({ organizationId: "org-1", actorId: "owner-1", actorRole: "OWNER", targetUserId: "owner-1" }),
		ConflictError,
	);
});

test("application members must belong to the organization and cannot be added twice", async () => {
	const input = { organizationId: "org-1", applicationId: "app-1", actorId: "admin-1", userId: "user-2", role: "MEMBER" as const };
	const useCase = (result: "added" | "not_org_member" | "exists" | "not_found", audit = auditSpy()) =>
		new AddApplicationMemberUseCase({
			membershipRepository: membershipRepository({ addApplicationMember: async () => result }),
			auditService: audit,
		});

	await assert.rejects(useCase("not_org_member").execute(input), ValidationError);
	await assert.rejects(useCase("exists").execute(input), ConflictError);
	await assert.rejects(useCase("not_found").execute(input), NotFoundError);

	const audit = auditSpy();
	assert.deepEqual(await useCase("added", audit).execute(input), { userId: "user-2", role: "MEMBER" });
	assert.equal(audit.events[0]?.action, "application.member.added");
});

function invitationRepository(overrides: Partial<IInvitationRepository> = {}): IInvitationRepository {
	return {
		create: async (input) => ({
			invitation: {
				id: "invite-1",
				email: input.email,
				role: input.role,
				expiresAt: input.expiresAt,
				createdAt: new Date(),
				invitedByUserId: input.invitedByUserId,
			},
			organizationName: "Acme",
		}),
		countPending: async () => 0,
		listPending: unexpected("listPending"),
		revoke: unexpected("revoke"),
		isActiveMemberEmail: async () => false,
		findByTokenHash: async () => null,
		accept: async () => true,
		...overrides,
	};
}

function invitationEmails() {
	const sent: Array<{ email: string; token: string; organizationName: string; inviterName: string }> = [];
	return {
		sent,
		service: {
			sendInvitation: async (email: string, input: { organizationName: string; inviterName: string; token: string }) => {
				sent.push({ email, ...input });
			},
		},
	};
}

test("inviting someone stores only a token hash and emails the raw token once", async () => {
	const tokenService = new TokenService();
	const emails = invitationEmails();
	let storedHash = "";
	const useCase = new CreateInvitationUseCase({
		invitationRepository: invitationRepository({
			create: async (input) => {
				storedHash = input.tokenHash;
				return {
					invitation: { id: "invite-1", email: input.email, role: input.role, expiresAt: input.expiresAt, createdAt: new Date(), invitedByUserId: "user-1" },
					organizationName: "Acme",
				};
			},
		}),
		invitationEmailService: emails.service,
		tokenService,
		auditService: auditSpy(),
	});

	const result = await useCase.execute({
		organizationId: "org-1",
		inviter: { id: "user-1", name: "Ada\r\nBcc: attacker@example.com" },
		email: "new@example.com",
		role: "MEMBER",
	});
	assert.equal(result.invitation.email, "new@example.com");
	assert.equal(emails.sent.length, 1);
	assert.equal(tokenService.hash(emails.sent[0]?.token ?? ""), storedHash);
	assert.notEqual(emails.sent[0]?.token, storedHash);
	assert.doesNotMatch(emails.sent[0]?.inviterName ?? "", /[\r\n]/);
	assert.equal(JSON.stringify(result).includes(emails.sent[0]?.token ?? "missing"), false);
});

test("invitations reject existing members and enforce the pending limit", async () => {
	const base = { tokenService: new TokenService(), auditService: auditSpy(), invitationEmailService: invitationEmails().service };
	const input = { organizationId: "org-1", inviter: { id: "user-1", name: "Ada" }, email: "new@example.com", role: "MEMBER" as const };

	await assert.rejects(
		new CreateInvitationUseCase({ ...base, invitationRepository: invitationRepository({ isActiveMemberEmail: async () => true }) }).execute(input),
		ConflictError,
	);
	await assert.rejects(
		new CreateInvitationUseCase({
			...base,
			invitationRepository: invitationRepository({ countPending: async () => tenancyConfig.limits.pendingInvitationsPerOrganization }),
		}).execute(input),
		LimitExceededError,
	);
});

test("a failing email provider does not fail invitation creation", async () => {
	const useCase = new CreateInvitationUseCase({
		invitationRepository: invitationRepository(),
		invitationEmailService: { sendInvitation: async () => { throw new Error("queue closed"); } },
		tokenService: new TokenService(),
		auditService: auditSpy(),
	});
	const result = await useCase.execute({
		organizationId: "org-1", inviter: { id: "user-1", name: "Ada" }, email: "new@example.com", role: "ADMIN",
	});
	assert.equal(result.invitation.role, "ADMIN");
});

function lookup(overrides: Partial<InvitationLookup> = {}): InvitationLookup {
	return {
		id: "invite-1",
		organizationId: "org-1",
		organizationName: "Acme",
		organizationArchivedAt: null,
		email: "invitee@example.com",
		role: "ADMIN",
		expiresAt: new Date(Date.now() + 3_600_000),
		acceptedAt: null,
		revokedAt: null,
		...overrides,
	};
}

function acceptance(found: InvitationLookup | null, accepted = true, audit = auditSpy()) {
	let claimed = 0;
	const useCase = new AcceptInvitationUseCase({
		invitationRepository: invitationRepository({
			findByTokenHash: async () => found,
			accept: async () => { claimed += 1; return accepted; },
		}),
		tokenService: new TokenService(),
		auditService: audit,
	});
	return { useCase, claimed: () => claimed };
}

const invitee = { id: "user-9", email: "Invitee@Example.com" };

test("accepting an invitation joins the organization with the invited role", async () => {
	const audit = auditSpy();
	const { useCase, claimed } = acceptance(lookup(), true, audit);
	const result = await useCase.execute({ token: "x".repeat(43), user: invitee });

	assert.deepEqual(result, { organization: { id: "org-1", name: "Acme" }, role: "ADMIN" });
	assert.equal(claimed(), 1);
	assert.equal(audit.events[0]?.action, "organization.invitation.accepted");
});

test("every invalid invitation produces the same error and never claims it", async () => {
	const invalid = [
		null,
		lookup({ acceptedAt: new Date() }),
		lookup({ revokedAt: new Date() }),
		lookup({ expiresAt: new Date(Date.now() - 1000) }),
		lookup({ organizationArchivedAt: new Date() }),
		lookup({ email: "someone-else@example.com" }),
	];
	for (const found of invalid) {
		const { useCase, claimed } = acceptance(found);
		await assert.rejects(
			useCase.execute({ token: "x".repeat(43), user: invitee }),
			(error: unknown) => error instanceof ValidationError && error.message === "Invalid or expired invitation",
		);
		assert.equal(claimed(), 0);
	}

	const raced = acceptance(lookup(), false);
	await assert.rejects(raced.useCase.execute({ token: "x".repeat(43), user: invitee }), ValidationError);
});
