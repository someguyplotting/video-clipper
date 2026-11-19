import { createFileRoute } from "@tanstack/react-router";
import { asMember, json } from "@/server/http";
import { getProject } from "@/server/projects";

export const Route = createFileRoute("/api/projects/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => asMember(request, async (user) => json(await getProject(user.id, params.id))),
    },
  },
});
