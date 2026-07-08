import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/** How often we check for repos that are due for a background fetch. */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Drives background `git fetch` so ahead/behind ("needs pull") indicators stay
 * fresh across the sidebar. The main process only fetches repos that haven't
 * been fetched in the last 15 minutes, so polling here is cheap.
 *
 * To save network/battery the loop only runs while the window is visible, and
 * catches up immediately when the window regains focus. Mount once.
 */
export function useAutoFetchBranches() {
	const utils = electronTrpc.useUtils();
	const isRunningRef = useRef(false);

	const autoFetch =
		electronTrpc.workspaces.autoFetchStaleWorkspaces.useMutation({
			onSettled: () => {
				isRunningRef.current = false;
			},
			onSuccess: ({ fetchedWorkspaceIds }) => {
				if (fetchedWorkspaceIds.length === 0) return;
				utils.workspaces.getAheadBehind.invalidate();
				utils.workspaces.getAheadBehindBatch.invalidate();
			},
		});

	const mutateRef = useRef(autoFetch.mutate);
	mutateRef.current = autoFetch.mutate;

	useEffect(() => {
		const run = () => {
			if (document.visibilityState !== "visible") return;
			if (isRunningRef.current) return;
			isRunningRef.current = true;
			mutateRef.current({});
		};

		run();
		const interval = setInterval(run, POLL_INTERVAL_MS);
		const onFocus = () => {
			if (document.visibilityState === "visible") run();
		};
		document.addEventListener("visibilitychange", onFocus);
		window.addEventListener("focus", onFocus);

		return () => {
			clearInterval(interval);
			document.removeEventListener("visibilitychange", onFocus);
			window.removeEventListener("focus", onFocus);
		};
	}, []);
}
