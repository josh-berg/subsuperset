import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	VscArrowDown,
	VscArrowUp,
	VscCloudUpload,
	VscLoading,
	VscSync,
} from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface FetchPushPullBarProps {
	worktreePath: string;
	pullCount: number;
	pushCount: number;
	hasUpstream: boolean;
	onRefresh: () => void;
}

type BarAction = "fetch" | "pull" | "push" | "sync" | "publish";

function getBarAction({
	pullCount,
	pushCount,
	hasUpstream,
}: {
	pullCount: number;
	pushCount: number;
	hasUpstream: boolean;
}): BarAction {
	if (!hasUpstream) return "publish";
	if (pullCount > 0 && pushCount > 0) return "sync";
	if (pullCount > 0) return "pull";
	if (pushCount > 0) return "push";
	return "fetch";
}

function formatLastFetched(date: Date): string {
	const diffMs = Date.now() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	if (diffMins < 1) return "just now";
	if (diffMins === 1) return "1 minute ago";
	if (diffMins < 60) return `${diffMins} minutes ago`;
	const diffHours = Math.floor(diffMins / 60);
	return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
}

export function FetchPushPullBar({
	worktreePath,
	pullCount,
	pushCount,
	hasUpstream,
	onRefresh,
}: FetchPushPullBarProps) {
	const [lastFetched, setLastFetched] = useState<Date | null>(null);

	const fetchMutation = electronTrpc.changes.fetch.useMutation({
		onSuccess: () => {
			setLastFetched(new Date());
			onRefresh();
		},
		onError: (error) => toast.error(`Fetch failed: ${error.message}`),
	});

	const pullMutation = electronTrpc.changes.pull.useMutation({
		onSuccess: () => {
			toast.success("Pulled");
			onRefresh();
		},
		onError: (error) => toast.error(`Pull failed: ${error.message}`),
	});

	const pushMutation = electronTrpc.changes.push.useMutation({
		onSuccess: () => {
			toast.success("Pushed");
			onRefresh();
		},
		onError: (error) => toast.error(`Push failed: ${error.message}`),
	});

	const syncMutation = electronTrpc.changes.sync.useMutation({
		onSuccess: () => {
			toast.success("Synced");
			onRefresh();
		},
		onError: (error) => toast.error(`Sync failed: ${error.message}`),
	});

	const isPending =
		fetchMutation.isPending ||
		pullMutation.isPending ||
		pushMutation.isPending ||
		syncMutation.isPending;

	const action = getBarAction({ pullCount, pushCount, hasUpstream });

	type BarConfig = {
		Icon: React.ComponentType<{ className?: string }>;
		spinning: boolean;
		label: string;
		subtitle: string;
		handler: () => void;
	};

	const configs: Record<BarAction, BarConfig> = {
		fetch: {
			Icon: VscSync,
			spinning: fetchMutation.isPending,
			label: "Fetch origin",
			subtitle: lastFetched
				? `Last fetched ${formatLastFetched(lastFetched)}`
				: "Fetch from remote",
			handler: () => fetchMutation.mutate({ worktreePath }),
		},
		pull: {
			Icon: VscArrowDown,
			spinning: pullMutation.isPending,
			label: "Pull origin",
			subtitle: `${pullCount} commit${pullCount === 1 ? "" : "s"} behind`,
			handler: () => pullMutation.mutate({ worktreePath }),
		},
		push: {
			Icon: VscArrowUp,
			spinning: pushMutation.isPending,
			label: "Push origin",
			subtitle: `${pushCount} commit${pushCount === 1 ? "" : "s"} to push`,
			handler: () => pushMutation.mutate({ worktreePath, setUpstream: true }),
		},
		sync: {
			Icon: VscSync,
			spinning: syncMutation.isPending,
			label: "Sync origin",
			subtitle: `↓${pullCount} ↑${pushCount}`,
			handler: () => syncMutation.mutate({ worktreePath }),
		},
		publish: {
			Icon: VscCloudUpload,
			spinning: pushMutation.isPending,
			label: "Publish branch",
			subtitle: "Publish to remote",
			handler: () => pushMutation.mutate({ worktreePath, setUpstream: true }),
		},
	};

	const { Icon, spinning, label, subtitle, handler } = configs[action];

	return (
		<button
			type="button"
			className={cn(
				"flex w-full items-center gap-3 px-4 py-2.5 shrink-0",
				"border-b border-border bg-muted/20 hover:bg-muted/40",
				"transition-colors text-left",
				"disabled:opacity-50 disabled:cursor-not-allowed",
			)}
			onClick={handler}
			disabled={isPending}
		>
			{spinning ? (
				<VscLoading className="size-[18px] shrink-0 text-foreground/70 animate-spin" />
			) : (
				<Icon className="size-[18px] shrink-0 text-foreground/70" />
			)}
			<span className="flex flex-col min-w-0">
				<span className="text-sm font-semibold leading-tight">{label}</span>
				<span className="text-xs text-muted-foreground leading-snug mt-0.5">
					{subtitle}
				</span>
			</span>
		</button>
	);
}
