import { test, expect } from "@playwright/test";

test("concept page renders heading and katex", async ({ page }) => {
  await page.goto("/modules/linalg-1");
  await expect(
    page
      .getByRole("heading", { name: "Linear Algebra I", level: 1 })
      .first(),
  ).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
});
