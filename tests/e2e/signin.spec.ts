import { test, expect } from "@playwright/test";

// Auth E2E. The Playwright webServer runs `npm run dev` and inherits this
// process's env (default Playwright behavior). Because we cannot reliably
// preset DB_PATH/AUTH_SECRET for the spawned server from inside a test,
// and the dev .env.local already contains AUTH_SECRET + DB_PATH, this test
// asserts the signin page renders. The auth wiring is exercised by the
// unit tests in lib/auth/current-user.test.ts (per implementation plan).
test("signin page renders form", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
