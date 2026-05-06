export interface CanUnlockSolutionInput {
  attempts: number;
  openedAt: number | null;
  now: number;
  minMinutes?: number;
}

/**
 * Solution mode unlocks when EITHER:
 *   - the user has made at least one attempt, OR
 *   - the timer-based gate has elapsed (default: 15 minutes since first open).
 *
 * Negative time skew (now < openedAt) is treated as locked: a clock skew
 * shouldn't accidentally unlock the gate.
 */
export function canUnlockSolution(input: CanUnlockSolutionInput): boolean {
  const { attempts, openedAt, now } = input;
  const minMinutes = input.minMinutes ?? 15;
  if (attempts >= 1) return true;
  if (openedAt === null) return false;
  const elapsed = now - openedAt;
  if (elapsed < 0) return false;
  return elapsed >= minMinutes * 60_000;
}
