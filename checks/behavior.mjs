import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { withFakeAi } from "./fake-ai.mjs";
import { fixture, uploadProject } from "./helpers.mjs";

const runtime = await startRuntime(withFakeAi);
const long = { timeout: 90_000 };
try {
  const page = await (await runtime.context("owner")).newPage();

  // F001: upload a video and get a project that plays it.
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-file").setInputFiles(fixture("interview.webm"));
  await page.getByTestId("project-title-input").fill("Founder Q&A, episode 12");
  await Promise.all([page.waitForURL(/\/projects\/[\w-]+$/, long), page.getByTestId("create-project").click()]);
  const projectId = page.url().split("/").pop();
  await expect(page.getByRole("heading", { level: 1, name: "Founder Q&A, episode 12" })).toBeVisible();
  await expect(page.getByTestId("project-status")).toHaveText("Uploaded", long);
  await expect(page.getByTestId("source-video")).toHaveAttribute("src", `/api/projects/${projectId}/source`);
  const ranged = await runtime.fetch(`/api/projects/${projectId}/source`, { role: "owner", headers: { range: "bytes=0-99" } });
  expect(ranged.status).toBe(206);
  expect((await ranged.arrayBuffer()).byteLength).toBe(100);

  // F002: choose a range, a length band and a prompt; a failed run can be retried.
  await page.getByTestId("scan-start").fill("0:00");
  await page.getByTestId("scan-end").fill("0:40");
  await page.getByTestId("band-short").click();
  await page.getByTestId("clip-prompt").fill("weekly habits and growth lessons");
  await page.getByTestId("find-clips").click();
  await expect(page.getByTestId("project-status")).toHaveText("Failed", long);
  await expect(page.getByTestId("project-error")).toBeVisible();
  await page.getByTestId("retry-clipping").click();
  await expect(page.getByTestId("project-status")).toHaveText("Ready", long);
  const rows = page.getByTestId("clip-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByTestId("clip-title")).toHaveText("Nobody buys a feature");
  await expect(rows.nth(0).getByTestId("clip-score")).toHaveText("93");
  await expect(rows.nth(1).getByTestId("clip-title")).toHaveText("Walkthroughs doubled signups");
  const project = await (await runtime.fetch(`/api/projects/${projectId}`, { role: "owner" })).json();
  for (const clip of project.clips) {
    expect(clip.start).toBeGreaterThanOrEqual(0);
    expect(clip.end).toBeLessThanOrEqual(40);
    expect(clip.end - clip.start).toBeLessThan(30);
  }

  // F003 + F004: trim, rename, aspect, reframe, captions.
  await rows.nth(0).getByTestId("edit-clip").click();
  await expect(page.getByTestId("preview-canvas")).toBeVisible();
  const clipUrl = page.url();
  const clipId = clipUrl.split("/").pop();
  await page.getByTestId("clip-title-input").fill("Nobody buys a feature, they buy an afternoon");
  await page.getByTestId("clip-end").fill("11.5");
  await page.getByTestId("aspect-1:1").click();
  await page.getByTestId("reframe-auto").click();
  await expect(page.getByTestId("reframe-status")).toContainText("4", long);
  await page.getByTestId("reframe-manual").click();
  await expect(page.getByTestId("reframe-status")).toContainText("Manual");
  const canvas = page.getByTestId("preview-canvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId("caption-word").first().click();
  await page.getByTestId("word-input").fill("So,");
  await page.getByTestId("word-keyword").click();
  await page.getByTestId("style-box").click();
  await page.getByTestId("save-clip").click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("clip-title-input")).toHaveValue("Nobody buys a feature, they buy an afternoon");
  await expect(page.getByTestId("clip-end")).toHaveValue("11.5");
  await expect(page.getByTestId("aspect-1:1")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("reframe-status")).toContainText("Manual");
  await expect(page.getByTestId("caption-word").first()).toHaveText("So,");
  await expect(page.getByTestId("style-box")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("captions-toggle").click();
  await expect(page.getByTestId("captions-toggle")).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("captions-toggle").click();

  // F006: export, download, and re-editing marks the export outdated.
  await page.getByTestId("export-clip").click();
  await expect(page.getByTestId("export-status")).toContainText("Exported", long);
  await expect(page.getByTestId("download-clip")).toHaveAttribute("href", `/api/clips/${clipId}/export`);
  const download = await runtime.fetch(`/api/clips/${clipId}/export`, { role: "owner" });
  expect(download.status).toBe(200);
  expect(download.headers.get("content-type")).toBe("video/mp4");
  expect(Buffer.from(await download.arrayBuffer()).subarray(0, 16).toString("latin1")).toContain("ftyp");
  await page.getByTestId("clip-title-input").fill("Nobody buys a feature");
  await page.getByTestId("save-clip").click();
  await expect(page.getByTestId("export-status")).toContainText("Outdated");
  await page.goto(`/projects/${projectId}`);
  await expect(rows.nth(0).getByTestId("export-status")).toContainText("Outdated");
  await expect(rows.nth(0).getByTestId("download-clip")).toBeVisible();

  // F003: delete a clip.
  await rows.nth(1).getByTestId("edit-clip").click();
  await page.getByTestId("delete-clip").click();
  await Promise.all([page.waitForURL(new RegExp(`/projects/${projectId}$`)), page.getByTestId("confirm-delete").click()]);
  await expect(rows).toHaveCount(1);

  // F005: a brand template becomes the default.
  await page.goto("/templates");
  await page.getByTestId("new-template").click();
  await page.getByTestId("template-name").fill("Studio bold");
  await page.getByTestId("font-anton").click();
  await page.getByTestId("template-text-color").fill("#ffffff");
  await page.getByTestId("template-highlight-color").fill("#ffd23f");
  await page.getByTestId("position-top").click();
  await page.getByTestId("template-uppercase").click();
  await page.getByTestId("template-logo").setInputFiles(fixture("logo.png"));
  await page.getByTestId("corner-top-right").click();
  await page.getByTestId("save-template").click();
  const studio = page.getByTestId("template-row").filter({ hasText: "Studio bold" });
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId("template-logo-preview")).toBeVisible();
  await studio.getByTestId("make-default").click();
  await expect(studio.getByTestId("default-badge")).toBeVisible();

  // F001: list newest first, rename and delete.
  const other = await uploadProject(runtime, "owner", "Webinar recording");
  await page.goto("/");
  const projectRows = page.getByTestId("project-row");
  await expect(projectRows.nth(0)).toContainText("Webinar recording");
  await expect(projectRows.nth(1)).toContainText("Founder Q&A, episode 12");
  await projectRows.nth(0).getByTestId("rename-project").click();
  await page.getByTestId("rename-input").fill("Webinar, spring launch");
  await page.getByTestId("rename-save").click();
  await expect(projectRows.nth(0)).toContainText("Webinar, spring launch");
  await projectRows.nth(0).getByTestId("delete-project").click();
  await page.getByTestId("confirm-delete").click();
  await expect(projectRows).toHaveCount(1);
  expect((await runtime.fetch(`/api/projects/${other.id}/source`, { role: "owner" })).status).toBe(404);

  // F002 + F005: re-running with a new prompt replaces the clips, which take the default template.
  await projectRows.nth(0).getByRole("link").first().click();
  await page.getByTestId("band-auto").click();
  await page.getByTestId("clip-prompt").fill("hiring advice");
  await page.getByTestId("find-clips").click();
  await expect(page.getByTestId("project-status")).toHaveText("Ready", long);
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).getByTestId("clip-title")).toHaveText("Hire the curious ones");
  await rows.nth(0).getByTestId("edit-clip").click();
  await expect(page.getByTestId("template-option").filter({ hasText: "Studio bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("caption-word").first()).toBeVisible();
  await runtime.screenshot(page);

  // Phone-sized smoke.
  const phone = await (await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto("/");
  await expect(phone.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await expect(phone.getByTestId("new-project")).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
} finally {
  await runtime.close();
}
