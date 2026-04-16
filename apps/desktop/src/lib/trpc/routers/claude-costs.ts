import { collectClaudeCosts } from "main/lib/claude-costs";
import { z } from "zod";
import { publicProcedure, router } from "..";

const modelUsageSchema = z.object({
	model: z.string(),
	inputTokens: z.number().int().min(0),
	cacheCreationTokens: z.number().int().min(0),
	cacheReadTokens: z.number().int().min(0),
	outputTokens: z.number().int().min(0),
	costUSD: z.number().min(0),
});

const dailyUsageSchema = z.object({
	date: z.string(),
	totalCostUSD: z.number().min(0),
	totalInputTokens: z.number().int().min(0),
	totalOutputTokens: z.number().int().min(0),
});

export const claudeCostSnapshotSchema = z.object({
	todayCostUSD: z.number().min(0),
	weekCostUSD: z.number().min(0),
	todayInputTokens: z.number().int().min(0),
	todayCacheCreationTokens: z.number().int().min(0),
	todayCacheReadTokens: z.number().int().min(0),
	todayOutputTokens: z.number().int().min(0),
	byModel: z.array(modelUsageSchema),
	dailyHistory: z.array(dailyUsageSchema),
	collectedAt: z.number().int().min(0),
});

export type ClaudeCostSnapshot = z.infer<typeof claudeCostSnapshotSchema>;

export const createClaudeCostsRouter = () => {
	return router({
		getSnapshot: publicProcedure
			.input(z.object({ force: z.boolean().optional() }).optional())
			.output(claudeCostSnapshotSchema)
			.query(async ({ input }) => {
				return collectClaudeCosts(input?.force);
			}),
	});
};
