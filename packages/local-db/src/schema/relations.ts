import { relations } from "drizzle-orm";
import { projects, workspaceSections, workspaces, worktrees } from "./schema";

export const projectsRelations = relations(projects, ({ one, many }) => ({
	worktrees: many(worktrees),
	workspaces: many(workspaces),
	workspaceSections: many(workspaceSections),
	parent: one(projects, {
		fields: [projects.parentProjectId],
		references: [projects.id],
		relationName: "feature_project_children",
	}),
	children: many(projects, {
		relationName: "feature_project_children",
	}),
}));

export const worktreesRelations = relations(worktrees, ({ one, many }) => ({
	project: one(projects, {
		fields: [worktrees.projectId],
		references: [projects.id],
	}),
	workspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one }) => ({
	project: one(projects, {
		fields: [workspaces.projectId],
		references: [projects.id],
	}),
	worktree: one(worktrees, {
		fields: [workspaces.worktreeId],
		references: [worktrees.id],
	}),
	section: one(workspaceSections, {
		fields: [workspaces.sectionId],
		references: [workspaceSections.id],
	}),
}));

export const workspaceSectionsRelations = relations(
	workspaceSections,
	({ one, many }) => ({
		project: one(projects, {
			fields: [workspaceSections.projectId],
			references: [projects.id],
		}),
		workspaces: many(workspaces),
	}),
);
