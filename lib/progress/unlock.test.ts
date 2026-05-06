import { describe, it, expect } from "vitest";
import { canUnlockSolution } from "./unlock";

const M = 60_000;

describe("canUnlockSolution", () => {
  it("locked: 0 attempts, no openedAt", () => {
    expect(
      canUnlockSolution({ attempts: 0, openedAt: null, now: 1_000 }),
    ).toBe(false);
  });

  it("unlocked: 1 attempt, no openedAt", () => {
    expect(
      canUnlockSolution({ attempts: 1, openedAt: null, now: 1_000 }),
    ).toBe(true);
  });

  it("unlocked: many attempts even at t=0 elapsed", () => {
    expect(
      canUnlockSolution({ attempts: 5, openedAt: 100, now: 100 }),
    ).toBe(true);
  });

  it("locked at 14:59 elapsed, 0 attempts", () => {
    expect(
      canUnlockSolution({
        attempts: 0,
        openedAt: 0,
        now: 15 * M - 1,
      }),
    ).toBe(false);
  });

  it("unlocked at exactly 15:00 elapsed, 0 attempts", () => {
    expect(
      canUnlockSolution({ attempts: 0, openedAt: 0, now: 15 * M }),
    ).toBe(true);
  });

  it("respects custom minMinutes", () => {
    expect(
      canUnlockSolution({
        attempts: 0,
        openedAt: 0,
        now: 5 * M,
        minMinutes: 5,
      }),
    ).toBe(true);
    expect(
      canUnlockSolution({
        attempts: 0,
        openedAt: 0,
        now: 5 * M - 1,
        minMinutes: 5,
      }),
    ).toBe(false);
  });

  it("locked under negative time skew", () => {
    expect(
      canUnlockSolution({
        attempts: 0,
        openedAt: 10_000,
        now: 5_000,
      }),
    ).toBe(false);
  });

  it("locked when attempts is 0 and openedAt is null even with huge now", () => {
    expect(
      canUnlockSolution({
        attempts: 0,
        openedAt: null,
        now: Number.MAX_SAFE_INTEGER,
      }),
    ).toBe(false);
  });
});
