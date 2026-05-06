import { execSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import {
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from "../../scripts/seed-curriculum";

/**
 * Phase 9 wiring test. The SM-2 math is fully unit-tested in
 * `lib/progress/sm2.test.ts`; this E2E only confirms:
 *   - /review renders empty state for a fresh user
 *   - inserting a due review row via the test helper makes it appear
 *   - the problem page renders the review banner under ?review=1
 *
 * We bypass the Pyodide checker (which is gated behind PLAYWRIGHT_PYODIDE)
 * by seeding the review_queue row directly via tsx; this matches the spec's
 * "path of least friction" guidance.
 */

const PROBLEM_ID = "linalg-1-eigen-1";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  await page.locator('input[name="email"]').fill(TEST_USER_EMAIL);
  await page.locator('input[name="password"]').fill(TEST_USER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), {
    timeout: 15_000,
  });
}

function seedReview(dueAt: number) {
  execSync(
    `npx tsx tests/helpers/seed-review.ts ${TEST_USER_EMAIL} ${PROBLEM_ID} ${dueAt} 1 1 2.5`,
    { stdio: "inherit" },
  );
}

function clearReview() {
  // Reset the row so subsequent test runs start clean.
  execSync(
    `npx tsx -e "const{openDb}=require('./lib/db');const db=openDb(process.env.DB_PATH||'math-tutor.db');db.prepare('DELETE FROM review_queue WHERE problem_id=?').run('${PROBLEM_ID}');"`,
    { stdio: "inherit" },
  );
}

test.describe("spaced review", () => {
  test.beforeEach(() => {
    clearReview();
  });
  test.afterAll(() => {
    clearReview();
  });

  test("empty state when nothing is due", async ({ page }) => {
    await signIn(page);
    await page.goto("/review");
    await expect(page.getByTestId("review-empty")).toBeVisible();
  });

  test("home header links to review", async ({ page }) => {
    await signIn(page);
    await page.goto("/");
    await expect(page.getByTestId("nav-review")).toBeVisible();
  });

  test("a row due now appears in /review and links to ?review=1", async ({
    page,
  }) => {
    const now = (Date.now() / 1000) | 0;
    // Seed a row whose due_at is already in the past (i.e. due now).
    seedReview(now - 60);

    await signIn(page);
    await page.goto("/review");
    const item = page.getByTestId("review-item").first();
    await expect(item).toBeVisible();
    await item.getByRole("link").click();

    await page.waitForURL((u) => u.pathname.startsWith(`/problems/${PROBLEM_ID}`));
    expect(page.url()).toContain("review=1");
    await expect(page.getByTestId("review-banner")).toBeVisible();
  });

  test("a row due in the future does NOT appear", async ({ page }) => {
    const now = (Date.now() / 1000) | 0;
    seedReview(now + 86400 * 7); // due in a week

    await signIn(page);
    await page.goto("/review");
    await expect(page.getByTestId("review-empty")).toBeVisible();
  });
});
