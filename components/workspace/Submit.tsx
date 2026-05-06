"use client";

import { useCallback, useState } from "react";
import { loadSympy, checkEquivalent } from "@/lib/sympy/client";

export interface SubmitProps {
  problemId: string;
  expectedAnswer: string | null;
  getAnswer: () => string;
  getWork: () => string;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "correct" }
  | { kind: "incorrect"; diff?: string }
  | { kind: "error"; message: string };

export default function Submit({
  problemId,
  expectedAnswer,
  getAnswer,
  getWork,
}: SubmitProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  const onSubmit = useCallback(async () => {
    if (busy) return;
    if (!expectedAnswer) {
      setStatus({
        kind: "error",
        message: "This problem has no expected answer to check against.",
      });
      return;
    }
    const userAnswer = getAnswer().trim();
    if (!userAnswer) {
      setStatus({ kind: "error", message: "Type a final answer first." });
      return;
    }
    setBusy(true);
    try {
      setStatus({ kind: "loading", message: "Loading SymPy…" });
      await loadSympy();
      setStatus({ kind: "loading", message: "Checking…" });
      const verdict = await checkEquivalent(userAnswer, expectedAnswer);
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          problemId,
          userAnswer,
          userWork: getWork(),
          sympyVerdict: verdict,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setStatus({ kind: "error", message: `Server error: ${text}` });
        return;
      }
      if (verdict.error) {
        setStatus({ kind: "error", message: verdict.error });
      } else if (verdict.equivalent) {
        setStatus({ kind: "correct" });
      } else {
        setStatus({ kind: "incorrect", diff: verdict.simplified_diff });
      }
    } catch (e) {
      setStatus({ kind: "error", message: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  }, [busy, expectedAnswer, getAnswer, getWork, problemId]);

  return (
    <div className="flex flex-col gap-2" data-testid="submit-block">
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        data-testid="submit-button"
      >
        {busy ? "Checking…" : "Submit"}
      </button>
      {status.kind === "loading" && (
        <p
          className="text-sm text-neutral-600 dark:text-neutral-400"
          data-testid="verdict-loading"
        >
          {status.message}
        </p>
      )}
      {status.kind === "correct" && (
        <div
          className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200"
          data-testid="verdict-correct"
        >
          Correct.
        </div>
      )}
      {status.kind === "incorrect" && (
        <div
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
          data-testid="verdict-incorrect"
        >
          Not yet.
          {status.diff ? ` Simplified diff: ${status.diff}` : ""}
        </div>
      )}
      {status.kind === "error" && (
        <div
          className="rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200"
          data-testid="verdict-error"
        >
          Couldn&apos;t check: {status.message}
        </div>
      )}
    </div>
  );
}
