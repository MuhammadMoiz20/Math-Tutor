// Browser-only client wrapper around the Pyodide-in-a-worker SymPy fast-path.
// The worker is a classic (non-module) worker served from /public so that
// Next's bundler does not try to process it.

export interface CheckEquivalentResult {
  equivalent: boolean;
  simplified_diff?: string;
  error?: string;
}

export const SYMPY_WORKER_URL = "/sympy-worker.js";

interface Pending {
  resolve: (r: CheckEquivalentResult) => void;
  reject: (e: unknown) => void;
}

let worker: Worker | null = null;
let loadPromise: Promise<void> | null = null;
const pending = new Map<number, Pending>();
let nextId = 1;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(SYMPY_WORKER_URL);
  worker.addEventListener("message", (ev: MessageEvent) => {
    const data = ev.data as
      | { type: "loaded" }
      | {
          type: "result";
          id: number;
          equivalent: boolean;
          simplified_diff?: string;
          error?: string;
        };
    if (!data || typeof data !== "object") return;
    if (data.type === "result") {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      p.resolve({
        equivalent: data.equivalent,
        simplified_diff: data.simplified_diff,
        error: data.error,
      });
    }
  });
  return worker;
}

export function loadSympy(): Promise<void> {
  if (loadPromise) return loadPromise;
  const w = ensureWorker();
  loadPromise = new Promise<void>((resolve, reject) => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string };
      if (data && data.type === "loaded") {
        w.removeEventListener("message", onMessage);
        resolve();
      }
    };
    const onError = (e: ErrorEvent) => {
      w.removeEventListener("error", onError);
      reject(e.error ?? new Error(e.message));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ type: "load" });
  });
  return loadPromise;
}

export function checkEquivalent(
  userExpr: string,
  expected: string,
): Promise<CheckEquivalentResult> {
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<CheckEquivalentResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: "check_equivalent", id, userExpr, expected });
  });
}

// Test-only reset hook.
export function __resetSympyClient(): void {
  worker = null;
  loadPromise = null;
  pending.clear();
  nextId = 1;
}
