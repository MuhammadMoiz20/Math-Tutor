import { test, expect } from "@playwright/test";
import {
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from "../../scripts/seed-curriculum";

test.describe("workspace", () => {
  test("scratchpad live-renders KaTeX in the preview pane", async ({
    page,
  }) => {
    // Sign in via the credentials form. The global setup seeded a known user.
    await page.goto("/signin");
    await page.locator('input[name="email"]').fill(TEST_USER_EMAIL);
    await page.locator('input[name="password"]').fill(TEST_USER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Wait for redirect away from /signin.
    await page.waitForURL((u) => !u.pathname.startsWith("/signin"), {
      timeout: 15_000,
    });

    await page.goto("/problems/linalg-1-eigen-1");
    await expect(
      page.getByRole("heading", { name: "Eigenvalues of a 2×2 matrix" }),
    ).toBeVisible();

    // Type into the CodeMirror editor — focus the editor's contenteditable.
    const editor = page
      .locator('[data-testid="scratchpad-editor"] .cm-content')
      .first();
    await editor.click();
    await page.keyboard.type("$x^2$");

    // Preview should render KaTeX.
    const preview = page.locator('[data-testid="scratchpad-preview"]');
    await expect(preview.locator(".katex").first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
