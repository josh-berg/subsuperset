export const MULTI_REPO_CONTEXT_LOCAL_FILE = "CLAUDE.local.md";

const SEPARATE_REPOS_NOTE =
	"Each repo listed above (including this one, if applicable) is a separate\n" +
	"git repository with its own history, branches, and pull requests —\n" +
	"commits and pushes in one repo do not affect the others.";

export const AUTO_REGENERATED_NOTE =
	"\n---\n" +
	"This file is regenerated automatically whenever a repo is added to or\n" +
	"removed from this project. Manual edits will be overwritten.\n";

interface RepoInfo {
	name: string;
	mainRepoPath: string;
}

function formatRepoList(repos: RepoInfo[]): string {
	return repos
		.map((repo) => `- ${repo.name} — ${repo.mainRepoPath}`)
		.join("\n");
}

/** Content for the parent feature-project folder, listing all child repos. */
export function buildFeatureProjectContextMarkdown(
	featureProjectName: string,
	featureProjectPath: string,
	children: RepoInfo[],
): string {
	return `# Multi-repo project: ${featureProjectName}

This folder is the root of a multi-repo project managed with Superset. It does
not contain its own git repository; instead, each repo below is cloned as a
sibling folder directly inside this directory:

  ${featureProjectPath}

Repos in this project:
${formatRepoList(children)}

${SEPARATE_REPOS_NOTE}

When work spans multiple repos, look for related code and config in the
sibling paths listed above.
`;
}

/** Content injected into each child repo describing its siblings. */
export function buildChildRepoContextMarkdown(
	featureProjectName: string,
	featureProjectPath: string,
	currentRepo: RepoInfo,
	siblings: RepoInfo[],
): string {
	return `# Multi-repo project: ${featureProjectName}

This repository ("${currentRepo.name}") is one of ${siblings.length + 1} repos
that make up the "${featureProjectName}" multi-repo project, managed with
Superset. All repos are cloned as sibling folders inside:

  ${featureProjectPath}

Sibling repos in this project:
${formatRepoList(siblings)}

${SEPARATE_REPOS_NOTE}

When work spans multiple repos, look for related code and config in the
sibling paths listed above.
`;
}
