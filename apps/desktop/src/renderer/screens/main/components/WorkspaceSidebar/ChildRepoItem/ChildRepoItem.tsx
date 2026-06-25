import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuGitBranch } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { SwitchBranchDialog } from "../WorkspaceListItem/components/SwitchBranchDialog";
import { GITHUB_STATUS_STALE_TIME } from "../WorkspaceListItem/constants";
import { WorkspaceAheadBehind } from "../WorkspaceListItem/WorkspaceAheadBehind";

interface ChildRepoItemProps {
	workspaceId: string | null;
	mainRepoPath: string;
	name: string;
	branch: string;
	isCollapsed?: boolean;
}

export function ChildRepoItem({
	workspaceId,
	mainRepoPath,
	name,
	branch,
	isCollapsed = false,
}: ChildRepoItemProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const [showSwitchBranchDialog, setShowSwitchBranchDialog] = useState(false);

	const { data: aheadBehind } = electronTrpc.workspaces.getAheadBehind.useQuery(
		{ workspaceId: workspaceId ?? "" },
		{ enabled: !!workspaceId, staleTime: GITHUB_STATUS_STALE_TIME },
	);
	const isBehind = (aheadBehind?.behind ?? 0) > 0;

	const isActive =
		!!workspaceId &&
		!!matchRoute({
			to: "/workspace/$workspaceId",
			params: { workspaceId },
			fuzzy: true,
		});

	const handleClick = () => {
		if (!workspaceId) return;
		navigateToWorkspace(workspaceId, navigate);
	};

	if (isCollapsed) {
		return (
			<button
				type="button"
				onClick={handleClick}
				disabled={!workspaceId}
				title={`${name}: ${branch}${isBehind ? ` (↓${aheadBehind?.behind})` : ""}`}
				className={cn(
					"relative flex items-center justify-center size-8 rounded-md transition-colors",
					isActive
						? "bg-primary/10 text-primary"
						: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
					!workspaceId && "opacity-40 cursor-default",
				)}
			>
				<LuGitBranch className="size-3.5" />
				{isBehind && (
					<span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-400" />
				)}
			</button>
		);
	}

	return (
		<>
			<button
				type="button"
				onClick={handleClick}
				disabled={!workspaceId}
				className={cn(
					"group flex items-center gap-2 w-full pl-4 pr-2 py-1 text-left rounded-md transition-colors min-h-[28px]",
					isActive
						? "bg-primary/10 text-foreground"
						: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
					!workspaceId && "opacity-40 cursor-default",
				)}
			>
				<LuGitBranch className="size-3.5 shrink-0 opacity-60" />
				<span className="flex-1 text-xs font-medium truncate">{name}</span>
				{aheadBehind && (
					<WorkspaceAheadBehind
						ahead={aheadBehind.ahead}
						behind={aheadBehind.behind}
					/>
				)}
				{branch && workspaceId && (
					<span
						role="button"
						tabIndex={0}
						onClick={(e) => {
							e.stopPropagation();
							setShowSwitchBranchDialog(true);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.stopPropagation();
								setShowSwitchBranchDialog(true);
							}
						}}
						className="text-[10px] text-muted-foreground/60 font-mono truncate max-w-[80px] shrink-0 rounded px-0.5 -mx-0.5 hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
					>
						{branch}
					</span>
				)}
				{branch && !workspaceId && (
					<span className="text-[10px] text-muted-foreground/60 font-mono truncate max-w-[80px] shrink-0">
						{branch}
					</span>
				)}
			</button>
			<SwitchBranchDialog
				open={showSwitchBranchDialog}
				onOpenChange={setShowSwitchBranchDialog}
				worktreePath={mainRepoPath}
				currentBranch={branch}
			/>
		</>
	);
}
