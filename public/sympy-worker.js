/* eslint-disable */
// Bare web worker (NOT a module worker) that loads Pyodide + SymPy from the
// jsdelivr CDN and exposes a check_equivalent message API.
//
// Pinned to pyodide v0.29.3 (mirror of the npm package version).

const PYODIDE_VERSION = "0.29.3";
const CDN = "https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/";

let pyodidePromise = null;

const PY_SETUP = `
import sympy
from sympy import sympify, simplify, FiniteSet, Eq, S
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
)

_TRANSFORMS = standard_transformations + (implicit_multiplication_application,)

def _parse(s):
    s = (s or "").strip()
    if not s:
        raise ValueError("empty expression")
    # Set literal: {a, b, c} -> FiniteSet(...)
    if s.startswith("{") and s.endswith("}"):
        inner = s[1:-1].strip()
        if not inner:
            return FiniteSet()
        parts = [p.strip() for p in inner.split(",") if p.strip()]
        return FiniteSet(*[parse_expr(p, transformations=_TRANSFORMS) for p in parts])
    # List literal: [a, b, c]
    if s.startswith("[") and s.endswith("]"):
        inner = s[1:-1].strip()
        if not inner:
            return []
        return [parse_expr(p.strip(), transformations=_TRANSFORMS)
                for p in inner.split(",") if p.strip()]
    return parse_expr(s, transformations=_TRANSFORMS)

def check_equivalent(user_expr, expected):
    try:
        a = _parse(user_expr)
        b = _parse(expected)
    except Exception as e:
        return {"equivalent": False, "error": "parse: " + str(e)}
    try:
        # Both sets -> compare as sets.
        if isinstance(a, FiniteSet) or isinstance(b, FiniteSet):
            af = a if isinstance(a, FiniteSet) else FiniteSet(*a) if isinstance(a, list) else FiniteSet(a)
            bf = b if isinstance(b, FiniteSet) else FiniteSet(*b) if isinstance(b, list) else FiniteSet(b)
            return {"equivalent": bool(af == bf)}
        # Lists -> elementwise equality up to simplification.
        if isinstance(a, list) and isinstance(b, list):
            if len(a) != len(b):
                return {"equivalent": False, "simplified_diff": "length mismatch"}
            for x, y in zip(a, b):
                if simplify(x - y) != 0:
                    return {"equivalent": False, "simplified_diff": str(simplify(x - y))}
            return {"equivalent": True}
        diff = simplify(a - b)
        if diff == 0:
            return {"equivalent": True}
        return {"equivalent": False, "simplified_diff": str(diff)}
    except Exception as e:
        return {"equivalent": False, "error": "compare: " + str(e)}
`;

function ensurePyodide() {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    importScripts(CDN + "pyodide.js");
    // eslint-disable-next-line no-undef
    const py = await loadPyodide({ indexURL: CDN });
    await py.loadPackage("sympy");
    py.runPython(PY_SETUP);
    return py;
  })();
  return pyodidePromise;
}

self.addEventListener("message", async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "load") {
      await ensurePyodide();
      self.postMessage({ type: "loaded" });
      return;
    }
    if (msg.type === "check_equivalent") {
      const py = await ensurePyodide();
      py.globals.set("__user_expr", msg.userExpr ?? "");
      py.globals.set("__expected", msg.expected ?? "");
      const proxy = py.runPython(
        "check_equivalent(__user_expr, __expected)",
      );
      const result = proxy.toJs ? proxy.toJs({ dict_converter: Object.fromEntries }) : proxy;
      if (proxy && proxy.destroy) proxy.destroy();
      self.postMessage({
        type: "result",
        id: msg.id,
        equivalent: !!result.equivalent,
        simplified_diff: result.simplified_diff,
        error: result.error,
      });
      return;
    }
  } catch (e) {
    self.postMessage({
      type: "result",
      id: msg.id,
      equivalent: false,
      error: String((e && e.message) || e),
    });
  }
});
