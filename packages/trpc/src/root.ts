import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { adminRouter } from "./router/admin";
import { agentRouter } from "./router/agent";
import { analyticsRouter } from "./router/analytics";
import { chatRouter } from "./router/chat";
import { deviceRouter } from "./router/device";
import { projectRouter } from "./router/project";
import { taskRouter } from "./router/task";
import { userRouter } from "./router/user";
import { v2ProjectRouter } from "./router/v2-project";
import { v2WorkspaceRouter } from "./router/v2-workspace";
import { workspaceRouter } from "./router/workspace";
import { createCallerFactory, createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
	admin: adminRouter,
	agent: agentRouter,
	analytics: analyticsRouter,
	chat: chatRouter,
	device: deviceRouter,
	project: projectRouter,
	task: taskRouter,
	user: userRouter,
	v2Project: v2ProjectRouter,
	v2Workspace: v2WorkspaceRouter,
	workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);
