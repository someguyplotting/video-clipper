import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { AiError } from "@/server/ai";
import * as clips from "@/server/clips";

export const getClip = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => clips.clipIdInput.parse(data))
  .handler(({ data, context }) => clips.getClip(context.user.id, data.id));

export const updateClip = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => clips.updateClipInput.parse(data))
  .handler(({ data, context }) => clips.updateClip(context.user.id, data));

export const deleteClip = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => clips.clipIdInput.parse(data))
  .handler(({ data, context }) => clips.deleteClip(context.user.id, data.id));

export const detectFocus = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => clips.detectFocusInput.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const result = await clips.detectFocus(context.user.id, data);
      return result ? { ok: true as const, keyframes: result.keyframes } : { ok: false as const, error: "Clip not found." };
    } catch (error) {
      if (error instanceof AiError || error instanceof Error) return { ok: false as const, error: error.message };
      throw error;
    }
  });
