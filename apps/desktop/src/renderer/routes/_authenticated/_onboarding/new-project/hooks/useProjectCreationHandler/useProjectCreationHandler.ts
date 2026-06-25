import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenMainRepoWorkspace } from "renderer/react-query/workspaces/useOpenMainRepoWorkspace";

export function useProjectCreationHandler(onError: (error: string) => void) {
	const utils = electronTrpc.useUtils();
	const openMainRepoWorkspace = useOpenMainRepoWorkspace();

	const handleResult = (
		result: {
			canceled?: boolean;
			success?: boolean;
			error?: string | null;
			project?: { id: string } | null;
		},
		resetState?: () => void,
	) => {
		if (result.canceled) return;
		if (result.success && result.project) {
			utils.projects.getRecents.invalidate();
			resetState?.();
			openMainRepoWorkspace.mutate({ projectId: result.project.id });
		} else if (!result.success && result.error) {
			onError(result.error);
		}
	};

	const handleError = (err: { message?: string }) => {
		onError(err.message || "Operation failed");
	};

	return {
		handleResult,
		handleError,
	};
}
