import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	LuBookmark,
	LuCheck,
	LuGitBranch,
	LuLayers,
	LuPlus,
	LuRefreshCw,
	LuSearch,
	LuSettings,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

export interface RepoSelection {
	fullName: string;
	name: string;
	description: string | null;
	isPrivate: boolean;
	parentBranch: string;
}

interface RepoPickerProps {
	selectedRepos: RepoSelection[];
	onToggleRepo: (repo: {
		fullName: string;
		name: string;
		description: string | null;
		isPrivate: boolean;
	}) => void;
	onUpdateParentBranch: (fullName: string, value: string) => void;
	onRemoveRepo: (fullName: string) => void;
	onApplyGroup: (repos: string[]) => void;
	onError: (error: string) => void;
}

export function RepoPicker({
	selectedRepos,
	onToggleRepo,
	onUpdateParentBranch,
	onRemoveRepo,
	onApplyGroup,
	onError,
}: RepoPickerProps) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();

	const [repoSearch, setRepoSearch] = useState("");
	const [savingGroup, setSavingGroup] = useState(false);
	const [newGroupName, setNewGroupName] = useState("");

	const { data: repoGroups = [] } = electronTrpc.repoGroups.list.useQuery();
	const createRepoGroup = electronTrpc.repoGroups.create.useMutation({
		onSuccess: async () => {
			await utils.repoGroups.list.invalidate();
			setSavingGroup(false);
			setNewGroupName("");
		},
		onError: (err) => onError(err.message),
	});

	const { data: cacheStatus } =
		electronTrpc.featureProjects.getRepoCacheStatus.useQuery();

	const { data: searchResults = [] } =
		electronTrpc.featureProjects.searchCachedRepos.useQuery(
			{ query: repoSearch.trim(), limit: 20 },
			{ enabled: (cacheStatus?.count ?? 0) > 0 },
		);

	const syncCache = electronTrpc.featureProjects.syncRepoCache.useMutation({
		onSuccess: async () => {
			await utils.featureProjects.getRepoCacheStatus.invalidate();
			await utils.featureProjects.searchCachedRepos.invalidate();
		},
		onError: (err) => onError(err.message),
	});

	// Auto-sync when first shown and the cache is empty
	useEffect(() => {
		if (cacheStatus?.count === 0) {
			syncCache.mutate();
		}
	}, [cacheStatus?.count, syncCache.mutate]); // eslint-disable-line react-hooks/exhaustive-deps

	const isSyncing = syncCache.isPending;

	const isRepoSelected = (fullName: string) =>
		selectedRepos.some((r) => r.fullName === fullName);

	const handleSaveGroup = () => {
		if (!newGroupName.trim()) {
			onError("Please enter a group name");
			return;
		}
		if (selectedRepos.length === 0) {
			onError("Select at least one repo to save as a group");
			return;
		}
		createRepoGroup.mutate({
			name: newGroupName.trim(),
			repos: selectedRepos.map((r) => r.fullName),
		});
	};

	const lastSyncedLabel = (() => {
		if (!cacheStatus?.syncedAt) return null;
		const diffMs = Date.now() - cacheStatus.syncedAt;
		const diffMin = Math.floor(diffMs / 60_000);
		if (diffMin < 1) return "just now";
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		return `${Math.floor(diffHr / 24)}d ago`;
	})();

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium text-foreground flex items-center gap-1.5">
						<LuLayers className="size-3.5 text-muted-foreground" />
						Repo groups
					</span>
					<button
						type="button"
						onClick={() => navigate({ to: "/settings/repo-groups" })}
						className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
						title="Manage repo groups in settings"
					>
						<LuSettings className="size-3" />
						Manage
					</button>
				</div>
				{repoGroups.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						No saved groups yet. Create one in settings to quickly add a set of
						repos.
					</p>
				) : (
					<div className="flex flex-wrap gap-1.5">
						{repoGroups.map((group) => (
							<button
								key={group.id}
								type="button"
								onClick={() => onApplyGroup(group.repos)}
								className="flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs hover:bg-accent/50 transition-colors"
								title={group.repos.join("\n")}
							>
								<LuPlus className="size-3 text-muted-foreground" />
								<span>{group.name}</span>
								<span className="text-muted-foreground/60">
									{group.repos.length}
								</span>
							</button>
						))}
					</div>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				<div className="flex items-center justify-between">
					<label
						htmlFor="repo-search"
						className="text-sm font-medium text-foreground"
					>
						Search GitHub repositories
					</label>
					<div className="flex items-center gap-1.5">
						{lastSyncedLabel && (
							<span className="text-xs text-muted-foreground">
								{cacheStatus?.count} repos · synced {lastSyncedLabel}
							</span>
						)}
						<button
							type="button"
							onClick={() => syncCache.mutate()}
							disabled={isSyncing}
							className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
							title="Refresh repo list"
						>
							<LuRefreshCw
								className={`size-3 ${isSyncing ? "animate-spin" : ""}`}
							/>
							{isSyncing ? "Syncing…" : "Refresh"}
						</button>
					</div>
				</div>
				<div className="relative">
					<LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						id="repo-search"
						value={repoSearch}
						onChange={(e) => setRepoSearch(e.target.value)}
						placeholder={
							isSyncing
								? "Syncing repo list…"
								: cacheStatus?.count === 0
									? "Fetching repos…"
									: "Search repos…"
						}
						className="pl-8"
						disabled={isSyncing}
						autoFocus
					/>
				</div>
			</div>

			{(cacheStatus?.count ?? 0) > 0 && !isSyncing && (
				<div className="h-48 overflow-y-auto border border-border rounded-md p-1">
					{searchResults.length === 0 ? (
						<div className="flex items-center justify-center h-full text-sm text-muted-foreground">
							{repoSearch.trim() ? "No repos found" : "Type to search repos"}
						</div>
					) : (
						<div className="flex flex-col gap-1">
							{searchResults.map((repo) => {
								const selected = isRepoSelected(repo.fullName);
								return (
									<button
										key={repo.fullName}
										type="button"
										onClick={() => onToggleRepo(repo)}
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
				</div>
			)}

			{selectedRepos.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<p className="text-sm font-medium text-foreground">
							Selected ({selectedRepos.length})
						</p>
						<button
							type="button"
							onClick={() => setSavingGroup((s) => !s)}
							className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							<LuBookmark className="size-3" />
							Save as group
						</button>
					</div>
					{savingGroup && (
						<div className="flex items-center gap-2">
							<Input
								value={newGroupName}
								onChange={(e) => setNewGroupName(e.target.value)}
								placeholder="Group name"
								className="h-8 text-sm"
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSaveGroup();
									if (e.key === "Escape") setSavingGroup(false);
								}}
							/>
							<Button
								size="sm"
								onClick={handleSaveGroup}
								disabled={createRepoGroup.isPending}
							>
								{createRepoGroup.isPending ? "Saving…" : "Save"}
							</Button>
						</div>
					)}
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
									onUpdateParentBranch(repo.fullName, e.target.value)
								}
								placeholder="parent branch (default: main)"
								className="h-7 text-xs w-40 shrink-0"
							/>
							<button
								type="button"
								onClick={() => onRemoveRepo(repo.fullName)}
								className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
							>
								<LuX className="size-3.5" />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
