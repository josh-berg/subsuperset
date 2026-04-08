// Stub: org membership/admin checks are no-ops in local-only mode
export async function verifyOrgMembership(
	_userId: string,
	_organizationId: string,
): Promise<void> {
	// No-op: single-user local mode has no org membership concept
}

export async function verifyOrgAdmin(
	_userId: string,
	_organizationId: string,
): Promise<void> {
	// No-op: single-user local mode has no org admin concept
}
