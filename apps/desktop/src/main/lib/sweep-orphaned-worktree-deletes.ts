import { dirname } from "node:path";
import { worktrees } from "@superset/local-db";
import { sweepOrphanedDeletes } from "lib/trpc/routers/workspaces/utils/sweep-orphaned-deletes";
import { localDb } from "./local-db";

/** Remove `.superset-delete-*` dirs left beside tracked worktrees by an interrupted delete. */
export async function sweepOrphanedWorktreeDeletes(): Promise<void> {
	try {
		const parents = localDb
			.select({ path: worktrees.path })
			.from(worktrees)
			.all()
			.map((worktree) => dirname(worktree.path));
		const swept = await sweepOrphanedDeletes(parents);
		if (swept.length > 0) {
			console.log(
				`[workspace/delete] Cleaning ${swept.length} orphaned delete dir(s)`,
			);
		}
	} catch (error) {
		console.error("[workspace/delete] Orphan sweep failed:", error);
	}
}
