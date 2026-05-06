"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  CHAT_MODES,
  type ChatMessage,
  type ChatMode,
} from "@/lib/chat/repo";

const MODE_LABELS: Record<ChatMode, string> = {
  socratic: "Socratic",
  hints: "Hints",
  rigor: "Rigor",
  exam: "Exam",
};

interface ChatProps {
  problemId: string;
  initialMessages: Record<ChatMode, ChatMessage[]>;
}

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocked?: boolean;
}

function toUi(msgs: ChatMessage[]): UiMessage[] {
  return msgs.map((m) => ({
    id: `db-${m.id}`,
    role: m.role,
    content: m.content,
  }));
}

export default function Chat({ problemId, initialMessages }: ChatProps) {
  const [mode, setMode] = useState<ChatMode>("socratic");
  const [byMode, setByMode] = useState<Record<ChatMode, UiMessage[]>>(() => ({
    socratic: toUi(initialMessages.socratic ?? []),
    hints: toUi(initialMessages.hints ?? []),
    rigor: toUi(initialMessages.rigor ?? []),
    exam: toUi(initialMessages.exam ?? []),
  }));
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = byMode[mode];

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // When switching modes, refresh that mode's history from the server.
  const refreshMode = useCallback(
    async (m: ChatMode) => {
      try {
        const res = await fetch(
          `/api/coach?problemId=${encodeURIComponent(problemId)}&mode=${m}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        setByMode((prev) => ({ ...prev, [m]: toUi(data.messages) }));
      } catch {
        /* ignore */
      }
    },
    [problemId],
  );

  const onSwitchMode = useCallback(
    (m: ChatMode) => {
      setMode(m);
      void refreshMode(m);
    },
    [refreshMode],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const userMsg: UiMessage = {
      id: `local-${Date.now()}-u`,
      role: "user",
      content: text,
    };
    const assistantId = `local-${Date.now()}-a`;
    setByMode((prev) => ({
      ...prev,
      [mode]: [
        ...prev[mode],
        userMsg,
        { id: assistantId, role: "assistant", content: "" },
      ],
    }));
    setStreaming(true);

    let acc = "";
    let blocked = false;

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId,
          mode,
          userMessage: text,
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`coach error: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = pending.indexOf("\n\n")) !== -1) {
          const frame = pending.slice(0, idx);
          pending = pending.slice(idx + 2);
          if (!frame.startsWith("data:")) continue;
          const payload = frame.slice(5).trim();
          if (!payload) continue;
          try {
            const ev = JSON.parse(payload) as
              | { type: "delta"; text: string }
              | { type: "blocked"; reason: string; text: string }
              | { type: "done" }
              | { type: "error"; text: string };
            if (ev.type === "delta") {
              acc += ev.text;
              setByMode((prev) => ({
                ...prev,
                [mode]: prev[mode].map((m) =>
                  m.id === assistantId ? { ...m, content: acc } : m,
                ),
              }));
            } else if (ev.type === "blocked") {
              blocked = true;
              acc = ev.text;
              setByMode((prev) => ({
                ...prev,
                [mode]: prev[mode].map((m) =>
                  m.id === assistantId
                    ? { ...m, content: acc, blocked: true }
                    : m,
                ),
              }));
            }
          } catch {
            /* swallow malformed frame */
          }
        }
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "coach request failed";
      setByMode((prev) => ({
        ...prev,
        [mode]: prev[mode].map((m) =>
          m.id === assistantId ? { ...m, content: errMsg } : m,
        ),
      }));
    } finally {
      setStreaming(false);
      void blocked;
    }
  }, [input, mode, problemId, streaming]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void send();
      }
    },
    [send],
  );

  const placeholder = useMemo(() => {
    switch (mode) {
      case "socratic":
        return "Ask the coach to nudge you with a question…";
      case "hints":
        return "Ask for the next hint…";
      case "rigor":
        return "Paste the line you want critiqued…";
      case "exam":
        return "Ask only for clarification of the problem statement…";
    }
  }, [mode]);

  return (
    <div className="flex h-[36rem] flex-col" data-testid="chat">
      <div role="tablist" className="mb-3 flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
        {CHAT_MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            data-testid={`chat-tab-${m}`}
            onClick={() => onSwitchMode(m)}
            className={`px-3 py-1.5 text-sm transition ${
              mode === m
                ? "border-b-2 border-neutral-900 font-medium text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div
        ref={listRef}
        data-testid="chat-messages"
        className="flex-1 overflow-y-auto rounded border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        {messages.length === 0 ? (
          <p className="text-neutral-500">No messages yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                data-role={m.role}
                data-testid={`chat-message-${m.role}`}
                className={
                  m.role === "user"
                    ? "self-end max-w-[85%] rounded bg-neutral-100 px-3 py-2 dark:bg-neutral-800"
                    : "self-start max-w-[95%]"
                }
              >
                {m.blocked && (
                  <span
                    data-testid="chat-blocked-badge"
                    className="mr-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                  >
                    blocked
                  </span>
                )}
                <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[[rehypeKatex, { strict: false }]]}
                  >
                    {m.content || (m.role === "assistant" && streaming ? "…" : "")}
                  </ReactMarkdown>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <textarea
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="min-h-[3rem] flex-1 resize-y rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          rows={2}
        />
        <button
          data-testid="chat-send"
          onClick={() => void send()}
          disabled={streaming || input.trim() === ""}
          className="self-end rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {streaming ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
