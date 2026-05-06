/**
 * Minimal SM-2 scheduler.
 *
 * Pure function. Takes the previous review state (or null for first-ever
 * review of a problem) and a quality grade in [0..5], returns the next state.
 *
 * - grade < 3 => failure: reset reps/interval, due immediately.
 * - grade >= 3 => success: increment reps, grow interval, update ease.
 *
 * Ease floor is 1.3 (per classic SM-2).
 */

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export interface ReviewState {
  ease: number;
  interval_days: number;
  reps: number;
  due_at: number; // unix seconds
  last_reviewed_at: number; // unix seconds
}

const DAY_SECONDS = 86400;
const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

export function schedule(
  prev: ReviewState | null,
  grade: Grade,
  now: number,
): ReviewState {
  const baseEase = prev?.ease ?? DEFAULT_EASE;

  if (grade < 3) {
    return {
      ease: baseEase, // ease unchanged on failure (kept simple/predictable)
      interval_days: 0,
      reps: 0,
      due_at: now,
      last_reviewed_at: now,
    };
  }

  // Update ease via standard SM-2 formula.
  const q = grade;
  const newEaseRaw = baseEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const ease = Math.max(MIN_EASE, newEaseRaw);

  const reps = (prev?.reps ?? 0) + 1;
  let interval_days: number;
  if (reps === 1) {
    interval_days = 1;
  } else if (reps === 2) {
    interval_days = 6;
  } else {
    const prevInterval = prev?.interval_days ?? 1;
    interval_days = Math.max(1, Math.round(prevInterval * ease));
  }

  return {
    ease,
    interval_days,
    reps,
    due_at: now + interval_days * DAY_SECONDS,
    last_reviewed_at: now,
  };
}
