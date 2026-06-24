export interface ModelUsage {
	model: string;
	inputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	outputTokens: number;
	costUSD: number;
	missingPricing: boolean;
}

export interface DailyUsage {
	date: string;
	totalCostUSD: number;
	totalInputTokens: number;
	totalOutputTokens: number;
}
