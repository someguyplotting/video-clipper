import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { ensureMember } from "@/server/members";
import * as projects from "@/server/projects";

export const getProjects = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) => {
    await ensureMember(user);
    return projects.listProjects(user.id);
  });

export const getProject = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) => projects.getProject(context.user.id, data.id));

export const renameProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.renameProjectInput.parse(data))
  .handler(({ data, context }) => projects.renameProject(context.user.id, data));

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) => projects.deleteProject(context.user.id, data.id));

export const startClipping = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.startClippingInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    await ensureMember(user);
    return projects.startClipping(user.id, data);
  });

export const retryClipping = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) => projects.retryClipping(context.user.id, data.id));
