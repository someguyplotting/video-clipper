import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clips, members, templates } from "@/db/schema";
import { ensureMember, type Person } from "./members";
import { logoKey, media } from "./storage";

export const FONTS = ["sans", "anton", "bebas", "montserrat", "serif"] as const;
export const POSITIONS = ["top", "middle", "bottom"] as const;
export const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const saveTemplateInput = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1, "Give the template a name").max(80),
    font: z.enum(FONTS),
    textColor: color,
    highlightColor: color,
    position: z.enum(POSITIONS),
    uppercase: z.boolean(),
    logoCorner: z.enum(CORNERS),
    removeLogo: z.boolean().optional(),
  })
  .strict();
export const templateIdInput = z.object({ id: z.string().min(1) }).strict();

export async function listTemplates(user: Person) {
  const member = await ensureMember(user);
  const rows = await db.select().from(templates).where(eq(templates.userId, user.id)).orderBy(templates.createdAt);
  return rows.map(({ userId: _u, ...t }) => ({ ...t, isDefault: t.id === member.defaultTemplateId }));
}

async function owned(userId: string, id: string) {
  return (await db.select().from(templates).where(and(eq(templates.id, id), eq(templates.userId, userId))).get()) ?? null;
}

export async function saveTemplate(user: Person, { id, removeLogo, ...fields }: z.infer<typeof saveTemplateInput>) {
  await ensureMember(user);
  if (id) {
    const found = await owned(user.id, id);
    if (!found) return null;
    await db
      .update(templates)
      .set({ ...fields, ...(removeLogo ? { hasLogo: false } : {}) })
      .where(and(eq(templates.id, id), eq(templates.userId, user.id)));
    if (removeLogo) await media().delete(logoKey(id));
    await markOutdated(user.id, id);
    return { id };
  }
  const newId = crypto.randomUUID();
  await db.insert(templates).values({ id: newId, userId: user.id, ...fields });
  return { id: newId };
}

async function markOutdated(userId: string, templateId: string) {
  await db
    .update(clips)
    .set({ exportStatus: "outdated" })
    .where(and(eq(clips.userId, userId), eq(clips.templateId, templateId), eq(clips.exportStatus, "ready")));
}

export async function setDefaultTemplate(userId: string, id: string) {
  if (!(await owned(userId, id))) return null;
  await db.update(members).set({ defaultTemplateId: id }).where(eq(members.id, userId));
  return { id };
}

export async function deleteTemplate(user: Person, id: string) {
  const member = await ensureMember(user);
  if (!(await owned(user.id, id))) return null;
  const rest = (await db.select({ id: templates.id }).from(templates).where(eq(templates.userId, user.id))).filter((t) => t.id !== id);
  if (!rest.length) throw new Error("Keep at least one template.");
  const fallback = member.defaultTemplateId === id ? rest[0]!.id : member.defaultTemplateId;
  await db.batch([
    db.update(clips).set({ templateId: fallback }).where(and(eq(clips.userId, user.id), eq(clips.templateId, id))),
    db.update(members).set({ defaultTemplateId: fallback }).where(eq(members.id, user.id)),
    db.delete(templates).where(and(eq(templates.id, id), eq(templates.userId, user.id))),
  ]);
  await media().delete(logoKey(id));
  return { id };
}

export async function saveLogo(userId: string, id: string, body: ArrayBuffer, contentType: string) {
  if (!(await owned(userId, id))) return null;
  await media().put(logoKey(id), body, { httpMetadata: { contentType } });
  await db.update(templates).set({ hasLogo: true }).where(and(eq(templates.id, id), eq(templates.userId, userId)));
  await markOutdated(userId, id);
  return { ok: true };
}

export async function logoFor(userId: string, id: string) {
  const found = await owned(userId, id);
  return found?.hasLogo ? logoKey(id) : null;
}
