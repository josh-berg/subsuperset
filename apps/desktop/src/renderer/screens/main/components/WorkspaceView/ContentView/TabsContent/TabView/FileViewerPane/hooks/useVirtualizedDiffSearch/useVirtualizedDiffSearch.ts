import { DIFFS_TAG_NAME } from "@pierre/diffs";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findLineMatches, type LineMatch } from "./findLineMatches";

const SEARCH_DEBOUNCE_MS = 150;
// Matches pierre's default virtual line height; only used to aim the first jump.
const ESTIMATED_LINE_HEIGHT = 20;
const MAX_REVEAL_FRAMES = 30;
const MATCH_HIGHLIGHT = "virtualized-diff-search-active";

interface UseVirtualizedDiffSearchOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	enabled: boolean;
	isSearchOpen: boolean;
	query: string;
	caseSensitive: boolean;
	/** The new-file text; deleted lines aren't searched. */
	text: string | undefined;
}

interface UseVirtualizedDiffSearchReturn {
	matchCount: number;
	activeMatchIndex: number;
	findNext: () => void;
	findPrevious: () => void;
}

function getShadowRoots(container: HTMLElement): ShadowRoot[] {
	return Array.from(container.querySelectorAll<HTMLElement>(DIFFS_TAG_NAME))
		.map((element) => element.shadowRoot)
		.filter((root): root is ShadowRoot => root !== null);
}

function findLineElement(
	roots: ShadowRoot[],
	line: number,
): HTMLElement | null {
	for (const root of roots) {
		const element = root.querySelector<HTMLElement>(
			`[data-line="${line}"]:not([data-line-type="change-deletion"])`,
		);
		if (element) {
			return element;
		}
	}
	return null;
}

function getRenderedLineRange(
	roots: ShadowRoot[],
): { first: number; last: number } | null {
	let first = Number.POSITIVE_INFINITY;
	let last = 0;
	for (const root of roots) {
		for (const element of root.querySelectorAll<HTMLElement>(
			"[data-line]:not([data-line-type='change-deletion'])",
		)) {
			const line = Number(element.getAttribute("data-line"));
			if (Number.isFinite(line)) {
				first = Math.min(first, line);
				last = Math.max(last, line);
			}
		}
	}
	return last === 0 ? null : { first, last };
}

function createRange(
	element: HTMLElement,
	start: number,
	length: number,
): Range | null {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	const range = document.createRange();
	let offset = 0;
	let started = false;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const size = node.textContent?.length ?? 0;
		if (!started && start < offset + size) {
			range.setStart(node, start - offset);
			started = true;
		}
		if (started && start + length <= offset + size) {
			range.setEnd(node, start + length - offset);
			return range;
		}
		offset += size;
	}
	return null;
}

function supportsCustomHighlights(): boolean {
	return (
		typeof CSS !== "undefined" &&
		typeof Highlight !== "undefined" &&
		Boolean(CSS.highlights)
	);
}

/**
 * Find-in-diff for virtualized diffs. The DOM only holds lines near the
 * viewport, so matches come from the file text and navigating to one scrolls
 * it into the rendered window first.
 */
export function useVirtualizedDiffSearch({
	containerRef,
	enabled,
	isSearchOpen,
	query,
	caseSensitive,
	text,
}: UseVirtualizedDiffSearchOptions): UseVirtualizedDiffSearchReturn {
	const [matches, setMatches] = useState<LineMatch[]>([]);
	const [activeMatchIndex, setActiveMatchIndex] = useState(0);
	const revealFrameRef = useRef(0);
	const styleElementsRef = useRef(new Map<ShadowRoot, HTMLStyleElement>());

	const clearHighlight = useCallback(() => {
		cancelAnimationFrame(revealFrameRef.current);
		if (supportsCustomHighlights()) {
			CSS.highlights.delete(MATCH_HIGHLIGHT);
		}
	}, []);

	const reveal = useCallback(
		(match: LineMatch) => {
			clearHighlight();
			const container = containerRef.current;
			if (!container) {
				return;
			}

			container.scrollTop = Math.max(
				0,
				(match.line - 1) * ESTIMATED_LINE_HEIGHT - container.clientHeight / 2,
			);

			let frames = 0;
			const step = () => {
				const roots = getShadowRoots(container);
				const element = findLineElement(roots, match.line);
				if (element) {
					element.scrollIntoView({ block: "center" });
					const range = createRange(element, match.start, match.length);
					const root = element.getRootNode();
					if (range && root instanceof ShadowRoot) {
						if (!styleElementsRef.current.has(root)) {
							const style = document.createElement("style");
							style.textContent = `::highlight(${MATCH_HIGHLIGHT}) { background-color: var(--highlight-active); }`;
							root.appendChild(style);
							styleElementsRef.current.set(root, style);
						}
						if (supportsCustomHighlights()) {
							CSS.highlights.set(MATCH_HIGHLIGHT, new Highlight(range));
						}
					}
					return;
				}

				frames += 1;
				if (frames >= MAX_REVEAL_FRAMES) {
					return;
				}
				// Not rendered yet: nudge by the distance to the rendered window.
				const rendered = getRenderedLineRange(roots);
				if (rendered) {
					const target =
						match.line < rendered.first ? rendered.first : rendered.last;
					container.scrollTop += (match.line - target) * ESTIMATED_LINE_HEIGHT;
				}
				revealFrameRef.current = requestAnimationFrame(step);
			};
			revealFrameRef.current = requestAnimationFrame(step);
		},
		[clearHighlight, containerRef],
	);

	useEffect(() => {
		if (!enabled || !isSearchOpen || !query || text === undefined) {
			clearHighlight();
			setMatches([]);
			setActiveMatchIndex(0);
			return;
		}

		const timer = setTimeout(() => {
			const found = findLineMatches(text, query, caseSensitive);
			setMatches(found);
			setActiveMatchIndex(0);
			if (found[0]) {
				reveal(found[0]);
			} else {
				clearHighlight();
			}
		}, SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timer);
	}, [
		enabled,
		isSearchOpen,
		query,
		caseSensitive,
		text,
		clearHighlight,
		reveal,
	]);

	useEffect(
		() => () => {
			clearHighlight();
			for (const style of styleElementsRef.current.values()) {
				style.remove();
			}
			styleElementsRef.current.clear();
		},
		[clearHighlight],
	);

	const step = useCallback(
		(delta: number) => {
			if (matches.length === 0) {
				return;
			}
			const next = (activeMatchIndex + delta + matches.length) % matches.length;
			setActiveMatchIndex(next);
			const match = matches[next];
			if (match) {
				reveal(match);
			}
		},
		[activeMatchIndex, matches, reveal],
	);

	return useMemo(
		() => ({
			matchCount: matches.length,
			activeMatchIndex,
			findNext: () => step(1),
			findPrevious: () => step(-1),
		}),
		[activeMatchIndex, matches.length, step],
	);
}
