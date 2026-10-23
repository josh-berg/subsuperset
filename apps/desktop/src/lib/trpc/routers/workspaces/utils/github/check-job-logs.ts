import { execWithShellEnv } from "../shell-env";

const MAX_LOG_BYTES = 64 * 1024 * 1024;

/**
 * GitHub Actions check URLs look like
 * https://github.com/<owner>/<repo>/actions/runs/<run_id>/job/<job_id>.
 * Returns null for anything else (other CI providers, non-job URLs).
 */
export function parseActionsJobUrl(
	detailsUrl: string,
): { nwo: string; jobId: string } | null {
	let url: URL;
	try {
		url = new URL(detailsUrl);
	} catch {
		return null;
	}
	if (url.hostname !== "github.com") return null;
	const match = url.pathname.match(
		/^\/([^/]+)\/([^/]+)\/actions\/runs\/\d+\/job\/(\d+)/,
	);
	if (!match) return null;
	return { nwo: `${match[1]}/${match[2]}`, jobId: match[3] };
}

export async function fetchCheckJobLogs({
	worktreePath,
	detailsUrl,
}: {
	worktreePath: string;
	detailsUrl: string;
}): Promise<string> {
	const job = parseActionsJobUrl(detailsUrl);
	if (!job) {
		throw new Error("Check is not a GitHub Actions job with downloadable logs");
	}
	const { stdout } = await execWithShellEnv(
		"gh",
		["api", `repos/${job.nwo}/actions/jobs/${job.jobId}/logs`],
		{ cwd: worktreePath, maxBuffer: MAX_LOG_BYTES, timeout: 30_000 },
	);
	return stdout;
}
