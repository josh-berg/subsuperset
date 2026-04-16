import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiOutlineArrowPath, HiOutlineCurrencyDollar } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { DailyUsage, ModelUsage } from "./types";

function formatCost(usd: number): string {
	if (usd === 0) return "$0.00";
	if (usd < 0.001) return "<$0.001";
	if (usd < 0.01) return `$${usd.toFixed(3)}`;
	if (usd < 1) return `$${usd.toFixed(3)}`;
	return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
	return n.toString();
}

function formatModelName(model: string): string {
	return model
		.replace(/^claude-/, "")
		.replace(/-(\d{8})$/, "")
		.replace(/-(\d+)-(\d+)$/, " $1.$2");
}

function MetricBadge({
	label,
	value,
	tooltip,
}: {
	label: string;
	value: string;
	tooltip?: string;
}) {
	const content = (
		<div className="min-w-0 px-1 py-0.5">
			<span className="block text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap">
				{label}
			</span>
			<span className="block text-base leading-5 font-medium tabular-nums whitespace-nowrap text-muted-foreground">
				{value}
			</span>
		</div>
	);

	if (!tooltip) return content;

	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>{content}</TooltipTrigger>
			<TooltipContent side="top" sideOffset={6} showArrow={false}>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}

function ModelRow({ m }: { m: ModelUsage }) {
	const totalIn = m.inputTokens + m.cacheCreationTokens + m.cacheReadTokens;
	return (
		<div className="flex items-center justify-between text-xs gap-2">
			<div className="min-w-0 flex-1">
				<span className="font-medium text-foreground/80">
					{formatModelName(m.model)}
				</span>
				<span className="ml-1.5 text-muted-foreground tabular-nums">
					{formatTokens(totalIn)}↑ {formatTokens(m.outputTokens)}↓
				</span>
			</div>
			<span className="font-medium tabular-nums text-foreground/80 shrink-0">
				{formatCost(m.costUSD)}
			</span>
		</div>
	);
}

function DailyBarChart({ history }: { history: DailyUsage[] }) {
	const maxCost = Math.max(...history.map((d) => d.totalCostUSD), 0.001);
	const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

	return (
		<div className="flex items-end gap-1" style={{ height: "52px" }}>
			{history.map((day) => {
				const pct = (day.totalCostUSD / maxCost) * 100;
				const isToday = day.date === todayStr;
				const dayLabel = new Date(`${day.date}T12:00:00`)
					.toLocaleDateString(undefined, { weekday: "short" })
					.slice(0, 1);

				return (
					<Tooltip key={day.date} delayDuration={100}>
						<TooltipTrigger asChild>
							<div className="flex-1 flex flex-col items-center gap-0.5 cursor-default">
								<div
									className="w-full flex items-end"
									style={{ height: "40px" }}
								>
									<div
										className={`w-full rounded-sm ${
											isToday ? "bg-primary/60" : "bg-muted-foreground/25"
										}`}
										style={{ height: `${Math.max(pct, 4)}%` }}
									/>
								</div>
								<span
									className={`text-[9px] ${
										isToday
											? "text-primary/80 font-medium"
											: "text-muted-foreground/60"
									}`}
								>
									{dayLabel}
								</span>
							</div>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={4} showArrow={false}>
							<div className="text-xs space-y-0.5">
								<div className="font-medium">{day.date}</div>
								<div>{formatCost(day.totalCostUSD)}</div>
							</div>
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}

export function ClaudeCosts() {
	const [open, setOpen] = useState(false);

	const {
		data: snapshot,
		refetch,
		isFetching,
	} = electronTrpc.claudeCosts.getSnapshot.useQuery(undefined, {
		refetchInterval: open ? 30_000 : 120_000,
	});

	const todayCost = snapshot?.todayCostUSD ?? 0;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="no-drag flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring"
							aria-label="Claude API costs"
						>
							<HiOutlineCurrencyDollar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							{snapshot !== undefined && (
								<span className="text-xs font-medium tabular-nums text-muted-foreground hidden md:inline">
									{formatCost(todayCost)}
								</span>
							)}
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				{snapshot !== undefined && (
					<TooltipContent
						side="bottom"
						sideOffset={6}
						showArrow={false}
						className="md:hidden"
					>
						{formatCost(todayCost)}
					</TooltipContent>
				)}
			</Tooltip>

			<PopoverContent align="start" className="w-[22rem] p-0">
				<div className="p-3 border-b border-border">
					<div className="flex items-center justify-between">
						<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
							Claude Spend
						</h4>
						<button
							type="button"
							onClick={() => refetch()}
							className="p-0.5 rounded hover:bg-muted transition-colors"
							aria-label="Refresh cost stats"
						>
							<HiOutlineArrowPath
								className={`h-3.5 w-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`}
							/>
						</button>
					</div>

					{snapshot && (
						<div className="mt-2 grid grid-cols-2 gap-2">
							<MetricBadge
								label="Today"
								value={formatCost(snapshot.todayCostUSD)}
								tooltip="Total Claude API cost since midnight (local time)."
							/>
							<MetricBadge
								label="This week"
								value={formatCost(snapshot.weekCostUSD)}
								tooltip="Total Claude API cost over the last 7 days."
							/>
						</div>
					)}
				</div>

				<div className="max-h-[50vh] overflow-y-auto">
					{snapshot && snapshot.byModel.length > 0 && (
						<div className="p-3 border-b border-border">
							<p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
								Today by model
							</p>
							<div className="space-y-1.5">
								{snapshot.byModel.map((m) => (
									<ModelRow key={m.model} m={m} />
								))}
							</div>
						</div>
					)}

					{snapshot && (
						<div className="p-3">
							<p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
								Last 7 days
							</p>
							<DailyBarChart history={snapshot.dailyHistory} />
						</div>
					)}

					{!snapshot && (
						<div className="px-3 py-4 text-center text-xs text-muted-foreground">
							Loading...
						</div>
					)}

					{snapshot &&
						snapshot.byModel.length === 0 &&
						snapshot.weekCostUSD === 0 && (
							<div className="px-3 py-2 text-center text-xs text-muted-foreground">
								No Claude usage in the last 7 days
							</div>
						)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
