import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
	collectProcessTree,
	getProcessGroupId,
	hasDescendantProcess,
	parseProcessTable,
	signalProcessTreeAndGroups,
} from "./process-tree";

describe("parseProcessTable", () => {
	test("parses pid/ppid/pgid rows and skips malformed ones", () => {
		const table = parseProcessTable(
			["  10   1  10", " 11  10  10", "garbage", " 12 x 12", " 13 10 0"].join(
				"\n",
			),
		);
		expect(table).toEqual([
			{ pid: 10, ppid: 1, pgid: 10 },
			{ pid: 11, ppid: 10, pgid: 10 },
		]);
	});
});

describe("collectProcessTree", () => {
	test("walks descendants by ppid", () => {
		const table = [
			{ pid: 1, ppid: 0, pgid: 1 },
			{ pid: 10, ppid: 1, pgid: 10 },
			{ pid: 11, ppid: 10, pgid: 11 },
			{ pid: 12, ppid: 11, pgid: 12 },
			{ pid: 20, ppid: 1, pgid: 20 },
		];
		expect([...collectProcessTree(10, table)].sort()).toEqual([10, 11, 12]);
		expect(getProcessGroupId(11, table)).toBe(11);
		expect(getProcessGroupId(999, table)).toBeNull();
	});
});

describe("signalProcessTreeAndGroups", () => {
	test("kills a detached background process group spawned under the root", async () => {
		// Root shell starts a setsid-style detached child (own process group)
		// that PPID-only traversal would still find, plus verifies group signalling.
		const root = spawn("sh", ["-c", "sleep 60 & sleep 60 & wait"], {
			detached: true,
			stdio: "ignore",
		});
		const rootPid = root.pid;
		if (rootPid === undefined) throw new Error("spawn failed");
		await new Promise((r) => setTimeout(r, 200));

		const targets = signalProcessTreeAndGroups(rootPid, "SIGKILL");
		expect(targets.some((t) => t.id === rootPid)).toBe(true);

		await new Promise((r) => root.once("exit", r));
		expect(() => process.kill(rootPid, 0)).toThrow();
	});

	test("never targets the calling process or its group", () => {
		const targets = signalProcessTreeAndGroups(process.pid, "SIGCONT");
		expect(
			targets.some((t) => t.target === "pid" && t.id === process.pid),
		).toBe(false);
	});
});

describe("hasDescendantProcess", () => {
	const table = [
		{ pid: 10, ppid: 1, pgid: 10 },
		{ pid: 11, ppid: 10, pgid: 11 },
		{ pid: 20, ppid: 1, pgid: 20 },
	];

	test("true when the root has a child", () => {
		expect(hasDescendantProcess(10, table)).toBe(true);
	});

	test("false for an idle shell", () => {
		expect(hasDescendantProcess(20, table)).toBe(false);
	});
});
