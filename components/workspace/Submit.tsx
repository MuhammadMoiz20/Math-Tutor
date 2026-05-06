"use client";

import { useCallback, useState } from "react";
import { loadSympy, checkEquivalent } from "@/lib/sympy/client";

export interface SubmitProps {
  problemId: string;
  expectedAnswer: string | null;
  problemType?: "computational" | "derivation";
  getAnswer: () => string;
  getWork: () => string;
}

interface JudgeVerdict {
  verdict: "correct" | "partial" | "incorrect";
  missing_claims: string[];
  errors: string[];
  comments: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "correct" }
  | { kind: "incorrect"; diff?: string }
  | { kind: "judged"; judge: JudgeVerdict }
  | { kind: "error"; message: string };

export default function Submit({
  problemId,
  expectedAnswer,
  problemType = "computational",
  getAnswer,
  getWork,
}: SubmitProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  const onSubmit = useCallback(async () => {
    if (busy) return;

    // Derivation: send the user's work to the LLM judge; no Pyodide.
    if (problemType === "derivation") {
      const userWork = getWork().trim();
      if (!userWork) {
        setStatus({
          kind: "error",
          message: "Write your derivation in the scratchpad first.",
        });
        return;
      }
      setBusy(true);
      try {
        setStatus({ kind: "loading", message: "Asking the judge…" });
        const res = await fetch("/api/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            problemId,
            userAnswer: getAnswer().trim() || null,
            userWork,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          setStatus({ kind: "error", message: `Server error: ${text}` });
          return;
        }
        const data = (await res.json()) as { judge?: JudgeVerdict };
        window.dispatchEvent(new CustomEvent("math-tutor:attempt-recorded"));
        if (data.judge) setStatus({ kind: "judged", judge: data.judge });
        else setStatus({ kind: "idle" });
      } catch (e) {
        setStatus({
          kind: "error",
          message: String((e as Error).message ?? e),
        });
      } finally {
        setBusy(false);
      }
      return;
    }

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
      // Notify listeners (e.g. the chat panel's Solution-tab gate) that an
      // attempt was just recorded.
      window.dispatchEvent(new CustomEvent("math-tutor:attempt-recorded"));
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
  }, [busy, expectedAnswer, getAnswer, getWork, problemId, problemType]);

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
      {status.kind === "judged" && (
        <div
          className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
          data-testid="verdict-judged"
        >
          <p className="font-medium">
            Verdict: <span data-testid="judge-verdict">{status.judge.verdict}</span>
          </p>
          {status.judge.missing_claims.length > 0 && (
            <div className="mt-1">
              <p className="font-medium">Missing claims:</p>
              <ul className="list-disc pl-5">
                {status.judge.missing_claims.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {status.judge.errors.length > 0 && (
            <div className="mt-1">
              <p className="font-medium">Errors:</p>
              <ul className="list-disc pl-5">
                {status.judge.errors.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {status.judge.comments && (
            <p className="mt-1 italic">{status.judge.comments}</p>
          )}
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
