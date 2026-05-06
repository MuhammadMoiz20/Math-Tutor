import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { requireUserId } from "@/lib/auth/current-user";

const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;

describe("requireUserId", () => {
  beforeEach(() => mockedAuth.mockReset());

  it("returns numeric id when authenticated", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "42", email: "a@b.com" } });
    await expect(requireUserId()).resolves.toBe(42);
  });

  it("throws UNAUTHENTICATED when no session", async () => {
    mockedAuth.mockResolvedValue(null);
    await expect(requireUserId()).rejects.toThrow("UNAUTHENTICATED");
  });

  it("throws UNAUTHENTICATED when session has no user id", async () => {
    mockedAuth.mockResolvedValue({ user: { email: "a@b.com" } });
    await expect(requireUserId()).rejects.toThrow("UNAUTHENTICATED");
  });
});
