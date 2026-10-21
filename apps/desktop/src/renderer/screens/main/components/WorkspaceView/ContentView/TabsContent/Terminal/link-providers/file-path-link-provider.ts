import {
	decodeUrlEncodedPath,
	detectFallbackLinks,
	detectLinks,
	getCurrentOS,
	type IFallbackLink,
	type IParsedLink,
	removeLinkSuffix,
} from "@superset/shared/terminal-link-parsing";
import type { IBufferLine, ILink, ILinkProvider, Terminal } from "@xterm/xterm";

// A line this close to full width counts as filled to the edge.
const HARD_WRAP_COLS_TOLERANCE = 2;
const MAX_HARD_WRAP_EXTENSION_LINES = 8;
// What the first token of a hard-wrapped continuation line may look like.
const HARD_WRAP_TAIL_PATTERN = /^[A-Za-z0-9._~@%+\-/]/;

interface LineSegment {
	index: number;
	lineNumber: number;
	text: string;
	leadingTrim: number;
	startOffset: number;
}

/**
 * A link provider that detects file paths in terminal output using VSCode's
 * terminal link parsing logic. Supports a wide variety of path formats including:
 *
 * - Basic paths: /path/to/file.ts, ./src/file.ts, ~/config.json
 * - With line numbers: file.ts:42, file.ts:42:10
 * - With line ranges: file.ts:42-50, file.ts:42:10-50
 * - Parenthesis format: file.ts(42), file.ts(42, 10)
 * - Square bracket format: file.ts[42], file.ts[42, 10]
 * - Verbose formats: "file.ts", line 42, col 10
 * - Git diff paths: --- a/path/file.ts, +++ b/path/file.ts
 *
 * Also handles multi-line wrapped paths spanning up to 3 terminal lines.
 */
export class FilePathLinkProvider implements ILinkProvider {
	constructor(
		private readonly terminal: Terminal,
		private readonly onOpen: (
			event: MouseEvent,
			path: string,
			line?: number,
			column?: number,
			lineEnd?: number,
			columnEnd?: number,
		) => void,
	) {}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		const lineIndex = bufferLineNumber - 1;
		const line = this.terminal.buffer.active.getLine(lineIndex);
		if (!line) {
			callback(undefined);
			return;
		}

		// Soft-wrapped lines and hard-wrapped path tokens are joined so a path
		// split across lines is one link.
		const segments = this.buildSegments(lineIndex);
		const currentSegment = segments.find(
			(segment) => segment.index === lineIndex,
		);
		if (!currentSegment) {
			callback(undefined);
			return;
		}
		const combinedText = segments.map((segment) => segment.text).join("");
		const currentLineOffset = currentSegment.startOffset;
		const currentLineLength = currentSegment.text.length;

		// Use VSCode's link detection
		const os = getCurrentOS();
		const detectedLinks = detectLinks(combinedText, os);

		const links: ILink[] = [];

		for (let parsedLink of detectedLinks) {
			// Strip trailing punctuation from paths without suffixes
			// (paths with suffixes like :42 already have proper boundaries)
			if (!parsedLink.suffix) {
				parsedLink = this.stripTrailingPunctuation(parsedLink, combinedText);
			}

			// Calculate the full link range including prefix and suffix
			const linkStart = parsedLink.prefix?.index ?? parsedLink.path.index;
			const linkEnd = parsedLink.suffix
				? parsedLink.suffix.suffix.index + parsedLink.suffix.suffix.text.length
				: parsedLink.path.index + parsedLink.path.text.length;

			// Check if this link overlaps with the current line
			const currentLineStart = currentLineOffset;
			const currentLineEnd = currentLineOffset + currentLineLength;

			if (linkEnd <= currentLineStart || linkStart >= currentLineEnd) {
				continue;
			}

			// Get the path text (without suffix for opening)
			const pathText = parsedLink.path.text;

			// Skip URLs
			if (this.isUrl(pathText, linkStart, combinedText)) {
				continue;
			}

			// Skip version strings like v1.2.3
			if (this.isVersionString(pathText)) {
				continue;
			}

			// Skip npm package references like @scope/package@1.2.3
			if (this.isNpmPackageReference(pathText, linkStart, combinedText)) {
				continue;
			}

			// Skip pure numeric patterns
			if (/^\d+(:\d+)*$/.test(pathText)) {
				continue;
			}

			// Calculate the range for highlighting
			const range = this.calculateLinkRange(linkStart, linkEnd, segments);

			// Build the full link text for display
			const fullLinkText = combinedText.substring(linkStart, linkEnd);

			links.push({
				range,
				text: fullLinkText,
				activate: (event: MouseEvent) => {
					this.handleActivation(event, parsedLink);
				},
			});
		}

		// If no links found via primary detection, try fallback matchers
		// These catch special formats like Python errors, Rust errors, etc.
		if (links.length === 0) {
			const fallbackLinks = detectFallbackLinks(combinedText);
			for (const fallback of fallbackLinks) {
				const linkStart = fallback.index;
				const linkEnd = fallback.index + fallback.link.length;

				// Check if this link overlaps with the current line
				const fbCurrentLineStart = currentLineOffset;
				const fbCurrentLineEnd = currentLineOffset + currentLineLength;
				if (linkEnd <= fbCurrentLineStart || linkStart >= fbCurrentLineEnd) {
					continue;
				}

				// Calculate the range for highlighting
				const range = this.calculateLinkRange(linkStart, linkEnd, segments);

				links.push({
					range,
					text: fallback.link,
					activate: (event: MouseEvent) => {
						this.handleFallbackActivation(event, fallback);
					},
				});
			}
		}

		callback(links.length > 0 ? links : undefined);
	}

	/**
	 * Strip trailing punctuation from a link that has no suffix.
	 * This handles cases like "See ./path/file." where the period is sentence punctuation,
	 * not part of the path.
	 */
	private stripTrailingPunctuation(
		parsedLink: IParsedLink,
		combinedText: string,
	): IParsedLink {
		const pathText = parsedLink.path.text;
		const linkEnd = parsedLink.path.index + pathText.length;

		// Check if the path ends with common sentence punctuation
		// Only strip if followed by whitespace or end of line (to avoid stripping valid extensions)
		const trailingPunctMatch = pathText.match(/([.,;:!?)]+)$/);
		if (trailingPunctMatch) {
			const punct = trailingPunctMatch[1];
			const afterPunct = combinedText[linkEnd];

			// Only strip if followed by whitespace, end of string, or another punctuation
			if (
				afterPunct === undefined ||
				/\s/.test(afterPunct) ||
				afterPunct === '"' ||
				afterPunct === "'"
			) {
				// Don't strip if it looks like a file extension (e.g., "file.ts")
				// A period followed by 1-4 alphanumeric characters at the end is likely an extension
				if (punct === "." && /\.[a-zA-Z0-9]{1,4}$/.test(pathText)) {
					return parsedLink;
				}

				return {
					...parsedLink,
					path: {
						index: parsedLink.path.index,
						text: pathText.slice(0, -punct.length),
					},
				};
			}
		}

		return parsedLink;
	}

	private isUrl(
		pathText: string,
		linkStart: number,
		combinedText: string,
	): boolean {
		if (
			pathText.startsWith("http://") ||
			pathText.startsWith("https://") ||
			pathText.startsWith("ftp://")
		) {
			return true;
		}

		// Check if this is part of a URL (e.g., the path portion after ://)
		if (
			linkStart > 0 &&
			combinedText[linkStart - 1] === ":" &&
			(pathText.startsWith("//") || pathText.startsWith("http"))
		) {
			return true;
		}

		return false;
	}

	private isVersionString(pathText: string): boolean {
		// Match version strings like 1.2.3, v1.2.3, 1.2.3.4
		return /^v?\d+\.\d+(\.\d+)*$/.test(pathText);
	}

	private isNpmPackageReference(
		pathText: string,
		linkStart: number,
		combinedText: string,
	): boolean {
		// Check context for npm package patterns like @scope/package@1.2.3
		const contextStart = Math.max(0, linkStart - 30);
		const contextEnd = linkStart + pathText.length;
		const context = combinedText.substring(contextStart, contextEnd);
		return /@\d+\.\d+/.test(context);
	}

	private handleActivation(event: MouseEvent, parsedLink: IParsedLink): void {
		if (!event.metaKey && !event.ctrlKey) {
			return;
		}

		event.preventDefault();

		const pathText = parsedLink.path.text;

		// Clean up the path - remove any remaining suffix patterns that might have been
		// included (defensive, since detectLinks should handle this)
		let cleanPath = removeLinkSuffix(pathText);

		if (!cleanPath) {
			return;
		}

		// Decode URL-encoded characters (e.g., %3A -> :, %20 -> space)
		cleanPath = decodeUrlEncodedPath(cleanPath);

		// Extract line/column info from suffix, or try to parse from URL-encoded path
		let line = parsedLink.suffix?.row;
		let column = parsedLink.suffix?.col;
		const lineEnd = parsedLink.suffix?.rowEnd;
		const columnEnd = parsedLink.suffix?.colEnd;

		// If no suffix was detected, check if the decoded path contains line:col info
		if (line === undefined) {
			const lineColMatch = cleanPath.match(/:(\d+)(?::(\d+))?$/);
			if (lineColMatch) {
				cleanPath = cleanPath.replace(/:(\d+)(?::(\d+))?$/, "");
				line = Number.parseInt(lineColMatch[1], 10);
				if (lineColMatch[2]) {
					column = Number.parseInt(lineColMatch[2], 10);
				}
			}
		}

		this.onOpen(event, cleanPath, line, column, lineEnd, columnEnd);
	}

	private handleFallbackActivation(
		event: MouseEvent,
		fallback: IFallbackLink,
	): void {
		if (!event.metaKey && !event.ctrlKey) {
			return;
		}

		event.preventDefault();

		const cleanPath = decodeUrlEncodedPath(fallback.path);

		if (!cleanPath) {
			return;
		}

		this.onOpen(event, cleanPath, fallback.line, fallback.col);
	}

	private buildSegments(lineIndex: number): LineSegment[] {
		const buffer = this.terminal.buffer.active;

		// A soft wrap only reaches one line out, as it always has; hard-wrapped
		// tails chain.
		let first = lineIndex;
		for (let steps = 0; steps < MAX_HARD_WRAP_EXTENSION_LINES; steps++) {
			const line = buffer.getLine(first);
			const prev = buffer.getLine(first - 1);
			if (!line || !prev) break;
			if (line.isWrapped) {
				if (steps === 0) first--;
				break;
			}
			if (!this.isHardWrapContinuation(prev, line)) break;
			first--;
		}

		let last = lineIndex;
		for (let steps = 0; steps < MAX_HARD_WRAP_EXTENSION_LINES; steps++) {
			const line = buffer.getLine(last);
			const next = buffer.getLine(last + 1);
			if (!line || !next) break;
			if (next.isWrapped) {
				if (steps === 0) last++;
				break;
			}
			if (!this.isHardWrapContinuation(line, next)) break;
			last++;
		}

		const segments: LineSegment[] = [];
		let offset = 0;
		for (let index = first; index <= last; index++) {
			const line = buffer.getLine(index);
			if (!line) break;
			const segment = this.toSegment(
				index,
				line,
				index > first && !line.isWrapped,
			);
			segment.startOffset = offset;
			offset += segment.text.length;
			segments.push(segment);
		}
		return segments;
	}

	private toSegment(
		index: number,
		line: IBufferLine,
		trimLeading: boolean,
	): LineSegment {
		const raw = line.translateToString(true);
		const leadingTrim = trimLeading ? raw.length - raw.trimStart().length : 0;
		return {
			index,
			lineNumber: index + 1,
			text: raw.slice(leadingTrim),
			leadingTrim,
			startOffset: 0,
		};
	}

	/**
	 * TUIs such as Claude Code wrap long paths with a real newline at the pane
	 * width, so xterm never marks the next line as wrapped. Treat `next` as the
	 * tail of `prev` when `prev` runs to the edge of the terminal and ends in a
	 * path-looking token that the first token of `next` could continue.
	 */
	private isHardWrapContinuation(
		prev: IBufferLine | undefined,
		next: IBufferLine | undefined,
	): boolean {
		if (!prev || !next || next.isWrapped) return false;
		const cols = this.terminal.cols;
		if (typeof cols !== "number" || cols <= 0) return false;
		const prevText = prev.translateToString(true);
		if (prevText.length < cols - HARD_WRAP_COLS_TOLERANCE) return false;

		const prevToken = prevText.match(/\S+$/)?.[0];
		if (!prevToken || !prevToken.includes("/")) return false;
		if (/^[a-z][a-z0-9+.-]*:\/\//i.test(prevToken)) return false;

		const nextToken = next
			.translateToString(true)
			.trimStart()
			.match(/^\S+/)?.[0];
		// A tail that opens with "/" is far more likely the next path in a list.
		return (
			!!nextToken &&
			!nextToken.startsWith("/") &&
			HARD_WRAP_TAIL_PATTERN.test(nextToken)
		);
	}

	private calculateLinkRange(
		matchIndex: number,
		matchEnd: number,
		segments: LineSegment[],
	): ILink["range"] {
		const last = segments[segments.length - 1];
		const startSegment =
			segments.find(
				(segment) => matchIndex < segment.startOffset + segment.text.length,
			) ?? last;
		const endSegment =
			segments.find(
				(segment) => matchEnd <= segment.startOffset + segment.text.length,
			) ?? last;

		return {
			start: {
				x: startSegment.leadingTrim + matchIndex - startSegment.startOffset + 1,
				y: startSegment.lineNumber,
			},
			end: {
				x: endSegment.leadingTrim + matchEnd - endSegment.startOffset + 1,
				y: endSegment.lineNumber,
			},
		};
	}
}
