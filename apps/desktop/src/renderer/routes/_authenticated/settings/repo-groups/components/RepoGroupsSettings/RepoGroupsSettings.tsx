import type { SelectRepoGroup } from "@superset/local-db";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { LuLayers, LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { RepoPicker } from "./components/RepoPicker";

interface RepoGroupsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

type Draft = { id: string | null; name: string; repos: string[] };

export function RepoGroupsSettings({ visibleItems }: RepoGroupsSettingsProps) {
	const show = isItemVisible(SETTING_ITEM_ID.REPO_GROUPS_MANAGE, visibleItems);

	const utils = electronTrpc.useUtils();
	const { data: groups = [], isLoading } =
		electronTrpc.repoGroups.list.useQuery();

	const [draft, setDraft] = useState<Draft | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<SelectRepoGroup | null>(
		null,
	);

	const invalidate = () => utils.repoGroups.list.invalidate();

	const createGroup = electronTrpc.repoGroups.create.useMutation({
		onSuccess: () => {
			void invalidate();
			setDraft(null);
		},
	});
	const updateGroup = electronTrpc.repoGroups.update.useMutation({
		onSuccess: () => {
			void invalidate();
			setDraft(null);
		},
	});
	const deleteGroup = electronTrpc.repoGroups.delete.useMutation({
		onSuccess: () => {
			void invalidate();
			setDeleteTarget(null);
		},
	});

	if (!show) return null;

	const isSaving = createGroup.isPending || updateGroup.isPending;
	const canSave = Boolean(draft?.name.trim()) && (draft?.repos.length ?? 0) > 0;

	const handleSave = () => {
		if (!draft || !canSave) return;
		if (draft.id) {
			updateGroup.mutate({
				id: draft.id,
				name: draft.name.trim(),
				repos: draft.repos,
			});
		} else {
			createGroup.mutate({ name: draft.name.trim(), repos: draft.repos });
		}
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-lg font-semibold">Repo Groups</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Save reusable groups of repositories to quickly select when creating
						multi-repo projects.
					</p>
				</div>
				{!draft && (
					<Button
						size="sm"
						onClick={() => setDraft({ id: null, name: "", repos: [] })}
					>
						<LuPlus className="size-4 mr-1" />
						New group
					</Button>
				)}
			</div>

			{draft && (
				<div className="mb-6 rounded-lg border border-border p-4 flex flex-col gap-4">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-medium">
							{draft.id ? "Edit group" : "New group"}
						</h3>
						<button
							type="button"
							onClick={() => setDraft(null)}
							className="text-muted-foreground hover:text-foreground transition-colors"
						>
							<LuX className="size-4" />
						</button>
					</div>

					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="repo-group-name"
							className="text-sm font-medium text-foreground"
						>
							Group name
						</label>
						<Input
							id="repo-group-name"
							value={draft.name}
							onChange={(e) =>
								setDraft((d) => (d ? { ...d, name: e.target.value } : d))
							}
							placeholder="e.g. Checkout services"
							autoFocus
						/>
					</div>

					<RepoPicker
						value={draft.repos}
						onChange={(repos) => setDraft((d) => (d ? { ...d, repos } : d))}
					/>

					<div className="flex justify-end gap-2 pt-2 border-t border-border/40">
						<Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={handleSave}
							disabled={!canSave || isSaving}
						>
							{isSaving
								? "Saving…"
								: draft.id
									? "Save changes"
									: "Create group"}
						</Button>
					</div>
				</div>
			)}

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : groups.length === 0 && !draft ? (
				<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
					<LuLayers className="size-6 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">No repo groups yet.</p>
					<p className="text-xs text-muted-foreground/70">
						Create one to quickly select these repos when starting a multi-repo
						project.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{groups.map((group) => (
						<div
							key={group.id}
							className="rounded-lg border border-border p-4 flex flex-col gap-3"
						>
							<div className="flex items-center justify-between gap-3">
								<div className="min-w-0">
									<p className="text-sm font-medium truncate">{group.name}</p>
									<p className="text-xs text-muted-foreground">
										{group.repos.length}{" "}
										{group.repos.length === 1 ? "repo" : "repos"}
									</p>
								</div>
								<div className="flex items-center gap-1 shrink-0">
									<Button
										variant="ghost"
										size="sm"
										onClick={() =>
											setDraft({
												id: group.id,
												name: group.name,
												repos: group.repos,
											})
										}
									>
										<LuPencil className="size-3.5 mr-1" />
										Edit
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setDeleteTarget(group)}
									>
										<LuTrash2 className="size-3.5 text-destructive" />
									</Button>
								</div>
							</div>
							{group.repos.length > 0 && (
								<div className="flex flex-wrap gap-1.5">
									{group.repos.map((fullName) => (
										<span
											key={fullName}
											className="rounded-md border border-border/60 px-2 py-0.5 text-xs text-muted-foreground"
										>
											{fullName}
										</span>
									))}
								</div>
							)}
						</div>
					))}
				</div>
			)}

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete repo group?</AlertDialogTitle>
						<AlertDialogDescription>
							"{deleteTarget?.name}" will be removed. This only deletes the
							saved group — your repositories and projects are not affected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() =>
								deleteTarget && deleteGroup.mutate({ id: deleteTarget.id })
							}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
