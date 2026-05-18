import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useEffect, useState } from "react";
import { LuCheck, LuRefreshCw, LuSearch } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useProjectCreationHandler } from "../../hooks/useProjectCreationHandler";

interface CloneRepoTabProps {
	onError: (error: string) => void;
	parentDir: string;
}

export function CloneRepoTab({ onError, parentDir }: CloneRepoTabProps) {
	const [url, setUrl] = useState("");
	const [repoSearch, setRepoSearch] = useState("");
	const [selectedFullName, setSelectedFullName] = useState<string | null>(null);

	const utils = electronTrpc.useUtils();
	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation();
	const { handleResult, handleError } = useProjectCreationHandler(onError);
	const isLoading = cloneRepo.isPending;

	const { data: cacheStatus } =
		electronTrpc.featureProjects.getRepoCacheStatus.useQuery();

	const { data: searchResults = [] } =
		electronTrpc.featureProjects.searchCachedRepos.useQuery(
			{ query: repoSearch.trim(), limit: 20 },
			{ enabled: cacheStatus != null && cacheStatus.count > 0 },
		);

	const syncCache = electronTrpc.featureProjects.syncRepoCache.useMutation({
		onSuccess: async () => {
			await utils.featureProjects.getRepoCacheStatus.invalidate();
			await utils.featureProjects.searchCachedRepos.invalidate();
		},
		onError: (err) => onError(err.message),
	});

	// Auto-sync on first mount if the cache is empty
	useEffect(() => {
		if (cacheStatus?.count === 0) {
			syncCache.mutate();
		}
	}, [cacheStatus?.count === 0]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleRepoSelect = (repo: { fullName: string; url: string }) => {
		setUrl(repo.url);
		setSelectedFullName(repo.fullName);
		setRepoSearch(repo.fullName);
	};

	const handleUrlChange = (value: string) => {
		setUrl(value);
		if (selectedFullName) setSelectedFullName(null);
	};

	const handleClone = () => {
		if (!url.trim()) {
			onError("Please enter a repository URL");
			return;
		}
		if (!parentDir.trim()) {
			onError("Please select a project location");
			return;
		}

		cloneRepo.mutate(
			{ url: url.trim(), targetDirectory: parentDir.trim() },
			{
				onSuccess: (result) =>
					handleResult(result, () => {
						setUrl("");
						setRepoSearch("");
						setSelectedFullName(null);
					}),
				onError: handleError,
			},
		);
	};

	const isSyncing = syncCache.isPending;

	// Show the list container whenever the user is actively searching and the
	// cache is ready. Fixed height means layout never shifts as results change.
	const showResultsContainer =
		repoSearch.trim().length > 0 && (cacheStatus?.count ?? 0) > 0 && !isSyncing;

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
			{/* GitHub repo search */}
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center justify-between">
					<label
						htmlFor="clone-repo-search"
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
							disabled={isSyncing || isLoading}
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
						id="clone-repo-search"
						value={repoSearch}
						onChange={(e) => {
							setRepoSearch(e.target.value);
							if (selectedFullName) setSelectedFullName(null);
						}}
						placeholder={
							isSyncing
								? "Syncing repo list…"
								: cacheStatus?.count === 0
									? "Fetching repos…"
									: "Search repos…"
						}
						className="pl-8"
						disabled={isLoading || isSyncing}
						autoFocus
					/>
				</div>
				{showResultsContainer && (
					<div className="h-48 overflow-y-auto border border-border rounded-md p-1">
						{searchResults.length === 0 ? (
							<div className="flex items-center justify-center h-full text-sm text-muted-foreground">
								No repos found
							</div>
						) : (
							<div className="flex flex-col gap-1">
								{searchResults.map((repo) => {
									const isSelected = selectedFullName === repo.fullName;
									return (
										<button
											key={repo.fullName}
											type="button"
											onClick={() => handleRepoSelect(repo)}
											className="flex items-center gap-3 w-full px-3 py-2 rounded text-left hover:bg-accent/50 transition-colors"
										>
											<div
												className={`size-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"}`}
											>
												{isSelected && (
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
			</div>

			{/* Divider */}
			<div className="flex items-center gap-3">
				<div className="flex-1 h-px bg-border/40" />
				<span className="text-xs text-muted-foreground">or</span>
				<div className="flex-1 h-px bg-border/40" />
			</div>

			{/* Manual URL input */}
			<div>
				<label
					htmlFor="clone-url"
					className="block text-sm font-medium text-foreground mb-2"
				>
					Repository URL
				</label>
				<Input
					id="clone-url"
					value={url}
					onChange={(e) => handleUrlChange(e.target.value)}
					placeholder="https:// or git@github.com:user/repo.git"
					disabled={isLoading}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !isLoading) {
							handleClone();
						}
					}}
				/>
			</div>

			<div className="flex justify-end pt-2 border-t border-border/40">
				<Button
					onClick={handleClone}
					disabled={isLoading || !url.trim()}
					size="sm"
				>
					{isLoading ? "Cloning..." : "Clone"}
				</Button>
			</div>
		</div>
	);
}
