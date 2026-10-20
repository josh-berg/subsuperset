/**
 * Parked terminals keep an xterm (and, with WebGL, a glyph atlas) alive. Past
 * this many, the least recently parked are evicted. Eviction is lossless: the
 * backend session keeps running, and remounting re-attaches from its snapshot.
 */
export const MAX_PARKED_TERMINALS = 12;

export interface ParkedTerminal {
	paneId: string;
	parkedAt: number;
	/**
	 * Entries that carry state a re-attach can't rebuild: a full-screen TUI,
	 * a recorded process exit, or lifecycle events still waiting for a mount.
	 */
	exempt: boolean;
}

/** Pane ids to evict, oldest first, so at most `max` terminals stay parked. */
export function selectParkedEvictions(
	parked: ParkedTerminal[],
	max: number = MAX_PARKED_TERMINALS,
): string[] {
	const excess = parked.length - max;
	if (excess <= 0) return [];
	return parked
		.filter((entry) => !entry.exempt)
		.sort((a, b) => a.parkedAt - b.parkedAt)
		.slice(0, excess)
		.map((entry) => entry.paneId);
}
