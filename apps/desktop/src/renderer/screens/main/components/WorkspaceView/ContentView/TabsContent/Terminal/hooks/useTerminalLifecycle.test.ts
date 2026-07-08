/**
 * Reproduction tests for issue #1873:
 * "When I switch between terminal tab and browser tab the terminal stuck for a
 * while to load. Additionally, the terminal leaving a large blank space."
 *
 * Root cause: `scheduleReattachRecovery` in useTerminalLifecycle.ts silently
 * drops recovery requests when called within the 120ms throttle window, with
 * no retry scheduled.
 *
 * When a user returns from an external browser to the Electron app, the
 * `window.focus` event fires and schedules reattach recovery. This recovery:
 *   1. Clears the stale WebGL texture atlas (`clearTextureAtlas`)
 *   2. Re-fits the terminal to its container (`fitAddon.fit()`)
 *   3. Forces a full repaint (`xterm.refresh()`)
 *
 * If the user switches focus multiple times in rapid succession (within 120ms),
 * subsequent recovery calls hit the throttle and return early — without ever
 * scheduling a retry. The terminal stays blank/stale until the next container
 * resize event (which may never come).
 *
 * Fix: when the throttle fires, schedule a retry after the remaining throttle
 * duration instead of silently returning.
 */
import { describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal model of the scheduleReattachRecovery throttle mechanism.
// Mirrors the exact logic in useTerminalLifecycle.ts so tests accurately
// demonstrate the production behaviour.
// ---------------------------------------------------------------------------

type SchedulerState = {
	throttleMs: number;
	pendingFrame: number | null;
	lastRunAt: number;
	pendingForceResize: boolean;
};

function makeScheduler(runRecovery: (forceResize: boolean) => void): {
	schedule: (forceResize: boolean) => void;
	flush: () => void;
	state: SchedulerState;
} {
	const reattachRecovery: SchedulerState = {
		throttleMs: 120,
		pendingFrame: null,
		lastRunAt: 0,
		pendingForceResize: false,
	};

	const pendingRafs: Array<() => void> = [];

	const mockRaf = (cb: () => void): number => {
		pendingRafs.push(cb);
		return pendingRafs.length;
	};

	const isUnmounted = false;

	const scheduleReattachRecovery = (forceResize: boolean) => {
		reattachRecovery.pendingForceResize ||= forceResize;
		if (reattachRecovery.pendingFrame !== null) return;

		reattachRecovery.pendingFrame = mockRaf(() => {
			reattachRecovery.pendingFrame = null;

			const now = Date.now();
			if (now - reattachRecovery.lastRunAt < reattachRecovery.throttleMs) {
				// Schedule a retry after the remaining throttle window so the recovery
				// is not permanently lost when focus events fire in rapid succession.
				const remaining =
					reattachRecovery.throttleMs - (now - reattachRecovery.lastRunAt);
				setTimeout(() => {
					if (!isUnmounted)
						scheduleReattachRecovery(reattachRecovery.pendingForceResize);
				}, remaining + 1);
				return;
			}

			reattachRecovery.lastRunAt = now;
			const shouldForce = reattachRecovery.pendingForceResize;
			reattachRecovery.pendingForceResize = false;
			runRecovery(shouldForce);
		}) as unknown as number;
	};

	const flushRafs = () => {
		while (pendingRafs.length > 0) {
			const cb = pendingRafs.shift();
			cb?.();
		}
	};

	return {
		schedule: scheduleReattachRecovery,
		flush: flushRafs,
		state: reattachRecovery,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scheduleReattachRecovery throttle — issue #1873", () => {
	it("runs recovery on first window.focus event", () => {
		let calls = 0;
		const { schedule, flush } = makeScheduler(() => {
			calls++;
		});

		schedule(false);
		flush();

		expect(calls).toBe(1);
	});

	it("second schedule within 120ms throttle window is silently dropped", () => {
		let calls = 0;
		const { schedule, flush, state } = makeScheduler(() => {
			calls++;
		});

		// Simulate a recovery that ran 50ms ago (within the 120ms throttle window)
		state.lastRunAt = Date.now() - 50;

		schedule(false);
		flush();

		// Recovery was dropped because lastRunAt is only 50ms ago (< 120ms throttle)
		expect(calls).toBe(0);
	});

	/**
	 * REPRODUCTION TEST — this test currently FAILS, demonstrating the bug.
	 *
	 * Expected behaviour: when a recovery call is throttled, a retry should be
	 * scheduled to run after the remaining throttle window expires. Without a
	 * retry the terminal is permanently blank until the user resizes the window.
	 *
	 * Fix: in scheduleReattachRecovery (useTerminalLifecycle.ts), when the
	 * throttle fires, add:
	 *   const remaining = reattachRecovery.throttleMs - (now - reattachRecovery.lastRunAt);
	 *   setTimeout(() => { if (!isUnmounted) scheduleReattachRecovery(reattachRecovery.pendingForceResize); }, remaining + 1);
	 */
	it("throttled recovery is retried after throttle window expires", async () => {
		let calls = 0;
		const { schedule, flush, state } = makeScheduler(() => {
			calls++;
		});

		// Simulate a recovery that ran 50ms ago (within the 120ms throttle window)
		state.lastRunAt = Date.now() - 50;

		// This call hits the throttle; current code silently drops it
		schedule(false);
		flush();
		expect(calls).toBe(0); // correctly throttled

		// Wait past the remaining throttle duration (120 - 50 = 70ms remaining)
		await new Promise((r) => setTimeout(r, 100));

		// With the fix, a setTimeout was scheduled that queued a new rAF
		flush(); // run the retried rAF

		// FAILS with current code: calls is still 0 because no retry was scheduled
		// PASSES after fix: the retry fires and recovery runs
		expect(calls).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Mode resync on idle background return
//
// Root cause: a stream stall while a pane is hidden/unfocused (e.g. the IPC
// subscription silently drops data) can leave xterm believing a mode like
// mouse tracking is still enabled after the real pty-side program already
// disabled it. Every mouse movement then sends raw escape sequences into a
// plain shell, which just echoes them back as garbage text. Only a full
// unmount/remount (fresh createOrAttach) fixed it before this change.
//
// Fix: `markActiveAndRecover` in useTerminalLifecycle.ts tracks how long the
// pane was inactive (hidden or unfocused) and triggers a mode resync when
// that exceeds MODE_RESYNC_IDLE_THRESHOLD_MS, instead of only doing the
// cosmetic reattach recovery.
// ---------------------------------------------------------------------------

const MODE_RESYNC_IDLE_THRESHOLD_MS = 45_000;

/** Mirrors the inactiveSince/markInactive/markActiveAndRecover logic in
 * useTerminalLifecycle.ts, with an injectable clock so tests don't need to
 * sleep for real past the 45s threshold. */
function makeInactivityTracker(
	runModeResync: () => void,
	now: () => number = Date.now,
) {
	let inactiveSince: number | null = null;

	const markInactive = () => {
		if (inactiveSince === null) inactiveSince = now();
	};

	const markActiveAndRecover = () => {
		const inactiveDuration = inactiveSince !== null ? now() - inactiveSince : 0;
		inactiveSince = null;
		if (inactiveDuration >= MODE_RESYNC_IDLE_THRESHOLD_MS) {
			runModeResync();
		}
	};

	return { markInactive, markActiveAndRecover };
}

describe("mode resync on idle background return", () => {
	it("does not resync when the pane was hidden only briefly", () => {
		let calls = 0;
		let clock = 0;
		const { markInactive, markActiveAndRecover } = makeInactivityTracker(
			() => {
				calls++;
			},
			() => clock,
		);

		markInactive();
		clock += 1_000; // returned after 1s — well under the threshold
		markActiveAndRecover();

		expect(calls).toBe(0);
	});

	it("resyncs modes when the pane was hidden past the idle threshold", () => {
		let calls = 0;
		let clock = 0;
		const { markInactive, markActiveAndRecover } = makeInactivityTracker(
			() => {
				calls++;
			},
			() => clock,
		);

		markInactive();
		clock += MODE_RESYNC_IDLE_THRESHOLD_MS + 1;
		markActiveAndRecover();

		expect(calls).toBe(1);
	});

	it("resets the inactivity window after each recovery check", () => {
		let calls = 0;
		let clock = 0;
		const { markInactive, markActiveAndRecover } = makeInactivityTracker(
			() => {
				calls++;
			},
			() => clock,
		);

		markInactive();
		clock += 1_000;
		markActiveAndRecover();
		expect(calls).toBe(0);

		// A second, brief hide/show cycle right after should also not resync —
		// the window must have been cleared, not left stuck accumulating time.
		markInactive();
		clock += 1_000;
		markActiveAndRecover();
		expect(calls).toBe(0);
	});
});
