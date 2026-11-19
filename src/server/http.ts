import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import type { Person } from "./members";

export const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/** Runs a route handler for the signed-in member; null from the handler is a 404. */
export async function asMember(
  request: Request,
  handle: (user: Person) => Promise<Response | null>,
): Promise<Response> {
  const user = await getEveryAppUser(request, env);
  if (!user) return Response.json({ error: "Sign in through the Gateway" }, { status: 401 });
  return (await handle({ id: user.id, email: user.email })) ?? notFound();
}

export const json = (data: unknown, status = 200) => (data === null ? null : Response.json(data, { status }));
