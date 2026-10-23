import { USER_GIT_ENV_SIMPLE_GIT_OPTIONS } from "@superset/shared/simple-git-options";
import simpleGit from "simple-git";

import type { GitCredentialProvider, GitFactory } from "./types";
import { getRemoteUrl } from "./utils";

export function createGitFactory(provider: GitCredentialProvider): GitFactory {
	return async (repoPath: string) => {
		const initialCredentials = await provider.getCredentials(null);
		const git = simpleGit(repoPath, USER_GIT_ENV_SIMPLE_GIT_OPTIONS).env(
			initialCredentials.env,
		);
		const remoteUrl = await getRemoteUrl(git);
		const credentials = await provider.getCredentials(remoteUrl);

		return git.env({
			...initialCredentials.env,
			...credentials.env,
			GIT_OPTIONAL_LOCKS: "0",
		});
	};
}
