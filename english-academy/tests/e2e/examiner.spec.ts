import { expect, test } from "@playwright/test";
import { api, signUp } from "./helpers";

const OLD_EXAM = `Schulaufgabe Englisch Q11 – Arbeitszeit: 90 minutes
Text: "Harbour Lights" (fictional)
1. Outline the narrator's situation in about 120 words.
2. Analyse how the atmosphere of the extract is created.
3. Comment on the claim that small towns have no future. Write about 300 words.`;

test.describe("My English Examiner", () => {
  test("upload, confirm, generate, write under exam conditions, submit, revise and get feedback", async ({ page }) => {
    await signUp(page, { sample: false });
    page.on("dialog", (d) => d.accept());

    await page.goto("/abitur/examiner?tab=materials");
    await page.getByLabel("Files").setInputFiles({ name: "schulaufgabe.txt", mimeType: "text/plain", buffer: Buffer.from(OLD_EXAM) });
    await page.getByRole("button", { name: /^Upload/ }).click();
    await expect(page.getByText(/1 document uploaded/)).toBeVisible();
    await page.getByRole("link", { name: "schulaufgabe.txt" }).click();
    await expect(page.getByText(/Suggested: Previous exam/)).toBeVisible();
    await page.getByLabel("Document type").selectOption("exam_paper");
    await page.getByRole("button", { name: "Confirm type" }).click();
    await page.getByRole("button", { name: "The text is correct" }).click();
    await expect(page.getByText("usable as evidence")).toBeVisible();

    await page.goto("/abitur/examiner/new");
    await page.getByLabel("Topics").fill("Environment");
    await page.getByRole("checkbox", { name: /schulaufgabe/ }).check();
    await page.getByRole("button", { name: "Create exam" }).click();
    await expect(page.getByText("Demo exam", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Start timed/ }).click();

    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByText(/Fictional practice text/)).toBeVisible();
    // Hidden expectations never reach the exam room.
    expect(await page.content()).not.toContain("expectedContent");
    await page.getByLabel("Answer to task 1").fill("The mayor argues that the town must act now. He admits that the plan isn't cheap.");
    await page.getByLabel("Answer to task 2").fill("He uses repetition and rhetorical questions to create urgency.");
    await expect(page.getByText("saved", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByLabel("Answer to task 1")).toHaveValue(/must act now/);
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByText("submitted", { exact: true })).toBeVisible();
    await page.getByText("What was expected").first().click();
    await expect(page.getByText(/central situation or claim/i)).toBeVisible();

    await page.getByRole("button", { name: "Revise answers" }).click();
    await page.getByLabel("Revised answer to task 2").fill("He uses repetition and rhetorical questions, which make the plan seem urgent.");
    await page.getByRole("button", { name: "Save as new version" }).click();
    await expect(page.getByText("Saved as version 2")).toBeVisible();
    await page.getByLabel("Compare with").selectOption("1");
    await expect(page.locator(".bg-sage-soft").filter({ hasText: "seem" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Get assessment" }).click();
    await expect(page.getByText("demo assessment")).toBeVisible();
    await expect(page.getByText(/not an official grade/)).toBeVisible();
    await expect(page.getByRole("img", { name: "Estimated 0 to 15 points out of 15" })).toBeVisible();
  });

  test("another account cannot open someone else's exam", async ({ page, browser }) => {
    await signUp(page, { sample: false });
    const { id } = await api<{ id: string }>(page.request, "post", "/api/examiner/exams", { topics: ["Media"] });
    const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const p2 = await other.newPage();
    await signUp(p2, { sample: false });
    expect((await p2.request.get(`/api/examiner/exams/${id}`)).status()).toBe(404);
    expect((await p2.request.post("/api/examiner/attempts", { data: { examId: id, timed: true } })).status()).toBe(404);
    await other.close();
  });

  test("the cost page is only for operators", async ({ page }) => {
    await signUp(page, { sample: false });
    expect((await page.request.get("/api/admin/usage")).status()).toBe(403);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/home/);
  });
});
