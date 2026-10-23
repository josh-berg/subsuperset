import type { CheckItem } from "@superset/local-db";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import {
	LuCheck,
	LuClipboardCopy,
	LuLoaderCircle,
	LuMinus,
	LuX,
} from "react-icons/lu";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { STROKE_WIDTH } from "../../../../../../../constants";

interface CheckItemRowProps {
	check: CheckItem;
	workspaceId: string;
}

export function CheckItemRow({ check, workspaceId }: CheckItemRowProps) {
	const [copying, setCopying] = useState(false);

	const copyLogs = async () => {
		if (!check.url || copying) return;
		setCopying(true);
		try {
			const { logs } =
				await electronTrpcClient.workspaces.getCheckJobLogs.query({
					workspaceId,
					detailsUrl: check.url,
				});
			await navigator.clipboard.writeText(logs);
			toast.success(`Copied logs for ${check.name}`);
		} catch (error) {
			toast.error("Couldn't copy check logs", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setCopying(false);
		}
	};

	const statusConfig = {
		success: { icon: LuCheck, className: "text-emerald-500" },
		failure: { icon: LuX, className: "text-destructive-foreground" },
		pending: { icon: LuLoaderCircle, className: "text-amber-500" },
		skipped: { icon: LuMinus, className: "text-muted-foreground" },
		cancelled: { icon: LuMinus, className: "text-muted-foreground" },
	};

	const { icon: Icon, className } = statusConfig[check.status];

	const content = (
		<span className="flex items-center gap-1.5 py-0.5">
			<Icon
				className={`size-3 shrink-0 ${className} ${check.status === "pending" ? "animate-spin" : ""}`}
				strokeWidth={STROKE_WIDTH}
			/>
			<span className="truncate">{check.name}</span>
		</span>
	);

	if (check.url) {
		return (
			<div className="flex items-center gap-1.5 text-muted-foreground">
				<a
					href={check.url}
					target="_blank"
					rel="noopener noreferrer"
					className="block min-w-0 flex-1 hover:text-foreground transition-colors"
				>
					{content}
				</a>
				{check.status === "failure" && (
					<button
						type="button"
						title="Copy logs"
						disabled={copying}
						onClick={copyLogs}
						className="shrink-0 hover:text-foreground transition-colors disabled:opacity-50"
					>
						<LuClipboardCopy className="size-3" strokeWidth={STROKE_WIDTH} />
					</button>
				)}
			</div>
		);
	}

	return <div className="text-muted-foreground">{content}</div>;
}
