import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuPlus } from "react-icons/lu";
import { STROKE_WIDTH_THICK } from "./constants";
import { type GitWorkspaceRef, PullAllButton } from "./PullAllButton";

interface WorkspaceSidebarFooterProps {
	isCollapsed?: boolean;
	gitWorkspaces: GitWorkspaceRef[];
}

export function WorkspaceSidebarFooter({
	isCollapsed = false,
	gitWorkspaces,
}: WorkspaceSidebarFooterProps) {
	const navigate = useNavigate();

	const handleClick = () => {
		navigate({ to: "/new-project" });
	};

	if (isCollapsed) {
		return (
			<div className="border-t border-border p-2 flex flex-col items-center gap-1">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleClick}
							className="group flex items-center justify-center size-8 rounded-md bg-accent/40 hover:bg-accent/60 transition-colors"
						>
							<div className="flex items-center justify-center size-5 rounded bg-accent">
								<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
							</div>
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">New Project</TooltipContent>
				</Tooltip>
				<PullAllButton isCollapsed gitWorkspaces={gitWorkspaces} />
			</div>
		);
	}

	return (
		<div className="border-t border-border p-2 @container">
			<div className="flex items-center gap-1">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleClick}
							className="group flex min-w-0 flex-1 items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground @max-[260px]:flex-none @max-[260px]:size-8 @max-[260px]:justify-center @max-[260px]:p-0"
						>
							<LuPlus
								className="size-4 shrink-0"
								strokeWidth={STROKE_WIDTH_THICK}
							/>
							<span className="flex-1 truncate text-left @max-[260px]:hidden">
								New Project
							</span>
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">New Project</TooltipContent>
				</Tooltip>
				<PullAllButton gitWorkspaces={gitWorkspaces} />
			</div>
		</div>
	);
}
