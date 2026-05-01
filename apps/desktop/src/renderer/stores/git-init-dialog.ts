import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface GitInitDialogState {
	isOpen: boolean;
	isPending: boolean;
	paths: string[];
	onConfirm: (() => void) | null;
	onOpenGitless: (() => void) | null;
	onCancel: (() => void) | null;
	open: (params: {
		paths: string[];
		onConfirm: () => void;
		onOpenGitless: () => void;
		onCancel: () => void;
	}) => void;
	setIsPending: (isPending: boolean) => void;
	close: () => void;
}

export const useGitInitDialogStore = create<GitInitDialogState>()(
	devtools(
		(set) => ({
			isOpen: false,
			isPending: false,
			paths: [],
			onConfirm: null,
			onOpenGitless: null,
			onCancel: null,

			open: ({ paths, onConfirm, onOpenGitless, onCancel }) => {
				set({
					isOpen: true,
					isPending: false,
					paths,
					onConfirm,
					onOpenGitless,
					onCancel,
				});
			},

			setIsPending: (isPending) => {
				set({ isPending });
			},

			close: () => {
				set({
					isOpen: false,
					isPending: false,
					paths: [],
					onConfirm: null,
					onOpenGitless: null,
					onCancel: null,
				});
			},
		}),
		{ name: "GitInitDialogStore" },
	),
);
