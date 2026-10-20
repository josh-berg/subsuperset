import { describe, expect, it } from "bun:test";
import {
	MAX_PARKED_TERMINALS,
	type ParkedTerminal,
	selectParkedEvictions,
} from "./v1-terminal-eviction";

const parked = (
	paneId: string,
	parkedAt: number,
	exempt = false,
): ParkedTerminal => ({ paneId, parkedAt, exempt });

describe("selectParkedEvictions", () => {
	it("evicts nothing at or under the cap", () => {
		const entries = Array.from({ length: MAX_PARKED_TERMINALS }, (_, i) =>
			parked(`p${i}`, i),
		);
		expect(selectParkedEvictions(entries)).toEqual([]);
	});

	it("evicts the least recently parked first", () => {
		const entries = [parked("c", 30), parked("a", 10), parked("b", 20)];
		expect(selectParkedEvictions(entries, 1)).toEqual(["a", "b"]);
	});

	it("skips exempt entries and never evicts them", () => {
		const entries = [
			parked("tui", 1, true),
			parked("a", 10),
			parked("b", 20),
			parked("c", 30),
		];
		expect(selectParkedEvictions(entries, 2)).toEqual(["a", "b"]);
	});

	it("stays over the cap rather than evicting exempt entries", () => {
		const entries = [
			parked("x", 1, true),
			parked("y", 2, true),
			parked("z", 3),
		];
		expect(selectParkedEvictions(entries, 1)).toEqual(["z"]);
	});

	it("does not mutate its input", () => {
		const entries = [parked("b", 2), parked("a", 1)];
		selectParkedEvictions(entries, 1);
		expect(entries.map((e) => e.paneId)).toEqual(["b", "a"]);
	});
});
