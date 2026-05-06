import { test, expect } from "@playwright/test";
import {
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from "../../scripts/seed-curriculum";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  await page.locator('input[name="email"]').fill(TEST_USER_EMAIL);
  await page.locator('input[name="password"]').fill(TEST_USER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), {
    timeout: 15_000,
  });
}

test.describe("Solution mode unlock gate (offline, mocked APIs)", () => {
  test("Solution tab is locked initially and unlocks after one attempt", async ({
    page,
  }) => {
    await signIn(page);

    // Mock /api/check to record an attempt without hitting the LLM judge.
    await page.route("**/api/check", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          attemptId: 1,
          verdict: "incorrect",
          judge: {
            verdict: "incorrect",
            missing_claims: ["inductive step"],
            errors: [],
            comments: "Only the base case is shown.",
          },
        }),
      });
    });
    // Mock /api/coach so we never need a live API for this test.
    await page.route("**/api/coach**", async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ messages: [] }),
        });
        return;
      }
      const body = [
        'data: {"type":"delta","text":"Here is the canonical solution..."}\n\n',
        'data: {"type":"done"}\n\n',
      ].join("");
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
        },
        body,
      });
    });

    // Use the derivation problem so Submit takes the LLM-judge path
    // (mocked above) and avoids loading Pyodide in the browser.
    await page.goto("/problems/linalg-1-proof-1");
    const solTab = page.getByTestId("chat-tab-solution");
    await expect(solTab).toBeVisible();
    await expect(solTab).toBeDisabled();
    await expect(solTab).toHaveAttribute("data-locked", "true");

    // Submit a (wrong) attempt → unlock condition met.
    // Derivation problems take the scratchpad-only path (no final-answer
    // checking).
    await page.getByTestId("scratchpad-editor").click();
    await page.keyboard.type("Base case: 1 = 1.");
    await page.getByTestId("submit-button").click();
    // Verdict UI eventually settles; we just need the attempt-recorded
    // event to fire, which happens immediately on the 200 response.
    await expect(solTab).toBeEnabled({ timeout: 10_000 });

    // Click Solution; the mocked stream should deliver text.
    await solTab.click();
    await page.getByTestId("chat-input").fill("Walk me through it.");
    await page.getByTestId("chat-send").click();
    await expect(
      page.getByTestId("chat-messages").getByText(/canonical solution/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});
