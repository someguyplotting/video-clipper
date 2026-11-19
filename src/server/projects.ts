import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { db } from "@/db";
import { clips, projects } from "@/db/schema";
import { LENGTH_BANDS } from "@/lib/highlights";
import { audioKey, deletePrefix, media, sourceKey } from "./storage";

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export const createProjectInput = z
  .object({
    title: z.string().trim().min(1, "Give the project a title").max(200),
    durationSec: z.number().positive().max(6 * 3600),
    contentType: z.enum(VIDEO_TYPES),
  })
  .strict();
export const renameProjectInput = z
  .object({ id: z.string().min(1), title: z.string().trim().min(1).max(200) })
  .strict();
export const projectIdInput = z.object({ id: z.string().min(1) }).strict();
export const startClippingInput = z
  .object({
    id: z.string().min(1),
    scanStart: z.number().min(0),
    scanEnd: z.number().positive(),
    lengthBand: z.enum(LENGTH_BANDS as ["auto", "short", "medium", "long"]),
    prompt: z.string().trim().max(500).default(""),
    audioChunks: z.number().int().min(1).max(100),
    chunkSec: z.number().positive(),
  })
  .strict();

const summary = {
  id: projects.id,
  title: projects.title,
  durationSec: projects.durationSec,
  status: projects.status,
  createdAt: projects.createdAt,
};

export function listProjects(userId: string) {
  return db
    .select(summary)
    .from(projects)
    .where(and(eq(projects.userId, userId)))
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .then((rows) => rows.filter((row) => row.status !== "uploading"));
}

export async function ownedProject(userId: string, id: string) {
  return (
    (await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .get()) ?? null
  );
}

/** A project with its clips, best first, or null when it isn't this member's. */
export async function getProject(userId: string, id: string) {
  const project = await ownedProject(userId, id);
  if (!project) return null;
  const list = await db
    .select({
      id: clips.id,
      title: clips.title,
      start: clips.startSec,
      end: clips.endSec,
      score: clips.score,
      reason: clips.reason,
      aspect: clips.aspect,
      exportStatus: clips.exportStatus,
      exportSize: clips.exportSize,
      exportedAt: clips.exportedAt,
    })
    .from(clips)
    .where(and(eq(clips.projectId, id), eq(clips.userId, userId)))
    .orderBy(desc(clips.score), clips.startSec);
  const { transcript: _t, runId: _r, userId: _u, ...shown } = project;
  return { ...shown, clips: list };
}

export async function createProject(userId: string, input: z.infer<typeof createProjectInput>) {
  const id = crypto.randomUUID();
  await db.insert(projects).values({ id, userId, ...input, status: "uploading" });
  return { id };
}

export async function startUpload(userId: string, id: string) {
  const project = await ownedProject(userId, id);
  if (!project || project.status !== "uploading") return null;
  const upload = await media().createMultipartUpload(sourceKey(id), {
    httpMetadata: { contentType: project.contentType },
  });
  return { uploadId: upload.uploadId };
}

export async function uploadPart(userId: string, id: string, uploadId: string, part: number, body: ArrayBuffer) {
  const project = await ownedProject(userId, id);
  if (!project || project.status !== "uploading") return null;
  const uploaded = await media().resumeMultipartUpload(sourceKey(id), uploadId).uploadPart(part, body);
  return { etag: uploaded.etag, part: uploaded.partNumber };
}

export async function completeUpload(
  userId: string,
  id: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  const project = await ownedProject(userId, id);
  if (!project || project.status !== "uploading") return null;
  await media().resumeMultipartUpload(sourceKey(id), uploadId).complete(parts);
  await db.update(projects).set({ status: "uploaded" }).where(eq(projects.id, id));
  return { status: "uploaded" };
}

export async function saveAudio(userId: string, id: string, n: number, body: ArrayBuffer) {
  const project = await ownedProject(userId, id);
  if (!project || project.status === "uploading") return null;
  await media().put(audioKey(id, n), body, { httpMetadata: { contentType: "audio/wav" } });
  return { ok: true };
}

export async function renameProject(userId: string, { id, title }: z.infer<typeof renameProjectInput>) {
  const [row] = await db
    .update(projects)
    .set({ title })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning(summary);
  return row ?? null;
}

/** Deletes the project, its clips and every stored file. */
export async function deleteProject(userId: string, id: string) {
  const project = await ownedProject(userId, id);
  if (!project) return null;
  await db.batch([
    db.delete(clips).where(and(eq(clips.projectId, id), eq(clips.userId, userId))),
    db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))),
  ]);
  await deletePrefix(`p/${id}/`);
  return { id };
}

export async function startClipping(userId: string, input: z.infer<typeof startClippingInput>) {
  const project = await ownedProject(userId, input.id);
  if (!project || project.status === "uploading") return null;
  const scanEnd = Math.min(input.scanEnd, project.durationSec);
  if (input.scanStart >= scanEnd - 1) throw new Error("The end must come after the start.");
  const runId = crypto.randomUUID();
  await db
    .update(projects)
    .set({
      status: "processing",
      error: null,
      scanStart: input.scanStart,
      scanEnd,
      lengthBand: input.lengthBand,
      prompt: input.prompt || null,
      audioChunks: input.audioChunks,
      chunkSec: input.chunkSec,
      runId,
      transcript: null,
    })
    .where(eq(projects.id, project.id));
  await env.jobs.send({ projectId: project.id, userId, runId });
  return { status: "processing" };
}

/** Runs the last clipping request again with the audio already stored. */
export async function retryClipping(userId: string, id: string) {
  const project = await ownedProject(userId, id);
  if (!project || project.status !== "failed" || !project.audioChunks) return null;
  const runId = crypto.randomUUID();
  await db.update(projects).set({ status: "processing", error: null, runId }).where(eq(projects.id, id));
  await env.jobs.send({ projectId: id, userId, runId });
  return { status: "processing" };
}
