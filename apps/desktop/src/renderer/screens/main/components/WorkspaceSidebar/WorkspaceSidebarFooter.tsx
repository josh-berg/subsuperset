import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuPlus } from "react-icons/lu";
import { STROKE_WIDTH_THICK } from "./constants";

interface WorkspaceSidebarFooterProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarFooter({
	isCollapsed = false,
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
			</div>
		);
	}

	return (
		<div className="border-t border-border p-2">
			<button
				type="button"
				onClick={handleClick}
				className="group flex items-center gap-2 px-2 py-1.5 w-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
			>
				<LuPlus className="size-4" strokeWidth={STROKE_WIDTH_THICK} />
				<span className="flex-1 text-left">New Project</span>
			</button>
		</div>
	);
}
