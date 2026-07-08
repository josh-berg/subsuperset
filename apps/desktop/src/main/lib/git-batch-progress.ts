import { EventEmitter } from "node:events";

export interface GitBatchProgress {
	operation: "pull" | "fetch";
	done: number;
	total: number;
}

/**
 * Broadcasts progress for the sidebar's "Pull All" / "Fetch All" batch
 * operations so the renderer can show a live x/y counter while they run.
 */
export const gitBatchProgressEmitter = new EventEmitter();
