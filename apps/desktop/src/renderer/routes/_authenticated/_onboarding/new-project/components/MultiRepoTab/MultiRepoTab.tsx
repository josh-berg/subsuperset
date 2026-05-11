import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	LuCheck,
	LuGitBranch,
	LuLoader,
	LuPlus,
	LuSearch,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface RepoSelection {
	fullName: string;
	name: string;
	description: string | null;
	isPrivate: boolean;
	parentBranch: string;
}

interface MultiRepoTabProps {
	onError: (error: string) => void;
	parentDir: string;
}

type Step = "configure" | "select-repos" | "creating";

export function MultiRepoTab({ onError, parentDir }: MultiRepoTabProps) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();

	const [step, setStep] = useState<Step>("configure");
	const [projectName, setProjectName] = useState("");
	const [branchName, setBranchName] = useState("");
	const [repoSearch, setRepoSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [selectedRepos, setSelectedRepos] = useState<RepoSelection[]>([]);
	const [addingRepoIndex, setAddingRepoIndex] = useState<number | null>(null);
	const [creationDone, setCreationDone] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(repoSearch), 1000);
		return () => clearTimeout(timer);
	}, [repoSearch]);

	const createFeatureProject =
		electronTrpc.featureProjects.create.useMutation();
	const addRepo = electronTrpc.featureProjects.addRepo.useMutation();

	const { data: searchResults = [], isFetching: isSearching } =
		electronTrpc.featureProjects.searchGitHubRepos.useQuery(
			{ query: debouncedSearch.trim(), limit: 20 },
			{ enabled: debouncedSearch.trim().length >= 2 },
		);

	const isRepoSelected = (fullName: string) =>
		selectedRepos.some((r) => r.fullName === fullName);

	const toggleRepo = (repo: {
		fullName: string;
		name: string;
		description: string | null;
		isPrivate: boolean;
	}) => {
		if (isRepoSelected(repo.fullName)) {
			setSelectedRepos((prev) =>
				prev.filter((r) => r.fullName !== repo.fullName),
			);
		} else {
			setSelectedRepos((prev) => [...prev, { ...repo, parentBranch: "" }]);
		}
	};

	const updateParentBranch = (fullName: string, value: string) => {
		setSelectedRepos((prev) =>
			prev.map((r) =>
				r.fullName === fullName ? { ...r, parentBranch: value } : r,
			),
		);
	};

	const handleConfigure = () => {
		if (!projectName.trim()) {
			onError("Please enter a project name");
			return;
		}
		if (!branchName.trim()) {
			onError("Please enter a feature branch name");
			return;
		}
		if (!parentDir.trim()) {
			onError("Please select a project location");
			return;
		}
		setStep("select-repos");
	};

	const handleCreate = async () => {
		if (selectedRepos.length === 0) {
			onError("Please select at least one repository");
			return;
		}

		setStep("creating");

		try {
			const { project } = await createFeatureProject.mutateAsync({
				name: projectName.trim(),
				parentDir: parentDir.trim(),
			});

			for (let i = 0; i < selectedRepos.length; i++) {
				setAddingRepoIndex(i);
				const repo = selectedRepos[i];
				await addRepo.mutateAsync({
					featureProjectId: project.id,
					repoFullName: repo.fullName,
					branchName: branchName.trim(),
					parentBranch: repo.parentBranch.trim() || undefined,
				});
			}

			setAddingRepoIndex(null);
			setCreationDone(true);

			await utils.workspaces.getAllGrouped.invalidate();
			await utils.projects.getRecents.invalidate();

			setTimeout(() => {
				navigate({
					to: "/project/$projectId",
					params: { projectId: project.id },
					replace: true,
				});
			}, 800);
		} catch (err) {
			setStep("select-repos");
			setAddingRepoIndex(null);
			onError(err instanceof Error ? err.message : "Failed to create project");
		}
	};

	if (step === "creating") {
		return (
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-3">
					{selectedRepos.map((repo, i) => {
						const isDone =
							addingRepoIndex !== null ? i < addingRepoIndex : creationDone;
						const isCurrent = addingRepoIndex === i;

						return (
							<div
								key={repo.fullName}
								className="flex items-center gap-3 text-sm"
							>
								<div className="size-5 flex items-center justify-center">
									{isDone || creationDone ? (
										<LuCheck className="size-4 text-green-500" />
									) : isCurrent ? (
										<LuLoader className="size-4 animate-spin text-primary" />
									) : (
										<div className="size-2 rounded-full bg-muted-foreground/30" />
									)}
								</div>
								<span
									className={
										isDone || creationDone
											? "text-foreground"
											: isCurrent
												? "text-foreground"
												: "text-muted-foreground"
									}
								>
									{repo.name}
								</span>
								{(isDone || creationDone) && (
									<span className="text-xs text-muted-foreground ml-auto">
										{branchName}
									</span>
								)}
							</div>
						);
					})}
				</div>
			</div>
		);
	}

	if (step === "select-repos") {
		return (
			<div className="flex flex-col gap-5">
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor="repo-search"
						className="text-sm font-medium text-foreground"
					>
						Search GitHub repositories
					</label>
					<div className="relative">
						<LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
						<Input
							id="repo-search"
							value={repoSearch}
							onChange={(e) => setRepoSearch(e.target.value)}
							placeholder="Search repos..."
							className="pl-8"
							autoFocus
						/>
					</div>
					{isSearching && (
						<p className="text-xs text-muted-foreground">Searching...</p>
					)}
				</div>

				{searchResults.length > 0 && (
					<div className="flex flex-col gap-1 max-h-48 overflow-y-auto border border-border rounded-md p-1">
						{searchResults.map((repo) => {
							const selected = isRepoSelected(repo.fullName);
							return (
								<button
									key={repo.fullName}
									type="button"
									onClick={() => toggleRepo(repo)}
									className="flex items-center gap-3 w-full px-3 py-2 rounded text-left hover:bg-accent/50 transition-colors"
								>
									<div
										className={`size-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}
									>
										{selected && (
											<LuCheck className="size-3 text-primary-foreground" />
										)}
									</div>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium truncate">
											{repo.fullName}
										</div>
										{repo.description && (
											<div className="text-xs text-muted-foreground truncate">
												{repo.description}
											</div>
										)}
									</div>
									{repo.isPrivate && (
										<span className="text-[10px] text-muted-foreground/60 border border-border/60 rounded px-1 shrink-0">
											private
										</span>
									)}
								</button>
							);
						})}
					</div>
				)}

				{selectedRepos.length > 0 && (
					<div className="flex flex-col gap-2">
						<p className="text-sm font-medium text-foreground">
							Selected ({selectedRepos.length})
						</p>
						{selectedRepos.map((repo) => (
							<div
								key={repo.fullName}
								className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2"
							>
								<LuGitBranch className="size-3.5 text-muted-foreground shrink-0" />
								<span className="text-sm flex-1 truncate">{repo.fullName}</span>
								<Input
									value={repo.parentBranch}
									onChange={(e) =>
										updateParentBranch(repo.fullName, e.target.value)
									}
									placeholder="parent branch (default: main)"
									className="h-7 text-xs w-40 shrink-0"
								/>
								<button
									type="button"
									onClick={() =>
										setSelectedRepos((prev) =>
											prev.filter((r) => r.fullName !== repo.fullName),
										)
									}
									className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
								>
									<LuX className="size-3.5" />
								</button>
							</div>
						))}
					</div>
				)}

				<div className="flex justify-between pt-2 border-t border-border/40">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setStep("configure")}
					>
						Back
					</Button>
					<Button
						size="sm"
						onClick={handleCreate}
						disabled={selectedRepos.length === 0}
					>
						<LuPlus className="size-4 mr-1" />
						Create project ({selectedRepos.length} repos)
					</Button>
				</div>
			</div>
		);
	}

	// Step: configure
	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="feature-project-name"
					className="text-sm font-medium text-foreground"
				>
					Project name
				</label>
				<Input
					id="feature-project-name"
					value={projectName}
					onChange={(e) => setProjectName(e.target.value)}
					placeholder="my-feature"
					autoFocus
					onKeyDown={(e) => {
						if (e.key === "Enter") handleConfigure();
					}}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="feature-branch-name"
					className="text-sm font-medium text-foreground"
				>
					Feature branch name
				</label>
				<Input
					id="feature-branch-name"
					value={branchName}
					onChange={(e) => setBranchName(e.target.value)}
					placeholder="feature/my-feature"
					onKeyDown={(e) => {
						if (e.key === "Enter") handleConfigure();
					}}
				/>
				<p className="text-xs text-muted-foreground">
					This branch will be created in each repo you add.
				</p>
			</div>
			<div className="flex justify-end pt-2 border-t border-border/40">
				<Button size="sm" onClick={handleConfigure}>
					Next: Select repos
				</Button>
			</div>
		</div>
	);
}
