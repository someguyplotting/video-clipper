import { env } from "cloudflare:workers";

export const media = () => env.media;
export const sourceKey = (projectId: string) => `p/${projectId}/source`;
export const audioKey = (projectId: string, n: number) => `p/${projectId}/audio/${n}.wav`;
export const exportKey = (projectId: string, clipId: string) => `p/${projectId}/clips/${clipId}.mp4`;
export const logoKey = (templateId: string) => `t/${templateId}/logo`;

/** Deletes every stored object under a prefix. */
export async function deletePrefix(prefix: string) {
  let cursor: string | undefined;
  do {
    const page = await env.media.list({ prefix, cursor });
    if (page.objects.length) await env.media.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/** An R2 object as a response, honouring a single byte range. */
export async function serveObject(key: string, request: Request, extra: Record<string, string> = {}) {
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  const head = await env.media.head(key);
  if (!head) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": head.httpMetadata?.contentType ?? "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    ...extra,
  };
  if (!range) {
    const object = await env.media.get(key);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { ...headers, "content-length": String(head.size) } });
  }
  const size = head.size;
  let start = range[1] ? Number(range[1]) : size - Number(range[2]);
  let end = range[1] ? (range[2] ? Number(range[2]) : size - 1) : size - 1;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  const object = await env.media.get(key, { range: { offset: start, length: end - start + 1 } });
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    status: 206,
    headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
  });
}
