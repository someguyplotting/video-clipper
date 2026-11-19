import { createFileRoute } from "@tanstack/react-router";
import { asMember, json } from "@/server/http";
import { serveObject } from "@/server/storage";
import { logoFor, saveLogo } from "@/server/templates";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const Route = createFileRoute("/api/templates/$id/logo")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        asMember(request, async (user) => {
          const key = await logoFor(user.id, params.id);
          return key ? serveObject(key, request) : null;
        }),
      PUT: ({ request, params }) =>
        asMember(request, async (user) => {
          const type = request.headers.get("content-type") ?? "";
          if (!IMAGE_TYPES.includes(type)) return Response.json({ error: "Use a PNG, JPEG or WebP image" }, { status: 415 });
          const body = await request.arrayBuffer();
          if (body.byteLength > 2_000_000) return Response.json({ error: "Use an image under 2 MB" }, { status: 413 });
          return json(await saveLogo(user.id, params.id, body, type));
        }),
    },
  },
});
