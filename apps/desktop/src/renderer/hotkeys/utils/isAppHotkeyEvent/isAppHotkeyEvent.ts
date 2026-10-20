import { getBinding } from "../../hooks/useBinding";
import { HOTKEYS, type HotkeyId } from "../../registry";
import { eventMatchesBinding } from "../eventMatchesBinding";

const HOTKEY_IDS = Object.keys(HOTKEYS) as HotkeyId[];

/**
 * True when the event is a chord currently bound to an app hotkey (user
 * overrides included). Used by the terminal so only registered chords bubble
 * to the app and everything else (Ctrl+R, Ctrl+L, ...) reaches the TUI.
 */
export function isAppHotkeyEvent(event: KeyboardEvent): boolean {
	for (const id of HOTKEY_IDS) {
		const binding = getBinding(id);
		if (binding && eventMatchesBinding(event, binding)) return true;
	}
	return false;
}
