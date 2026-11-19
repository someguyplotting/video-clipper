import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { uploadProject } from "./helpers.mjs";

const runtime = await startRuntime();
try {
  const { id, bytes } = await uploadProject(runtime, "owner", "Quarterly all-hands");
  await runtime.restart();
  const list = await (await runtime.fetch("/api/projects", { role: "owner" })).json();
  const found = list.projects.find((p) => p.id === id);
  expect(found.title).toBe("Quarterly all-hands");
  expect(found.status).toBe("uploaded");
  const source = await runtime.fetch(`/api/projects/${id}/source`, { role: "owner" });
  expect(source.status).toBe(200);
  expect((await source.arrayBuffer()).byteLength).toBe(bytes.length);
  const page = await (await runtime.context("owner")).newPage();
  await page.goto("/");
  await expect(page.getByTestId("project-row").filter({ hasText: "Quarterly all-hands" })).toBeVisible();
} finally {
  await runtime.close();
}
