import { Button } from "@superset/ui/button";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenMainRepoWorkspace } from "renderer/react-query/workspaces/useOpenMainRepoWorkspace";
import { PathSelector } from "../PathSelector";

interface OpenFolderTabProps {
	onError: (error: string) => void;
}

export function OpenFolderTab({ onError }: OpenFolderTabProps) {
	const [path, setPath] = useState("");
	const utils = electronTrpc.useUtils();
	const openAsGitless = electronTrpc.projects.openAsGitless.useMutation();
	const openMainRepoWorkspace = useOpenMainRepoWorkspace();

	const isLoading = openAsGitless.isPending || openMainRepoWorkspace.isPending;

	const handleOpen = () => {
		if (!path.trim()) {
			onError("Please select a folder");
			return;
		}

		openAsGitless.mutate(
			{ path: path.trim() },
			{
				onSuccess: (result) => {
					if (result.error) {
						onError(result.error);
						return;
					}
					if (result.project) {
						utils.projects.getRecents.invalidate();
						openMainRepoWorkspace.mutate({ projectId: result.project.id });
					}
				},
				onError: (err) => onError(err.message || "Failed to open folder"),
			},
		);
	};

	return (
		<div className="flex flex-col gap-5">
			<PathSelector value={path} onChange={setPath} />
			<div className="flex justify-end pt-2 border-t border-border/40">
				<Button
					onClick={handleOpen}
					disabled={isLoading || !path.trim()}
					size="sm"
				>
					{isLoading ? "Opening..." : "Open"}
				</Button>
			</div>
		</div>
	);
}
