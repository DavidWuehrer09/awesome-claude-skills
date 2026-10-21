import { expect, test } from "@playwright/test";
import { api, signUp } from "./helpers";

test.describe("small screens", () => {
  test("bottom navigation, More sheet and no horizontal scroll", async ({ page }) => {
    await signUp(page);
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Main" }).last();
    await expect(nav.getByRole("link", { name: "Learn" })).toBeVisible();
    if (test.info().project.name === "iphone") {
      // Phones use the bottom bar with a More sheet; tablets show the side rail instead.
      await nav.getByRole("button", { name: "More" }).click();
      await page.getByRole("dialog", { name: "More sections" }).getByRole("link", { name: "Mind Maps" }).click();
      await expect(page).toHaveURL(/mind-maps/);
    }
    for (const path of ["/home", "/vocabulary", "/learn", "/writing", "/progress", "/settings", "/tutor", "/abitur/examiner", "/abitur/examiner?tab=materials", "/abitur/examiner?tab=results", "/abitur/examiner/new", "/abitur/examiner/lab"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `horizontal overflow on ${path}`).toBe(false);
    }
  });

  test("swipe right on a flashcard rates it Good", async ({ page }) => {
    await signUp(page);
    const { items } = await api<{ items: { id: string }[] }>(page.request, "get", "/api/vocab?limit=2");
    await page.goto(`/learn/session?mode=practice&kinds=flip_en_de&ids=${items.map((i) => i.id).join(",")}`);
    await expect(page.getByText("1 / 2")).toBeVisible();
    const card = page.getByRole("button", { name: "Show answer" });
    const box = (await card.boundingBox())!;
    const swipe = async () => {
      await page.dispatchEvent("main div.mx-auto", "touchstart", { touches: [{ identifier: 1, clientX: box.x + 40, clientY: box.y + 100 }], changedTouches: [{ identifier: 1, clientX: box.x + 40, clientY: box.y + 100 }] });
      await page.dispatchEvent("main div.mx-auto", "touchend", { touches: [], changedTouches: [{ identifier: 1, clientX: box.x + 260, clientY: box.y + 110 }] });
    };
    await swipe(); // first swipe reveals
    await expect(page.getByText(/How well did you know it/)).toBeVisible();
    await swipe(); // second swipe right = Good
    await expect(page.getByText("2 / 2")).toBeVisible();
  });

  test("exam room: task overview, autosave and submit on a small screen", async ({ page }) => {
    await signUp(page, { sample: false });
    page.on("dialog", (d) => d.accept());
    const { id } = await api<{ id: string }>(page.request, "post", "/api/examiner/exams", { topics: ["Environment"], taskCount: 2 });
    const { attempt } = await api<{ attempt: { id: string } }>(page.request, "post", "/api/examiner/attempts", { examId: id, timed: true });
    await page.goto(`/abitur/examiner/attempt/${attempt.id}`);
    const tasks = page.getByRole("navigation", { name: "Tasks" });
    await expect(tasks.getByText("Task 2: not started")).toBeVisible();
    await page.getByLabel("Answer to task 2").fill("The speaker repeats short sentences to create urgency.");
    await expect(tasks.getByText(/Task 2: \d+ words/)).toBeVisible();
    await expect(page.getByText("saved", { exact: true })).toBeVisible({ timeout: 10_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("submitted", { exact: true })).toBeVisible();
  });
});
