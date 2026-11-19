import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members, templates } from "@/db/schema";

export interface Person {
  id: string;
  email: string;
}

/** The member's own record, created on first sight with a starter template as their default. */
export async function ensureMember(user: Person) {
  const found = await db.select().from(members).where(eq(members.id, user.id)).get();
  if (found) return found;
  const templateId = crypto.randomUUID();
  await db.batch([
    db.insert(members).values({ id: user.id, email: user.email, defaultTemplateId: templateId }).onConflictDoNothing(),
    db.insert(templates).values({ id: templateId, userId: user.id, name: "Clean" }),
  ]);
  const created = await db.select().from(members).where(eq(members.id, user.id)).get();
  return created!;
}
