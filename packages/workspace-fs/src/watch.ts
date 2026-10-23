import { stat } from "node:fs/promises";
import path from "node:path";
import {
	type AsyncSubscription,
	type Event as ParcelWatcherEvent,
	subscribe as subscribeToFilesystem,
} from "@parcel/watcher";
import { toErrorMessage } from "./error-message";
import { findNestedRepoRoots } from "./find-nested-repos";
import { normalizeAbsolutePath } from "./paths";
import {
	DEFAULT_IGNORE_DIR_NAMES,
	DEFAULT_IGNORE_PATTERNS,
	invalidateSearchIndexesForRoot,
	patchSearchIndexesForRoot,
	type SearchPatchEvent,
} from "./search";
import type { FsWatchEvent } from "./types";

export interface WatchPathOptions {
	absolutePath: string;
	recursive?: boolean;
}

export interface InternalWatchEvent {
	kind: "create" | "update" | "delete" | "rename" | "overflow";
	absolutePath: string;
	oldAbsolutePath?: string;
	isDirectory: boolean;
}

// Backslash-escape characters picomatch treats as magic so a path is matched
// literally when embedded in an ignore glob.
function escapeGlobMagic(input: string): string {
	return input.replace(/[\\*?{}()[\]!+@|^$]/g, (char) => `\\${char}`);
}

// Bounds attach latency on a slow FS; the static ignore globs still cover the
// known worktree conventions if the scan truncates.
const NESTED_REPO_SCAN_DEADLINE_MS = 3_000;

// FSEvents overflow rescan pacing. Reacting to every overflow cancels search
// index rebuilds and refetches consumers repeatedly under sustained churn.
// Coalesce per root into one trailing rescan, double the window while
// overflows keep arriving, and reset after a quiet period. A hard deadline
// guarantees a rescan at least every OVERFLOW_RESCAN_MAX_MS.
const OVERFLOW_RESCAN_INITIAL_MS = 5_000;
const OVERFLOW_RESCAN_MAX_MS = 60_000;
const OVERFLOW_BACKOFF_RESET_MS = 120_000;

const SLOW_NATIVE_OPERATION_MS = 10_000;

// parcel shares one native backend per process. A subscribe issued while the
// last unsubscribe is in flight joins a backend that is then destroyed, so it
// resolves but never delivers. Run native calls one at a time.
let nativeOperationTail: Promise<unknown> = Promise.resolve();

function runNativeOperation<T>(
	kind: "subscribe" | "unsubscribe",
	rootPath: string,
	operation: () => Promise<T>,
): Promise<T> {
	const result = nativeOperationTail.then(async () => {
		const startedAt = Date.now();
		const slowTimer = setTimeout(() => {
			console.warn(
				"[workspace-fs/watch] native watcher call is stuck; later watches wait behind it",
				{ kind, rootPath, elapsedMs: Date.now() - startedAt },
			);
		}, SLOW_NATIVE_OPERATION_MS);
		slowTimer.unref?.();
		try {
			return await operation();
		} finally {
			clearTimeout(slowTimer);
		}
	});
	nativeOperationTail = result.catch(() => {});
	return result;
}

type WatchListener = (batch: { events: FsWatchEvent[] }) => void;

interface WatcherState {
	absolutePath: string;
	subscription: AsyncSubscription;
	listeners: Set<WatchListener>;
	pathTypes: Map<string, boolean>;
	pendingEvents: ParcelWatcherEvent[];
	flushTimer: ReturnType<typeof setTimeout> | null;
	overflowRescanTimer: ReturnType<typeof setTimeout> | null;
	overflowRescanDeadline: number;
	overflowRescanDelayMs: number;
	lastOverflowAt: number;
}

function coalesceWatchEvent(
	current: ParcelWatcherEvent | undefined,
	next: ParcelWatcherEvent,
): ParcelWatcherEvent | null {
	if (!current) {
		return next;
	}

	if (current.type === "create") {
		if (next.type === "delete") {
			return null;
		}
		return current;
	}

	if (current.type === "update") {
		if (next.type === "delete") {
			return next;
		}
		if (next.type === "create") {
			return {
				type: "update",
				path: next.path,
			};
		}
		return current;
	}

	if (next.type === "create") {
		return {
			type: "update",
			path: next.path,
		};
	}

	return next;
}

export function coalesceWatchEvents(
	events: ParcelWatcherEvent[],
): ParcelWatcherEvent[] {
	const coalescedByPath = new Map<string, ParcelWatcherEvent>();

	for (const event of events) {
		const nextEvent = coalesceWatchEvent(
			coalescedByPath.get(event.path),
			event,
		);
		if (nextEvent) {
			coalescedByPath.set(event.path, nextEvent);
			continue;
		}
		coalescedByPath.delete(event.path);
	}

	return Array.from(coalescedByPath.values());
}

function getParentPath(absolutePath: string): string {
	return normalizeAbsolutePath(path.dirname(absolutePath));
}

function getBaseName(absolutePath: string): string {
	return path.basename(absolutePath);
}

interface RenameCandidate {
	kind: "create" | "delete";
	absolutePath: string;
	isDirectory: boolean;
	index: number;
}

function pairRenameCandidates(
	deletes: RenameCandidate[],
	creates: RenameCandidate[],
): Array<{
	deleteCandidate: RenameCandidate;
	createCandidate: RenameCandidate;
}> {
	const pairs: Array<{
		deleteCandidate: RenameCandidate;
		createCandidate: RenameCandidate;
	}> = [];
	const usedDeleteIndexes = new Set<number>();
	const usedCreateIndexes = new Set<number>();

	const collectUniquePairs = (
		keySelector: (candidate: RenameCandidate) => string,
	): void => {
		const deletesByKey = new Map<string, RenameCandidate[]>();
		const createsByKey = new Map<string, RenameCandidate[]>();

		for (const candidate of deletes) {
			if (usedDeleteIndexes.has(candidate.index)) {
				continue;
			}
			const key = keySelector(candidate);
			const group = deletesByKey.get(key);
			if (group) {
				group.push(candidate);
			} else {
				deletesByKey.set(key, [candidate]);
			}
		}

		for (const candidate of creates) {
			if (usedCreateIndexes.has(candidate.index)) {
				continue;
			}
			const key = keySelector(candidate);
			const group = createsByKey.get(key);
			if (group) {
				group.push(candidate);
			} else {
				createsByKey.set(key, [candidate]);
			}
		}

		for (const [key, deleteGroup] of deletesByKey.entries()) {
			const createGroup = createsByKey.get(key);
			if (
				!createGroup ||
				deleteGroup.length !== 1 ||
				createGroup.length !== 1
			) {
				continue;
			}

			const deleteCandidate = deleteGroup[0];
			const createCandidate = createGroup[0];
			if (!deleteCandidate || !createCandidate) {
				continue;
			}
			usedDeleteIndexes.add(deleteCandidate.index);
			usedCreateIndexes.add(createCandidate.index);
			pairs.push({ deleteCandidate, createCandidate });
		}
	};

	collectUniquePairs(
		(candidate) =>
			`${candidate.isDirectory ? "dir" : "file"}::parent::${getParentPath(candidate.absolutePath)}`,
	);
	collectUniquePairs(
		(candidate) =>
			`${candidate.isDirectory ? "dir" : "file"}::basename::${getBaseName(candidate.absolutePath)}`,
	);

	const remainingDeletes = deletes.filter(
		(candidate) => !usedDeleteIndexes.has(candidate.index),
	);
	const remainingCreates = creates.filter(
		(candidate) => !usedCreateIndexes.has(candidate.index),
	);
	const remainingDelete = remainingDeletes[0];
	const remainingCreate = remainingCreates[0];

	if (
		remainingDeletes.length === 1 &&
		remainingCreates.length === 1 &&
		remainingDelete &&
		remainingCreate &&
		remainingDelete.isDirectory === remainingCreate.isDirectory
	) {
		pairs.push({
			deleteCandidate: remainingDelete,
			createCandidate: remainingCreate,
		});
	}

	return pairs;
}

export function reconcileRenameEvents(
	events: InternalWatchEvent[],
): InternalWatchEvent[] {
	const deletes: RenameCandidate[] = [];
	const creates: RenameCandidate[] = [];

	for (const [index, event] of events.entries()) {
		if (event.kind === "delete") {
			deletes.push({
				index,
				kind: "delete",
				absolutePath: event.absolutePath,
				isDirectory: event.isDirectory,
			});
		} else if (event.kind === "create") {
			creates.push({
				index,
				kind: "create",
				absolutePath: event.absolutePath,
				isDirectory: event.isDirectory,
			});
		}
	}

	if (deletes.length === 0 || creates.length === 0) {
		return events;
	}

	const pairs = pairRenameCandidates(deletes, creates);
	if (pairs.length === 0) {
		return events;
	}

	const renameByCreateIndex = new Map<number, InternalWatchEvent>();
	const consumedIndexes = new Set<number>();

	for (const { deleteCandidate, createCandidate } of pairs) {
		consumedIndexes.add(deleteCandidate.index);
		consumedIndexes.add(createCandidate.index);
		renameByCreateIndex.set(createCandidate.index, {
			kind: "rename",
			oldAbsolutePath: deleteCandidate.absolutePath,
			absolutePath: createCandidate.absolutePath,
			isDirectory: createCandidate.isDirectory,
		});
	}

	const reconciled: InternalWatchEvent[] = [];
	for (const [index, event] of events.entries()) {
		const renameEvent = renameByCreateIndex.get(index);
		if (renameEvent) {
			reconciled.push(renameEvent);
			continue;
		}

		if (consumedIndexes.has(index)) {
			continue;
		}

		reconciled.push(event);
	}

	return reconciled;
}

function internalToFsWatchEvent(event: InternalWatchEvent): FsWatchEvent {
	return {
		kind: event.kind,
		absolutePath: event.absolutePath,
		oldAbsolutePath: event.oldAbsolutePath,
		isDirectory: event.isDirectory,
	};
}

function internalToSearchPatchEvent(
	event: InternalWatchEvent,
): SearchPatchEvent | null {
	if (event.kind === "overflow") {
		return null;
	}
	return {
		kind: event.kind,
		absolutePath: event.absolutePath,
		oldAbsolutePath: event.oldAbsolutePath,
		isDirectory: event.isDirectory,
	};
}

export interface FsWatcherManagerOptions {
	debounceMs?: number;
	ignore?: string[];
	/** Overflow rescan pacing. Test-only overrides. */
	overflowRescanInitialMs?: number;
	overflowRescanMaxMs?: number;
	overflowBackoffResetMs?: number;
}

export class FsWatcherManager {
	private readonly debounceMs: number;
	private readonly ignore: string[];
	private readonly overflowRescanInitialMs: number;
	private readonly overflowRescanMaxMs: number;
	private readonly overflowBackoffResetMs: number;
	private readonly watchers = new Map<string, WatcherState>();

	constructor(options: FsWatcherManagerOptions = {}) {
		this.overflowRescanInitialMs =
			options.overflowRescanInitialMs ?? OVERFLOW_RESCAN_INITIAL_MS;
		this.overflowRescanMaxMs =
			options.overflowRescanMaxMs ?? OVERFLOW_RESCAN_MAX_MS;
		this.overflowBackoffResetMs =
			options.overflowBackoffResetMs ?? OVERFLOW_BACKOFF_RESET_MS;
		this.debounceMs = options.debounceMs ?? 75;
		this.ignore = options.ignore ?? DEFAULT_IGNORE_PATTERNS;
	}

	async subscribe(
		options: WatchPathOptions,
		listener: WatchListener,
	): Promise<() => Promise<void>> {
		const absolutePath = normalizeAbsolutePath(options.absolutePath);
		let state = this.watchers.get(absolutePath);

		if (!state) {
			state = await this.createWatcher(absolutePath);
			this.watchers.set(absolutePath, state);
		}

		state.listeners.add(listener);

		return async () => {
			const currentState = this.watchers.get(absolutePath);
			if (!currentState) {
				return;
			}

			currentState.listeners.delete(listener);
			if (currentState.listeners.size > 0) {
				return;
			}

			if (currentState.flushTimer) {
				clearTimeout(currentState.flushTimer);
				currentState.flushTimer = null;
			}

			this.clearOverflowRescan(currentState);
			await this.unsubscribeNative(currentState);
			this.watchers.delete(absolutePath);
		};
	}

	async close(): Promise<void> {
		await Promise.all(
			Array.from(this.watchers.values()).map(async (state) => {
				if (state.flushTimer) {
					clearTimeout(state.flushTimer);
					state.flushTimer = null;
				}
				this.clearOverflowRescan(state);
				await this.unsubscribeNative(state);
			}),
		);
		this.watchers.clear();
	}

	private async createWatcher(absolutePath: string): Promise<WatcherState> {
		const state: WatcherState = {
			absolutePath: normalizeAbsolutePath(absolutePath),
			subscription: null as unknown as AsyncSubscription,
			listeners: new Set<WatchListener>(),
			pathTypes: new Map<string, boolean>(),
			pendingEvents: [],
			flushTimer: null,
			overflowRescanTimer: null,
			overflowRescanDeadline: 0,
			overflowRescanDelayMs: this.overflowRescanInitialMs,
			lastOverflowAt: 0,
		};

		try {
			const rootStats = await stat(state.absolutePath);
			if (!rootStats.isDirectory()) {
				throw new Error(
					`Cannot watch path: path is not a directory: ${state.absolutePath}`,
				);
			}
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				((error as NodeJS.ErrnoException).code === "ENOENT" ||
					(error as NodeJS.ErrnoException).code === "ENOTDIR")
			) {
				throw new Error(
					`Cannot watch path: path does not exist: ${state.absolutePath}`,
				);
			}
			throw error;
		}

		const nestedRepoIgnores = await this.computeNestedRepoIgnores(
			state.absolutePath,
		);

		state.subscription = await runNativeOperation(
			"subscribe",
			state.absolutePath,
			() =>
				subscribeToFilesystem(
					state.absolutePath,
					(error, events) => {
						if (error) {
							console.error("[workspace-fs/watch] Watcher error:", {
								absolutePath: state.absolutePath,
								error: toErrorMessage(error),
							});
							this.scheduleOverflowRescan(state);
							return;
						}

						if (events.length === 0) {
							return;
						}

						// Not push(...events): a huge batch overflows the call stack.
						for (const event of events) state.pendingEvents.push(event);
						if (state.flushTimer) {
							return;
						}

						const flushTimer = setTimeout(() => {
							state.flushTimer = null;
							const pendingEvents = state.pendingEvents.splice(
								0,
								state.pendingEvents.length,
							);
							void this.flushPendingEvents(state, pendingEvents);
						}, this.debounceMs);
						state.flushTimer = flushTimer;
						flushTimer.unref?.();
					},
					{
						ignore: [...this.ignore, ...nestedRepoIgnores],
					},
				),
		);

		return state;
	}

	/** Best-effort: a failed or truncated scan just watches more than ideal. */
	private async computeNestedRepoIgnores(rootPath: string): Promise<string[]> {
		try {
			const { roots, truncated } = await findNestedRepoRoots(rootPath, {
				pruneDirNames: DEFAULT_IGNORE_DIR_NAMES,
				deadlineMs: NESTED_REPO_SCAN_DEADLINE_MS,
			});
			if (truncated) {
				console.warn(
					"[workspace-fs/watch] nested-repo scan hit cap; some nested repos may still be watched",
					{ absolutePath: rootPath, found: roots.length },
				);
			}
			// parcel matches ignore globs relative to the watch root.
			return roots.map(
				(root) => `${escapeGlobMagic(path.relative(rootPath, root))}/**`,
			);
		} catch (error) {
			console.error("[workspace-fs/watch] nested-repo scan failed", {
				absolutePath: rootPath,
				error: toErrorMessage(error),
			});
			return [];
		}
	}

	private unsubscribeNative(state: WatcherState): Promise<void> {
		return runNativeOperation("unsubscribe", state.absolutePath, () =>
			state.subscription.unsubscribe(),
		);
	}

	private clearOverflowRescan(state: WatcherState): void {
		if (state.overflowRescanTimer) {
			clearTimeout(state.overflowRescanTimer);
			state.overflowRescanTimer = null;
		}
	}

	/**
	 * The rescan trails the last overflow of a storm: overflows only stamp
	 * `lastOverflowAt`, and the armed timer re-checks at fire time, pushing
	 * itself out if an overflow landed inside its window.
	 */
	private scheduleOverflowRescan(state: WatcherState): void {
		const now = Date.now();
		if (now - state.lastOverflowAt >= this.overflowBackoffResetMs) {
			state.overflowRescanDelayMs = this.overflowRescanInitialMs;
		}
		state.lastOverflowAt = now;
		if (state.overflowRescanTimer) {
			return;
		}
		state.overflowRescanDeadline = now + this.overflowRescanMaxMs;
		this.armOverflowRescan(state, now + state.overflowRescanDelayMs);
	}

	private armOverflowRescan(state: WatcherState, fireAt: number): void {
		const delayMs = Math.max(
			0,
			Math.min(fireAt, state.overflowRescanDeadline) - Date.now(),
		);
		const timer = setTimeout(() => {
			state.overflowRescanTimer = null;
			this.performOverflowRescan(state);
		}, delayMs);
		timer.unref?.();
		state.overflowRescanTimer = timer;
	}

	private performOverflowRescan(state: WatcherState): void {
		if (this.watchers.get(state.absolutePath) !== state) {
			return;
		}
		const now = Date.now();
		const windowMs = state.overflowRescanDelayMs;
		const trailingFireAt = state.lastOverflowAt + windowMs;
		if (now < trailingFireAt && now < state.overflowRescanDeadline) {
			this.armOverflowRescan(state, trailingFireAt);
			return;
		}
		state.overflowRescanDelayMs = Math.min(
			windowMs * 2,
			this.overflowRescanMaxMs,
		);
		console.error("[workspace-fs/watch] FSEvents overflow rescan:", {
			absolutePath: state.absolutePath,
		});
		// Dropped events mean the patch-maintained index can't be trusted.
		invalidateSearchIndexesForRoot(state.absolutePath);
		this.emit(state, {
			events: [{ kind: "overflow", absolutePath: state.absolutePath }],
		});
		// A deadline-forced fire mid-storm hasn't seen the fs settle; keep the
		// trailing guarantee with a follow-up batch.
		if (now - state.lastOverflowAt < windowMs) {
			state.overflowRescanDeadline = now + this.overflowRescanMaxMs;
			this.armOverflowRescan(state, now + state.overflowRescanDelayMs);
		}
	}

	private async flushPendingEvents(
		state: WatcherState,
		events: ParcelWatcherEvent[],
	): Promise<void> {
		if (events.length === 0) {
			return;
		}

		const coalescedEvents = coalesceWatchEvents(events);
		if (coalescedEvents.length === 0) {
			return;
		}

		const internalEvents = await Promise.all(
			coalescedEvents.map((event) => this.normalizeEvent(state, event)),
		);
		const reconciledEvents = reconcileRenameEvents(internalEvents);

		const searchPatchEvents = reconciledEvents
			.map(internalToSearchPatchEvent)
			.filter((e): e is SearchPatchEvent => e !== null);
		patchSearchIndexesForRoot(state.absolutePath, searchPatchEvents);

		const publicEvents = reconciledEvents.map(internalToFsWatchEvent);
		this.emit(state, { events: publicEvents });
	}

	private async normalizeEvent(
		state: WatcherState,
		event: ParcelWatcherEvent,
	): Promise<InternalWatchEvent> {
		const absolutePath = normalizeAbsolutePath(event.path);
		let isDirectory = state.pathTypes.get(absolutePath) ?? false;

		if (event.type === "delete") {
			state.pathTypes.delete(absolutePath);
		} else {
			try {
				const stats = await stat(absolutePath);
				isDirectory = stats.isDirectory();
				state.pathTypes.set(absolutePath, isDirectory);
			} catch {
				isDirectory = state.pathTypes.get(absolutePath) ?? false;
			}
		}

		return {
			kind: event.type,
			absolutePath,
			isDirectory,
		};
	}

	private emit(state: WatcherState, batch: { events: FsWatchEvent[] }): void {
		for (const listener of state.listeners) {
			listener(batch);
		}
	}
}
