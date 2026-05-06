import { describe, it, expect, vi, beforeEach } from "vitest";

const spawnSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

beforeEach(() => {
  spawnSyncMock.mockReset();
});

async function load() {
  vi.resetModules();
  return await import("./server");
}

function ok(json: unknown) {
  return { status: 0, stdout: JSON.stringify(json), stderr: "" };
}

describe("sympy server (mocked subprocess)", () => {
  it("check_equivalent passes inputs via env and parses stdout", async () => {
    spawnSyncMock.mockReturnValue(
      ok({ equivalent: true, simplified_diff: "0" }),
    );
    const { check_equivalent } = await load();
    const r = check_equivalent("x+1", "1+x");
    expect(r).toEqual({ equivalent: true, simplified_diff: "0" });
    const call = spawnSyncMock.mock.calls[0];
    expect(call[0]).toBe("python3");
    expect(call[1][0]).toBe("-c");
    expect(call[2].env.A).toBe("x+1");
    expect(call[2].env.B).toBe("1+x");
    expect(call[2].timeout).toBe(5000);
  });

  it("non-zero exit becomes {error}", async () => {
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "boom",
    });
    const { simplify } = await load();
    const r = simplify("x");
    expect(r.error).toMatch(/python exit 1/);
  });

  it("spawn error becomes {error}", async () => {
    spawnSyncMock.mockReturnValue({
      error: new Error("ENOENT"),
      status: null,
      stdout: "",
      stderr: "",
    });
    const { diff } = await load();
    const r = diff("x**2", "x");
    expect(r.error).toMatch(/spawn: ENOENT/);
  });

  it("malformed stdout becomes {error}", async () => {
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: "not json",
      stderr: "",
    });
    const { integrate } = await load();
    const r = integrate("x", "x");
    expect(r.error).toMatch(/parse:/);
  });

  it("solve returns the parsed list", async () => {
    spawnSyncMock.mockReturnValue(ok({ result: ["1", "3"] }));
    const { solve } = await load();
    expect(solve("(x-1)*(x-3)", "x")).toEqual({ result: ["1", "3"] });
  });

  it("evaluate_at sends VAL env", async () => {
    spawnSyncMock.mockReturnValue(ok({ result: "4" }));
    const { evaluate_at } = await load();
    const r = evaluate_at("x**2", "x", "2");
    expect(r).toEqual({ result: "4" });
    expect(spawnSyncMock.mock.calls[0][2].env.VAL).toBe("2");
  });
});

const integration = process.env.MATH_TUTOR_PY === "1" ? describe : describe.skip;
integration("sympy server (live python)", () => {
  it("actually computes check_equivalent", async () => {
    vi.doUnmock("node:child_process");
    vi.resetModules();
    const mod = await import("./server");
    const r = mod.check_equivalent("x+1", "1+x");
    expect(r.equivalent).toBe(true);
  });
});
