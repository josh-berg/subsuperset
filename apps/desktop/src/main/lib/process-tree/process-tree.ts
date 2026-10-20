import { spawnSync } from "node:child_process";

export interface ProcessInfo {
	pid: number;
	ppid: number;
	pgid: number;
}

export interface ProcessSignalError {
	target: "pid" | "pgid";
	id: number;
	signal: NodeJS.Signals;
	error: unknown;
}

export interface ProcessSignalTarget {
	target: "pid" | "pgid";
	id: number;
}

export interface SignalProcessTreeAndGroupsOptions {
	/**
	 * When false, skip the root pid and its process group. node-pty delivers
	 * the signal to its own child separately; we only need descendants and any
	 * detached process groups they spawned.
	 */
	includeRoot?: boolean;
	signalGroups?: boolean;
	signalPids?: boolean;
	/**
	 * Never signal the caller's own process group or any ancestor's pid/group.
	 * A group collision (a tree member that never called setsid) would
	 * otherwise let one killpg take out the invoking session.
	 */
	excludeCurrentProcessGroup?: boolean;
	onSignalError?: (error: ProcessSignalError) => void;
}

export function signalProcessTreeAndGroups(
	rootPid: number,
	signal: NodeJS.Signals,
	options: SignalProcessTreeAndGroupsOptions = {},
): ProcessSignalTarget[] {
	const targets = collectProcessSignalTargets(rootPid, options);
	signalProcessTargets(targets, signal, options.onSignalError);
	return targets;
}

export function collectProcessSignalTargets(
	rootPid: number,
	options: SignalProcessTreeAndGroupsOptions = {},
): ProcessSignalTarget[] {
	if (!isPositiveInteger(rootPid)) return [];

	const includeRoot = options.includeRoot ?? true;
	const signalGroups = options.signalGroups ?? true;
	const signalPids = options.signalPids ?? true;
	const excludeCurrentProcessGroup = options.excludeCurrentProcessGroup ?? true;
	const table = readProcessTable();
	const infoByPid = new Map(table.map((row) => [row.pid, row]));

	const protectedPids = new Set<number>();
	const protectedPgids = new Set<number>();
	if (excludeCurrentProcessGroup) {
		let cursor: number | undefined = process.pid;
		while (cursor !== undefined && cursor > 1 && !protectedPids.has(cursor)) {
			protectedPids.add(cursor);
			const row = infoByPid.get(cursor);
			if (!row) break;
			if (row.pgid > 1) protectedPgids.add(row.pgid);
			cursor = row.ppid;
		}
	}

	const rootPgid = getProcessGroupId(rootPid, table);
	const pids = collectProcessTree(rootPid, table);
	for (const pid of protectedPids) pids.delete(pid);

	const pgids = new Set<number>();
	for (const pid of pids) {
		if (!includeRoot && pid === rootPid) continue;
		const info = infoByPid.get(pid);
		if (!info) continue;
		if (info.pgid <= 1) continue;
		if (protectedPgids.has(info.pgid)) continue;
		if (!includeRoot && rootPgid !== null && info.pgid === rootPgid) continue;
		pgids.add(info.pgid);
	}

	const targets: ProcessSignalTarget[] = [];
	if (signalGroups) {
		for (const pgid of pgids) {
			targets.push({ target: "pgid", id: pgid });
		}
	}

	if (signalPids) {
		for (const pid of pids) {
			if (!includeRoot && pid === rootPid) continue;
			targets.push({ target: "pid", id: pid });
		}
	}

	return targets;
}

export function signalProcessTargets(
	targets: ProcessSignalTarget[],
	signal: NodeJS.Signals,
	onSignalError?: (error: ProcessSignalError) => void,
): void {
	for (const { target, id } of targets) {
		try {
			process.kill(target === "pgid" ? -id : id, signal);
		} catch (error) {
			onSignalError?.({ target, id, signal, error });
		}
	}
}

// A hung ps (stale NFS mount, kernel proc stalls) must fail the read, not
// wedge the kill chain.
const PS_TIMEOUT_MS = 5_000;

export function readProcessTable(): ProcessInfo[] {
	const result = spawnSync("ps", ["-axo", "pid=,ppid=,pgid="], {
		encoding: "utf8",
		timeout: PS_TIMEOUT_MS,
	});
	if (result.error || result.status !== 0) return [];
	return parseProcessTable(result.stdout);
}

export function parseProcessTable(stdout: string): ProcessInfo[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			const [pidText, ppidText, pgidText] = line.split(/\s+/);
			if (
				pidText === undefined ||
				ppidText === undefined ||
				pgidText === undefined
			) {
				return [];
			}
			const pid = Number(pidText);
			const ppid = Number(ppidText);
			const pgid = Number(pgidText);
			if (!isPositiveInteger(pid) || !Number.isInteger(ppid) || ppid < 0) {
				return [];
			}
			if (!isPositiveInteger(pgid)) return [];
			return [{ pid, ppid, pgid }];
		});
}

export function collectProcessTree(
	rootPid: number,
	table: ProcessInfo[],
): Set<number> {
	const pids = new Set<number>([rootPid]);
	const childrenByParent = new Map<number, ProcessInfo[]>();
	for (const row of table) {
		const children = childrenByParent.get(row.ppid) ?? [];
		children.push(row);
		childrenByParent.set(row.ppid, children);
	}

	const queue = [rootPid];
	for (const pid of queue) {
		for (const child of childrenByParent.get(pid) ?? []) {
			if (pids.has(child.pid)) continue;
			pids.add(child.pid);
			queue.push(child.pid);
		}
	}

	return pids;
}

export function getProcessGroupId(
	pid: number,
	table: ProcessInfo[],
): number | null {
	return table.find((row) => row.pid === pid)?.pgid ?? null;
}

export function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}
