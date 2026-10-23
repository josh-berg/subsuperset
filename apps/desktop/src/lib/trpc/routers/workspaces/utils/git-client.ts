import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
} from "node:child_process";
import { promisify } from "node:util";
import { USER_GIT_ENV_SIMPLE_GIT_OPTIONS } from "@superset/shared/simple-git-options";
import simpleGit, { type SimpleGit } from "simple-git";
import { getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

// Without this git prints non-ASCII paths as quoted octal escapes
// ("\303\251.txt"), which the name-status/porcelain parsers would take
// literally.
const GIT_QUOTE_PATH_CONFIG = "core.quotePath=false";

// The git task worker sets this for the task it is running, so every git
// process built on that thread meanwhile dies with the task when the runner
// cancels it. The main thread never sets it.
let taskAbortSignal: AbortSignal | undefined;

export function setGitTaskAbortSignal(signal: AbortSignal | undefined): void {
	taskAbortSignal = signal;
}

// Superset is a local Git client, so inherited user Git config/env is expected
// behavior. simple-git 3.36 blocks these hooks by default; allow them centrally
// instead of deleting individual env vars and changing Git semantics.
export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	const git = simpleGit({
		...USER_GIT_ENV_SIMPLE_GIT_OPTIONS,
		...(repoPath ? { baseDir: repoPath } : {}),
		config: [GIT_QUOTE_PATH_CONFIG],
		...(taskAbortSignal ? { abort: taskAbortSignal } : {}),
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
		signal: options?.signal ?? taskAbortSignal,
	});
}
