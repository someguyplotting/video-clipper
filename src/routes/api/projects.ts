import { createFileRoute } from "@tanstack/react-router";
import { asMember, json } from "@/server/http";
import { ensureMember } from "@/server/members";
import * as projects from "@/server/projects";

export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: ({ request }) => asMember(request, async (user) => json({ projects: await projects.listProjects(user.id) })),
      POST: ({ request }) =>
        asMember(request, async (user) => {
          const parsed = projects.createProjectInput.safeParse(await request.json().catch(() => null));
          if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
          await ensureMember(user);
          return json(await projects.createProject(user.id, parsed.data), 201);
        }),
    },
  },
});
