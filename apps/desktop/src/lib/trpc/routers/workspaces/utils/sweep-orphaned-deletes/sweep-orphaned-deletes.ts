import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

// Matches the temp name `removeWorktree` renames a worktree to before the
// background `rm -rf`. If the app quits mid-delete the directory is orphaned.
export const DELETE_TEMP_PREFIX = ".superset-delete-";

export async function findOrphanedDeleteDirs(
	parentDirs: Iterable<string>,
): Promise<string[]> {
	const found: string[] = [];
	for (const parent of new Set(parentDirs)) {
		const entries = await readdir(parent, { withFileTypes: true }).catch(
			() => [],
		);
		for (const entry of entries) {
			if (entry.isDirectory() && entry.name.startsWith(DELETE_TEMP_PREFIX)) {
				found.push(join(parent, entry.name));
			}
		}
	}
	return found;
}

/** Finish deletes interrupted by an app quit or crash. Best-effort. */
export async function sweepOrphanedDeletes(
	parentDirs: Iterable<string>,
): Promise<string[]> {
	const orphans = await findOrphanedDeleteDirs(parentDirs);
	for (const dir of orphans) {
		const child = spawn("/bin/rm", ["-rf", dir], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
		child.on("error", (error) => {
			console.error(
				`[workspace/delete] Orphan sweep failed for ${dir}:`,
				error,
			);
		});
	}
	return orphans;
}
