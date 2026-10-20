import { expect, test } from "@playwright/test";
import { api, signUp } from "./helpers";

test.describe("iPhone layout", () => {
  test("bottom navigation, More sheet and no horizontal scroll", async ({ page }) => {
    await signUp(page);
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Main" }).last();
    await expect(nav.getByRole("link", { name: "Learn" })).toBeVisible();
    await nav.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More sections" }).getByRole("link", { name: "Mind Maps" }).click();
    await expect(page).toHaveURL(/mind-maps/);
    for (const path of ["/home", "/vocabulary", "/learn", "/writing", "/progress", "/settings", "/tutor"]) {
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
});
