import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import {
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuNetwork,
	LuSettings,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { CloneRepoTab } from "./components/CloneRepoTab";
import { EmptyRepoTab } from "./components/EmptyRepoTab";
import { MultiRepoTab } from "./components/MultiRepoTab";
import { OpenFolderTab } from "./components/OpenFolderTab";
import type { NewProjectMode } from "./constants";

export const Route = createFileRoute(
	"/_authenticated/_onboarding/new-project/",
)({
	component: NewProjectPage,
});

const OPTIONS: {
	mode: NewProjectMode;
	label: string;
	description: string;
	icon: typeof LuFolderPlus;
}[] = [
	{
		mode: "clone",
		label: "Single-repo",
		description: "Work within a single repository",
		icon: LuGitBranch,
	},
	{
		mode: "multi-repo",
		label: "Multi-repo",
		description: "Feature across multiple repos",
		icon: LuNetwork,
	},
	{
		mode: "empty",
		label: "New Repository",
		description: "New git repository from scratch",
		icon: LuFolderPlus,
	},
	{
		mode: "open-folder",
		label: "Open Folder",
		description: "Open any folder without git",
		icon: LuFolderOpen,
	},
];

function NewProjectPage() {
	const [mode, setMode] = useState<NewProjectMode>("clone");
	const [error, setError] = useState<string | null>(null);

	const { data: projectsRootDir, isLoading: isRootLoading } =
		electronTrpc.settings.getProjectsRootDir.useQuery();

	const reposDir =
		projectsRootDir ? `${projectsRootDir}/repos` : null;
	const projectsDir =
		projectsRootDir ? `${projectsRootDir}/projects` : null;

	const activeDir =
		mode === "multi-repo" ? projectsDir : reposDir;

	return (
		<div className="flex flex-col h-full w-full relative overflow-hidden bg-background">
			<div className="absolute top-4 left-4 z-10">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/">
						<HiArrowLeft className="size-4" />
						Back
					</Link>
				</Button>
			</div>

			<div className="relative flex flex-1 items-center justify-center">
				<div className="flex flex-col items-center w-full max-w-xl px-6">
					<div className="w-full flex flex-col gap-5">
						<h1 className="text-lg font-medium text-foreground">New Project</h1>

						{/* Storage location row (hidden for open-folder which uses its own path) */}
						{mode !== "open-folder" && !isRootLoading && (
							projectsRootDir ? (
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<span>Saving to</span>
									<code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
										{activeDir}
									</code>
									<Link
										to="/settings/git"
										className="ml-auto flex items-center gap-1 hover:text-foreground transition-colors"
									>
										<LuSettings className="size-3" />
										Change
									</Link>
								</div>
							) : (
								<div className="flex items-center gap-2 rounded-md px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
									<span className="flex-1">
										Set a projects root directory before creating projects.
									</span>
									<Link
										to="/settings/git"
										className="flex items-center gap-1 font-medium hover:underline shrink-0"
									>
										<LuSettings className="size-3" />
										Open Settings
									</Link>
								</div>
							)
						)}

						<div className="grid grid-cols-2 gap-3">
							{OPTIONS.map((option) => {
								const selected = mode === option.mode;
								return (
									<button
										key={option.mode}
										type="button"
										onClick={() => {
											setMode(option.mode);
											setError(null);
										}}
										className={cn(
											"flex flex-col items-center gap-3 rounded-lg border p-4 pt-5 text-center transition-all",
											selected
												? "border-primary/50 bg-primary/5"
												: "border-border/50 hover:border-border hover:bg-accent/30",
										)}
									>
										<option.icon
											className={cn(
												"size-6",
												selected ? "text-primary" : "text-muted-foreground",
											)}
										/>
										<div>
											<div className="text-sm font-medium text-foreground">
												{option.label}
											</div>
											<div className="text-xs text-muted-foreground mt-0.5">
												{option.description}
											</div>
										</div>
									</button>
								);
							})}
						</div>

						{mode === "empty" && (
							<EmptyRepoTab
								onError={setError}
								parentDir={reposDir ?? ""}
								disabled={!projectsRootDir}
							/>
						)}
						{mode === "clone" && (
							<CloneRepoTab
								onError={setError}
								parentDir={reposDir ?? ""}
								disabled={!projectsRootDir}
							/>
						)}
						{mode === "multi-repo" && (
							<MultiRepoTab
								onError={setError}
								parentDir={projectsDir ?? ""}
								disabled={!projectsRootDir}
							/>
						)}
						{mode === "open-folder" && (
							<OpenFolderTab onError={setError} />
						)}

						{error && (
							<div className="w-full flex items-start gap-2 rounded-md px-4 py-3 bg-destructive/10 border border-destructive/20">
								<span className="flex-1 text-sm text-destructive">{error}</span>
								<button
									type="button"
									onClick={() => setError(null)}
									className="shrink-0 rounded p-0.5 text-destructive/70 hover:text-destructive transition-colors"
									aria-label="Dismiss error"
								>
									<LuX className="h-3.5 w-3.5" />
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
