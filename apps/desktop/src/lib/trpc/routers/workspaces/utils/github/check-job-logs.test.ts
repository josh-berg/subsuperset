import { describe, expect, test } from "bun:test";
import { parseActionsJobUrl } from "./check-job-logs";

describe("parseActionsJobUrl", () => {
	test("parses a GitHub Actions job URL", () => {
		expect(
			parseActionsJobUrl("https://github.com/hudl/repo/actions/runs/12/job/34"),
		).toEqual({ nwo: "hudl/repo", jobId: "34" });
	});

	test("rejects run-only, other hosts and garbage", () => {
		expect(
			parseActionsJobUrl("https://github.com/hudl/repo/actions/runs/12"),
		).toBeNull();
		expect(
			parseActionsJobUrl("https://evil.test/hudl/repo/actions/runs/1/job/2"),
		).toBeNull();
		expect(parseActionsJobUrl("nope")).toBeNull();
	});
});
