import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function runNotifyHook(payload: Record<string, unknown>) {
	const template = readFileSync(
		path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
		"utf-8",
	)
		.replaceAll("{{MARKER}}", "# test")
		.replaceAll("{{DEFAULT_PORT}}", "1");
	return spawnSync("bash", ["-c", template], {
		input: JSON.stringify(payload),
		env: {
			PATH: process.env.PATH,
			SUPERSET_TAB_ID: "tab-1",
			SUPERSET_DEBUG_HOOKS: "1",
		},
	});
}

describe("getNotifyScriptContent", () => {
	it("prefers Mastra resourceId over internal session_id", () => {
		const script = readFileSync(
			path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
			"utf-8",
		);

		expect(script).toContain('RESOURCE_ID=$(echo "$INPUT"');
		expect(script).toContain(
			"SESSION_ID=" + "\u0024{RESOURCE_ID:-$HOOK_SESSION_ID}",
		);
		expect(script).toContain('--data-urlencode "resourceId=$RESOURCE_ID"');
		expect(script).toContain(
			'--data-urlencode "hookSessionId=$HOOK_SESSION_ID"',
		);
		expect(script).toContain(
			"event=$EVENT_TYPE sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID",
		);
	});

	it("ignores hooks fired inside a subagent (agent_id present)", () => {
		const result = runNotifyHook({
			hook_event_name: "PostToolUse",
			session_id: "main-session",
			agent_id: "a251e067cfdbabec7",
			agent_type: "general-purpose",
		});

		expect(result.status).toBe(0);
		expect(result.stderr.toString()).toBe("");
	});

	it("still dispatches main-loop hooks without agent_id", () => {
		const result = runNotifyHook({
			hook_event_name: "Stop",
			session_id: "main-session",
		});

		expect(result.status).toBe(0);
		expect(result.stderr.toString()).toContain("[notify-hook] event=Stop");
	});
});
