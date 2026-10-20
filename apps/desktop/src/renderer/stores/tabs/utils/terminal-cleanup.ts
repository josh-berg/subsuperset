import { electronTrpcClient } from "../../../lib/trpc-client";

type PaneTerminalDisposer = (paneId: string) => void;

const paneTerminalDisposers = new Set<PaneTerminalDisposer>();

/**
 * Lets a renderer-side terminal cache free its xterm when the pane is killed
 * while unmounted (e.g. closing a hidden tab). Registration goes through here
 * rather than an import so the store never depends on terminal components.
 */
export const registerPaneTerminalDisposer = (
	disposer: PaneTerminalDisposer,
): void => {
	paneTerminalDisposers.add(disposer);
};

/**
 * Uses standalone tRPC client to avoid React hook dependencies
 */
export const killTerminalForPane = (paneId: string): void => {
	for (const dispose of paneTerminalDisposers) {
		try {
			dispose(paneId);
		} catch (error) {
			console.warn(`Failed to dispose cached terminal ${paneId}:`, error);
		}
	}
	electronTrpcClient.terminal.kill.mutate({ paneId }).catch((error) => {
		console.warn(`Failed to kill terminal for pane ${paneId}:`, error);
	});
};
