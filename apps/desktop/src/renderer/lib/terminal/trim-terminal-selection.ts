/** Drops the padding xterm adds: trailing spaces on every line and trailing blank lines. */
export function trimTerminalSelection(selection: string): string {
	return selection.replace(/ +(?=\r?\n|$)/g, "").replace(/(?:\r?\n)+$/, "");
}
