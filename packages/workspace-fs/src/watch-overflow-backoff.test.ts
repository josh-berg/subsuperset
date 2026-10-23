import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FsWatcherManager } from "./watch";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("FsWatcherManager overflow rescan", () => {
	const cleanups: Array<() => Promise<void>> = [];

	afterEach(async () => {
		for (const cleanup of cleanups.splice(0)) {
			await cleanup();
		}
	});

	async function setup() {
		const root = await mkdtemp(path.join(tmpdir(), "watch-overflow-"));
		const manager = new FsWatcherManager({
			overflowRescanInitialMs: 40,
			overflowRescanMaxMs: 200,
			overflowBackoffResetMs: 1_000,
		});
		const batches: string[] = [];
		const unsubscribe = await manager.subscribe(
			{ absolutePath: root },
			({ events }) => {
				for (const event of events) batches.push(event.kind);
			},
		);
		cleanups.push(async () => {
			await unsubscribe();
			await manager.close();
			await rm(root, { recursive: true, force: true });
		});
		return { manager, batches };
	}

	it("coalesces a burst of overflows into one trailing rescan", async () => {
		const { manager, batches } = await setup();
		const internals = manager as unknown as {
			watchers: Map<string, unknown>;
			scheduleOverflowRescan(state: unknown): void;
		};
		const watcherState = [...internals.watchers.values()][0];
		for (let i = 0; i < 5; i++) {
			internals.scheduleOverflowRescan(watcherState);
			await sleep(10);
		}
		expect(batches.filter((kind) => kind === "overflow")).toHaveLength(0);
		await sleep(150);
		expect(batches.filter((kind) => kind === "overflow")).toHaveLength(1);
	});
});
