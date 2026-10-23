import { describe, expect, it } from "bun:test";
import { findLineMatches, MAX_LINE_MATCHES } from "./findLineMatches";

describe("findLineMatches", () => {
	it("finds every occurrence with line and column", () => {
		expect(findLineMatches("foo bar\nbaz foo foo", "foo", true)).toEqual([
			{ line: 1, start: 0, length: 3 },
			{ line: 2, start: 4, length: 3 },
			{ line: 2, start: 8, length: 3 },
		]);
	});

	it("respects case sensitivity", () => {
		expect(findLineMatches("Foo\nfoo", "foo", true)).toHaveLength(1);
		expect(findLineMatches("Foo\nfoo", "foo", false)).toHaveLength(2);
	});

	it("returns nothing for an empty query and caps runaway matches", () => {
		expect(findLineMatches("abc", "", false)).toEqual([]);
		const many = "a\n".repeat(MAX_LINE_MATCHES + 50);
		expect(findLineMatches(many, "a", true)).toHaveLength(MAX_LINE_MATCHES);
	});
});
