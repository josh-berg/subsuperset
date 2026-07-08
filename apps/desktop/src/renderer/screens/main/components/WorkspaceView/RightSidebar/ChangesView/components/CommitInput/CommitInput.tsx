import type { GitHubStatus } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import {
	VscArrowUp,
	VscCheck,
	VscChevronDown,
	VscLinkExternal,
} from "react-icons/vsc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateOrOpenPR } from "renderer/screens/main/hooks";

type CommitInputPullRequest = NonNullable<GitHubStatus["pr"]>;

interface CommitInputProps {
	worktreePath: string;
	hasChangesToCommit: boolean;
	filesToStage: string[];
	filesToUnstage: string[];
	hasUpstream: boolean;
	pullRequest?: CommitInputPullRequest | null;
	canCreatePR: boolean;
	shouldAutoCreatePRAfterPublish: boolean;
	onRefresh: () => void;
}

export function CommitInput({
	worktreePath,
	hasChangesToCommit,
	filesToStage,
	filesToUnstage,
	hasUpstream,
	pullRequest,
	canCreatePR,
	shouldAutoCreatePRAfterPublish,
	onRefresh,
}: CommitInputProps) {
	const [commitMessage, setCommitMessage] = useState("");
	const [isOpen, setIsOpen] = useState(false);

	const commitMutation = electronTrpc.changes.commit.useMutation({
		onSuccess: () => {
			toast.success("Committed");
			setCommitMessage("");
			onRefresh();
		},
		onError: (error) => toast.error(`Commit failed: ${error.message}`),
	});

	const stageFilesMutation = electronTrpc.changes.stageFiles.useMutation();
	const unstageFilesMutation = electronTrpc.changes.unstageFiles.useMutation();

	const pushMutation = electronTrpc.changes.push.useMutation({
		onSuccess: () => {
			toast.success("Pushed");
			onRefresh();
		},
		onError: (error) => toast.error(`Push failed: ${error.message}`),
	});

	const { createOrOpenPR, isPending: isCreateOrOpenPRPending } =
		useCreateOrOpenPR({
			worktreePath,
			onSuccess: onRefresh,
		});

	const isPending =
		commitMutation.isPending ||
		stageFilesMutation.isPending ||
		unstageFilesMutation.isPending ||
		pushMutation.isPending ||
		isCreateOrOpenPRPending;

	const canCommit = hasChangesToCommit && commitMessage.trim();
	const hasExistingPR = Boolean(pullRequest);
	const prUrl = pullRequest?.url;

	// Reconcile git's index with the checked files before committing, since checkboxes
	// track commit inclusion independently of actual staged/unstaged state.
	const reconcileStaging = async () => {
		if (filesToUnstage.length > 0) {
			await unstageFilesMutation.mutateAsync({
				worktreePath,
				filePaths: filesToUnstage,
			});
		}
		if (filesToStage.length > 0) {
			await stageFilesMutation.mutateAsync({
				worktreePath,
				filePaths: filesToStage,
			});
		}
	};

	const handleCommit = async () => {
		if (!canCommit) return;
		await reconcileStaging();
		commitMutation.mutate({ worktreePath, message: commitMessage.trim() });
	};

	const handlePush = () => {
		const isPublishing = !hasUpstream;
		pushMutation.mutate(
			{ worktreePath, setUpstream: true },
			{
				onSuccess: () => {
					if (
						isPublishing &&
						!hasExistingPR &&
						shouldAutoCreatePRAfterPublish
					) {
						createOrOpenPR();
					}
				},
			},
		);
	};

	const handleCommitAndPush = async () => {
		if (!canCommit) return;
		await reconcileStaging();
		commitMutation.mutate(
			{ worktreePath, message: commitMessage.trim() },
			{ onSuccess: handlePush },
		);
	};

	const handleCommitPushAndCreatePR = async () => {
		if (!canCommit) return;
		await reconcileStaging();
		commitMutation.mutate(
			{ worktreePath, message: commitMessage.trim() },
			{
				onSuccess: () => {
					pushMutation.mutate(
						{ worktreePath, setUpstream: true },
						{ onSuccess: () => createOrOpenPR() },
					);
				},
			},
		);
	};

	const handleCreatePR = () => {
		if (!canCreatePR) return;
		createOrOpenPR();
	};

	const handleOpenPR = () => prUrl && window.open(prUrl, "_blank");

	const commitTooltip = !hasChangesToCommit
		? "No changes selected"
		: !commitMessage.trim()
			? "Enter a commit message"
			: "Commit selected changes (⌘↵)";

	return (
		<div className="flex flex-col gap-1.5 px-2 py-2">
			<Textarea
				placeholder="Commit message"
				value={commitMessage}
				onChange={(e) => setCommitMessage(e.target.value)}
				className="min-h-[52px] resize-none text-[10px] bg-background"
				onKeyDown={(e) => {
					if (
						e.key === "Enter" &&
						(e.metaKey || e.ctrlKey) &&
						canCommit &&
						!isPending
					) {
						e.preventDefault();
						handleCommit();
					}
				}}
			/>
			<ButtonGroup className="w-full">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="secondary"
							size="sm"
							className="flex-1 gap-1.5 h-7 text-xs"
							onClick={handleCommit}
							disabled={!canCommit || isPending}
						>
							<VscCheck className="size-4" />
							<span>Commit</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{commitTooltip}</TooltipContent>
				</Tooltip>
				<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="secondary"
							size="sm"
							disabled={isPending}
							className="h-7 px-1.5"
						>
							<VscChevronDown className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48 text-xs">
						<DropdownMenuItem
							onClick={handleCommit}
							disabled={!canCommit}
							className="text-xs"
						>
							<VscCheck className="size-3.5" />
							Commit
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleCommitAndPush}
							disabled={!canCommit}
							className="text-xs"
						>
							<VscArrowUp className="size-3.5" />
							Commit &amp; Push
						</DropdownMenuItem>
						{!hasExistingPR && canCreatePR && (
							<DropdownMenuItem
								onClick={handleCommitPushAndCreatePR}
								disabled={!canCommit}
								className="text-xs"
							>
								<VscLinkExternal className="size-3.5" />
								Commit, Push &amp; Create PR
							</DropdownMenuItem>
						)}

						<DropdownMenuSeparator />

						{hasExistingPR ? (
							<DropdownMenuItem onClick={handleOpenPR} className="text-xs">
								<VscLinkExternal className="size-3.5" />
								Open Pull Request
							</DropdownMenuItem>
						) : canCreatePR ? (
							<DropdownMenuItem onClick={handleCreatePR} className="text-xs">
								<VscLinkExternal className="size-3.5" />
								Create Pull Request
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			</ButtonGroup>
		</div>
	);
}
