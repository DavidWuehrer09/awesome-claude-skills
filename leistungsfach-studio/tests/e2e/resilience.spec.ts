import { expect, test } from "@playwright/test";
import { createEssayViaApi, startServer, tempDb } from "./helpers";

test.describe.configure({ mode: "serial" });

test("data survives an application restart", async ({ page }) => {
  const dir = tempDb();
  let s = await startServer(3202, { AI_PROVIDER: "mock", PGLITE_DIR: dir, ALLOW_NO_PASSWORD: "true" });
  const e = await createEssayViaApi(s.url, "Survives restart");
  await fetch(`${s.url}/api/essays/${e.id}/assess`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "teacher_standard" }) });
  await s.stop();
  s = await startServer(3202, { AI_PROVIDER: "mock", PGLITE_DIR: dir, ALLOW_NO_PASSWORD: "true" });
  try {
    await page.goto(`${s.url}/essays`);
    await expect(page.getByRole("link", { name: "Survives restart" })).toBeVisible();
    await page.goto(`${s.url}/essays/${e.id}`);
    await expect(page.getByText("Estimated score · Teacher standard mode")).toBeVisible();
  } finally { await s.stop(); }
});

test("without an API key the essay is saved and the user gets a clear message", async ({ page }) => {
  const s = await startServer(3203, { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "", PGLITE_DIR: tempDb(), ALLOW_NO_PASSWORD: "true" });
  try {
    await page.goto(`${s.url}/examiner`);
    await expect(page.getByText("The AI tutor is not configured yet")).toBeVisible();
    const e = await createEssayViaApi(s.url, "No key essay");
    const r = await fetch(`${s.url}/api/essays/${e.id}/assess`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "strict" }) });
    expect(r.status).toBe(503);
    expect((await r.json()).error.message).toMatch(/ANTHROPIC_API_KEY/);
    await page.goto(`${s.url}/essays/${e.id}`);
    await expect(page.getByText(/Assessment failed/)).toBeVisible();
    await expect(page.getByText("The article deals with the planned closure")).toBeVisible();
  } finally { await s.stop(); }
});

test("malformed AI output is rejected and nothing invalid is saved", async ({ page }) => {
  const s = await startServer(3205, { AI_PROVIDER: "mock", MOCK_AI_BEHAVIOR: "malformed_always", PGLITE_DIR: tempDb(), ALLOW_NO_PASSWORD: "true" });
  try {
    const e = await createEssayViaApi(s.url, "Malformed essay");
    await page.goto(`${s.url}/essays/${e.id}`);
    await page.getByRole("button", { name: "Assess", exact: true }).click();
    await expect(page.getByText(/could not be read \(malformed\)/).first()).toBeVisible();
    const runs = await (await fetch(`${s.url}/api/export`)).json();
    expect(runs.data.assessments.every((a: { status: string }) => a.status === "failed")).toBe(true);
    expect(runs.data.ai_runs.some((r: { error_code?: string; errorCode?: string; attempts: number }) => (r.errorCode ?? r.error_code) === "invalid_json" && r.attempts === 2)).toBe(true);
  } finally { await s.stop(); }
});

test("password protection: redirects, rejects wrong password, accepts the right one", async ({ page }) => {
  const s = await startServer(3204, { AI_PROVIDER: "mock", PGLITE_DIR: tempDb(), APP_PASSWORD: "test-password-123" });
  try {
    const api = await fetch(`${s.url}/api/essays`);
    expect(api.status).toBe(401);
    await page.goto(`${s.url}/essays`);
    await page.waitForURL(/\/login/);
    await page.getByLabel("Password").fill("wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That password is not correct.")).toBeVisible();
    await page.getByLabel("Password").fill("test-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/essays$/);
    await expect(page.getByRole("heading", { name: "Essay History" })).toBeVisible();
  } finally { await s.stop(); }
});

test("production without a password refuses to serve", async () => {
  const s = await startServer(3206, { AI_PROVIDER: "mock", PGLITE_DIR: tempDb(), APP_PASSWORD: "", ALLOW_NO_PASSWORD: "" });
  try {
    const r = await fetch(`${s.url}/`);
    expect(r.status).toBe(503);
    expect(await r.text()).toMatch(/APP_PASSWORD/);
  } finally { await s.stop(); }
});
