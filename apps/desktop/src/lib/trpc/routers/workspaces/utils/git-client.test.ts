import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

mock.module("./shell-env", () => ({
	getProcessEnvWithShellPath: async (
		base: NodeJS.ProcessEnv = process.env,
	) => ({
		...base,
	}),
}));

const { execGitWithShellPath, getSimpleGitWithShellPath } = await import(
	"./git-client"
);

describe("git client path quoting", () => {
	let repo: string;

	beforeEach(() => {
		repo = mkdtempSync(path.join(tmpdir(), "git-client-"));
		const run = (...args: string[]) =>
			execFileSync("git", args, { cwd: repo, stdio: "ignore" });
		run("init", "-q");
		writeFileSync(path.join(repo, "é文.txt"), "a\n");
		run("add", ".");
		run("-c", "user.email=a@b.c", "-c", "user.name=n", "commit", "-qm", "init");
		writeFileSync(path.join(repo, "é文.txt"), "a\nb\n");
	});

	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	it("simple-git reports non-ASCII paths unquoted", async () => {
		const git = await getSimpleGitWithShellPath(repo);
		const out = await git.raw(["diff", "--name-status", "HEAD"]);
		expect(out.trim()).toBe("M\té文.txt");
	});

	it("execGitWithShellPath reports non-ASCII paths unquoted", async () => {
		const { stdout } = await execGitWithShellPath(["status", "--porcelain"], {
			cwd: repo,
		});
		expect(stdout.trim()).toBe("M é文.txt");
	});
});
