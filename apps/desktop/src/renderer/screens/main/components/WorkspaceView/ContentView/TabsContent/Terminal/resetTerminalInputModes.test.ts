/**
 * Regression test for the "mouse movement spews garbage after cold restore" bug.
 *
 * Cold restore replays the previous session's raw output stream as scrollback.
 * If that session ended uncleanly with a mouse-tracking TUI (e.g. Claude) still
 * up, the replayed stream enables mouse tracking on the fresh xterm but never
 * disables it. Starting a plain shell under that xterm makes every mouse move
 * send raw mouse-report sequences into the shell's stdin, which it echoes back
 * as garbage like `35;88;43M35;85;43M…`.
 *
 * The fix writes INPUT_MODE_RESET_SEQUENCE to xterm before attaching the fresh
 * process. This test proves that sequence actually turns the input-affecting
 * private modes back off, verified against a real terminal parser
 * (@xterm/headless), not just a string comparison.
 */
// @xterm/headless references `window` at module load; the polyfill that guards
// it is preloaded via apps/desktop/bunfig.toml (run tests from apps/desktop).

import { describe, expect, it } from "bun:test";
import { Terminal } from "@xterm/headless";
import { INPUT_MODE_RESET_SEQUENCE } from "./helpers";

function write(term: Terminal, data: string): Promise<void> {
	return new Promise((resolve) => term.write(data, () => resolve()));
}

describe("INPUT_MODE_RESET_SEQUENCE", () => {
	it("disables mouse tracking, bracketed paste, and focus reporting", async () => {
		const term = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });

		// Simulate the replayed scrollback from a mouse-tracking TUI session.
		await write(term, "\x1b[?1002h\x1b[?1006h\x1b[?2004h\x1b[?1004h\x1b[?1h");
		expect(term.modes.mouseTrackingMode).not.toBe("none");
		expect(term.modes.bracketedPasteMode).toBe(true);
		expect(term.modes.sendFocusMode).toBe(true);
		expect(term.modes.applicationCursorKeysMode).toBe(true);

		// Applying the reset sequence must return every mode to its default.
		await write(term, INPUT_MODE_RESET_SEQUENCE);
		expect(term.modes.mouseTrackingMode).toBe("none");
		expect(term.modes.bracketedPasteMode).toBe(false);
		expect(term.modes.sendFocusMode).toBe(false);
		expect(term.modes.applicationCursorKeysMode).toBe(false);

		term.dispose();
	});

	it("also clears any-event (motion) mouse tracking — the mode Claude uses", async () => {
		const term = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });

		await write(term, "\x1b[?1003h\x1b[?1006h");
		expect(term.modes.mouseTrackingMode).toBe("any");

		await write(term, INPUT_MODE_RESET_SEQUENCE);
		expect(term.modes.mouseTrackingMode).toBe("none");

		term.dispose();
	});
});
