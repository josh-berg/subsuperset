import { Button } from "@superset/ui/button";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface PaneErrorBoundaryProps {
	paneId: string;
	onClosePane: () => void;
	children: ReactNode;
}

interface PaneErrorBoundaryState {
	error: Error | null;
}

/**
 * Contains a render error to the pane that threw it. Without this, one broken
 * pane reaches the route boundary and replaces the whole workspace, and since
 * the pane is saved in the layout, reloading brings the same screen back.
 */
export class PaneErrorBoundary extends Component<
	PaneErrorBoundaryProps,
	PaneErrorBoundaryState
> {
	state: PaneErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): PaneErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error(
			`[renderer] Pane ${this.props.paneId} crashed:`,
			error,
			info.componentStack,
		);
	}

	private retry = () => this.setState({ error: null });

	render() {
		const { error } = this.state;
		if (!error) return this.props.children;

		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
				<div className="text-sm font-medium text-foreground">
					This pane hit an error
				</div>
				<div className="max-w-md break-words text-xs text-muted-foreground">
					{error.message}
				</div>
				<div className="flex gap-2">
					<Button size="sm" variant="outline" onClick={this.retry}>
						Retry
					</Button>
					<Button size="sm" variant="outline" onClick={this.props.onClosePane}>
						Close pane
					</Button>
				</div>
			</div>
		);
	}
}
