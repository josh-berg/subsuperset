import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { promisify } from "node:util";
import simpleGit, { type SimpleGit } from "simple-git";
import { getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

// Without this git prints non-ASCII paths as quoted octal escapes
// ("\303\251.txt"), which the name-status/porcelain parsers would take
// literally.
const GIT_QUOTE_PATH_CONFIG = "core.quotePath=false";

export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	const git = simpleGit({
		...(repoPath ? { baseDir: repoPath } : {}),
		config: [GIT_QUOTE_PATH_CONFIG],
	});
	git.env(await getProcessEnvWithShellPath());
	return git;
}

export async function execGitWithShellPath(
	args: string[],
	options?: Omit<ExecFileOptionsWithStringEncoding, "encoding">,
): Promise<{ stdout: string; stderr: string }> {
	const env = await getProcessEnvWithShellPath(
		options?.env ? { ...process.env, ...options.env } : process.env,
	);

	return execFileAsync("git", ["-c", GIT_QUOTE_PATH_CONFIG, ...args], {
		...options,
		encoding: "utf8",
		env,
	});
}
