import { describe, expect, it } from "bun:test";
import { eventMatchesBinding } from "./eventMatchesBinding";

function keyEvent(init: Partial<KeyboardEvent>): KeyboardEvent {
	return {
		key: "",
		code: "",
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...init,
	} as KeyboardEvent;
}

describe("eventMatchesBinding", () => {
	it("matches a simple chord by key", () => {
		const event = keyEvent({ key: "p", code: "KeyP", metaKey: true });
		expect(eventMatchesBinding(event, "meta+p")).toBe(true);
	});

	it("requires modifiers to match exactly", () => {
		const event = keyEvent({
			key: "p",
			code: "KeyP",
			metaKey: true,
			shiftKey: true,
		});
		expect(eventMatchesBinding(event, "meta+p")).toBe(false);
		expect(eventMatchesBinding(event, "meta+shift+p")).toBe(true);
	});

	it("matches named keys through event.code", () => {
		const event = keyEvent({
			key: "[",
			code: "BracketLeft",
			metaKey: true,
		});
		expect(eventMatchesBinding(event, "meta+bracketleft")).toBe(true);
	});

	it("matches digits through event.code when shift changes event.key", () => {
		const event = keyEvent({
			key: "!",
			code: "Digit1",
			ctrlKey: true,
			shiftKey: true,
		});
		expect(eventMatchesBinding(event, "ctrl+shift+1")).toBe(true);
	});

	it("does not match unrelated chords", () => {
		const event = keyEvent({ key: "r", code: "KeyR", ctrlKey: true });
		expect(eventMatchesBinding(event, "ctrl+l")).toBe(false);
	});
});
