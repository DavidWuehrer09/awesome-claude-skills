import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Runs after workflows.spec.ts (alphabetical order is not guaranteed, so pages must also work when empty).
const PAGES = ["/", "/examiner", "/essays", "/revision", "/training", "/vocabulary", "/profile?tab=skills", "/profile?tab=curriculum", "/profile?tab=data"];

for (const path of PAGES) {
  for (const scheme of ["light", "dark"] as const) {
    test(`no serious accessibility violations on ${path} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
}
