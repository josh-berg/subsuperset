const MOCK_ORG_ID = "mock-org-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function requireActiveOrgId(_session?: any, _message?: string): string {
	return MOCK_ORG_ID;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requireActiveOrgMembership(
	_session?: any,
	_message?: string,
): Promise<string> {
	return MOCK_ORG_ID;
}
