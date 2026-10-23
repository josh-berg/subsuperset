export const VIRTUALIZE_DIFF_LINE_THRESHOLD = 3000;

function countLines(text: string): number {
	let lines = 1;
	for (let index = text.indexOf("\n"); index !== -1; ) {
		lines += 1;
		index = text.indexOf("\n", index + 1);
	}
	return lines;
}

/**
 * Large diffs render every line into the DOM, which makes scrolling and
 * resizing laggy. Above the threshold we render only what's near the
 * viewport; below it the full DOM keeps find-in-diff complete.
 */
export function shouldVirtualizeDiff(
	original: string,
	modified: string,
): boolean {
	return (
		Math.max(countLines(original), countLines(modified)) >
		VIRTUALIZE_DIFF_LINE_THRESHOLD
	);
}
