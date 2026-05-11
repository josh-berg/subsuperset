import { type SelectProject, workspaces } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import {
	activateProject,
	getBranchWorkspace,
	setLastActiveWorkspace,
	touchWorkspace,
} from "../../workspaces/utils/db-helpers";

/** Create or return the gitless branch workspace for a feature project. Activates the project in the sidebar. */
export function ensureGitlessWorkspace(project: SelectProject): void {
	const existingWorkspace = getBranchWorkspace(project.id);
	if (existingWorkspace) {
		touchWorkspace(existingWorkspace.id);
		setLastActiveWorkspace(existingWorkspace.id);
		return;
	}

	const insertResult = localDb
		.insert(workspaces)
		.values({
			projectId: project.id,
			type: "branch",
			branch: "",
			name: "default",
			tabOrder: 0,
		})
		.onConflictDoNothing()
		.returning()
		.all();

	const workspace = insertResult[0] ?? getBranchWorkspace(project.id);
	if (!workspace) return;

	setLastActiveWorkspace(workspace.id);
	activateProject(project);
}

/**
 * Create or return the main branch workspace for a child repo project.
 * Unlike the standard workspace bootstrap, does NOT call activateProject — child repos
 * must remain hidden from the top-level sidebar (tabOrder stays null).
 * Returns the workspace ID, or null if creation failed.
 */
export function ensureChildRepoWorkspace(
	project: SelectProject,
	branchName: string,
): string | null {
	const existingBranchWorkspace = getBranchWorkspace(project.id);

	if (existingBranchWorkspace) {
		touchWorkspace(existingBranchWorkspace.id);
		return existingBranchWorkspace.id;
	}

	const insertResult = localDb
		.insert(workspaces)
		.values({
			projectId: project.id,
			type: "branch",
			branch: branchName,
			name: project.name,
			tabOrder: 0,
		})
		.onConflictDoNothing()
		.returning()
		.all();

	const workspace = insertResult[0] ?? getBranchWorkspace(project.id);
	return workspace?.id ?? null;
}
