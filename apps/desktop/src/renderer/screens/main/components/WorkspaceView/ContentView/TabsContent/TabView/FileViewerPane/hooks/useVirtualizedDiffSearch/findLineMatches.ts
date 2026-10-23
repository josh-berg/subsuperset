export interface LineMatch {
	/** 1-based line number in the text. */
	line: number;
	/** Character offset of the match within the line. */
	start: number;
	length: number;
}

export const MAX_LINE_MATCHES = 10_000;

export function findLineMatches(
	text: string,
	query: string,
	caseSensitive: boolean,
): LineMatch[] {
	if (!query) {
		return [];
	}

	const needle = caseSensitive ? query : query.toLowerCase();
	const matches: LineMatch[] = [];
	const lines = text.split("\n");

	for (let index = 0; index < lines.length; index++) {
		const raw = lines[index] as string;
		const haystack = caseSensitive ? raw : raw.toLowerCase();
		let from = 0;
		for (
			let found = haystack.indexOf(needle, from);
			found !== -1;
			found = haystack.indexOf(needle, from)
		) {
			matches.push({ line: index + 1, start: found, length: needle.length });
			if (matches.length >= MAX_LINE_MATCHES) {
				return matches;
			}
			from = found + needle.length;
		}
	}

	return matches;
}
