import { expect, test } from "@playwright/test";
import { ESSAY, SOURCE } from "./helpers";

test.describe.configure({ mode: "serial" });

test("empty dashboard shows guidance, not invented data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("there is no data yet")).toBeVisible();
  await expect(page.getByText("Mock AI mode")).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
});

test("essay examiner: submit, assess in strict mode, read the evidence-based assessment", async ({ page }) => {
  await page.goto("/examiner");
  await page.getByLabel("Title").fill("Youth centre – analysis");
  await page.getByLabel("Task type").selectOption("nonfiction_analysis");
  await page.getByLabel("Task prompt (exact wording)").fill("Analyse how the author tries to convince the reader that closing the youth centre is a mistake.");
  await page.getByLabel("Source text").fill(SOURCE);
  await page.getByLabel("Essay text").fill(ESSAY);
  await expect(page.getByText(/\d+ words/).last()).toBeVisible();
  await page.getByLabel(/Strict/).check();
  await page.getByRole("button", { name: "Save and assess" }).click();
  await page.waitForURL(/\/essays\/[0-9a-f-]+/);
  await expect(page.getByText("Estimated score · Strict mode")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Strongest aspects" })).toBeVisible();
  await expect(page.getByText("Major — conceptual or task-level")).toBeVisible();
  await expect(page.getByText("mock AI").first()).toBeVisible();
  // evidence for a criterion is expandable
  await page.getByRole("button", { name: /Analytical depth/ }).click();
  await expect(page.getByText("Mock rationale for analytical_depth")).toBeVisible();
});

test("form validation keeps the user's input and explains the problem", async ({ page }) => {
  await page.goto("/examiner");
  await page.getByLabel("Title").fill("Too short");
  await page.getByLabel("Essay text").fill("Just a line.");
  await page.getByRole("button", { name: "Save without assessing" }).click();
  await expect(page.getByText("The essay is too short to assess")).toBeVisible();
  await expect(page.getByLabel("Essay text")).toHaveValue("Just a line.");
});

test("revision studio: colour legend, keyboard navigation, keep original, final version", async ({ page }) => {
  await page.goto("/essays");
  await page.getByRole("link", { name: "Youth centre – analysis" }).click();
  await page.getByRole("button", { name: "Open in Revision Studio" }).click();
  await page.waitForURL(/\/revision\/[0-9a-f-]+/);
  for (const label of ["kept", "changed", "added", "removed"]) await expect(page.getByRole("list", { name: "Colour legend" }).getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText("Greater precision").first()).toBeVisible();
  await page.keyboard.press("j");
  await expect(page.getByText("2/3")).toBeVisible();
  await page.getByRole("button", { name: "Keep my original" }).click();
  await expect(page.getByText("kept original").first()).toBeVisible();
  await page.getByRole("button", { name: "← Prev" }).click();
  await expect(page.getByText("New idea — not in your original")).toHaveCount(0);
  await page.getByRole("tab", { name: "Side by side" }).click();
  await expect(page.getByRole("heading", { name: "Your original" })).toBeVisible();
  await page.getByRole("tab", { name: "Final version" }).click();
  await expect(page.getByText("The author uses a quotation from the mayor to show his opinion.")).toBeVisible();
  await page.getByRole("tab", { name: "Changes" }).click();
  await page.getByRole("button", { name: "Explain this change" }).click();
  await expect(page.getByText("Mock explanation of the change.")).toBeVisible();
});

test("aim for 15: one click gives a 15-point version, ideas and savable phrase upgrades", async ({ page }) => {
  await page.goto("/essays");
  await page.getByRole("link", { name: "Youth centre – analysis" }).click();
  await page.getByRole("button", { name: "Aim for 15" }).click();
  await page.waitForURL(/\/revision\/[0-9a-f-]+/);
  await expect(page.getByText("15-point version")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ideas to reach 15 — do these yourself" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Phrase upgrades" })).toBeVisible();
  await page.getByRole("button", { name: "Save to vocabulary" }).first().click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("training: priorities, hidden model answer, attempt, feedback and reveal", async ({ page }) => {
  await page.goto("/training");
  await expect(page.getByRole("heading", { name: "Your three most valuable priorities" })).toBeVisible();
  await page.getByRole("button", { name: "Start exercise" }).first().click();
  await page.waitForURL(/\/training\/[0-9a-f-]+/);
  await expect(page.getByText("The model answer appears after you submit.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model answer and key" })).toHaveCount(0);
  await page.getByLabel("Answer").fill("1. By comparing the city's lights to a fever, the writer presents city life as an illness its people secretly enjoy.\n2. The metaphor makes the reader uneasy.");
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model answer and key" })).toBeVisible();
});

test("vocabulary: add, search, recall practice changes status to recognised", async ({ page }) => {
  await page.goto("/vocabulary");
  await page.getByLabel("Word or expression").fill("juxtapose");
  await page.getByLabel("Meaning in context").fill("to place side by side to show contrast");
  await page.getByLabel("Natural collocations").fill("juxtapose two images");
  await page.getByRole("button", { name: "Add to bank" }).click();
  await expect(page.getByText("juxtapose").first()).toBeVisible();
  await page.getByLabel("Search vocabulary").fill("contrast");
  await expect(page.getByRole("button", { name: "Practise" })).toHaveCount(1);
  await page.getByRole("button", { name: "Practise" }).click();
  await page.getByLabel("Your answer").fill("juxtapose");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Now use it in a sentence" }).click();
  await page.getByLabel("Your sentence").fill("The director juxtaposes two images to expose the hypocrisy of the council.");
  await page.getByRole("button", { name: "Check sentence" }).click();
  await expect(page.getByText("Mock: natural use.")).toBeVisible();
});

test("learner profile: evidence is visible and can be removed with a reason", async ({ page }) => {
  await page.goto("/profile?tab=skills");
  const card = page.locator("li", { has: page.getByText("Paragraph structure", { exact: true }) }).first();
  await card.getByRole("button", { name: /Evidence \(\d+\)/ }).click();
  page.once("dialog", (d) => d.accept("My teacher disagrees"));
  await card.getByRole("button", { name: "This is inaccurate — remove" }).first().click();
  await expect(card.getByText("Removed: My teacher disagrees")).toBeVisible();
  await page.goto("/profile?tab=curriculum");
  await expect(page.getByText("Research limitation.")).toBeVisible();
  await expect(page.getByText("Official, reported — unverified").first()).toBeVisible();
});

test("dashboard reflects stored work and the progress review", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Score estimates over time" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Performance by criterion" })).toBeVisible();
  await page.getByRole("button", { name: "Write a progress review" }).click();
  await expect(page.getByText("Mock progress review based on the statistics provided.")).toBeVisible();
});

test("data export downloads JSON with the essays", async ({ request }) => {
  const r = await request.get("/api/export");
  expect(r.status()).toBe(200);
  const json = await r.json();
  expect(json.data.essays.length).toBeGreaterThan(0);
});
