import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  callAgentForModule,
  extractJsonBlock,
  type AgentQueryFn,
} from "./client";

describe("ingest/client", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "client-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("posts a document block + system prompt and parses fenced JSON", async () => {
    const fakePdf = path.join(tmp, "fake.pdf");
    fs.writeFileSync(fakePdf, "PDF-bytes");

    let captured: { prompt: AsyncIterable<unknown> | string; options?: Record<string, unknown> } | null = null;
    const fake: AgentQueryFn = (args) => {
      captured = args;
      return (async function* () {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: '```json\n{"concept_mdx":"# C","worked_examples":[{"id":"1","mdx":"w"}],"problems":[{"id":"p1","title":"T","type":"computational","expected_answer":"1","source":{"book":"B"},"mdx":"stmt\\n\\n---SOLUTION---\\n\\nsol"}]}\n```',
              },
            ],
          },
        };
        yield { type: "result" };
      })();
    };

    const { payload } = await callAgentForModule(
      {
        bookPath: fakePdf,
        bookTitle: "Fake",
        moduleId: "m",
        moduleTitle: "M",
        chapters: [1],
        model: "claude-sonnet-4-6",
      },
      { queryFn: fake },
    );

    expect(payload.problems[0].id).toBe("p1");
    expect(captured).not.toBeNull();
    expect(captured!.options?.model).toBe("claude-sonnet-4-6");
    expect(captured!.options?.allowedTools).toEqual([]);

    // Drain the prompt stream to verify it carried a PDF document block.
    const yielded: Array<{ message: { content: Array<{ type: string; source?: { media_type?: string } }> } }> = [];
    for await (const m of captured!.prompt as AsyncIterable<{ message: { content: Array<{ type: string; source?: { media_type?: string } }> } }>) {
      yielded.push(m);
    }
    const doc = yielded[0].message.content.find((c) => c.type === "document");
    expect(doc?.source?.media_type).toBe("application/pdf");
  });

  it("throws when model returns no JSON block", async () => {
    const fakePdf = path.join(tmp, "fake.pdf");
    fs.writeFileSync(fakePdf, "x");
    const fake: AgentQueryFn = () =>
      (async function* () {
        yield {
          type: "assistant",
          message: { content: [{ type: "text", text: "sorry, no can do" }] },
        };
        yield { type: "result" };
      })();
    await expect(
      callAgentForModule(
        {
          bookPath: fakePdf,
          bookTitle: "B",
          moduleId: "m",
          moduleTitle: "M",
          chapters: [1],
          model: "claude-sonnet-4-6",
        },
        { queryFn: fake },
      ),
    ).rejects.toThrow(/did not return a JSON block/);
  });

  it("extractJsonBlock prefers ```json``` then any fence then raw object", () => {
    expect(extractJsonBlock('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonBlock('```\n{"a":2}\n```')).toBe('{"a":2}');
    expect(extractJsonBlock('{"a":3}')).toBe('{"a":3}');
    expect(extractJsonBlock("nope")).toBeNull();
  });
});
