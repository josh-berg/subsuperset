import type { ITerminalOptions } from "@xterm/xterm";
import {
	DEFAULT_TERMINAL_FONT_FAMILY as SHARED_DEFAULT_TERMINAL_FONT_FAMILY,
	DEFAULT_TERMINAL_FONT_SIZE as SHARED_DEFAULT_TERMINAL_FONT_SIZE,
} from "renderer/lib/terminal/appearance";
import { DEFAULT_TERMINAL_SCROLLBACK } from "shared/constants";

// Use user's theme
export const TERMINAL_THEME: ITerminalOptions["theme"] = undefined;

// Fallback timeout for first render (in case xterm doesn't emit onRender)
export const FIRST_RENDER_RESTORE_FALLBACK_MS = 250;

// If a pane was hidden/backgrounded for at least this long, a stream stall
// (e.g. IPC subscription silently dying while backgrounded) could have let
// the daemon's real terminal modes (mouse tracking, bracketed paste, etc.)
// drift from what the renderer's xterm instance still thinks is active.
// On visibility/focus regain past this threshold we re-fetch the daemon's
// mode state and correct xterm rather than only re-rendering cosmetically.
export const MODE_RESYNC_IDLE_THRESHOLD_MS = 45_000;

// Debug logging for terminal lifecycle (enable via localStorage)
// Run in DevTools console: localStorage.setItem('SUPERSET_TERMINAL_DEBUG', '1')
export const DEBUG_TERMINAL =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

// Shared terminal font defaults are serialized as a valid CSS font-family value.
export const DEFAULT_TERMINAL_FONT_FAMILY = SHARED_DEFAULT_TERMINAL_FONT_FAMILY;

export const DEFAULT_TERMINAL_FONT_SIZE = SHARED_DEFAULT_TERMINAL_FONT_SIZE;

export const TERMINAL_OPTIONS: ITerminalOptions = {
	cursorBlink: true,
	fontSize: DEFAULT_TERMINAL_FONT_SIZE,
	fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
	theme: TERMINAL_THEME,
	allowProposedApi: true,
	scrollback: DEFAULT_TERMINAL_SCROLLBACK,
	// Allow Option+key to type special characters on international keyboards (e.g., Option+2 = @)
	macOptionIsMeta: false,
	cursorStyle: "block",
	cursorInactiveStyle: "outline",
	screenReaderMode: false,
	// xterm's fit addon permanently reserves scrollbar width from usable columns.
	// Hide the built-in scrollbar so terminal content can use the full pane width.
	scrollbar: {
		showScrollbar: false,
	},
};

export const RESIZE_DEBOUNCE_MS = 150;
