import { Virtualizer } from "@pierre/diffs";
import { MultiFileDiff, VirtualizerContext } from "@pierre/diffs/react";
import { cn } from "@superset/ui/utils";
import {
	type CSSProperties,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import type { DiffViewMode, FileContents } from "shared/changes-types";
import { shouldVirtualizeDiff } from "./shouldVirtualizeDiff";

interface LightDiffViewerProps {
	contents: FileContents;
	viewMode: DiffViewMode;
	hideUnchangedRegions?: boolean;
	filePath: string;
	/**
	 * The element that scrolls this diff. When provided and the diff is large,
	 * only the lines near the viewport are rendered.
	 */
	scrollContainerRef?: RefObject<HTMLElement | null>;
	className?: string;
	style?: CSSProperties;
}

export function LightDiffViewer({
	contents,
	viewMode,
	hideUnchangedRegions,
	filePath,
	scrollContainerRef,
	className,
	style,
}: LightDiffViewerProps) {
	const virtualize =
		scrollContainerRef !== undefined &&
		shouldVirtualizeDiff(contents.original, contents.modified);
	const contentRef = useRef<HTMLDivElement>(null);
	const [virtualizer, setVirtualizer] = useState<Virtualizer>();

	useEffect(() => {
		const root = scrollContainerRef?.current;
		if (!virtualize || !root) {
			return;
		}
		const instance = new Virtualizer();
		instance.setup(root, contentRef.current ?? undefined);
		setVirtualizer(instance);
		return () => {
			instance.cleanUp();
			setVirtualizer(undefined);
		};
	}, [virtualize, scrollContainerRef]);

	const activeTheme = useResolvedTheme();
	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{
			staleTime: 30_000,
		},
	);
	const shikiTheme = getDiffsTheme(activeTheme);
	const parsedEditorFontSize =
		typeof fontSettings?.editorFontSize === "number"
			? fontSettings.editorFontSize
			: typeof fontSettings?.editorFontSize === "string"
				? Number.parseFloat(fontSettings.editorFontSize)
				: Number.NaN;
	const diffStyle = getDiffViewerStyle(activeTheme, {
		fontFamily: fontSettings?.editorFontFamily ?? undefined,
		fontSize: Number.isFinite(parsedEditorFontSize)
			? parsedEditorFontSize
			: undefined,
	});

	const diff = (
		<MultiFileDiff
			oldFile={{ name: filePath, contents: contents.original }}
			newFile={{ name: filePath, contents: contents.modified }}
			className={cn(className)}
			style={{
				...diffStyle,
				...style,
			}}
			options={{
				diffStyle: viewMode === "side-by-side" ? "split" : "unified",
				expandUnchanged: !hideUnchangedRegions,
				theme: shikiTheme,
				themeType: activeTheme.type,
				overflow: "wrap",
				disableFileHeader: true,
				unsafeCSS: `
					* {
						user-select: text;
						-webkit-user-select: text;
					}
				`,
			}}
		/>
	);

	if (!virtualize) {
		return diff;
	}

	// MultiFileDiff picks its (virtualized or plain) renderer when it mounts,
	// so wait for the virtualizer instead of switching renderers mid-life.
	return (
		<div ref={contentRef}>
			{virtualizer && (
				<VirtualizerContext.Provider value={virtualizer}>
					{diff}
				</VirtualizerContext.Provider>
			)}
		</div>
	);
}
