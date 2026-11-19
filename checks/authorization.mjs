import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { uploadProject } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  // X001: every page and API is member-only; anonymous and outsiders are refused.
  await runtime.assertPrivateAccess(["/", "/templates", "/api/projects"]);

  const { id } = await uploadProject(runtime, "owner", "Board meeting notes");
  const db = await runtime.database();
  await db.prepare(
    "INSERT INTO clips (id, project_id, user_id, title, start_sec, end_sec, score, reason) VALUES (?, ?, 'owner', 'Private moment', 1, 9, 80, 'x')",
  ).bind("clip-owner-1", id).run();

  for (const role of [undefined, "outsider"]) {
    expect((await runtime.fetch(`/api/projects/${id}/source`, { role })).status).not.toBe(200);
    expect((await runtime.fetch(`/api/clips/clip-owner-1/export`, { role })).status).not.toBe(200);
  }

  // One member never reads or changes another's projects, clips or templates.
  const theirs = await (await runtime.fetch("/api/projects", { role: "member" })).json();
  expect(theirs.projects.map((p) => p.id)).not.toContain(id);
  expect((await runtime.fetch(`/api/projects/${id}`, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(`/api/projects/${id}/source`, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(`/api/projects/${id}/upload?step=start`, { role: "member", method: "POST" })).status).toBe(404);
  expect((await runtime.fetch(`/api/projects/${id}/audio/0`, { role: "member", method: "PUT", body: "RIFF" })).status).toBe(404);
  expect((await runtime.fetch(`/api/clips/clip-owner-1/export`, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(`/api/clips/clip-owner-1/export`, { role: "member", method: "PUT", body: "x" })).status).toBe(404);

  const ownerPage = await (await runtime.context("owner")).newPage();
  await ownerPage.goto("/templates");
  await expect(ownerPage.getByTestId("template-row").first()).toBeVisible();
  const template = await db.prepare("SELECT id FROM templates WHERE user_id = 'owner' LIMIT 1").first();
  expect((await runtime.fetch(`/api/templates/${template.id}/logo`, { role: "member", method: "PUT",
    headers: { "content-type": "image/png" }, body: "png" })).status).toBe(404);

  const memberPage = await (await runtime.context("member")).newPage();
  await memberPage.goto(`/projects/${id}`);
  await expect(memberPage.getByTestId("not-found")).toBeVisible();
  await expect(memberPage.getByText("Board meeting notes")).toHaveCount(0);
  await memberPage.goto(`/projects/${id}/clips/clip-owner-1`);
  await expect(memberPage.getByTestId("not-found")).toBeVisible();
  await expect(memberPage.getByText("Private moment")).toHaveCount(0);
  await memberPage.goto("/templates");
  await expect(memberPage.getByTestId("template-row")).toHaveCount(1);
  expect(await memberPage.getByTestId("template-row").getAttribute("data-id")).not.toBe(template.id);

  // The app has no sign-in of its own and exposes no public route.
  for (const path of ["/login", "/signin", "/signup"]) {
    expect((await runtime.fetch(path, { role: "owner" })).status).toBe(404);
  }
  await ownerPage.goto("/");
  await expect(ownerPage.locator('input[type="password"]')).toHaveCount(0);
  const anon = await runtime.fetch("/api/projects");
  expect(anon.status).not.toBe(200);
} finally {
  await runtime.close();
}
