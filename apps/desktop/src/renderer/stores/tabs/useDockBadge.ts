import { useEffect } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "./store";

/**
 * Mirrors the number of workspaces with an agent waiting on the user
 * (permission request or finished-and-unreviewed) onto the OS dock badge.
 */
export function useDockBadge() {
	const count = useTabsStore((state) => {
		const workspaceByTab = new Map(
			state.tabs.map((tab) => [tab.id, tab.workspaceId]),
		);
		const waiting = new Set<string>();
		for (const pane of Object.values(state.panes)) {
			if (pane.status !== "permission" && pane.status !== "review") continue;
			const workspaceId = workspaceByTab.get(pane.tabId);
			if (workspaceId) waiting.add(workspaceId);
		}
		return waiting.size;
	});

	useEffect(() => {
		void electronTrpcClient.notifications.setDockBadge
			.mutate({ count })
			.catch(() => {});
	}, [count]);
}
