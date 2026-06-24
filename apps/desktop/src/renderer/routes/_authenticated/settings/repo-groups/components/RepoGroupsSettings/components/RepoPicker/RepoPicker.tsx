import { Input } from "@superset/ui/input";
import { useState } from "react";
import {
	LuCheck,
	LuGitBranch,
	LuRefreshCw,
	LuSearch,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface RepoPickerProps {
	/** Selected GitHub repo full names. */
	value: string[];
	onChange: (next: string[]) => void;
}

/**
 * Controlled multi-select over the local GitHub repo cache. Mirrors the search
 * experience used in the multi-repo project creation flow.
 */
export function RepoPicker({ value, onChange }: RepoPickerProps) {
	const utils = electronTrpc.useUtils();
	const [search, setSearch] = useState("");

	const { data: cacheStatus } =
		electronTrpc.featureProjects.getRepoCacheStatus.useQuery();

	const { data: searchResults = [] } =
		electronTrpc.featureProjects.searchCachedRepos.useQuery(
			{ query: search.trim(), limit: 20 },
			{ enabled: (cacheStatus?.count ?? 0) > 0 },
		);

	const syncCache = electronTrpc.featureProjects.syncRepoCache.useMutation({
		onSuccess: async () => {
			await utils.featureProjects.getRepoCacheStatus.invalidate();
			await utils.featureProjects.searchCachedRepos.invalidate();
		},
	});
	const isSyncing = syncCache.isPending;

	const isSelected = (fullName: string) => value.includes(fullName);
	const toggle = (fullName: string) => {
		onChange(
			isSelected(fullName)
				? value.filter((r) => r !== fullName)
				: [...value, fullName],
		);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">
					{cacheStatus?.count
						? `${cacheStatus.count} repos available`
						: "No repos cached yet"}
				</span>
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

			<div className="relative">
				<LuSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={isSyncing ? "Syncing repo list…" : "Search repos…"}
					className="pl-8"
					disabled={isSyncing}
				/>
			</div>

			{(cacheStatus?.count ?? 0) > 0 && !isSyncing && (
				<div className="h-44 overflow-y-auto border border-border rounded-md p-1">
					{searchResults.length === 0 ? (
						<div className="flex items-center justify-center h-full text-sm text-muted-foreground">
							{search.trim() ? "No repos found" : "Type to search repos"}
						</div>
					) : (
						<div className="flex flex-col gap-1">
							{searchResults.map((repo) => {
								const selected = isSelected(repo.fullName);
								return (
									<button
										key={repo.fullName}
										type="button"
										onClick={() => toggle(repo.fullName)}
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

			{value.length > 0 && (
				<div className="flex flex-col gap-2">
					<p className="text-sm font-medium text-foreground">
						Selected ({value.length})
					</p>
					<div className="flex flex-wrap gap-1.5">
						{value.map((fullName) => (
							<span
								key={fullName}
								className="flex items-center gap-1.5 rounded-md border border-border/60 pl-2 pr-1 py-1 text-xs"
							>
								<LuGitBranch className="size-3 text-muted-foreground shrink-0" />
								<span className="truncate max-w-[220px]">{fullName}</span>
								<button
									type="button"
									onClick={() => toggle(fullName)}
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									<LuX className="size-3" />
								</button>
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
