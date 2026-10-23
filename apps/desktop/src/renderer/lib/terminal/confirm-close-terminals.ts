import { alert } from "@superset/ui/atoms/Alert";
import { electronTrpcClient } from "renderer/lib/trpc-client";

async function isAnyRunning(paneIds: string[]): Promise<boolean> {
	try {
		return await electronTrpcClient.terminal.hasRunningProcess.query({
			paneIds,
		});
	} catch {
		// If we can't tell, don't block the user from closing.
		return false;
	}
}

/**
 * Resolves true when the close should proceed: either nothing is running in
 * the given terminals, or the user confirmed killing it.
 */
export async function confirmCloseTerminals(
	paneIds: string[],
	labels: { title: string; description: string; confirmLabel: string },
): Promise<boolean> {
	if (paneIds.length === 0 || !(await isAnyRunning(paneIds))) return true;

	return new Promise<boolean>((resolve) => {
		alert({
			title: labels.title,
			description: labels.description,
			actions: [
				{
					label: labels.confirmLabel,
					variant: "destructive",
					onClick: () => resolve(true),
				},
				{ label: "Cancel", variant: "ghost", onClick: () => resolve(false) },
			],
		});
	});
}
