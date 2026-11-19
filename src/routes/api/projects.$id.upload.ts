import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { asMember, json } from "@/server/http";
import * as projects from "@/server/projects";

const completeInput = z.object({
  uploadId: z.string().min(1),
  parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) })).min(1).max(10000),
});

// The source video goes to storage in parts, so long recordings fit.
export const Route = createFileRoute("/api/projects/$id/upload")({
  server: {
    handlers: {
      POST: ({ request, params }) =>
        asMember(request, async (user) => {
          const step = new URL(request.url).searchParams.get("step");
          if (step === "start") return json(await projects.startUpload(user.id, params.id));
          if (step !== "complete") return null;
          const parsed = completeInput.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return Response.json({ error: "Bad upload" }, { status: 400 });
          return json(await projects.completeUpload(user.id, params.id, parsed.data.uploadId, parsed.data.parts));
        }),
      PUT: ({ request, params }) =>
        asMember(request, async (user) => {
          const query = new URL(request.url).searchParams;
          const part = Number(query.get("part"));
          const uploadId = query.get("uploadId");
          if (!uploadId || !Number.isInteger(part) || part < 1) return Response.json({ error: "Bad part" }, { status: 400 });
          return json(await projects.uploadPart(user.id, params.id, uploadId, part, await request.arrayBuffer()));
        }),
    },
  },
});
