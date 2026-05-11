import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { LuGitBranch } from "react-icons/lu";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

interface ChildRepoItemProps {
	workspaceId: string | null;
	name: string;
	branch: string;
	isCollapsed?: boolean;
}

export function ChildRepoItem({
	workspaceId,
	name,
	branch,
	isCollapsed = false,
}: ChildRepoItemProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();

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
				title={`${name}: ${branch}`}
				className={cn(
					"flex items-center justify-center size-8 rounded-md transition-colors",
					isActive
						? "bg-primary/10 text-primary"
						: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
					!workspaceId && "opacity-40 cursor-default",
				)}
			>
				<LuGitBranch className="size-3.5" />
			</button>
		);
	}

	return (
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
			{branch && (
				<span className="text-[10px] text-muted-foreground/60 font-mono truncate max-w-[80px] shrink-0">
					{branch}
				</span>
			)}
		</button>
	);
}
