import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane } from "renderer/stores/tabs/types";
import { useShallow } from "zustand/react/shallow";

export interface RunningTabCounts {
	/** Tabs containing a Claude chat pane or a terminal running the `claude` CLI. */
	claude: number;
	/** Tabs containing a terminal that is not running Claude. */
	terminal: number;
}

/**
 * Classify a tab the same way the tab strip does (see GroupItem): a tab counts
 * as "claude" if it has a chat pane or a terminal running the Claude CLI,
 * otherwise "terminal" if it has any terminal pane.
 */
function classifyTab(panes: Pane[]): "claude" | "terminal" | null {
	const hasChat = panes.some((p) => p.type === "chat");
	const hasClaudeTerminal = panes.some(
		(p) => p.type === "terminal" && p.runningClaude,
	);
	if (hasChat || hasClaudeTerminal) return "claude";
	if (panes.some((p) => p.type === "terminal")) return "terminal";
	return null;
}

/**
 * Count running Claude and terminal tabs across the given workspaces. Pass a
 * single workspace id for a workspace row, or every workspace id in a project
 * for an aggregate count on the project header.
 */
export function useRunningTabCounts(workspaceIds: string[]): RunningTabCounts {
	return useTabsStore(
		useShallow((state) => {
			const ids = new Set(workspaceIds);
			const panesByTab = new Map<string, Pane[]>();
			for (const pane of Object.values(state.panes)) {
				const existing = panesByTab.get(pane.tabId);
				if (existing) existing.push(pane);
				else panesByTab.set(pane.tabId, [pane]);
			}

			let claude = 0;
			let terminal = 0;
			for (const tab of state.tabs) {
				if (!ids.has(tab.workspaceId)) continue;
				const kind = classifyTab(panesByTab.get(tab.id) ?? []);
				if (kind === "claude") claude++;
				else if (kind === "terminal") terminal++;
			}
			return { claude, terminal };
		}),
	);
}
