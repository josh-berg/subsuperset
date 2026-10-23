import { describe, expect, test } from "bun:test";
import { trimTerminalSelection } from "./trim-terminal-selection";

describe("trimTerminalSelection", () => {
	test("trims trailing spaces per line", () => {
		expect(trimTerminalSelection("a   \nb  ")).toBe("a\nb");
	});

	test("drops trailing blank lines but keeps interior ones", () => {
		expect(trimTerminalSelection("a\n\nb\n\n  \n")).toBe("a\n\nb");
	});

	test("keeps leading indentation", () => {
		expect(trimTerminalSelection("  a  ")).toBe("  a");
	});
});
