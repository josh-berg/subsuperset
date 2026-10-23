import { describe, expect, it } from "bun:test";
import {
	shouldVirtualizeDiff,
	VIRTUALIZE_DIFF_LINE_THRESHOLD,
} from "./shouldVirtualizeDiff";

const lines = (count: number) => `${"x\n".repeat(count - 1)}x`;

describe("shouldVirtualizeDiff", () => {
	it("leaves normal files fully rendered", () => {
		expect(shouldVirtualizeDiff(lines(200), lines(210))).toBe(false);
		expect(
			shouldVirtualizeDiff(
				lines(VIRTUALIZE_DIFF_LINE_THRESHOLD),
				lines(VIRTUALIZE_DIFF_LINE_THRESHOLD),
			),
		).toBe(false);
	});

	it("virtualizes when either side is over the threshold", () => {
		const big = lines(VIRTUALIZE_DIFF_LINE_THRESHOLD + 1);
		expect(shouldVirtualizeDiff("", big)).toBe(true);
		expect(shouldVirtualizeDiff(big, "")).toBe(true);
	});
});
