import { beforeEach, describe, expect, it, mock } from "bun:test";

const killMutate = mock(() => Promise.resolve());

mock.module("../../../lib/trpc-client", () => ({
	electronTrpcClient: { terminal: { kill: { mutate: killMutate } } },
}));

const { killTerminalForPane, registerPaneTerminalDisposer } = await import(
	"./terminal-cleanup"
);

describe("killTerminalForPane", () => {
	beforeEach(() => {
		killMutate.mockClear();
	});

	it("runs registered disposers and kills the backend session", () => {
		const disposed: string[] = [];
		registerPaneTerminalDisposer((paneId) => disposed.push(paneId));

		killTerminalForPane("pane-1");

		expect(disposed).toContain("pane-1");
		expect(killMutate).toHaveBeenCalledWith({ paneId: "pane-1" });
	});

	it("still kills the session when a disposer throws", () => {
		registerPaneTerminalDisposer(() => {
			throw new Error("boom");
		});

		expect(() => killTerminalForPane("pane-2")).not.toThrow();
		expect(killMutate).toHaveBeenCalledWith({ paneId: "pane-2" });
	});
});
