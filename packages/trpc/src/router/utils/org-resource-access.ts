import { TRPCError } from "@trpc/server";

type ResourceErrorCode = "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND";

export type OrgScopedResource = {
	organizationId: string;
};

type RequireOrgScopedResourceOptions = {
	code?: ResourceErrorCode;
	message: string;
	organizationId?: string;
};

export async function requireOrgScopedResource<T extends OrgScopedResource>(
	resolveResource: () => Promise<T | null | undefined>,
	options: RequireOrgScopedResourceOptions,
): Promise<T> {
	const resource = await resolveResource();

	if (
		!resource ||
		(options.organizationId &&
			resource.organizationId !== options.organizationId)
	) {
		throw new TRPCError({
			code: options.code ?? "NOT_FOUND",
			message: options.message,
		});
	}

	return resource;
}

type RequireOrgResourceAccessOptions = RequireOrgScopedResourceOptions & {
	access?: "admin" | "member";
};

export async function requireOrgResourceAccess<T extends OrgScopedResource>(
	_userId: string,
	resolveResource: () => Promise<T | null | undefined>,
	options: RequireOrgResourceAccessOptions,
): Promise<T> {
	// Local-only mode: no org membership checks
	return requireOrgScopedResource(resolveResource, options);
}
