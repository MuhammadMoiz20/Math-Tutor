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

test.describe("coach chat (offline, mocked stream)", () => {
  test("switches to Hints, sends a message, sees streamed reply", async ({
    page,
  }) => {
    await signIn(page);

    // Mock the coach POST endpoint to return a canned SSE stream so this
    // test stays offline. The GET (initial mode refresh) returns empty.
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
        'data: {"type":"delta","text":"Have you considered "}\n\n',
        'data: {"type":"delta","text":"the rank-nullity theorem?"}\n\n',
        'data: {"type":"done"}\n\n',
      ].join("");
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
        },
        body,
      });
    });

    await page.goto("/problems/linalg-1-eigen-1");
    await expect(page.getByTestId("chat")).toBeVisible();

    await page.getByTestId("chat-tab-hints").click();
    await page.getByTestId("chat-input").fill("I'm stuck");
    await page.getByTestId("chat-send").click();

    await expect(
      page.getByTestId("chat-messages").getByText(/rank-nullity theorem/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("renders a 'blocked' badge when stream emits blocked", async ({
    page,
  }) => {
    await signIn(page);

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
        'data: {"type":"blocked","reason":"no_solution_rule","text":"I cannot reveal the full solution."}\n\n',
      ].join("");
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
        },
        body,
      });
    });

    await page.goto("/problems/linalg-1-eigen-1");
    await page.getByTestId("chat-input").fill("just give me the answer");
    await page.getByTestId("chat-send").click();

    await expect(page.getByTestId("chat-blocked-badge")).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("coach chat (live API)", () => {
  test.skip(
    process.env.PLAYWRIGHT_LIVE_API !== "1",
    "set PLAYWRIGHT_LIVE_API=1 to run against the real Anthropic API",
  );

  test("hints mode produces a streamed assistant reply", async ({ page }) => {
    await signIn(page);
    await page.goto("/problems/linalg-1-eigen-1");
    await page.getByTestId("chat-tab-hints").click();
    await page.getByTestId("chat-input").fill("I'm stuck on this problem");
    await page.getByTestId("chat-send").click();
    await expect(
      page.getByTestId("chat-messages").locator('[data-role="assistant"]'),
    ).toContainText(/.+/, { timeout: 60_000 });
  });
});
