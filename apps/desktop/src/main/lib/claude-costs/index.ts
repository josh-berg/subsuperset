import { loadDailyUsageData } from "ccusage/data-loader";

export interface ModelUsage {
	model: string;
	inputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	outputTokens: number;
	costUSD: number;
}

export interface DailyUsage {
	date: string; // YYYY-MM-DD in local time
	totalCostUSD: number;
	totalInputTokens: number;
	totalOutputTokens: number;
}

export interface ClaudeCostSnapshot {
	todayCostUSD: number;
	weekCostUSD: number;
	todayInputTokens: number;
	todayCacheCreationTokens: number;
	todayCacheReadTokens: number;
	todayOutputTokens: number;
	byModel: ModelUsage[];
	dailyHistory: DailyUsage[]; // last 7 days oldest-first
	collectedAt: number;
}

let cachedSnapshot: ClaudeCostSnapshot | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30_000;

function localDateString(ms: number): string {
	const d = new Date(ms);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function buildEmptySnapshot(now: number): ClaudeCostSnapshot {
	const dailyHistory: DailyUsage[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		dailyHistory.push({
			date: localDateString(d.getTime()),
			totalCostUSD: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
		});
	}
	return {
		todayCostUSD: 0,
		weekCostUSD: 0,
		todayInputTokens: 0,
		todayCacheCreationTokens: 0,
		todayCacheReadTokens: 0,
		todayOutputTokens: 0,
		byModel: [],
		dailyHistory,
		collectedAt: now,
	};
}

export async function collectClaudeCosts(
	force = false,
): Promise<ClaudeCostSnapshot> {
	const now = Date.now();
	if (!force && cachedSnapshot && now < cacheExpiresAt) {
		return cachedSnapshot;
	}

	const todayKey = localDateString(now);

	// Build a YYYY-MM-DD string for 7 days ago
	const sevenDaysAgo = new Date(now);
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
	const sinceKey = localDateString(sevenDaysAgo.getTime());

	let dailyData: Awaited<ReturnType<typeof loadDailyUsageData>> = [];
	try {
		dailyData = await loadDailyUsageData({
			since: sinceKey,
			order: "asc",
			offline: true, // Use bundled pricing — avoids a network call on every refresh
		});
	} catch (err) {
		console.warn("[claude-costs] ccusage loadDailyUsageData failed:", err);
		return buildEmptySnapshot(now);
	}

	// Build 7-day history (oldest first, always 7 entries)
	const dailyHistory: DailyUsage[] = [];
	let weekCostUSD = 0;

	for (let i = 6; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		const dateKey = localDateString(d.getTime());
		// Use find() to avoid branded-string type friction with Map.get()
		const entry = dailyData.find((e) => e.date === dateKey);

		const dayCost = entry?.totalCost ?? 0;
		weekCostUSD += dayCost;

		dailyHistory.push({
			date: dateKey,
			totalCostUSD: dayCost,
			totalInputTokens: entry?.inputTokens ?? 0,
			totalOutputTokens: entry?.outputTokens ?? 0,
		});
	}

	// Today's data
	const todayEntry = dailyData.find((e) => e.date === todayKey);
	const todayCostUSD = todayEntry?.totalCost ?? 0;
	const todayInputTokens = todayEntry?.inputTokens ?? 0;
	const todayCacheCreationTokens = todayEntry?.cacheCreationTokens ?? 0;
	const todayCacheReadTokens = todayEntry?.cacheReadTokens ?? 0;
	const todayOutputTokens = todayEntry?.outputTokens ?? 0;

	const byModel: ModelUsage[] = (todayEntry?.modelBreakdowns ?? []).map(
		(mb) => ({
			model: mb.modelName,
			inputTokens: mb.inputTokens,
			cacheCreationTokens: mb.cacheCreationTokens,
			cacheReadTokens: mb.cacheReadTokens,
			outputTokens: mb.outputTokens,
			costUSD: mb.cost,
		}),
	);

	const snapshot: ClaudeCostSnapshot = {
		todayCostUSD,
		weekCostUSD,
		todayInputTokens,
		todayCacheCreationTokens,
		todayCacheReadTokens,
		todayOutputTokens,
		byModel,
		dailyHistory,
		collectedAt: now,
	};

	cachedSnapshot = snapshot;
	cacheExpiresAt = now + CACHE_TTL_MS;

	return snapshot;
}
