import { describe, it, expect } from "vitest";
import { schedule, type ReviewState } from "./sm2";

const NOW = 1_700_000_000;
const DAY = 86400;

describe("sm2 schedule()", () => {
  it("first success (grade 5) → reps=1, interval=1, due in 1d", () => {
    const next = schedule(null, 5, NOW);
    expect(next.reps).toBe(1);
    expect(next.interval_days).toBe(1);
    expect(next.due_at).toBe(NOW + DAY);
    expect(next.ease).toBeGreaterThan(2.5);
  });

  it("second success → reps=2, interval=6", () => {
    const first = schedule(null, 5, NOW);
    const next = schedule(first, 5, NOW + DAY);
    expect(next.reps).toBe(2);
    expect(next.interval_days).toBe(6);
    expect(next.due_at).toBe(NOW + DAY + 6 * DAY);
  });

  it("third success → interval ≈ round(prev.interval * ease)", () => {
    const a = schedule(null, 5, NOW);
    const b = schedule(a, 5, NOW + DAY);
    const c = schedule(b, 5, NOW + 7 * DAY);
    expect(c.reps).toBe(3);
    // interval is computed using the freshly-updated ease (c.ease).
    expect(c.interval_days).toBe(Math.round(6 * c.ease));
  });

  it("grade 0 → reset, due now", () => {
    const prev: ReviewState = {
      ease: 2.6,
      interval_days: 6,
      reps: 2,
      due_at: NOW,
      last_reviewed_at: NOW - DAY,
    };
    const next = schedule(prev, 0, NOW);
    expect(next.reps).toBe(0);
    expect(next.interval_days).toBe(0);
    expect(next.due_at).toBe(NOW);
  });

  it("grade 2 → reset (still failure)", () => {
    const prev: ReviewState = {
      ease: 2.5,
      interval_days: 6,
      reps: 2,
      due_at: NOW,
      last_reviewed_at: NOW - DAY,
    };
    const next = schedule(prev, 2, NOW);
    expect(next.reps).toBe(0);
    expect(next.interval_days).toBe(0);
    expect(next.due_at).toBe(NOW);
  });

  it("grade 3 → success, slight ease drop", () => {
    const next = schedule(null, 3, NOW);
    expect(next.reps).toBe(1);
    expect(next.interval_days).toBe(1);
    // SM-2: q=3 → ease change = 0.1 - 2*(0.08 + 2*0.02) = -0.14
    expect(next.ease).toBeCloseTo(2.5 - 0.14, 5);
  });

  it("grade 4 → success, almost no ease change", () => {
    const next = schedule(null, 4, NOW);
    // q=4 → ease change = 0.1 - 1*(0.08 + 1*0.02) = 0
    expect(next.ease).toBeCloseTo(2.5, 5);
  });

  it("grade 5 → success, ease grows by 0.1", () => {
    const next = schedule(null, 5, NOW);
    expect(next.ease).toBeCloseTo(2.6, 5);
  });

  it("ease floor is 1.3", () => {
    let state = schedule(null, 3, NOW);
    for (let i = 0; i < 30; i++) {
      state = schedule(state, 3, NOW + (i + 1) * DAY);
    }
    expect(state.ease).toBeGreaterThanOrEqual(1.3);
    expect(state.ease).toBeCloseTo(1.3, 5);
  });

  it("reps progression 1 → 2 → 3 with intervals 1, 6, round(6*ease)", () => {
    const a = schedule(null, 5, NOW);
    expect(a.interval_days).toBe(1);
    const b = schedule(a, 5, NOW);
    expect(b.interval_days).toBe(6);
    const c = schedule(b, 5, NOW);
    expect(c.interval_days).toBeGreaterThan(6);
  });
});
