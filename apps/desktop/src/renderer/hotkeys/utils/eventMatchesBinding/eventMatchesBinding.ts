/**
 * Normalizes `event.code` to the key names used in hotkey bindings
 * ("KeyP" -> "p", "Digit1" -> "1", "BracketLeft" -> "bracketleft").
 * Layout-independent, so it also matches chords whose `event.key` is a
 * symbol (Option+letter on macOS) or differs from the binding name.
 */
function normalizeEventCode(code: string): string {
	return code.replace(/^(Key|Digit)/, "").toLowerCase();
}

/** True when a KeyboardEvent is exactly the chord described by a binding like "meta+shift+p". */
export function eventMatchesBinding(
	event: KeyboardEvent,
	binding: string,
): boolean {
	const parts = binding.toLowerCase().split("+");
	const modifiers = new Set(parts.slice(0, -1));
	const key = parts[parts.length - 1];
	if (modifiers.has("meta") !== event.metaKey) return false;
	if (modifiers.has("ctrl") !== event.ctrlKey) return false;
	if (modifiers.has("alt") !== event.altKey) return false;
	if (modifiers.has("shift") !== event.shiftKey) return false;
	return (
		event.key.toLowerCase() === key || normalizeEventCode(event.code) === key
	);
}
