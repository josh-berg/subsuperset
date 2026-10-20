import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { IDisposable, ITheme, Terminal as XTerm } from "@xterm/xterm";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { writeCommandInPane } from "renderer/lib/terminal/launch-command";
import { runWhenParserIdle } from "renderer/lib/terminal/parser-idle-gate";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { killTerminalForPane } from "renderer/stores/tabs/utils/terminal-cleanup";
import { isTerminalAttachCanceledMessage } from "../attach-cancel";
import { scheduleTerminalAttach } from "../attach-scheduler";
import { isCommandEchoed, sanitizeForTitle } from "../commandBuffer";
import {
	DEBUG_TERMINAL,
	FIRST_RENDER_RESTORE_FALLBACK_MS,
	MODE_RESYNC_IDLE_THRESHOLD_MS,
} from "../config";
import {
	loadRenderer,
	resetTerminalInputModes,
	setupClickToMoveCursor,
	setupCopyHandler,
	setupFocusListener,
	setupKeyboardHandler,
	setupPasteHandler,
	type TerminalRendererRef,
} from "../helpers";
import { isPaneDestroyed } from "../pane-guards";
import { coldRestoreState } from "../state";
import type {
	CreateOrAttachMutate,
	CreateOrAttachResult,
	TerminalCancelCreateOrAttachMutate,
	TerminalClearScrollbackMutate,
	TerminalResizeMutate,
	TerminalWriteMutate,
} from "../types";
import { scrollToBottom } from "../utils";
import * as v1TerminalCache from "../v1-terminal-cache";
import { createAttachRequestId } from "./attach-request-id";
import {
	getPaneWorkspaceRun,
	hasPaneWorkspaceRun,
	recoverWorkspaceRunPane,
	resolveWorkspaceRunAttachMode,
	setPaneWorkspaceRunState,
} from "./workspaceRun";

type RegisterCallback = (paneId: string, callback: () => void) => void;
type UnregisterCallback = (paneId: string) => void;

const attachInFlightByPane = new Map<string, number>();
const attachWaitersByPane = new Map<string, Set<() => void>>();

function markAttachInFlight(paneId: string, attachId: number): void {
	attachInFlightByPane.set(paneId, attachId);
}

function clearAttachInFlight(paneId: string, attachId?: number): void {
	if (attachId !== undefined) {
		const current = attachInFlightByPane.get(paneId);
		if (current !== attachId) return;
	}
	attachInFlightByPane.delete(paneId);
	const waiters = attachWaitersByPane.get(paneId);
	if (!waiters) return;
	attachWaitersByPane.delete(paneId);
	for (const waiter of waiters) {
		waiter();
	}
}

function waitForAttachClear(paneId: string, waiter: () => void): () => void {
	if (!attachInFlightByPane.has(paneId)) {
		waiter();
		return () => {};
	}

	let waiters = attachWaitersByPane.get(paneId);
	if (!waiters) {
		waiters = new Set();
		attachWaitersByPane.set(paneId, waiters);
	}
	waiters.add(waiter);

	return () => {
		const current = attachWaitersByPane.get(paneId);
		if (!current) return;
		current.delete(waiter);
		if (current.size === 0) {
			attachWaitersByPane.delete(paneId);
		}
	};
}
/**
 * A createOrAttach succeeded, so the pane has a backend session: make sure the
 * cache-owned stream subscription is running and open its gate so events reach
 * the component's registered handler. Idempotent, so every successful attach
 * (initial, restart, retry) can call it.
 */
export function openPaneStream(paneId: string): void {
	v1TerminalCache.startStream(paneId);
	v1TerminalCache.setStreamReady(paneId);
}

export interface UseTerminalLifecycleOptions {
	paneId: string;
	tabIdRef: MutableRefObject<string>;
	workspaceId: string;
	terminalRef: RefObject<HTMLDivElement | null>;
	xtermRef: MutableRefObject<XTerm | null>;
	fitAddonRef: MutableRefObject<FitAddon | null>;
	searchAddonRef: MutableRefObject<SearchAddon | null>;
	rendererRef: MutableRefObject<TerminalRendererRef | null>;
	isExitedRef: MutableRefObject<boolean>;
	wasKilledByUserRef: MutableRefObject<boolean>;
	commandBufferRef: MutableRefObject<string>;
	isFocusedRef: MutableRefObject<boolean>;
	isRestoredModeRef: MutableRefObject<boolean>;
	connectionErrorRef: MutableRefObject<string | null>;
	initialThemeRef: MutableRefObject<ITheme | null>;
	workspaceCwdRef: MutableRefObject<string | null>;
	handleFileLinkClickRef: MutableRefObject<
		(path: string, line?: number, column?: number) => void
	>;
	handleUrlClickRef: MutableRefObject<((url: string) => void) | undefined>;
	paneInitialCwdRef: MutableRefObject<string | undefined>;
	clearPaneInitialDataRef: MutableRefObject<(paneId: string) => void>;
	setConnectionError: (error: string | null) => void;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	setIsRestoredMode: (value: boolean) => void;
	setRestoredCwd: (cwd: string | null) => void;
	createOrAttachRef: MutableRefObject<CreateOrAttachMutate>;
	writeRef: MutableRefObject<TerminalWriteMutate>;
	resizeRef: MutableRefObject<TerminalResizeMutate>;
	cancelCreateOrAttachRef: MutableRefObject<TerminalCancelCreateOrAttachMutate>;
	clearScrollbackRef: MutableRefObject<TerminalClearScrollbackMutate>;
	isStreamReadyRef: MutableRefObject<boolean>;
	didFirstRenderRef: MutableRefObject<boolean>;
	pendingInitialStateRef: MutableRefObject<CreateOrAttachResult | null>;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
	isAlternateScreenRef: MutableRefObject<boolean>;
	isBracketedPasteRef: MutableRefObject<boolean>;
	setPaneNameRef: MutableRefObject<(paneId: string, name: string) => void>;
	renameUnnamedWorkspaceRef: MutableRefObject<(title: string) => void>;
	handleTerminalFocusRef: MutableRefObject<() => void>;
	registerClearCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterClearCallbackRef: MutableRefObject<UnregisterCallback>;
	registerScrollToBottomCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterScrollToBottomCallbackRef: MutableRefObject<UnregisterCallback>;
	registerGetSelectionCallbackRef: MutableRefObject<
		(paneId: string, callback: () => string) => void
	>;
	unregisterGetSelectionCallbackRef: MutableRefObject<UnregisterCallback>;
	registerPasteCallbackRef: MutableRefObject<
		(paneId: string, callback: (text: string) => void) => void
	>;
	unregisterPasteCallbackRef: MutableRefObject<UnregisterCallback>;
	registerRefreshCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterRefreshCallbackRef: MutableRefObject<UnregisterCallback>;
	defaultRestartCommandRef: MutableRefObject<string | undefined>;
}

export interface UseTerminalLifecycleReturn {
	xtermInstance: XTerm | null;
	restartTerminal: (options?: {
		command?: string;
		forceRestart?: boolean;
	}) => Promise<void>;
}

export function useTerminalLifecycle({
	paneId,
	tabIdRef,
	workspaceId,
	terminalRef,
	xtermRef,
	fitAddonRef,
	searchAddonRef,
	rendererRef,
	isExitedRef,
	wasKilledByUserRef,
	commandBufferRef,
	isFocusedRef,
	isRestoredModeRef,
	connectionErrorRef,
	initialThemeRef,
	workspaceCwdRef,
	handleFileLinkClickRef,
	handleUrlClickRef,
	paneInitialCwdRef,
	clearPaneInitialDataRef,
	setConnectionError,
	setExitStatus,
	setIsRestoredMode,
	setRestoredCwd,
	createOrAttachRef,
	writeRef,
	resizeRef,
	cancelCreateOrAttachRef,
	clearScrollbackRef,
	isStreamReadyRef,
	didFirstRenderRef,
	pendingInitialStateRef,
	maybeApplyInitialState,
	flushPendingEvents,
	resetModes,
	isAlternateScreenRef,
	isBracketedPasteRef,
	setPaneNameRef,
	renameUnnamedWorkspaceRef,
	handleTerminalFocusRef,
	registerClearCallbackRef,
	unregisterClearCallbackRef,
	registerScrollToBottomCallbackRef,
	unregisterScrollToBottomCallbackRef,
	registerGetSelectionCallbackRef,
	unregisterGetSelectionCallbackRef,
	registerPasteCallbackRef,
	unregisterPasteCallbackRef,
	registerRefreshCallbackRef,
	unregisterRefreshCallbackRef,
	defaultRestartCommandRef,
}: UseTerminalLifecycleOptions): UseTerminalLifecycleReturn {
	const [xtermInstance, setXtermInstance] = useState<XTerm | null>(null);
	const restartTerminalRef = useRef<
		(options?: { command?: string; forceRestart?: boolean }) => Promise<void>
	>(() => Promise.resolve());
	const restartTerminal = useCallback(
		(options?: { command?: string; forceRestart?: boolean }) =>
			restartTerminalRef.current(options),
		[],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refs used intentionally
	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		if (DEBUG_TERMINAL) {
			console.log(`[Terminal] Mount: ${paneId}`);
		}

		let isUnmounted = false;
		let attachCanceled = false;
		let attachSequence = 0;
		let activeAttachId = 0;
		let activeAttachRequestId: string | null = null;
		let cancelAttachWait: (() => void) | null = null;

		// Reuse the cached xterm across tab switches instead of creating and
		// disposing it each time. Only treat this as a reattach when a previous
		// mount actually completed its attach: a cache entry can exist with
		// streamReady=false if the prior mount unmounted before createOrAttach
		// finished, and the fast path would leave that pane with no backend
		// session.
		const isReattach = v1TerminalCache.get(paneId)?.streamReady === true;
		if (DEBUG_TERMINAL) {
			console.log(`[Terminal] isReattach=${isReattach} paneId=${paneId}`);
		}
		const cached = v1TerminalCache.getOrCreate(paneId, {
			cwd: workspaceCwdRef.current ?? undefined,
			initialTheme: initialThemeRef.current,
			onFileLinkClick: (path, line, column) =>
				handleFileLinkClickRef.current(path, line, column),
			onUrlClickRef: handleUrlClickRef,
		});
		const { xterm, fitAddon, searchAddon, renderer } = cached;

		// Subscribe before attaching so no output is missed between the snapshot
		// and the stream. Events queue in the cache until the attach succeeds.
		v1TerminalCache.startStream(paneId);

		// Called after createOrAttach resolves: re-fit against the now-settled
		// container and push dims to the backend, in case the fit on attach ran
		// before flex layout resolved.
		const syncBackendDimensions = () => {
			if (container.clientWidth === 0 || container.clientHeight === 0) return;
			runWhenParserIdle(cached.gate, () => {
				if (isUnmounted || xtermRef.current !== xterm) return;
				if (container.clientWidth === 0 || container.clientHeight === 0) return;
				fitAddon.fit();
				// Always send: a resize that raced the session's creation was
				// dropped, and xterm's own size already reflects it, so a
				// "did it change" check would leave the shell at the wrong width.
				resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
			});
		};

		// Move the wrapper into the live container. The cache fits on attach and
		// on container resizes, invoking the callback when dimensions change.
		v1TerminalCache.attachToContainer(paneId, container, () => {
			resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
		});

		const scheduleScrollToBottom = () => {
			requestAnimationFrame(() => {
				if (isUnmounted || xtermRef.current !== xterm) return;
				scrollToBottom(xterm);
			});
		};

		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		rendererRef.current = renderer;
		searchAddonRef.current = searchAddon;
		isExitedRef.current = false;
		setXtermInstance(xterm);
		isStreamReadyRef.current = false;
		pendingInitialStateRef.current = null;

		if (isFocusedRef.current) {
			xterm.focus();
		}

		// Wait for first render before applying restoration. On reattach xterm
		// has already rendered, so skip the render gate.
		let renderDisposable: IDisposable | null = null;
		let firstRenderFallback: ReturnType<typeof setTimeout> | null = null;

		if (isReattach) {
			didFirstRenderRef.current = true;
		} else {
			didFirstRenderRef.current = false;

			renderDisposable = xterm.onRender(() => {
				if (firstRenderFallback) {
					clearTimeout(firstRenderFallback);
					firstRenderFallback = null;
				}
				renderDisposable?.dispose();
				renderDisposable = null;
				didFirstRenderRef.current = true;
				maybeApplyInitialState();
			});

			firstRenderFallback = setTimeout(() => {
				if (isUnmounted || didFirstRenderRef.current) return;
				didFirstRenderRef.current = true;
				maybeApplyInitialState();
			}, FIRST_RENDER_RESTORE_FALLBACK_MS);
		}

		const nextAttachRequestId = () => createAttachRequestId(paneId);
		const cancelAttachRequest = (requestId: string | null) => {
			if (!requestId) return;
			cancelCreateOrAttachRef.current({ paneId, requestId });
		};
		const writeWorkspaceRunCommand = async (command: string) => {
			await writeCommandInPane({
				paneId,
				command,
				write: (input) => electronTrpcClient.terminal.write.mutate(input),
			});
		};

		const restartTerminalSession = (options?: {
			command?: string;
			forceRestart?: boolean;
		}) =>
			new Promise<void>((resolve, reject) => {
				const command = options?.command ?? defaultRestartCommandRef.current;
				const workspaceRun = getPaneWorkspaceRun(paneId);
				if (workspaceRun && command) {
					setPaneWorkspaceRunState(paneId, "running");
				}
				const canReuseAttachedSession =
					Boolean(command) &&
					!options?.forceRestart &&
					!isExitedRef.current &&
					!connectionErrorRef.current;
				if (canReuseAttachedSession && command) {
					void writeWorkspaceRunCommand(command).then(resolve).catch(reject);
					return;
				}
				isExitedRef.current = false;
				isStreamReadyRef.current = false;
				wasKilledByUserRef.current = false;
				setExitStatus(null);
				resetModes();
				// Clear stale input modes (mouse tracking, bracketed paste, etc.)
				// left on xterm by the previous session before reattaching.
				resetTerminalInputModes(xterm);
				xterm.clear();
				const attach = () => {
					const requestId = nextAttachRequestId();
					cancelAttachRequest(activeAttachRequestId);
					activeAttachRequestId = requestId;
					createOrAttachRef.current(
						{
							paneId,
							requestId,
							tabId: tabIdRef.current,
							workspaceId,
							cols: xterm.cols,
							rows: xterm.rows,
							skipColdRestore: true,
							allowKilled: true,
						},
						{
							onSuccess: (result) => {
								if (activeAttachRequestId !== requestId) {
									resolve();
									return;
								}
								setConnectionError(null);
								v1TerminalCache.clearExitState(paneId);
								openPaneStream(paneId);
								syncBackendDimensions();
								pendingInitialStateRef.current = result;
								maybeApplyInitialState();
								if (!command) {
									resolve();
									return;
								}
								void writeWorkspaceRunCommand(command)
									.then(resolve)
									.catch((error) => {
										console.error(
											"[Terminal] Failed to write workspace run command:",
											error,
										);
										if (workspaceRun) {
											setPaneWorkspaceRunState(paneId, "stopped-by-exit");
										}
										setConnectionError(
											error instanceof Error
												? error.message
												: "Failed to write workspace run command",
										);
										isStreamReadyRef.current = true;
										flushPendingEvents();
										reject(error);
									});
							},
							onError: (error) => {
								if (activeAttachRequestId !== requestId) {
									resolve();
									return;
								}
								if (isTerminalAttachCanceledMessage(error.message)) {
									resolve();
									return;
								}
								console.error("[Terminal] Failed to restart:", error);
								if (workspaceRun) {
									setPaneWorkspaceRunState(paneId, "stopped-by-exit");
								}
								setConnectionError(
									error.message || "Failed to restart terminal",
								);
								isStreamReadyRef.current = true;
								flushPendingEvents();
								reject(error);
							},
							onSettled: () => {
								if (activeAttachRequestId === requestId) {
									activeAttachRequestId = null;
								}
							},
						},
					);
				};

				if (options?.forceRestart) {
					void electronTrpcClient.terminal.kill
						.mutate({ paneId })
						.catch((err) => {
							console.warn("[Terminal] Kill failed before restart:", err);
						})
						.finally(attach);
					return;
				}
				attach();
			});

		restartTerminalRef.current = restartTerminalSession;

		const handleTerminalInput = (data: string) => {
			if (isRestoredModeRef.current || connectionErrorRef.current) return;
			if (isExitedRef.current) {
				const isWorkspaceRunPane = hasPaneWorkspaceRun(paneId);
				if (
					!isFocusedRef.current ||
					(wasKilledByUserRef.current && !isWorkspaceRunPane)
				) {
					return;
				}
				// For workspace-run panes, don't restart until the run command
				// has been resolved via tRPC query — otherwise we'd start a
				// plain interactive shell instead of the configured command.
				if (isWorkspaceRunPane && !defaultRestartCommandRef.current) {
					return;
				}
				void restartTerminalSession();
				return;
			}
			writeRef.current({ paneId, data });
		};

		const handleKeyPress = (event: {
			key: string;
			domEvent: KeyboardEvent;
		}) => {
			if (isRestoredModeRef.current || connectionErrorRef.current) return;
			const { domEvent } = event;
			if (domEvent.key === "Enter") {
				if (!isAlternateScreenRef.current) {
					const buffer = commandBufferRef.current;
					if (isCommandEchoed(xterm, buffer)) {
						const title = sanitizeForTitle(buffer);
						if (title) {
							setPaneNameRef.current(paneId, title);
						}
					}
				}
				commandBufferRef.current = "";
			} else if (domEvent.key === "Backspace") {
				commandBufferRef.current = commandBufferRef.current.slice(0, -1);
			} else if (domEvent.key === "c" && domEvent.ctrlKey) {
				commandBufferRef.current = "";
				const currentPane = useTabsStore.getState().panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					useTabsStore.getState().setPaneStatus(paneId, "idle");
				}
			} else if (domEvent.key === "Escape") {
				const currentPane = useTabsStore.getState().panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					useTabsStore.getState().setPaneStatus(paneId, "idle");
				}
			} else if (
				domEvent.key.length === 1 &&
				!domEvent.ctrlKey &&
				!domEvent.metaKey
			) {
				commandBufferRef.current += domEvent.key;
			}
		};

		const initialCwd = paneInitialCwdRef.current;

		const {
			workspaceRun: paneWorkspaceRun,
			isNewWorkspaceRun,
			restartCommand: workspaceRunRestartCommand,
		} = resolveWorkspaceRunAttachMode(paneId, defaultRestartCommandRef.current);

		// On reattach the stream is already running and the xterm buffer is
		// current, so skip createOrAttach entirely.
		let cancelInitialAttach: (() => void) | null = null;

		if (isReattach) {
			isStreamReadyRef.current = true;
			// The attach snapshot used to restore these; xterm has parsed every
			// byte while parked, so its own state is authoritative.
			isAlternateScreenRef.current = xterm.buffer.active.type === "alternate";
			isBracketedPasteRef.current = xterm.modes.bracketedPasteMode;
			const exitState = v1TerminalCache.get(paneId)?.exitState;
			if (exitState) {
				// The process exited while this pane was parked or hidden; the exit
				// event was already consumed, so restore its state.
				isExitedRef.current = true;
				isStreamReadyRef.current = false;
				wasKilledByUserRef.current = exitState.killedByUser;
				setExitStatus(exitState.killedByUser ? "killed" : "exited");
			}
			const storedColdRestore = coldRestoreState.get(paneId);
			if (storedColdRestore?.isRestored) {
				setIsRestoredMode(true);
				setRestoredCwd(storedColdRestore.cwd);
			}
		} else {
			cancelInitialAttach = scheduleTerminalAttach({
				paneId,
				priority: isFocusedRef.current ? 0 : 1,
				run: (done) => {
					const startAttach = (commandToRunAfterAttach?: string) => {
						if (attachCanceled) return;
						if (attachInFlightByPane.has(paneId)) {
							cancelAttachWait = waitForAttachClear(paneId, () => {
								if (attachCanceled || isUnmounted) return;
								startAttach(commandToRunAfterAttach);
							});
							return;
						}

						const requestId = nextAttachRequestId();
						cancelAttachRequest(activeAttachRequestId);
						activeAttachRequestId = requestId;
						activeAttachId = ++attachSequence;
						const attachId = activeAttachId;
						const isAttachActive = () =>
							!isUnmounted && !attachCanceled && attachId === activeAttachId;

						markAttachInFlight(paneId, attachId);

						const finishAttach = () => {
							clearAttachInFlight(paneId, attachId);
							done();
						};

						if (DEBUG_TERMINAL) {
							console.log(`[Terminal] createOrAttach start: ${paneId}`);
						}
						createOrAttachRef.current(
							{
								paneId,
								requestId,
								tabId: tabIdRef.current,
								workspaceId,
								cols: xterm.cols,
								rows: xterm.rows,
								cwd: initialCwd,
								...((isNewWorkspaceRun || Boolean(commandToRunAfterAttach)) && {
									skipColdRestore: true,
								}),
							},
							{
								onSuccess: (result) => {
									if (!isAttachActive()) return;
									if (activeAttachRequestId !== requestId) return;
									setConnectionError(null);
									clearPaneInitialDataRef.current(paneId);
									openPaneStream(paneId);
									syncBackendDimensions();

									const storedColdRestore = coldRestoreState.get(paneId);
									if (storedColdRestore?.isRestored) {
										setIsRestoredMode(true);
										setRestoredCwd(storedColdRestore.cwd);
										if (storedColdRestore.scrollback && xterm) {
											xterm.write(
												storedColdRestore.scrollback,
												scheduleScrollToBottom,
											);
										}
										didFirstRenderRef.current = true;
										return;
									}

									if (result.isColdRestore) {
										const scrollback =
											result.snapshot?.snapshotAnsi ?? result.scrollback;
										coldRestoreState.set(paneId, {
											isRestored: true,
											cwd: result.previousCwd || null,
											scrollback,
										});
										setIsRestoredMode(true);
										setRestoredCwd(result.previousCwd || null);
										if (scrollback && xterm) {
											xterm.write(scrollback, scheduleScrollToBottom);
										}
										didFirstRenderRef.current = true;
										return;
									}

									pendingInitialStateRef.current = result;
									maybeApplyInitialState();

									if (!commandToRunAfterAttach) {
										return;
									}

									void writeWorkspaceRunCommand(commandToRunAfterAttach).catch(
										(error) => {
											console.error(
												"[Terminal] Failed to write workspace run command after attach:",
												error,
											);
											if (paneWorkspaceRun) {
												setPaneWorkspaceRunState(paneId, "stopped-by-exit");
											}
											setConnectionError(
												error instanceof Error
													? error.message
													: "Failed to write workspace run command",
											);
											isStreamReadyRef.current = true;
											flushPendingEvents();
										},
									);
								},
								onError: (error) => {
									if (!isAttachActive()) return;
									if (activeAttachRequestId !== requestId) return;
									if (isTerminalAttachCanceledMessage(error.message)) {
										return;
									}
									const workspaceRun = getPaneWorkspaceRun(paneId);
									if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
										if (workspaceRun) {
											setPaneWorkspaceRunState(paneId, "stopped-by-user");
										}
										wasKilledByUserRef.current = true;
										isExitedRef.current = true;
										isStreamReadyRef.current = false;
										setExitStatus("killed");
										setConnectionError(null);
										return;
									}
									console.error("[Terminal] Failed to create/attach:", error);
									if (workspaceRun) {
										setPaneWorkspaceRunState(paneId, "stopped-by-exit");
									}
									setConnectionError(
										error.message || "Failed to connect to terminal",
									);
									isStreamReadyRef.current = true;
									flushPendingEvents();
								},
								onSettled: () => {
									if (activeAttachRequestId === requestId) {
										activeAttachRequestId = null;
									}
									finishAttach();
								},
							},
						);
					};

					// Handle workspace-run panes that need recovery (stopped or stale "running" after restart)
					if (paneWorkspaceRun && !isNewWorkspaceRun) {
						void recoverWorkspaceRunPane({
							paneId,
							workspaceRun: paneWorkspaceRun,
							isNewWorkspaceRun,
							xterm,
							shouldAbort: () => isUnmounted || attachCanceled,
							startAttach,
							done,
							isExitedRef,
							wasKilledByUserRef,
							isStreamReadyRef,
							setExitStatus,
							restartCommand: workspaceRunRestartCommand,
						});
						return;
					}

					startAttach();
					return;
				},
			});
		}

		const inputDisposable = xterm.onData(handleTerminalInput);
		const keyDisposable = xterm.onKey(handleKeyPress);
		const titleDisposable = xterm.onTitleChange((title) => {
			if (title) {
				setPaneNameRef.current(paneId, title);
				renameUnnamedWorkspaceRef.current(title);
			}
		});

		const handleClear = () => {
			xterm.clear();
			clearScrollbackRef.current({ paneId });
		};

		const handleScrollToBottom = () => scrollToBottom(xterm);

		const handleWrite = (data: string) => {
			if (isExitedRef.current) return;
			writeRef.current({ paneId, data });
		};

		const cleanupKeyboard = setupKeyboardHandler(xterm, {
			onShiftEnter: () => handleWrite("\x1b\r"),
			onClear: handleClear,
			onWrite: handleWrite,
		});
		const cleanupClickToMove = setupClickToMoveCursor(xterm, {
			onWrite: handleWrite,
		});
		registerClearCallbackRef.current(paneId, handleClear);
		registerScrollToBottomCallbackRef.current(paneId, handleScrollToBottom);

		const handleGetSelection = () => {
			const selection = xterm.getSelection();
			if (!selection) return "";
			return selection
				.split("\n")
				.map((line) => line.trimEnd())
				.join("\n");
		};

		const handlePaste = (text: string) => {
			if (isExitedRef.current) return;
			xterm.paste(text);
		};

		registerGetSelectionCallbackRef.current(paneId, handleGetSelection);
		registerPasteCallbackRef.current(paneId, handlePaste);

		const cleanupFocus = setupFocusListener(xterm, () =>
			handleTerminalFocusRef.current(),
		);
		const cleanupPaste = setupPasteHandler(xterm, {
			onPaste: (text) => {
				commandBufferRef.current += text;
			},
			onWrite: handleWrite,
			isBracketedPasteEnabled: () => isBracketedPasteRef.current,
		});
		const cleanupCopy = setupCopyHandler(xterm);
		const reattachRecovery = {
			throttleMs: 120,
			pendingFrame: null as number | null,
			lastRunAt: 0,
			pendingForceResize: false,
		};

		const isCurrentTerminalRenderable = () => {
			if (isUnmounted || xtermRef.current !== xterm) return false;
			if (!container.isConnected) return false;

			const style = window.getComputedStyle(container);
			if (style.display === "none" || style.visibility === "hidden") {
				return false;
			}

			const rect = container.getBoundingClientRect();
			return rect.width > 1 && rect.height > 1;
		};

		const runReattachRecovery = (forceResize: boolean) => {
			if (!isCurrentTerminalRenderable()) return;

			const prevCols = xterm.cols;
			const prevRows = xterm.rows;
			const wasAtBottom =
				xterm.buffer.active.viewportY >= xterm.buffer.active.baseY;

			// Rebuild stale WebGL glyph cache after occlusion and force a paint pass.
			rendererRef.current?.current.clearTextureAtlas?.();

			runWhenParserIdle(cached.gate, () => {
				if (isUnmounted || xtermRef.current !== xterm) return;
				fitAddon.fit();
				xterm.refresh(0, Math.max(0, xterm.rows - 1));

				if (forceResize || xterm.cols !== prevCols || xterm.rows !== prevRows) {
					resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
				}
			});

			if (isFocusedRef.current && document.hasFocus()) {
				xterm.focus();
			}

			if (!wasAtBottom) return;
			requestAnimationFrame(() => {
				if (isUnmounted || xtermRef.current !== xterm) return;
				scrollToBottom(xterm);
			});
		};

		const scheduleReattachRecovery = (forceResize: boolean) => {
			reattachRecovery.pendingForceResize ||= forceResize;
			if (reattachRecovery.pendingFrame !== null) return;

			reattachRecovery.pendingFrame = requestAnimationFrame(() => {
				reattachRecovery.pendingFrame = null;

				const now = Date.now();
				if (now - reattachRecovery.lastRunAt < reattachRecovery.throttleMs) {
					// Schedule a retry after the remaining throttle window so the recovery
					// is not permanently lost when focus events fire in rapid succession.
					const remaining =
						reattachRecovery.throttleMs - (now - reattachRecovery.lastRunAt);
					setTimeout(() => {
						if (!isUnmounted)
							scheduleReattachRecovery(reattachRecovery.pendingForceResize);
					}, remaining + 1);
					return;
				}
				reattachRecovery.lastRunAt = now;

				const shouldForceResize = reattachRecovery.pendingForceResize;
				reattachRecovery.pendingForceResize = false;
				runReattachRecovery(shouldForceResize);
			});
		};

		const cancelReattachRecovery = () => {
			if (reattachRecovery.pendingFrame === null) return;
			cancelAnimationFrame(reattachRecovery.pendingFrame);
			reattachRecovery.pendingFrame = null;
		};

		registerRefreshCallbackRef.current(paneId, () => {
			rebuildRenderer();
			runReattachRecovery(true);
		});

		// Rebuild the GPU renderer (dispose + recreate) on demand, e.g. the manual
		// "refresh terminal" action. Not run on tab switches: the terminal now
		// survives them parked, so there is nothing to rebuild.
		const rebuildRenderer = () => {
			const rendererHolder = rendererRef.current;
			if (!rendererHolder || rendererHolder.current.kind !== "webgl") return;
			try {
				rendererHolder.current.dispose();
				rendererHolder.current = loadRenderer(xterm);
			} catch (error) {
				console.warn("[Terminal] Renderer rebuild failed:", error);
			}
		};

		// If the pane was backgrounded long enough that a stream stall could have
		// gone unnoticed (e.g. the IPC subscription silently drops data while
		// hidden), the daemon's real terminal modes (mouse tracking, bracketed
		// paste, etc.) can drift from what this xterm instance still believes is
		// active. A stuck "mouse tracking on" mode makes every mouse movement
		// send raw escape sequences into the pty, which a plain shell just
		// echoes back as garbage text. Re-fetching an attach snapshot is a cheap,
		// idempotent daemon call that returns the true current mode state so we
		// can correct any drift instead of only doing a cosmetic re-render.
		let inactiveSince: number | null =
			document.hidden || !document.hasFocus() ? Date.now() : null;
		let modeResyncInFlight = false;

		const shouldSkipModeResync = () =>
			isUnmounted ||
			isExitedRef.current ||
			connectionErrorRef.current !== null ||
			!isStreamReadyRef.current ||
			attachInFlightByPane.has(paneId) ||
			modeResyncInFlight;

		const runModeResync = () => {
			if (shouldSkipModeResync()) return;
			modeResyncInFlight = true;
			createOrAttachRef.current(
				{
					paneId,
					requestId: nextAttachRequestId(),
					tabId: tabIdRef.current,
					workspaceId,
					cols: xterm.cols,
					rows: xterm.rows,
				},
				{
					onSuccess: (result) => {
						if (isUnmounted || xtermRef.current !== xterm) return;
						if (result.isColdRestore) {
							// The daemon lost the underlying session while we were away;
							// fall back to the normal restore path to rebuild content.
							setIsRestoredMode(true);
							setRestoredCwd(result.previousCwd || null);
							pendingInitialStateRef.current = result;
							didFirstRenderRef.current = true;
							maybeApplyInitialState();
							return;
						}
						const snapshot = result.snapshot;
						if (!snapshot) return;
						isAlternateScreenRef.current = !!snapshot.modes.alternateScreen;
						isBracketedPasteRef.current = !!snapshot.modes.bracketedPaste;
						if (snapshot.rehydrateSequences) {
							xterm.write(snapshot.rehydrateSequences);
						}
						if (DEBUG_TERMINAL) {
							console.log(
								`[Terminal] Mode resync applied after idle background: ${paneId}`,
							);
						}
					},
					onError: (error) => {
						if (isTerminalAttachCanceledMessage(error.message)) return;
						console.warn(
							`[Terminal] Mode resync failed for ${paneId}:`,
							error.message,
						);
					},
					onSettled: () => {
						modeResyncInFlight = false;
					},
				},
			);
		};

		const markInactive = () => {
			if (inactiveSince === null) inactiveSince = Date.now();
		};

		const markActiveAndRecover = (forceResize: boolean) => {
			const inactiveDuration =
				inactiveSince !== null ? Date.now() - inactiveSince : 0;
			inactiveSince = null;
			if (inactiveDuration >= MODE_RESYNC_IDLE_THRESHOLD_MS) {
				runModeResync();
			}
			scheduleReattachRecovery(forceResize);
		};

		const handleVisibilityChange = () => {
			if (document.hidden) {
				markInactive();
				return;
			}
			markActiveAndRecover(isFocusedRef.current);
		};
		const handleWindowFocus = () => {
			markActiveAndRecover(isFocusedRef.current);
		};
		const handleWindowBlur = () => {
			markInactive();
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("focus", handleWindowFocus);
		window.addEventListener("blur", handleWindowBlur);

		const isPaneDestroyedInStore = () =>
			isPaneDestroyed(useTabsStore.getState().panes, paneId);

		return () => {
			if (DEBUG_TERMINAL) {
				console.log(`[Terminal] Unmount: ${paneId}`);
			}
			const paneDestroyed = isPaneDestroyedInStore();
			cancelInitialAttach?.();
			isUnmounted = true;
			attachCanceled = true;
			cancelAttachRequest(activeAttachRequestId);
			activeAttachRequestId = null;
			const cleanupAttachId = activeAttachId || undefined;
			activeAttachId = 0;
			if (cancelAttachWait) {
				cancelAttachWait();
				cancelAttachWait = null;
			}
			clearAttachInFlight(paneId, cleanupAttachId);
			if (firstRenderFallback) clearTimeout(firstRenderFallback);
			cancelReattachRecovery();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("focus", handleWindowFocus);
			window.removeEventListener("blur", handleWindowBlur);
			inputDisposable.dispose();
			keyDisposable.dispose();
			titleDisposable.dispose();
			cleanupKeyboard();
			cleanupClickToMove();
			cleanupFocus?.();
			cleanupPaste();
			cleanupCopy();
			unregisterClearCallbackRef.current(paneId);
			unregisterScrollToBottomCallbackRef.current(paneId);
			unregisterGetSelectionCallbackRef.current(paneId);
			unregisterPasteCallbackRef.current(paneId);
			unregisterRefreshCallbackRef.current(paneId);

			if (paneDestroyed) {
				// Pane was explicitly destroyed: kill the session and free the
				// cached terminal and its stream.
				killTerminalForPane(paneId);
				coldRestoreState.delete(paneId);
				v1TerminalCache.dispose(paneId);
			} else {
				// Pane hidden (tab or workspace switch): park the wrapper but keep
				// xterm and its stream subscription alive in the cache. No backend
				// detach: the session stays connected so output keeps flowing into
				// xterm while hidden.
				v1TerminalCache.detachFromContainer(paneId);
			}

			isStreamReadyRef.current = false;
			didFirstRenderRef.current = false;
			pendingInitialStateRef.current = null;
			resetModes();
			renderDisposable?.dispose();

			// The cache owns xterm's lifecycle; do not dispose it here.

			xtermRef.current = null;
			searchAddonRef.current = null;
			rendererRef.current = null;
			setXtermInstance(null);
		};
	}, [
		paneId,
		workspaceId,
		maybeApplyInitialState,
		flushPendingEvents,
		setConnectionError,
		resetModes,
		setIsRestoredMode,
		setRestoredCwd,
	]);

	return { xtermInstance, restartTerminal };
}
