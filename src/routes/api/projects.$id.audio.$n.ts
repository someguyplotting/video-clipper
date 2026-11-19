import { createFileRoute } from "@tanstack/react-router";
import { asMember, json } from "@/server/http";
import { saveAudio } from "@/server/projects";

// The audio the browser extracted for a clipping run, one part at a time.
export const Route = createFileRoute("/api/projects/$id/audio/$n")({
  server: {
    handlers: {
      PUT: ({ request, params }) =>
        asMember(request, async (user) => {
          const n = Number(params.n);
          if (!Number.isInteger(n) || n < 0 || n > 99) return null;
          return json(await saveAudio(user.id, params.id, n, await request.arrayBuffer()));
        }),
    },
  },
});
