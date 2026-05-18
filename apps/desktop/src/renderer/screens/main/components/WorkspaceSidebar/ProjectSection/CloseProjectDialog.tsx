import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Label } from "@superset/ui/label";
import { useState } from "react";
import { LuGitBranch, LuTriangleAlert } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface CloseProjectDialogProps {
	projectId: string;
	projectName: string;
	workspaceCount: number;
	mainRepoPath: string;
	isGitless: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (options: { deleteFromDisk: boolean }) => void;
}

export function CloseProjectDialog({
	projectId,
	projectName,
	workspaceCount,
	mainRepoPath,
	isGitless,
	open,
	onOpenChange,
	onConfirm,
}: CloseProjectDialogProps) {
	const [deleteFromDisk, setDeleteFromDisk] = useState(false);

	const { data: warningsData, isLoading: isCheckingWarnings } =
		electronTrpc.projects.getCloseWarnings.useQuery(
			{ id: projectId },
			{
				enabled: open && !isGitless,
				staleTime: 0,
				refetchOnWindowFocus: false,
			},
		);

	const warnings = warningsData?.warnings ?? [];
	const hasWarnings = warnings.length > 0;
	const worktreePaths = warningsData?.worktreePaths ?? [];

	const handleConfirm = () => {
		onConfirm({ deleteFromDisk });
		setDeleteFromDisk(false);
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setDeleteFromDisk(false);
		}
		onOpenChange(nextOpen);
	};

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[360px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Close project "{projectName}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="text-muted-foreground space-y-1.5">
							<span className="block">
								This will close {workspaceCount} workspace
								{workspaceCount !== 1 ? "s" : ""} and kill all active terminals
								in this project.
							</span>
							{!isGitless && !deleteFromDisk && (
								<span className="block">
									Your files and git history will remain on disk.
								</span>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{/* Git status warnings */}
				{!isGitless && (
					<>
						{isCheckingWarnings && (
							<div className="px-4 pb-2">
								<p className="text-xs text-muted-foreground animate-pulse">
									Checking for unsaved changes…
								</p>
							</div>
						)}
						{!isCheckingWarnings && hasWarnings && (
							<div className="px-4 pb-2">
								<div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 space-y-1.5">
									<div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
										<LuTriangleAlert className="h-3.5 w-3.5 shrink-0" />
										<span className="text-xs font-medium">
											Unsaved changes detected
										</span>
									</div>
									<ul className="space-y-1">
										{warnings.map((w) => (
											<li key={w.branch} className="flex items-start gap-1.5">
												<LuGitBranch className="h-3 w-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
												<span className="text-xs leading-relaxed">
													<span className="font-mono text-amber-800 dark:text-amber-300 break-all">
														{w.branch}
													</span>
													<span className="text-amber-600 dark:text-amber-400 ml-1">
														—{" "}
														{w.hasChanges && w.hasUnpushedCommits
															? "uncommitted changes, unpushed commits"
															: w.hasChanges
																? "uncommitted changes"
																: "unpushed commits"}
													</span>
												</span>
											</li>
										))}
									</ul>
								</div>
							</div>
						)}
					</>
				)}

				{/* Delete from disk checkbox */}
				{!isGitless && (
					<div className="px-4 pb-2 space-y-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="delete-from-disk"
								checked={deleteFromDisk}
								onCheckedChange={(checked) =>
									setDeleteFromDisk(checked === true)
								}
							/>
							<Label
								htmlFor="delete-from-disk"
								className="text-xs text-muted-foreground cursor-pointer select-none"
							>
								Also delete files from disk
							</Label>
						</div>
						{deleteFromDisk && (
							<ul className="space-y-0.5 pl-6">
								<li className="text-xs text-destructive font-mono break-all leading-relaxed">
									{mainRepoPath}
								</li>
								{worktreePaths.map((p) => (
									<li
										key={p}
										className="text-xs text-destructive font-mono break-all leading-relaxed"
									>
										{p}
									</li>
								))}
							</ul>
						)}
					</div>
				)}

				<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => handleOpenChange(false)}
					>
						Cancel
					</Button>
					<AlertDialogAction
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={handleConfirm}
					>
						{deleteFromDisk ? "Close & Delete Files" : "Close Project"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
