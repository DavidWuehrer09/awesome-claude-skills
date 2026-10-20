import { expect, test } from "@playwright/test";
import { api, signUp } from "./helpers";

test.describe("critical journeys", () => {
  test("onboarding from signup creates settings and sample data", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill(`onb-${Date.now()}@example.com`);
    await page.getByLabel("Password").fill("a-long-test-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: /set up your study space/i })).toBeVisible();
    await page.getByRole("button", { name: "Start learning" }).click();
    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByText("Due today", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "My Vocabulary" }).first().click();
    await expect(page.getByText("to undermine").first()).toBeVisible();
  });

  test("Flow A: paste a list, review, fix, assign topic and import", async ({ page }) => {
    await signUp(page, { sample: false });
    await page.goto("/vocabulary/import");
    await page.getByRole("button", { name: /Paste a list/ }).click();
    await page.getByLabel("Your list").fill(["Politics:", "to undermine — to weaken gradually", "turnout — Wahlbeteiligung", "ubiquitous", "", "Environment:", "to mitigate – abmildern", "  e.g. Trees mitigate urban heat."].join("\n"));
    await page.getByRole("button", { name: "Detect entries" }).click();
    await expect(page.getByText(/4 entries detected/)).toBeVisible();
    await expect(page.getByText("No meaning found")).toBeVisible();
    // correct the flagged entry before importing
    const rows = page.getByRole("textbox", { name: "German translation" });
    await rows.nth(2).fill("allgegenwärtig");
    await page.getByRole("button", { name: /Import 4 entries/ }).click();
    await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible();
    await expect(page.getByText("4 new words created")).toBeVisible();
    await page.getByRole("button", { name: "View words" }).click();
    await expect(page.getByText("ubiquitous")).toBeVisible();
    const topics = await api<{ topics: { name: string }[] }>(page.request, "get", "/api/topics");
    expect(topics.topics.map((t) => t.name).sort()).toEqual(["Environment", "Politics"]);
  });

  test("add and edit a word, then find it via global search", async ({ page }) => {
    await signUp(page);
    await page.goto("/vocabulary?add=1");
    await page.getByLabel("Word, phrase, idiom or collocation").fill("to scrutinise");
    await page.getByLabel("Meaning (optional)").fill("genau prüfen");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page).toHaveURL(/\/vocabulary\/.+\?new=1/);
    await page.getByLabel("English definition").fill("to examine something very carefully");
    await page.getByRole("textbox", { name: "Collocations" }).fill("scrutinise the evidence\nclosely scrutinise");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("English definition")).toHaveValue("to examine something very carefully");
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search query").fill("scrutin");
    await expect(page.getByRole("listbox").getByRole("option").first()).toContainText("to scrutinise");
  });

  test("Flow B: a study session records answers that persist and update the schedule", async ({ page }) => {
    await signUp(page);
    await page.goto("/learn/session?mode=mixed&minutes=5");
    await expect(page.getByText(/1 \/ \d+/)).toBeVisible();
    for (let i = 0; i < 4; i++) {
      // answer whatever exercise type is shown
      if (await page.getByRole("button", { name: "Show answer" }).isVisible().catch(() => false)) {
        await page.keyboard.press("Space");
        await page.getByRole("button", { name: /^Good/ }).click();
      } else if (await page.getByLabel("Your answer").isVisible().catch(() => false)) {
        await page.getByLabel("Your answer").fill("undermine");
        await page.getByRole("button", { name: "Check" }).click();
        const good = page.getByRole("button", { name: "Good", exact: true });
        if (await good.isVisible().catch(() => false)) await good.click();
        else await page.getByRole("button", { name: /Continue/ }).click();
      } else if (await page.getByRole("button", { name: /^1/ }).first().isVisible().catch(() => false)) {
        await page.keyboard.press("1");
        await page.getByRole("button", { name: /Continue/ }).click();
      } else break;
    }
    // answers are queued locally and flushed to the server
    await expect.poll(async () => {
      const r = await api<{ items: { state: { reps: number } | null }[] }>(page.request, "get", "/api/vocab?limit=50");
      return r.items.filter((i) => (i.state?.reps ?? 0) > 0).length;
    }, { timeout: 15000 }).toBeGreaterThan(0);
    await page.reload();
    await page.goto("/progress");
    await expect(page.getByText(/answers ·/)).toBeVisible();
  });

  test("typed recall gives precise feedback and accepts a typo as Hard", async ({ page }) => {
    await signUp(page);
    const { items } = await api<{ items: { id: string; headword: string }[] }>(page.request, "get", "/api/vocab?q=mitigate");
    await page.goto(`/learn/session?mode=practice&kinds=typed_de_en&ids=${items[0].id}`);
    await page.getByLabel("Your answer").fill("mitigtae");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Almost: check the spelling/)).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  });

  test("Flow C/D: practice modes and the mind map work on a topic", async ({ page }) => {
    await signUp(page);
    await page.goto("/learn/session?mode=practice&kinds=collocation");
    await expect(page.getByText("Complete the collocation").first()).toBeVisible();
    const topics = await api<{ topics: { id: string; name: string }[] }>(page.request, "get", "/api/topics");
    const env = topics.topics.find((t) => t.name === "Environment")!;
    await page.goto(`/mind-maps?topic=${env.id}`);
    await expect(page.locator(".react-flow__node").filter({ hasText: "to mitigate" })).toBeVisible();
    await page.locator(".react-flow__node").filter({ hasText: "to mitigate" }).click();
    await expect(page.getByRole("heading", { name: "to mitigate" })).toBeVisible();
    await page.getByLabel("Connected word or idea").fill("adaptation");
    await page.getByLabel("Relation", { exact: true }).selectOption("related");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator(".react-flow__node").filter({ hasText: "adaptation" })).toBeVisible();
    await page.getByRole("button", { name: /Study mode/ }).click();
    await expect(page.getByText(/Study mode: words show their meaning/)).toBeVisible();
  });

  test("Flow E: write, autosave, submit, get (demo-labelled) feedback, revise and compare", async ({ page }) => {
    await signUp(page);
    await page.goto("/writing/new?section=paragraph");
    await page.getByRole("tab", { name: "Ready-made prompts" }).click();
    await page.getByRole("button", { name: "Start" }).first().click();
    await expect(page).toHaveURL(/\/writing\/[0-9a-f-]{36}$/);
    const text = "Local elections deserve far more attention from young voters. Decisions about buses, schools and housing are made by councils, and turnout among young people is often very low. It's a missed opportunity.";
    await page.getByLabel("Your text").fill(text);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });
    await page.reload();
    await expect(page.getByLabel("Your text")).toHaveValue(text);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Submit for feedback/ }).click();
    await expect(page).toHaveURL(/\/writing\/submission\//);
    await page.getByRole("button", { name: "Get feedback" }).click();
    await expect(page.getByText("Demo check", { exact: true })).toBeVisible();
    await expect(page.getByText(/Contractions/).first()).toBeVisible();
    await page.getByRole("button", { name: "Understood" }).first().click();
    // revise → version 2 → compare
    await page.getByRole("link", { name: "Revise" }).click();
    await page.getByLabel("Your text").fill(text.replace("It's", "It is"));
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Submit for feedback/ }).click();
    await expect(page.getByText("Version 2")).toBeVisible();
    await page.getByLabel("Compare with version").selectOption({ label: "Version 1" });
    await expect(page.locator(".bg-sage-soft").filter({ hasText: "is" }).first()).toBeVisible();
    await expect(page.locator(".line-through").filter({ hasText: "It's" })).toBeVisible();
  });

  test("Flow F: the tutor answers (demo mode) from the learner's own data", async ({ page }) => {
    await signUp(page);
    const { items } = await api<{ items: { id: string }[] }>(page.request, "get", "/api/vocab?q=undermine");
    await page.goto(`/tutor?attach=${items[0].id}&ask=${encodeURIComponent("What is the difference between undermine and erode?")}`);
    await expect(page.getByText(/Demo mode/).first()).toBeVisible();
    await expect(page.getByText(/subvert/).first()).toBeVisible();
    await page.getByRole("button", { name: "Explain the nuance" }).click();
    await expect(page.locator(".bg-navy").filter({ hasText: /Explain the nuance/ })).toBeVisible();
  });

  test("Flow G: reminder settings save and explain unconfigured channels honestly", async ({ page }) => {
    await signUp(page);
    await page.goto("/settings");
    await page.getByLabel("Reminder time").fill("18:15");
    await page.getByRole("button", { name: "Save schedule" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
    await expect(page.getByText(/Not configured on this server \(VAPID keys missing\)/)).toBeVisible();
    await expect(page.getByText("Email delivery is not configured on this server.")).toBeVisible();
    const me = await api<{ settings: { reminderTime: string } }>(page.request, "get", "/api/me");
    expect(me.settings.reminderTime).toBe("18:15");
  });

  test("keyboard-only flashcards", async ({ page }) => {
    await signUp(page);
    const { items } = await api<{ items: { id: string }[] }>(page.request, "get", "/api/vocab?limit=3");
    await page.goto(`/learn/session?mode=practice&kinds=flip_en_de&ids=${items.map((i) => i.id).join(",")}`);
    await expect(page.getByText("1 / 3")).toBeVisible();
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
    await expect(page.getByText("2 / 3")).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.press("1"); // Again → card comes back later in the session
    await expect(page.getByText(/3 \/ 4/)).toBeVisible();
  });
});

test.describe("security boundaries", () => {
  test("data isolation, authentication and request validation over HTTP", async ({ page, browser }) => {
    await signUp(page);
    const { items } = await api<{ items: { id: string }[] }>(page.request, "get", "/api/vocab?limit=1");
    const other = await browser.newContext({ baseURL: `http://localhost:${process.env.E2E_PORT ?? 3200}` });
    const otherPage = await other.newPage();
    await signUp(otherPage, { sample: false });
    expect((await otherPage.request.get(`/api/vocab/${items[0].id}`)).status()).toBe(404);
    expect((await otherPage.request.patch(`/api/vocab/${items[0].id}`, { data: { baseVersion: 1, patch: { notes: "x" } } })).status()).toBe(404);
    expect((await otherPage.request.delete(`/api/vocab/${items[0].id}`)).status()).toBe(200); // reports 0 deleted
    expect((await page.request.get(`/api/vocab/${items[0].id}`)).status()).toBe(200); // still there
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    expect((await anonPage.request.get("http://localhost:3200/api/vocab")).status()).toBe(401);
    expect((await page.request.post("/api/vocab", { data: { headword: "x" }, headers: { origin: "https://evil.example" } })).status()).toBe(403);
    expect((await page.request.post("/api/vocab", { data: { headword: "" } })).status()).toBe(400);
    const upload = await page.request.post("/api/imports", { multipart: { file: { name: "evil.exe", mimeType: "application/octet-stream", buffer: Buffer.from([0x4d, 0x5a, 0x00, 0x01]) } } });
    expect(upload.status()).toBe(415);
    const me = await page.request.get("/api/me");
    expect(await me.text()).not.toMatch(/sk-ant|VAPID_PRIVATE|ANTHROPIC_API_KEY/);
    await other.close();
    await anon.close();
  });
});
