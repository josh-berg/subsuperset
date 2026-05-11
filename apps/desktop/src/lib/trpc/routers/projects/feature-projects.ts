import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
	projects,
	settings,
	workspaceSections,
	workspaces,
	worktrees,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { deleteProjectIcon } from "main/lib/project-icons";
import { getWorkspaceRuntimeRegistry } from "main/lib/workspace-runtime";
import { PROJECT_COLOR_VALUES } from "shared/constants/project-colors";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	selectNextActiveWorkspace,
	setLastActiveWorkspace,
} from "../workspaces/utils/db-helpers";
import { getDefaultBranch } from "../workspaces/utils/git";
import { getSimpleGitWithShellPath } from "../workspaces/utils/git-client";
import { execWithShellEnv } from "../workspaces/utils/shell-env";
import { getDefaultProjectColor } from "./utils/colors";
import {
	ensureChildRepoWorkspace,
	ensureGitlessWorkspace,
} from "./utils/workspace-bootstrap";

const SAFE_REPO_NAME_REGEX = /^[a-zA-Z0-9._\- ]+$/;

// Cached in-process so we only pay the gh API cost once per app session.
let cachedOwners: string[] | null = null;

async function resolveGitHubOwners(): Promise<string[]> {
	if (cachedOwners) return cachedOwners;

	const [userResult, orgsResult] = await Promise.allSettled([
		execWithShellEnv("gh", ["api", "user", "--jq", ".login"], {
			timeout: 5_000,
		}),
		execWithShellEnv("gh", ["api", "user/orgs", "--jq", ".[].login"], {
			timeout: 5_000,
		}),
	]);

	const owners: string[] = [];
	if (userResult.status === "fulfilled") {
		const login = userResult.value.stdout.trim();
		if (login) owners.push(login);
	}
	if (orgsResult.status === "fulfilled") {
		for (const org of orgsResult.value.stdout.trim().split("\n")) {
			if (org) owners.push(org);
		}
	}

	if (owners.length > 0) cachedOwners = owners;
	return owners;
}

function sanitizeRepoName(name: string): string | null {
	const clean = name.trim().replace(/\.git$/, "");
	return SAFE_REPO_NAME_REGEX.test(clean) && !/^\.+$/.test(clean)
		? clean
		: null;
}

export const createFeatureProjectsRouter = () => {
	return router({
		/** Create a new feature project (parent folder + gitless workspace). */
		create: publicProcedure
			.input(
				z.object({
					name: z.string().min(1).max(100),
					parentDir: z.string().min(1),
					color: z
						.string()
						.refine((v) => PROJECT_COLOR_VALUES.includes(v), "Invalid color")
						.optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const projectPath = join(input.parentDir, input.name.trim());

				await mkdir(projectPath, { recursive: true });

				const existing = localDb
					.select()
					.from(projects)
					.where(eq(projects.mainRepoPath, projectPath))
					.get();

				if (existing) {
					ensureGitlessWorkspace(existing);
					return { project: existing };
				}

				const project = localDb
					.insert(projects)
					.values({
						mainRepoPath: projectPath,
						name: input.name.trim(),
						color: input.color ?? getDefaultProjectColor(),
						isGitless: true,
						isFeatureProject: true,
					})
					.returning()
					.get();

				ensureGitlessWorkspace(project);

				track("feature_project_created", { project_id: project.id });

				return { project };
			}),

		/** Search GitHub repos accessible to the authenticated gh CLI user. */
		searchGitHubRepos: publicProcedure
			.input(
				z.object({
					query: z.string().min(1),
					limit: z.number().min(1).max(50).default(20),
				}),
			)
			.query(async ({ input }) => {
				try {
					const owners = await resolveGitHubOwners();
					if (owners.length === 0) return [];

					const ownerFlags = owners.flatMap((o) => ["--owner", o]);

					const { stdout } = await execWithShellEnv(
						"gh",
						[
							"search",
							"repos",
							input.query,
							...ownerFlags,
							"--archived=false",
							"--json",
							"fullName,description,isPrivate,url,name",
							"--limit",
							String(input.limit),
						],
						{ timeout: 10_000 },
					);
					const raw: unknown = JSON.parse(stdout.trim() || "[]");
					if (!Array.isArray(raw)) return [];

					return raw
						.filter(
							(item): item is Record<string, unknown> =>
								typeof item === "object" && item !== null,
						)
						.map((item) => ({
							fullName: String(item.fullName ?? ""),
							name: String(item.name ?? ""),
							description: item.description ? String(item.description) : null,
							isPrivate: Boolean(item.isPrivate),
							url: String(item.url ?? ""),
						}))
						.filter((item) => item.fullName);
				} catch (err) {
					console.warn("[searchGitHubRepos] Failed:", err);
					return [];
				}
			}),

		/** Clone a GitHub repo into the feature project folder and create a child project. */
		addRepo: publicProcedure
			.input(
				z.object({
					featureProjectId: z.string(),
					repoFullName: z.string().min(1),
					branchName: z.string().min(1),
					parentBranch: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const featureProject = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.featureProjectId))
					.get();

				if (!featureProject?.isFeatureProject) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Feature project not found",
					});
				}

				const repoName = sanitizeRepoName(basename(input.repoFullName));
				if (!repoName) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid repository name",
					});
				}

				const clonePath = join(featureProject.mainRepoPath, repoName);

				// Clone the repository
				try {
					await execWithShellEnv(
						"gh",
						["repo", "clone", input.repoFullName, clonePath],
						{ timeout: 120_000 },
					);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Failed to clone ${input.repoFullName}: ${msg}`,
					});
				}

				const defaultBranch =
					input.parentBranch ?? (await getDefaultBranch(clonePath));

				// Create or checkout the feature branch
				const git = await getSimpleGitWithShellPath(clonePath);
				try {
					await git.checkoutLocalBranch(input.branchName);
				} catch {
					// Branch may already exist locally or remotely
					try {
						await git.checkout(input.branchName);
					} catch {
						// If checkout fails, create from parent branch
						await git.checkoutBranch(input.branchName, defaultBranch);
					}
				}

				// Create the child project record (tabOrder=null keeps it hidden from main sidebar)
				const childProject = localDb
					.insert(projects)
					.values({
						mainRepoPath: clonePath,
						name: repoName,
						color: featureProject.color,
						defaultBranch,
						parentProjectId: input.featureProjectId,
						isGitless: false,
						isFeatureProject: false,
					})
					.returning()
					.get();

				const workspaceId = ensureChildRepoWorkspace(
					childProject,
					input.branchName,
				);

				track("feature_project_repo_added", {
					feature_project_id: input.featureProjectId,
					child_project_id: childProject.id,
				});

				return { project: childProject, workspaceId };
			}),

		/** Get all child repo projects for a feature project. */
		getChildRepos: publicProcedure
			.input(z.object({ featureProjectId: z.string() }))
			.query(({ input }) => {
				const children = localDb
					.select()
					.from(projects)
					.where(eq(projects.parentProjectId, input.featureProjectId))
					.all();

				if (children.length === 0) return [];

				const childWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(
						and(
							inArray(
								workspaces.projectId,
								children.map((c) => c.id),
							),
							eq(workspaces.type, "branch"),
							isNull(workspaces.deletingAt),
						),
					)
					.all();

				const workspaceByProjectId = new Map(
					childWorkspaces.map((ws) => [ws.projectId, ws]),
				);

				return children.map((child) => {
					const ws = workspaceByProjectId.get(child.id);
					return {
						id: child.id,
						name: child.name,
						mainRepoPath: child.mainRepoPath,
						defaultBranch: child.defaultBranch,
						workspaceId: ws?.id ?? null,
						workspaceBranch: ws?.branch ?? "",
					};
				});
			}),

		/** Remove a child repo from a feature project. Optionally deletes the folder from disk. */
		removeRepo: publicProcedure
			.input(
				z.object({
					childProjectId: z.string(),
					deleteFromDisk: z.boolean().default(false),
				}),
			)
			.mutation(async ({ input }) => {
				const child = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.childProjectId))
					.get();

				if (!child || !child.parentProjectId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Child repo project not found",
					});
				}

				const childWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, child.id))
					.all();

				const registry = getWorkspaceRuntimeRegistry();
				for (const ws of childWorkspaces) {
					const terminal = registry.getForWorkspaceId(ws.id).terminal;
					await terminal.killByWorkspaceId(ws.id);
				}

				const childWorkspaceIds = childWorkspaces.map((w) => w.id);
				if (childWorkspaceIds.length > 0) {
					// Update active workspace if needed
					const currentSettings = localDb.select().from(settings).get();
					if (
						currentSettings?.lastActiveWorkspaceId &&
						childWorkspaceIds.includes(currentSettings.lastActiveWorkspaceId)
					) {
						setLastActiveWorkspace(selectNextActiveWorkspace());
					}

					localDb
						.delete(workspaces)
						.where(inArray(workspaces.id, childWorkspaceIds))
						.run();
				}

				localDb
					.delete(worktrees)
					.where(eq(worktrees.projectId, child.id))
					.run();
				localDb
					.delete(workspaceSections)
					.where(eq(workspaceSections.projectId, child.id))
					.run();
				deleteProjectIcon(child.id);
				localDb.delete(projects).where(eq(projects.id, child.id)).run();

				if (input.deleteFromDisk) {
					const { rm } = await import("node:fs/promises");
					await rm(child.mainRepoPath, { recursive: true, force: true });
				}

				return { success: true };
			}),
	});
};

export type FeatureProjectsRouter = ReturnType<
	typeof createFeatureProjectsRouter
>;
