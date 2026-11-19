import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import { ownedProject } from "@/server/projects";
import { serveObject, sourceKey } from "@/server/storage";

export const Route = createFileRoute("/api/projects/$id/source")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        asMember(request, async (user) => {
          const project = await ownedProject(user.id, params.id);
          if (!project || project.status === "uploading") return null;
          return serveObject(sourceKey(project.id), request);
        }),
    },
  },
});
