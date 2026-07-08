import { stat, writeFile } from "node:fs/promises";
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
	MULTI_REPO_CONTEXT_SHARED_FILE,
	SEED_ONCE_NOTE,
} from "./multi-repo-context";

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Regenerate the auto-injected multi-repo context files for a feature project:
 * `CLAUDE.local.md` (git-excluded, always overwritten) into the feature
 * project's folder and every child repo, and best-effort `AGENTS.md` in child
 * repos that don't already have one (left alone once it exists, so we never
 * clobber user edits or repo conventions).
 *
 * Called whenever feature-project repo membership changes (create/addRepo/
 * removeRepo) so the files are correct on disk the moment a repo appears,
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

			const agentsMdPath = join(
				child.mainRepoPath,
				MULTI_REPO_CONTEXT_SHARED_FILE,
			);
			if (!(await fileExists(agentsMdPath))) {
				await writeFile(agentsMdPath, childContent + SEED_ONCE_NOTE, "utf-8");
			}
		}),
	);

	return { applicable: true, repoCount: children.length };
}
