import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import * as templates from "@/server/templates";

export const getTemplates = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => templates.listTemplates(context.user));

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => templates.saveTemplateInput.parse(data))
  .handler(({ data, context }) => templates.saveTemplate(context.user, data));

export const setDefaultTemplate = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => templates.templateIdInput.parse(data))
  .handler(({ data, context }) => templates.setDefaultTemplate(context.user.id, data.id));

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => templates.templateIdInput.parse(data))
  .handler(({ data, context }) => templates.deleteTemplate(context.user, data.id));
