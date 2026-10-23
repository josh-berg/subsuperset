import type {
	Collection,
	LocalStorageCollectionUtils,
} from "@tanstack/react-db";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import type { z } from "zod";
import {
	type DashboardSidebarProjectRow,
	type DashboardSidebarSectionRow,
	dashboardSidebarProjectSchema,
	dashboardSidebarSectionSchema,
	type WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "./dashboardSidebarLocal";

export interface OrgCollections {
	v2SidebarProjects: Collection<
		DashboardSidebarProjectRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarProjectSchema,
		z.input<typeof dashboardSidebarProjectSchema>
	>;
	v2WorkspaceLocalState: Collection<
		WorkspaceLocalStateRow,
		string,
		LocalStorageCollectionUtils,
		typeof workspaceLocalStateSchema,
		z.input<typeof workspaceLocalStateSchema>
	>;
	v2SidebarSections: Collection<
		DashboardSidebarSectionRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarSectionSchema,
		z.input<typeof dashboardSidebarSectionSchema>
	>;
}

// Per-org collections cache
const collectionsCache = new Map<string, OrgCollections>();

function createOrgCollections(organizationId: string): OrgCollections {
	const v2SidebarProjects = createCollection(
		localStorageCollectionOptions({
			id: `v2_sidebar_projects-${organizationId}`,
			storageKey: `v2-sidebar-projects-${organizationId}`,
			schema: dashboardSidebarProjectSchema,
			getKey: (item) => item.projectId,
		}),
	);

	const v2WorkspaceLocalState = createCollection(
		localStorageCollectionOptions({
			id: `v2_workspace_local_state-${organizationId}`,
			storageKey: `v2-workspace-local-state-${organizationId}`,
			schema: workspaceLocalStateSchema,
			getKey: (item) => item.workspaceId,
		}),
	);

	const v2SidebarSections = createCollection(
		localStorageCollectionOptions({
			id: `v2_sidebar_sections-${organizationId}`,
			storageKey: `v2-sidebar-sections-${organizationId}`,
			schema: dashboardSidebarSectionSchema,
			getKey: (item) => item.sectionId,
		}),
	);

	return {
		v2SidebarProjects,
		v2WorkspaceLocalState,
		v2SidebarSections,
	};
}

/**
 * No-op in local-only mode — collections are in-memory and require no preloading.
 */
export async function preloadCollections(
	_organizationId: string,
): Promise<void> {}

/**
 * Get collections for an organization, creating them if needed.
 */
export function getCollections(organizationId: string): OrgCollections {
	if (!collectionsCache.has(organizationId)) {
		collectionsCache.set(organizationId, createOrgCollections(organizationId));
	}

	const collections = collectionsCache.get(organizationId);
	if (!collections) {
		throw new Error(`Collections not found for org: ${organizationId}`);
	}

	return collections;
}

export type AppCollections = ReturnType<typeof getCollections>;
