import { createFileRoute } from "@tanstack/react-router";
import { exportFor, saveExport } from "@/server/clips";
import { asMember, json } from "@/server/http";
import { serveObject } from "@/server/storage";

export const Route = createFileRoute("/api/clips/$id/export")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        asMember(request, async (user) => {
          const found = await exportFor(user.id, params.id);
          if (!found) return null;
          const name = found.title.replace(/[^\w -]+/g, "").trim().slice(0, 80) || "clip";
          return serveObject(found.key, request, { "content-disposition": `attachment; filename="${name}.mp4"` });
        }),
      PUT: ({ request, params }) =>
        asMember(request, async (user) => {
          const body = await request.arrayBuffer();
          if (!body.byteLength) return Response.json({ error: "Empty file" }, { status: 400 });
          return json(await saveExport(user.id, params.id, body));
        }),
    },
  },
});
