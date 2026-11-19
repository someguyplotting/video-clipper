import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clips, projects, templates } from "@/db/schema";
import { validTrim, wordsBetween, type Word } from "@/lib/highlights";
import { chatJson } from "./ai";
import { exportKey, media } from "./storage";

export const ASPECTS = ["9:16", "1:1", "16:9"] as const;
export const CAPTION_STYLES = ["pop", "box", "karaoke", "minimal"] as const;

export const clipIdInput = z.object({ id: z.string().min(1) }).strict();
export const updateClipInput = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    startSec: z.number().min(0),
    endSec: z.number().positive(),
    aspect: z.enum(ASPECTS),
    focusMode: z.enum(["auto", "manual"]),
    focusX: z.number().min(0).max(1),
    focusY: z.number().min(0).max(1),
    captionsOn: z.boolean(),
    captionStyle: z.enum(CAPTION_STYLES),
    templateId: z.string().min(1).nullable(),
    words: z.array(z.object({ w: z.string().max(60), s: z.number(), e: z.number(), k: z.boolean().optional() }).strict()).max(5000),
  })
  .strict();
export const detectFocusInput = z
  .object({
    id: z.string().min(1),
    frames: z.array(z.object({ t: z.number(), image: z.string().startsWith("data:image/jpeg;base64,").max(400_000) })).min(1).max(8),
  })
  .strict();

async function ownedClip(userId: string, id: string) {
  return (await db.select().from(clips).where(and(eq(clips.id, id), eq(clips.userId, userId))).get()) ?? null;
}

/** Everything the editor needs, or null when the clip isn't this member's. */
export async function getClip(userId: string, id: string) {
  const clip = await ownedClip(userId, id);
  if (!clip) return null;
  const project = await db
    .select({ id: projects.id, title: projects.title, durationSec: projects.durationSec, transcript: projects.transcript })
    .from(projects)
    .where(and(eq(projects.id, clip.projectId), eq(projects.userId, userId)))
    .get();
  if (!project) return null;
  const transcript: Word[] = project.transcript ? JSON.parse(project.transcript) : [];
  const ownTemplates = await db.select().from(templates).where(eq(templates.userId, userId)).orderBy(templates.createdAt);
  const { userId: _u, ...shown } = clip;
  return {
    clip: { ...shown, keyframes: JSON.parse(clip.keyframes) as { t: number; x: number; y: number }[], words: JSON.parse(clip.words) as Word[] },
    project: { id: project.id, title: project.title, durationSec: project.durationSec },
    transcript,
    templates: ownTemplates.map(({ userId: _x, ...t }) => t),
  };
}

export async function updateClip(userId: string, input: z.infer<typeof updateClipInput>) {
  const loaded = await getClip(userId, input.id);
  if (!loaded) return null;
  if (!validTrim(input.startSec, input.endSec, loaded.project.durationSec)) {
    throw new Error("Keep the clip inside the video and at least a second long.");
  }
  if (input.templateId && !loaded.templates.some((t) => t.id === input.templateId)) return null;
  // The clip's words follow its new bounds; edits carry over by start time.
  const edited = new Map(input.words.map((w) => [w.s, w]));
  const base = loaded.transcript.length ? wordsBetween(loaded.transcript, input.startSec, input.endSec) : input.words;
  const words = base.map((w) => {
    const edit = edited.get(w.s);
    return edit ? { w: edit.w.trim() || w.w, s: w.s, e: w.e, ...(edit.k ? { k: true } : {}) } : { w: w.w, s: w.s, e: w.e };
  });
  const { id, words: _w, ...change } = input;
  const [row] = await db
    .update(clips)
    .set({
      ...change,
      words: JSON.stringify(words),
      exportStatus: loaded.clip.exportStatus === "ready" ? "outdated" : loaded.clip.exportStatus,
    })
    .where(and(eq(clips.id, id), eq(clips.userId, userId)))
    .returning({ exportStatus: clips.exportStatus });
  return row ? { exportStatus: row.exportStatus, words } : null;
}

export async function deleteClip(userId: string, id: string) {
  const clip = await ownedClip(userId, id);
  if (!clip) return null;
  await db.delete(clips).where(and(eq(clips.id, id), eq(clips.userId, userId)));
  await media().delete(exportKey(clip.projectId, id));
  return { projectId: clip.projectId };
}

/** Asks the model where the person is in each sampled frame and keeps those points. */
export async function detectFocus(userId: string, input: z.infer<typeof detectFocusInput>) {
  const clip = await ownedClip(userId, input.id);
  if (!clip) return null;
  const answer = await chatJson([
    {
      role: "system",
      content:
        'You locate the main person (their face, or body if no face) in video frames. For each image, in order, give the centre of that person as fractions of the width and height. With nobody visible, give the centre of the most important subject. Answer with JSON: {"positions":[{"x":number 0-1,"y":number 0-1}]}.',
    },
    {
      role: "user",
      content: input.frames.map((f) => ({ type: "image_url", image_url: { url: f.image, detail: "low" } })),
    },
  ]);
  const positions = Array.isArray(answer.positions) ? (answer.positions as { x: unknown; y: unknown }[]) : [];
  const clamp = (n: unknown) => Math.max(0, Math.min(1, Number.isFinite(Number(n)) ? Number(n) : 0.5));
  const keyframes = input.frames
    .slice(0, positions.length)
    .map((f, i) => ({ t: Math.round(f.t * 100) / 100, x: clamp(positions[i]!.x), y: clamp(positions[i]!.y) }));
  if (!keyframes.length) throw new Error("No subject was found. Place the frame by hand instead.");
  await db
    .update(clips)
    .set({
      keyframes: JSON.stringify(keyframes),
      focusMode: "auto",
      exportStatus: clip.exportStatus === "ready" ? "outdated" : clip.exportStatus,
    })
    .where(and(eq(clips.id, clip.id), eq(clips.userId, userId)));
  return { keyframes };
}

export async function saveExport(userId: string, id: string, body: ArrayBuffer) {
  const clip = await ownedClip(userId, id);
  if (!clip) return null;
  await media().put(exportKey(clip.projectId, id), body, { httpMetadata: { contentType: "video/mp4" } });
  await db
    .update(clips)
    .set({ exportStatus: "ready", exportSize: body.byteLength, exportedAt: new Date().toISOString() })
    .where(and(eq(clips.id, id), eq(clips.userId, userId)));
  return { size: body.byteLength };
}

export async function exportFor(userId: string, id: string) {
  const clip = await ownedClip(userId, id);
  if (!clip || clip.exportStatus === "none") return null;
  return { key: exportKey(clip.projectId, id), title: clip.title };
}
