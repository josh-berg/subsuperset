import {
	type AgentPresetPatch,
	buildFileCommandFromAgentConfig,
	type ResolvedAgentConfig,
	renderTaskPromptTemplate,
	validateTaskPromptTemplate,
} from "shared/utils/agent-settings";
import type { AgentEditableField } from "./agent-card.types";

const SAMPLE_TASK = {
	id: "task_agent_settings",
	slug: "desktop-agent-settings",
	title: "Desktop agent settings",
	description: "Implement the desktop agent settings architecture.",
	priority: "high",
	statusName: "Todo",
	labels: ["desktop", "agents"],
};

export function getPreviewPrompt(preset: ResolvedAgentConfig): string {
	return renderTaskPromptTemplate(preset.taskPromptTemplate, SAMPLE_TASK);
}

export function getPreviewNoPromptCommand(preset: ResolvedAgentConfig): string {
	return preset.command.trim() || "No command configured.";
}

export function getPreviewTaskCommand(preset: ResolvedAgentConfig): string {
	return (
		buildFileCommandFromAgentConfig({
			filePath: `.superset/task-${SAMPLE_TASK.slug}.md`,
			config: preset,
		}) ?? "No prompt-capable command configured."
	);
}

export function getAgentFieldValue(
	preset: ResolvedAgentConfig,
	field: AgentEditableField,
): string {
	switch (field) {
		case "label":
			return preset.label;
		case "description":
			return preset.description ?? "";
		case "command":
			return preset.command;
		case "promptCommand":
			return preset.promptCommand;
		case "promptCommandSuffix":
			return preset.promptCommandSuffix ?? "";
		case "taskPromptTemplate":
			return preset.taskPromptTemplate;
	}
}

export function buildAgentFieldPatch({
	preset,
	field,
	value,
}: {
	preset: ResolvedAgentConfig;
	field: AgentEditableField;
	value: string;
}): { patch: AgentPresetPatch } | { error: string } {
	switch (field) {
		case "label":
			if (!value.trim()) {
				return { error: "Label is required." };
			}
			return { patch: { label: value } };
		case "description":
			return { patch: { description: value || null } };
		case "command":
			if (!value.trim()) {
				return { error: "Command is required for terminal agents." };
			}
			return { patch: { command: value } };
		case "promptCommand":
			if (!value.trim()) {
				return preset.source === "user"
					? { patch: { promptCommand: "" } }
					: { error: "Prompt command is required for terminal agents." };
			}
			return { patch: { promptCommand: value } };
		case "promptCommandSuffix":
			return { patch: { promptCommandSuffix: value || null } };
		case "taskPromptTemplate": {
			if (!value.trim()) {
				return { error: "Task prompt template is required." };
			}
			const templateValidation = validateTaskPromptTemplate(value);
			if (!templateValidation.valid) {
				return {
					error: `Unknown variables: ${templateValidation.unknownVariables.join(", ")}`,
				};
			}
			return { patch: { taskPromptTemplate: value } };
		}
	}
}
