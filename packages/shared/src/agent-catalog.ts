import type {
	AgentDefinition,
	AgentDefinitionSource,
	AgentKind,
	TerminalAgentDefinition,
} from "./agent-definition";
import {
	BUILTIN_TERMINAL_AGENT_TYPES,
	BUILTIN_TERMINAL_AGENTS,
} from "./builtin-terminal-agents";

export const BUILTIN_AGENT_IDS = [...BUILTIN_TERMINAL_AGENT_TYPES] as const;

export type BuiltinAgentId = (typeof BUILTIN_AGENT_IDS)[number];
export type AgentDefinitionId = BuiltinAgentId | `custom:${string}`;

export type {
	AgentDefinition,
	AgentDefinitionSource,
	AgentKind,
	TerminalAgentDefinition,
};

export const BUILTIN_AGENT_LABELS: Record<BuiltinAgentId, string> =
	Object.fromEntries(
		BUILTIN_TERMINAL_AGENTS.map((agent) => [agent.id, agent.label]),
	) as Record<BuiltinAgentId, string>;

export const BUILTIN_AGENT_DEFINITIONS: AgentDefinition[] = [
	...BUILTIN_TERMINAL_AGENTS,
];

export function getBuiltinAgentDefinition(id: BuiltinAgentId): AgentDefinition {
	const definition = BUILTIN_AGENT_DEFINITIONS.find((item) => item.id === id);
	if (!definition) {
		throw new Error(`Unknown built-in agent definition: ${id}`);
	}
	return definition;
}

export function isTerminalAgentDefinition(
	definition: AgentDefinition,
): definition is TerminalAgentDefinition {
	return definition.kind === "terminal";
}

export function isBuiltinAgentId(id: string): id is BuiltinAgentId {
	return (BUILTIN_AGENT_IDS as readonly string[]).includes(id);
}

export function isCustomAgentId(id: string): id is `custom:${string}` {
	return id.startsWith("custom:");
}
