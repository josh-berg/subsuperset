import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuArrowDown, LuLoaderCircle, LuRefreshCw } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { STROKE_WIDTH } from "../constants";

interface GitBatchProgress {
	operation: "pull" | "fetch";
	done: number;
	total: number;
}

export interface GitWorkspaceRef {
	workspaceId: string;
	repoName: string;
	branch: string;
}

interface PullAllButtonProps {
	isCollapsed?: boolean;
	/** Git-backed workspaces across every project, for the "needs pull" list/count. */
	gitWorkspaces: GitWorkspaceRef[];
}

const MAX_TOOLTIP_NAMES = 8;

const TOOLTIP_THEME_CLASSES =
	"bg-popover text-popover-foreground border shadow-md";

interface RepoGroup {
	repoName: string;
	branches: string[];
}

function groupByRepo(workspaces: GitWorkspaceRef[]): RepoGroup[] {
	const groups: RepoGroup[] = [];
	const groupsByRepo = new Map<string, RepoGroup>();
	for (const w of workspaces) {
		let group = groupsByRepo.get(w.repoName);
		if (!group) {
			group = { repoName: w.repoName, branches: [] };
			groupsByRepo.set(w.repoName, group);
			groups.push(group);
		}
		if (w.branch) group.branches.push(w.branch);
	}
	return groups;
}

function summarizePull({
	pulled,
	skipped,
}: {
	pulled: string[];
	skipped: unknown[];
}): { message: string; hasSkips: boolean } {
	const pulledCount = pulled.length;
	const skippedCount = skipped.length;

	if (pulledCount === 0 && skippedCount === 0) {
		return { message: "Everything already up to date", hasSkips: false };
	}
	if (skippedCount === 0) {
		return {
			message: `Pulled ${pulledCount} workspace${pulledCount === 1 ? "" : "s"}`,
			hasSkips: false,
		};
	}
	if (pulledCount === 0) {
		return {
			message: `Nothing to pull — ${skippedCount} workspace${skippedCount === 1 ? "" : "s"} skipped (local changes or conflicts)`,
			hasSkips: true,
		};
	}
	return {
		message: `Pulled ${pulledCount}, skipped ${skippedCount} (local changes or conflicts)`,
		hasSkips: true,
	};
}

export function PullAllButton({
	isCollapsed = false,
	gitWorkspaces,
}: PullAllButtonProps) {
	const utils = electronTrpc.useUtils();

	const { data: aheadBehindBatch } =
		electronTrpc.workspaces.getAheadBehindBatch.useQuery(
			{ workspaceIds: gitWorkspaces.map((w) => w.workspaceId) },
			{ enabled: gitWorkspaces.length > 0 },
		);

	const invalidateGitStatus = () => {
		utils.workspaces.getAheadBehind.invalidate();
		utils.workspaces.getAheadBehindBatch.invalidate();
	};

	const pullAll = electronTrpc.workspaces.pullAllWorkspaces.useMutation({
		onSuccess: (result) => {
			invalidateGitStatus();
			utils.changes.getStatus.invalidate();

			const { message, hasSkips } = summarizePull(result);
			if (hasSkips) {
				toast.warning(message);
			} else {
				toast.success(message);
			}
		},
		onError: (error) => toast.error(`Pull all failed: ${error.message}`),
	});

	const fetchAll = electronTrpc.workspaces.autoFetchStaleWorkspaces.useMutation(
		{
			onSuccess: () => {
				invalidateGitStatus();
				toast.success("Fetched latest from remote");
			},
			onError: (error) => toast.error(`Fetch all failed: ${error.message}`),
		},
	);

	const [progress, setProgress] = useState<GitBatchProgress | null>(null);
	electronTrpc.workspaces.onGitBatchProgress.useSubscription(undefined, {
		onData: setProgress,
	});

	if (gitWorkspaces.length === 0) {
		return null;
	}

	const needsPullWorkspaces = aheadBehindBatch
		? gitWorkspaces.filter(
				(w) => (aheadBehindBatch[w.workspaceId]?.behind ?? 0) > 0,
			)
		: [];
	const needsPullCount = needsPullWorkspaces.length;
	const mode = needsPullCount > 0 ? "pull" : "fetch";

	const isPending = mode === "pull" ? pullAll.isPending : fetchAll.isPending;
	const handleClick = () =>
		mode === "pull" ? pullAll.mutate() : fetchAll.mutate({ staleMs: 0 });

	const Icon = isPending
		? LuLoaderCircle
		: mode === "pull"
			? LuArrowDown
			: LuRefreshCw;

	const showProgress =
		isPending &&
		progress !== null &&
		progress.operation === mode &&
		progress.total > 0;
	const progressText = showProgress
		? `${mode === "pull" ? "Pulling" : "Fetching"} ${progress?.done}/${progress?.total}`
		: null;

	const displayedWorkspaces = needsPullWorkspaces.slice(0, MAX_TOOLTIP_NAMES);
	const remainingCount = needsPullCount - displayedWorkspaces.length;
	const repoGroups = groupByRepo(displayedWorkspaces);

	const tooltipContent = progressText ? (
		<TooltipContent
			side={isCollapsed ? "right" : "bottom"}
			className={cn(TOOLTIP_THEME_CLASSES)}
			arrowClassName="bg-popover fill-popover"
		>
			{progressText}
		</TooltipContent>
	) : mode === "pull" ? (
		<TooltipContent
			side={isCollapsed ? "right" : "bottom"}
			className={cn("flex flex-col gap-1.5 max-w-72", TOOLTIP_THEME_CLASSES)}
			arrowClassName="bg-popover fill-popover"
		>
			<span className="font-medium">
				{needsPullCount} workspace{needsPullCount === 1 ? "" : "s"} need
				{needsPullCount === 1 ? "s" : ""} pulling
			</span>
			<div className="flex flex-col gap-1">
				{repoGroups.map((g) => (
					<div key={g.repoName} className="flex flex-col">
						<span className="text-xs font-medium truncate">{g.repoName}</span>
						{g.branches.map((branch) => (
							<span
								key={branch}
								className="text-xs text-muted-foreground truncate pl-3"
							>
								{branch}
							</span>
						))}
					</div>
				))}
			</div>
			{remainingCount > 0 && (
				<span className="text-xs text-muted-foreground">
					+{remainingCount} more
				</span>
			)}
		</TooltipContent>
	) : (
		<TooltipContent
			side={isCollapsed ? "right" : "bottom"}
			className={cn(TOOLTIP_THEME_CLASSES)}
			arrowClassName="bg-popover fill-popover"
		>
			Check all repos for updates
		</TooltipContent>
	);

	const label =
		progressText ??
		(mode === "pull" ? `Pull All (${needsPullCount})` : "Fetch All");

	if (isCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						disabled={isPending}
						className="group relative flex items-center justify-center size-8 rounded-md bg-accent/40 hover:bg-accent/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						<Icon
							className={cn(
								"size-4 text-foreground/70",
								isPending && "animate-spin",
							)}
							strokeWidth={STROKE_WIDTH}
						/>
						{mode === "pull" && (
							<span className="absolute -top-1 -right-1 flex items-center justify-center min-w-3.5 h-3.5 px-0.5 rounded-full bg-amber-400 text-background text-[9px] font-semibold leading-none tabular-nums">
								{needsPullCount}
							</span>
						)}
					</button>
				</TooltipTrigger>
				{tooltipContent}
			</Tooltip>
		);
	}

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					disabled={isPending}
					className={cn(
						"group relative flex min-w-0 flex-1 items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
						"text-muted-foreground hover:text-foreground hover:bg-accent/50",
						"disabled:opacity-50 disabled:cursor-not-allowed",
						"@max-[260px]:flex-none @max-[260px]:size-8 @max-[260px]:justify-center @max-[260px]:p-0",
					)}
				>
					<Icon
						className={cn("size-4 shrink-0", isPending && "animate-spin")}
						strokeWidth={STROKE_WIDTH}
					/>
					<span className="flex-1 truncate text-left @max-[260px]:hidden">
						{label}
					</span>
					{mode === "pull" && (
						<span className="absolute -top-1 -right-1 hidden items-center justify-center min-w-3.5 h-3.5 px-0.5 rounded-full bg-amber-400 text-background text-[9px] font-semibold leading-none tabular-nums @max-[260px]:flex">
							{needsPullCount}
						</span>
					)}
				</button>
			</TooltipTrigger>
			{tooltipContent}
		</Tooltip>
	);
}
