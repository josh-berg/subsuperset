import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { getSimpleGitWithShellPath } from "../../workspaces/utils/git-client";

/** Resolve the shared `.git` directory for a repo, correctly handling worktrees. */
async function resolveGitCommonDir(repoPath: string): Promise<string> {
	const git = await getSimpleGitWithShellPath(repoPath);
	const raw = (await git.revparse(["--git-common-dir"])).trim();
	return isAbsolute(raw) ? raw : join(repoPath, raw);
}

/**
 * Idempotently add a line to a repo's `.git/info/exclude` (a local-only ignore
 * list that never touches the repo's tracked `.gitignore`).
 */
export async function ensureGitExcludeEntry(
	repoPath: string,
	line: string,
): Promise<void> {
	const gitCommonDir = await resolveGitCommonDir(repoPath);
	const infoDir = join(gitCommonDir, "info");
	const excludePath = join(infoDir, "exclude");

	let existing = "";
	try {
		existing = await readFile(excludePath, "utf-8");
	} catch {
		// File doesn't exist yet; we'll create it below.
	}

	if (existing.split("\n").includes(line)) return;

	await mkdir(infoDir, { recursive: true });
	const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
	await writeFile(excludePath, `${existing}${separator}${line}\n`, "utf-8");
}
