import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  tool: (name: string, desc: string, schema: unknown, handler: unknown) => ({
    name,
    desc,
    schema,
    handler,
  }),
  createSdkMcpServer: (cfg: unknown) => ({ __mcp: true, cfg }),
}));

import { streamCoach } from "./stream";

function deltaEvent(text: string) {
  return {
    type: "stream_event" as const,
    event: { type: "content_block_delta", delta: { type: "text_delta", text } },
  };
}
function resultEvent() {
  return { type: "result" as const, subtype: "success" as const, result: "" };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("streamCoach", () => {
  it("yields deltas then done; passes the right mode prompt and tools", async () => {
    queryMock.mockImplementation(async function* () {
      yield deltaEvent("What ");
      yield deltaEvent("invariant?");
      yield resultEvent();
    });
    const events = [];
    for await (const e of streamCoach({
      mode: "socratic",
      problemId: "p1",
      userId: 1,
      scratch: "",
      lastVerdict: null,
      history: [],
      userMessage: "stuck",
    })) {
      events.push(e);
    }
    expect(events.map((e) => e.type)).toEqual(["delta", "delta", "done"]);
    const opts = queryMock.mock.calls[0][0].options;
    expect(opts.systemPrompt).toMatch(/Socratic math coach/);
    expect(opts.mcpServers).toBeDefined();
    expect(opts.allowedTools).toEqual(
      expect.arrayContaining([
        "mcp__math-tutor__get_problem_meta",
        "mcp__math-tutor__get_user_history",
      ]),
    );
  });

  it("emits blocked then stops when filter trips on a long derivation", async () => {
    const longBody = "x = 1 + 2 + 3 + 4 + 5 ".repeat(15);
    queryMock.mockImplementation(async function* () {
      yield deltaEvent(`$$${longBody}$$\n`);
      yield deltaEvent("Therefore the answer is 5.");
      yield deltaEvent("more text after");
      yield resultEvent();
    });
    const events = [];
    for await (const e of streamCoach({
      mode: "hints",
      problemId: "p1",
      userId: 1,
      scratch: "",
      lastVerdict: null,
      history: [],
      userMessage: "give me the solution",
    })) {
      events.push(e);
    }
    const types = events.map((e) => e.type);
    expect(types).toContain("blocked");
    expect(types[types.length - 1]).toBe("blocked");
    expect(
      events.find(
        (e) => e.type === "delta" && (e as { text: string }).text.includes("more text after"),
      ),
    ).toBeUndefined();
    const blocked = events.find((e) => e.type === "blocked") as {
      type: "blocked";
      reason: string;
    };
    expect(blocked.reason).toBe("no_solution_rule");
  });

  it("uses exam mode prompt when mode is exam", async () => {
    queryMock.mockImplementation(async function* () {
      yield resultEvent();
    });
    for await (const _ of streamCoach({
      mode: "exam",
      problemId: "p1",
      userId: 1,
      scratch: "",
      lastVerdict: null,
      history: [],
      userMessage: "help",
    })) {
      void _;
    }
    expect(queryMock.mock.calls[0][0].options.systemPrompt).toMatch(
      /exam proctor/i,
    );
  });
});
