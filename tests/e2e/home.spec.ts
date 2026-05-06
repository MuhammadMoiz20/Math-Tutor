import { test, expect } from "@playwright/test";

test("home lists modules and links to concept page", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: "Linear Algebra I" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/modules/linalg-1");
  await link.click();
  await expect(
    page
      .getByRole("heading", { name: "Linear Algebra I", level: 1 })
      .first(),
  ).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
});
