import { test, expect } from "@playwright/test";
import {
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from "../../scripts/seed-curriculum";

const PYODIDE_ENABLED = process.env.PLAYWRIGHT_PYODIDE === "1";

test.describe("answer checking", () => {
  test.skip(
    !PYODIDE_ENABLED,
    "Pyodide cold-load is too slow for default CI; gate with PLAYWRIGHT_PYODIDE=1.",
  );

  test("submits wrong then correct answer and sees red/green verdicts", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto("/signin");
    await page.locator('input[name="email"]').fill(TEST_USER_EMAIL);
    await page.locator('input[name="password"]').fill(TEST_USER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/signin"), {
      timeout: 15_000,
    });

    await page.goto("/problems/linalg-1-eigen-1");
    await expect(
      page.getByRole("heading", { name: "Eigenvalues of a 2×2 matrix" }),
    ).toBeVisible();

    const answerInput = page.locator('[data-testid="final-answer-input"]');
    const submit = page.locator('[data-testid="submit-button"]');

    // Wrong answer: red verdict.
    await answerInput.fill("{1, 2}");
    await submit.click();
    await expect(page.locator('[data-testid="verdict-incorrect"]')).toBeVisible(
      { timeout: 90_000 },
    );

    // Correct answer: green verdict.
    await answerInput.fill("{1, 3}");
    await submit.click();
    await expect(page.locator('[data-testid="verdict-correct"]')).toBeVisible({
      timeout: 60_000,
    });
  });
});
