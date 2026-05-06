// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

interface FakeWorker extends EventTarget {
  postMessage: (msg: unknown) => void;
  __posts: unknown[];
  __reply: (msg: unknown) => void;
}

let lastWorker: FakeWorker | null = null;

class WorkerMock extends EventTarget {
  __posts: unknown[] = [];
  postMessage(msg: unknown) {
    this.__posts.push(msg);
  }
  __reply(msg: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: msg }),
    );
  }
  constructor(public url: string) {
    super();
    lastWorker = this as unknown as FakeWorker;
  }
}

beforeEach(async () => {
  // @ts-expect-error -- wire up test global
  globalThis.Worker = WorkerMock;
  lastWorker = null;
  const mod = await import("./client");
  mod.__resetSympyClient();
  vi.resetModules();
});

describe("sympy client", () => {
  it("loadSympy posts {type:'load'} and resolves on 'loaded'", async () => {
    const { loadSympy } = await import("./client");
    const p = loadSympy();
    expect(lastWorker).not.toBeNull();
    expect(lastWorker!.__posts[0]).toEqual({ type: "load" });
    lastWorker!.__reply({ type: "loaded" });
    await p;
  });

  it("loadSympy returns the same promise on repeated calls", async () => {
    const { loadSympy } = await import("./client");
    const a = loadSympy();
    const b = loadSympy();
    expect(a).toBe(b);
    lastWorker!.__reply({ type: "loaded" });
    await a;
  });

  it("checkEquivalent correlates by id", async () => {
    const { checkEquivalent } = await import("./client");
    const p1 = checkEquivalent("{1,2}", "{1,3}");
    const p2 = checkEquivalent("x+1", "1+x");
    const posts = lastWorker!.__posts as Array<{
      type: string;
      id: number;
      userExpr: string;
      expected: string;
    }>;
    expect(posts).toHaveLength(2);
    expect(posts[0].type).toBe("check_equivalent");
    expect(posts[0].id).not.toBe(posts[1].id);

    // Reply out-of-order to verify id correlation.
    lastWorker!.__reply({
      type: "result",
      id: posts[1].id,
      equivalent: true,
    });
    lastWorker!.__reply({
      type: "result",
      id: posts[0].id,
      equivalent: false,
      simplified_diff: "1",
    });

    const r1 = await p1;
    const r2 = await p2;
    expect(r1).toEqual({
      equivalent: false,
      simplified_diff: "1",
      error: undefined,
    });
    expect(r2).toEqual({
      equivalent: true,
      simplified_diff: undefined,
      error: undefined,
    });
  });
});
