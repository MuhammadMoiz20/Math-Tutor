import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { callAnthropicForModule, type AnthropicLike } from "./client";

describe("ingest/client", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "client-"));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("posts a document block + tool, parses tool_use, validates payload", async () => {
    const fakePdf = path.join(tmp, "fake.pdf");
    fs.writeFileSync(fakePdf, "PDF-bytes");

    let captured: unknown = null;
    const fake: AnthropicLike = {
      messages: {
        create: async (req: unknown) => {
          captured = req;
          return {
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                name: "emit_module_content",
                input: {
                  concept_mdx: "# C",
                  worked_examples: [{ id: "1", mdx: "w" }],
                  problems: [
                    {
                      id: "p1",
                      title: "T",
                      type: "computational",
                      expected_answer: "1",
                      source: { book: "B" },
                      mdx: "stmt\n\n---SOLUTION---\n\nsol",
                    },
                  ],
                },
              },
            ],
          };
        },
      },
    };

    const { payload } = await callAnthropicForModule(fake, {
      bookPath: fakePdf,
      bookTitle: "Fake",
      moduleId: "m",
      moduleTitle: "M",
      chapters: [1],
      model: "claude-sonnet-4-5",
    });

    expect(payload.problems[0].id).toBe("p1");
    const reqAny = captured as { messages: Array<{ content: Array<{ type: string; source?: { media_type: string } }> }>; tools: Array<{ name: string }> };
    expect(reqAny.tools[0].name).toBe("emit_module_content");
    const doc = reqAny.messages[0].content.find((c) => c.type === "document");
    expect(doc?.source?.media_type).toBe("application/pdf");
  });

  it("throws when model returns no tool_use block", async () => {
    const fakePdf = path.join(tmp, "fake.pdf");
    fs.writeFileSync(fakePdf, "x");
    const fake: AnthropicLike = {
      messages: {
        create: async () => ({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "nope" }],
        }),
      },
    };
    await expect(
      callAnthropicForModule(fake, {
        bookPath: fakePdf,
        bookTitle: "B",
        moduleId: "m",
        moduleTitle: "M",
        chapters: [1],
        model: "claude-sonnet-4-5",
      }),
    ).rejects.toThrow(/did not call/);
  });
});
