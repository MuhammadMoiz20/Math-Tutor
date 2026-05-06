import { spawnSync, type SpawnSyncOptions } from "node:child_process";

/**
 * Server-side SymPy tool surface. Each call spawns `python3 -c "<script>"`
 * with a 5-second timeout and captures JSON on stdout. Errors (parse,
 * timeout, non-zero exit, malformed JSON) become `{error: string}`.
 *
 * Inputs are passed via env vars to avoid shell-escaping issues.
 */

const TIMEOUT_MS = 5_000;
const PYTHON = process.env.MATH_TUTOR_PYTHON ?? "python3";

interface RawError {
  error: string;
}

function runPython(script: string, env: Record<string, string>): unknown {
  const opts: SpawnSyncOptions = {
    timeout: TIMEOUT_MS,
    env: { ...process.env, ...env },
    encoding: "utf8",
  };
  const r = spawnSync(PYTHON, ["-c", script], opts);
  if (r.error) return { error: `spawn: ${r.error.message}` } satisfies RawError;
  if (r.status !== 0) {
    const stderr =
      typeof r.stderr === "string" ? r.stderr : r.stderr?.toString() ?? "";
    return { error: `python exit ${r.status}: ${stderr.trim()}` };
  }
  const stdout =
    typeof r.stdout === "string" ? r.stdout : r.stdout?.toString() ?? "";
  try {
    return JSON.parse(stdout);
  } catch (e) {
    return { error: `parse: ${String((e as Error).message)}` };
  }
}

const PRELUDE = `
import os, json, sys
try:
    import sympy
    from sympy import sympify, simplify as _simp, diff as _diff, integrate as _int, solve as _solve, Symbol, Eq, S
except Exception as e:
    print(json.dumps({"error": "import: " + str(e)}))
    sys.exit(0)
`.trim();

function emit(body: string): string {
  return `${PRELUDE}\ntry:\n${body
    .split("\n")
    .map((l) => "    " + l)
    .join("\n")}\nexcept Exception as e:\n    print(json.dumps({"error": str(e)}))\n`;
}

export interface CheckEquivalentResult {
  equivalent?: boolean;
  simplified_diff?: string;
  error?: string;
}

export function check_equivalent(a: string, b: string): CheckEquivalentResult {
  const script = emit(`
a = sympify(os.environ["A"])
b = sympify(os.environ["B"])
diff = _simp(a - b)
print(json.dumps({"equivalent": diff == 0, "simplified_diff": str(diff)}))
`);
  return runPython(script, { A: a, B: b }) as CheckEquivalentResult;
}

export interface SimpleResult {
  result?: string;
  error?: string;
}

export function simplify(expr: string): SimpleResult {
  const script = emit(`
e = sympify(os.environ["E"])
print(json.dumps({"result": str(_simp(e))}))
`);
  return runPython(script, { E: expr }) as SimpleResult;
}

export function diff(expr: string, variable: string): SimpleResult {
  const script = emit(`
e = sympify(os.environ["E"])
v = Symbol(os.environ["V"])
print(json.dumps({"result": str(_diff(e, v))}))
`);
  return runPython(script, { E: expr, V: variable }) as SimpleResult;
}

export function integrate(expr: string, variable: string): SimpleResult {
  const script = emit(`
e = sympify(os.environ["E"])
v = Symbol(os.environ["V"])
print(json.dumps({"result": str(_int(e, v))}))
`);
  return runPython(script, { E: expr, V: variable }) as SimpleResult;
}

export interface SolveResult {
  result?: string[];
  error?: string;
}

export function solve(expr: string, variable: string): SolveResult {
  const script = emit(`
e = sympify(os.environ["E"])
v = Symbol(os.environ["V"])
sols = _solve(e, v)
print(json.dumps({"result": [str(s) for s in sols]}))
`);
  return runPython(script, { E: expr, V: variable }) as SolveResult;
}

export function evaluate_at(
  expr: string,
  variable: string,
  value: string,
): SimpleResult {
  const script = emit(`
e = sympify(os.environ["E"])
v = Symbol(os.environ["V"])
val = sympify(os.environ["VAL"])
print(json.dumps({"result": str(e.subs(v, val))}))
`);
  return runPython(script, {
    E: expr,
    V: variable,
    VAL: value,
  }) as SimpleResult;
}
