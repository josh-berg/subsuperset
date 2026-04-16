import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "./store";

/**
 * Subscribes to claude CLI detection events from the terminal host and
 * updates pane state so tab icons reflect when `claude` is running.
 */
export function useClaudeRunningListener() {
	const setPaneClaudeRunning = useTabsStore((s) => s.setPaneClaudeRunning);

	electronTrpc.terminal.claudeStatus.useSubscription(undefined, {
		onData: ({ paneId, running }) => {
			setPaneClaudeRunning(paneId, running);
		},
	});
}
