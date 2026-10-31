export interface InvitationEmailInput {
	organizationName: string;
	inviterName: string;
	token: string;
}

export interface InvitationEmailPort {
	sendInvitation(email: string, input: InvitationEmailInput): Promise<void>;
}
