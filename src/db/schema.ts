import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

/** The app's own record of a member, keyed by the Gateway's user id. */
export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  defaultTemplateId: text("default_template_id"),
  createdAt: createdAt(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    durationSec: real("duration_sec").notNull().default(0),
    contentType: text("content_type").notNull().default("video/mp4"),
    // uploading, uploaded, processing, ready, failed
    status: text("status").notNull().default("uploading"),
    error: text("error"),
    scanStart: real("scan_start"),
    scanEnd: real("scan_end"),
    lengthBand: text("length_band").notNull().default("auto"),
    prompt: text("prompt"),
    audioChunks: integer("audio_chunks").notNull().default(0),
    chunkSec: real("chunk_sec").notNull().default(0),
    runId: text("run_id"),
    // JSON [{ w, s, e }], seconds in the source video
    transcript: text("transcript"),
    createdAt: createdAt(),
  },
  (t) => [index("projects_user_idx").on(t.userId, t.createdAt)],
);

export const clips = sqliteTable(
  "clips",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    startSec: real("start_sec").notNull(),
    endSec: real("end_sec").notNull(),
    score: integer("score").notNull().default(0),
    reason: text("reason").notNull().default(""),
    aspect: text("aspect").notNull().default("9:16"),
    focusMode: text("focus_mode").notNull().default("manual"),
    focusX: real("focus_x").notNull().default(0.5),
    focusY: real("focus_y").notNull().default(0.5),
    // JSON [{ t, x, y }]
    keyframes: text("keyframes").notNull().default("[]"),
    captionsOn: integer("captions_on", { mode: "boolean" })
      .notNull()
      .default(true),
    captionStyle: text("caption_style").notNull().default("pop"),
    // JSON [{ w, s, e, k? }]: this clip's copy of the transcript
    words: text("words").notNull().default("[]"),
    templateId: text("template_id"),
    // none, ready, outdated
    exportStatus: text("export_status").notNull().default("none"),
    exportSize: integer("export_size"),
    exportedAt: text("exported_at"),
    createdAt: createdAt(),
  },
  (t) => [index("clips_project_idx").on(t.projectId)],
);

export const templates = sqliteTable(
  "templates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    font: text("font").notNull().default("sans"),
    textColor: text("text_color").notNull().default("#ffffff"),
    highlightColor: text("highlight_color").notNull().default("#facc15"),
    position: text("position").notNull().default("bottom"),
    uppercase: integer("uppercase", { mode: "boolean" })
      .notNull()
      .default(false),
    hasLogo: integer("has_logo", { mode: "boolean" }).notNull().default(false),
    logoCorner: text("logo_corner").notNull().default("top-right"),
    createdAt: createdAt(),
  },
  (t) => [index("templates_user_idx").on(t.userId)],
);
