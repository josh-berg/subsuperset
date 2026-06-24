import { repoGroups } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Repo groups - saved sets of GitHub repos (by full name) the user can quickly
 * select when creating a multi-repo feature project. Managed from
 * Settings > Repo Groups and consumed by the multi-repo creation flow.
 */
export const createRepoGroupsRouter = () => {
	return router({
		/** List all saved repo groups, newest first. */
		list: publicProcedure.query(() => {
			return localDb
				.select()
				.from(repoGroups)
				.orderBy(desc(repoGroups.createdAt))
				.all();
		}),

		/** Create a new repo group. */
		create: publicProcedure
			.input(
				z.object({
					name: z.string().min(1).max(100),
					repos: z.array(z.string().min(1)).default([]),
				}),
			)
			.mutation(({ input }) => {
				return localDb
					.insert(repoGroups)
					.values({
						name: input.name.trim(),
						repos: dedupe(input.repos),
					})
					.returning()
					.get();
			}),

		/** Update a repo group's name and/or repo list. */
		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					name: z.string().min(1).max(100).optional(),
					repos: z.array(z.string().min(1)).optional(),
				}),
			)
			.mutation(({ input }) => {
				const existing = localDb
					.select()
					.from(repoGroups)
					.where(eq(repoGroups.id, input.id))
					.get();
				if (!existing) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Repo group not found",
					});
				}

				const updated = localDb
					.update(repoGroups)
					.set({
						name: input.name?.trim() ?? existing.name,
						repos: input.repos ? dedupe(input.repos) : existing.repos,
						updatedAt: Date.now(),
					})
					.where(eq(repoGroups.id, input.id))
					.returning()
					.get();
				return updated;
			}),

		/** Delete a repo group. */
		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				localDb.delete(repoGroups).where(eq(repoGroups.id, input.id)).run();
				return { success: true };
			}),
	});
};

function dedupe(repos: string[]): string[] {
	return [...new Set(repos.map((r) => r.trim()).filter(Boolean))];
}
