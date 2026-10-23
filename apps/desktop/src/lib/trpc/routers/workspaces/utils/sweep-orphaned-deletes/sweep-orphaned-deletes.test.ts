import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findOrphanedDeleteDirs } from "./sweep-orphaned-deletes";

describe("findOrphanedDeleteDirs", () => {
	let root: string;
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("finds only leftover delete temp dirs and tolerates missing parents", async () => {
		root = mkdtempSync(join(tmpdir(), "sweep-"));
		mkdirSync(join(root, ".superset-delete-abc"));
		mkdirSync(join(root, "real-worktree"));
		writeFileSync(join(root, ".superset-delete-file"), "");

		const found = await findOrphanedDeleteDirs([
			root,
			root,
			join(root, "missing"),
		]);

		expect(found).toEqual([join(root, ".superset-delete-abc")]);
	});
});
