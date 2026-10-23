export const SIMPLE_GIT_UNSAFE_OPTION_FLAGS = [
	"allowAbbreviatedOptions",
	"allowUnsafeAlias",
	"allowUnsafeAskPass",
	"allowUnsafeCommandBinaries",
	"allowUnsafeConfigEnvCount",
	"allowUnsafeConfigPaths",
	"allowUnsafeCredentialHelper",
	"allowUnsafeCustomBinary",
	"allowUnsafeDiffExternal",
	"allowUnsafeDiffTextConv",
	"allowUnsafeEditor",
	"allowUnsafeExec",
	"allowUnsafeFilter",
	"allowUnsafeFsMonitor",
	"allowUnsafeGitProxy",
	"allowUnsafeGpgProgram",
	"allowUnsafeHooksPath",
	"allowUnsafeInclude",
	"allowUnsafeMergeDriver",
	"allowUnsafePack",
	"allowUnsafePager",
	"allowUnsafeProtocolOverride",
	"allowUnsafeSshCommand",
	"allowUnsafeSubmodule",
	"allowUnsafeTemplateDir",
	"allowUnsafeUrlRewrite",
] as const;

export type SimpleGitUnsafeOptionFlag =
	(typeof SIMPLE_GIT_UNSAFE_OPTION_FLAGS)[number];

export const USER_GIT_ENV_SIMPLE_GIT_OPTIONS = {
	unsafe: Object.fromEntries(
		SIMPLE_GIT_UNSAFE_OPTION_FLAGS.map((flag) => [flag, true]),
	),
} as {
	unsafe: Record<SimpleGitUnsafeOptionFlag, true>;
};
