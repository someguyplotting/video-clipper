import { readFile } from "node:fs/promises";
import path from "node:path";

export const fixture = (name) => path.join(import.meta.dirname, "fixtures", name);

/** Creates a project and uploads the fixture video through the app's own upload routes. */
export async function uploadProject(runtime, role, title) {
  const bytes = await readFile(fixture("interview.webm"));
  const json = { "content-type": "application/json" };
  const created = await runtime.fetch("/api/projects", { role, method: "POST", headers: json,
    body: JSON.stringify({ title, durationSec: 40, contentType: "video/webm" }) });
  if (created.status !== 201) throw new Error(`create project: ${created.status} ${await created.text()}`);
  const { id } = await created.json();
  const start = await runtime.fetch(`/api/projects/${id}/upload?step=start`, { role, method: "POST" });
  if (start.status !== 200) throw new Error(`start upload: ${start.status}`);
  const { uploadId } = await start.json();
  const part = await runtime.fetch(`/api/projects/${id}/upload?uploadId=${encodeURIComponent(uploadId)}&part=1`, {
    role, method: "PUT", headers: { "content-type": "application/octet-stream" }, body: bytes });
  if (part.status !== 200) throw new Error(`upload part: ${part.status}`);
  const { etag } = await part.json();
  const done = await runtime.fetch(`/api/projects/${id}/upload?step=complete`, { role, method: "POST", headers: json,
    body: JSON.stringify({ uploadId, parts: [{ partNumber: 1, etag }] }) });
  if (done.status !== 200) throw new Error(`complete upload: ${done.status}`);
  return { id, bytes };
}
