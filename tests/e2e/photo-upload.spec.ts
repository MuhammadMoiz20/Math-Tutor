import { test, expect } from "@playwright/test";
import path from "node:path";
import {
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from "../../scripts/seed-curriculum";

const FIXTURE = path.resolve(__dirname, "../fixtures/sample.png");

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  await page.locator('input[name="email"]').fill(TEST_USER_EMAIL);
  await page.locator('input[name="password"]').fill(TEST_USER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), {
    timeout: 15_000,
  });
}

test.describe("photo upload (offline, mocked stream)", () => {
  test("attaches a photo, sends, and renders thumbnail", async ({ page }) => {
    await signIn(page);

    let lastPostBody: Record<string, unknown> | null = null;
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
      lastPostBody = JSON.parse(req.postData() || "{}");
      const body = [
        'data: {"type":"delta","text":"I can see your work in the photo. "}\n\n',
        'data: {"type":"delta","text":"Step 2 looks correct."}\n\n',
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

    // Upload via the hidden file input directly.
    await page.getByTestId("chat-photo-input").setInputFiles(FIXTURE);
    await expect(page.getByTestId("chat-photo-preview")).toBeVisible();

    await page.getByTestId("chat-input").fill("did I get this right?");
    await page.getByTestId("chat-send").click();

    await expect(
      page.getByTestId("chat-messages").getByText(/photo/i),
    ).toBeVisible({ timeout: 10_000 });

    // The submitted POST body must carry the base64 + mime fields.
    expect(lastPostBody).not.toBeNull();
    expect(typeof lastPostBody!.photoBase64).toBe("string");
    expect(lastPostBody!.photoMime).toMatch(/^image\/(png|jpeg|webp)$/);

    // The user-message thumbnail rendered locally after send.
    const thumbs = page.getByTestId("chat-attachment-thumb");
    await expect(thumbs.first()).toBeVisible();

    // Preview clears after send.
    await expect(page.getByTestId("chat-photo-preview")).toHaveCount(0);
  });
});

test.describe("photo upload (live API)", () => {
  test.skip(
    process.env.PLAYWRIGHT_LIVE_API !== "1",
    "set PLAYWRIGHT_LIVE_API=1 to run against the real Anthropic API",
  );

  test("attached photo produces a multimodal reply", async ({ page }) => {
    await signIn(page);
    await page.goto("/problems/linalg-1-eigen-1");
    await page.getByTestId("chat-photo-input").setInputFiles(FIXTURE);
    await page.getByTestId("chat-input").fill("Here's my work — anything wrong?");
    await page.getByTestId("chat-send").click();
    await expect(
      page.getByTestId("chat-messages").locator('[data-role="assistant"]'),
    ).toContainText(/.+/, { timeout: 60_000 });
  });
});
