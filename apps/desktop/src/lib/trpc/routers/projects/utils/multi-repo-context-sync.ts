import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projects } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { ensureGitExcludeEntry } from "./git-exclude";
import {
	AUTO_REGENERATED_NOTE,
	buildChildRepoContextMarkdown,
	buildFeatureProjectContextMarkdown,
	MULTI_REPO_CONTEXT_LOCAL_FILE,
} from "./multi-repo-context";

/**
 * Regenerate the auto-injected `CLAUDE.local.md` multi-repo context file
 * (git-excluded, always overwritten) into the feature project's folder and
 * every child repo.
 *
 * Called whenever feature-project repo membership changes (create/addRepo/
 * removeRepo) so the file is correct on disk the moment a repo appears,
 * regardless of which UI action a user later takes to launch an agent there.
 */
export async function regenerateMultiRepoContext(
	featureProjectId: string,
): Promise<{ applicable: boolean; repoCount?: number }> {
	const featureProject = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, featureProjectId))
		.get();
	if (!featureProject) return { applicable: false };

	const children = localDb
		.select()
		.from(projects)
		.where(eq(projects.parentProjectId, featureProjectId))
		.all();
	if (children.length === 0) return { applicable: false };

	const repoInfos = children.map((child) => ({
		name: child.name,
		mainRepoPath: child.mainRepoPath,
	}));

	await writeFile(
		join(featureProject.mainRepoPath, MULTI_REPO_CONTEXT_LOCAL_FILE),
		buildFeatureProjectContextMarkdown(
			featureProject.name,
			featureProject.mainRepoPath,
			repoInfos,
		) + AUTO_REGENERATED_NOTE,
		"utf-8",
	);

	await Promise.all(
		children.map(async (child) => {
			const siblings = repoInfos.filter(
				(r) => r.mainRepoPath !== child.mainRepoPath,
			);
			const childContent = buildChildRepoContextMarkdown(
				featureProject.name,
				featureProject.mainRepoPath,
				{ name: child.name, mainRepoPath: child.mainRepoPath },
				siblings,
			);

			await writeFile(
				join(child.mainRepoPath, MULTI_REPO_CONTEXT_LOCAL_FILE),
				childContent + AUTO_REGENERATED_NOTE,
				"utf-8",
			);
			await ensureGitExcludeEntry(
				child.mainRepoPath,
				MULTI_REPO_CONTEXT_LOCAL_FILE,
			);
		}),
	);

	return { applicable: true, repoCount: children.length };
}
