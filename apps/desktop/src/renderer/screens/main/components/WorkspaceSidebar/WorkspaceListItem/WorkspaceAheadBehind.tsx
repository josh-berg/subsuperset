interface WorkspaceAheadBehindProps {
	ahead: number;
	behind: number;
}

export function WorkspaceAheadBehind({
	ahead,
	behind,
}: WorkspaceAheadBehindProps) {
	if (ahead === 0 && behind === 0) {
		return null;
	}

	return (
		<div className="flex items-center gap-1 text-[11px] font-mono tabular-nums shrink-0">
			{behind > 0 && <span className="text-amber-400/75">↓{behind}</span>}
			{ahead > 0 && <span className="text-emerald-400/75">↑{ahead}</span>}
		</div>
	);
}
