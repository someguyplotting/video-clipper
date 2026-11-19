import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clips, members, projects } from "@/db/schema";
import { selectHighlights, wordsBetween, type LengthBand, type Word, BAND_LIMITS } from "@/lib/highlights";
import { AiError, chatJson, transcribe } from "./ai";
import { audioKey, deletePrefix, media } from "./storage";

export interface ClipJob {
  projectId: string;
  userId: string;
  runId: string;
}

/** Transcribes the stored audio, asks for highlights and replaces the project's clips. */
export async function runClipJob(job: ClipJob, orgId: string) {
  const project = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, job.projectId), eq(projects.userId, job.userId)))
    .get();
  if (!project || project.runId !== job.runId || project.status !== "processing") return;
  const target = { background: true as const, organizationId: orgId, userId: job.userId };
  const stillCurrent = and(eq(projects.id, project.id), eq(projects.runId, job.runId));
  try {
    const scanStart = project.scanStart ?? 0;
    const scanEnd = project.scanEnd ?? project.durationSec;
    let words: Word[] = project.transcript ? (JSON.parse(project.transcript) as Word[]) : [];
    if (!project.transcript) {
      for (let n = 0; n < project.audioChunks; n++) {
        const object = await media().get(audioKey(project.id, n));
        if (!object) throw new AiError("The extracted audio is missing. Run clipping again.");
        const offset = scanStart + n * project.chunkSec;
        const chunk = await transcribe(await object.arrayBuffer(), target);
        for (const w of chunk) {
          const s = Math.round((w.start + offset) * 100) / 100;
          const e = Math.round((w.end + offset) * 100) / 100;
          if (s < scanEnd) words.push({ w: w.word.trim(), s, e: Math.min(e, scanEnd) });
        }
      }
      if (!words.length) throw new AiError("No speech was found in the chosen part of the video.");
      await db.update(projects).set({ transcript: JSON.stringify(words) }).where(stillCurrent);
    }
    const band = project.lengthBand as LengthBand;
    const answer = await chatJson(highlightPrompt(words, band, project.prompt), target);
    const picked = selectHighlights(answer.clips, { start: scanStart, end: scanEnd }, band, words);
    if (!picked.length) throw new AiError("No moments fit the chosen length. Try another length or prompt.");
    const member = await db.select().from(members).where(eq(members.id, job.userId)).get();
    const current = await db.select({ runId: projects.runId }).from(projects).where(eq(projects.id, project.id)).get();
    if (current?.runId !== job.runId) return;
    await deletePrefix(`p/${project.id}/clips/`);
    await db.batch([
      db.delete(clips).where(and(eq(clips.projectId, project.id), eq(clips.userId, job.userId))),
      ...picked.map((h) =>
        db.insert(clips).values({
          id: crypto.randomUUID(),
          projectId: project.id,
          userId: job.userId,
          title: h.title,
          startSec: h.start,
          endSec: h.end,
          score: h.score,
          reason: h.reason,
          words: JSON.stringify(wordsBetween(words, h.start, h.end)),
          templateId: member?.defaultTemplateId ?? null,
        }),
      ),
      db.update(projects).set({ status: "ready", error: null }).where(stillCurrent),
    ]);
  } catch (error) {
    const message = error instanceof AiError ? error.message : "Clipping stopped unexpectedly. Try again.";
    if (!(error instanceof AiError)) console.error(error);
    await db.update(projects).set({ status: "failed", error: message }).where(stillCurrent);
  }
}

function highlightPrompt(words: Word[], band: LengthBand, prompt: string | null) {
  const { min, max } = BAND_LIMITS[band];
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 12) {
    const group = words.slice(i, i + 12);
    lines.push(`[${group[0]!.s.toFixed(1)}-${group[group.length - 1]!.e.toFixed(1)}] ${group.map((w) => w.w).join(" ")}`);
  }
  return [
    {
      role: "system",
      content:
        "You pick short highlight clips from a video transcript for social media. Each clip must make sense on its own: a complete thought with a hook, no dangling start or end. " +
        `Each clip lasts between ${min} and ${max} seconds. Use the bracketed times (seconds). ` +
        'Answer with JSON: {"clips":[{"title":string (max 8 words),"start":number,"end":number,"score":integer 0-100 (how likely to do well),"reason":string (one short sentence)}]}. Up to 10 clips, no overlaps.',
    },
    {
      role: "user",
      content: `${prompt ? `Moments wanted: ${prompt}\n\n` : ""}Transcript:\n${lines.join("\n")}`,
    },
  ];
}
