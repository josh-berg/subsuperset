import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { SquareTerminal } from "lucide-react";
import claudeIcon from "renderer/assets/app-icons/preset-icons/claude.svg";
import { useRunningTabCounts } from "./useRunningTabCounts";

interface RunningTabCountsProps {
	/** Workspace ids to aggregate counts over (one id for a workspace row). */
	workspaceIds: string[];
	className?: string;
}

/**
 * Inline indicator showing how many Claude and terminal tabs are running across
 * the given workspaces. Renders nothing when nothing is running.
 */
export function RunningTabCounts({
	workspaceIds,
	className,
}: RunningTabCountsProps) {
	const { claude, terminal } = useRunningTabCounts(workspaceIds);

	if (claude === 0 && terminal === 0) return null;

	return (
		<div
			className={cn(
				"flex items-center gap-1.5 shrink-0 text-[11px] text-muted-foreground tabular-nums",
				className,
			)}
		>
			{claude > 0 && (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<span className="flex items-center gap-0.5">
							<img src={claudeIcon} alt="" className="size-3 shrink-0" />
							{claude}
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						{claude} Claude {claude === 1 ? "session" : "sessions"} running
					</TooltipContent>
				</Tooltip>
			)}
			{terminal > 0 && (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<span className="flex items-center gap-0.5">
							<SquareTerminal className="size-3 shrink-0" />
							{terminal}
						</span>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						{terminal} {terminal === 1 ? "terminal" : "terminals"} running
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
