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
import { canUnlockSolution } from "@/lib/progress/unlock";

interface MessageAttachment {
  id: number;
  mime: string;
  data_base64: string;
}
type ChatMessageWithAttachments = ChatMessage & {
  attachments?: MessageAttachment[];
};

const MODE_LABELS: Record<ChatMode, string> = {
  socratic: "Socratic",
  hints: "Hints",
  rigor: "Rigor",
  exam: "Exam",
  solution: "Solution",
};

interface ChatProps {
  problemId: string;
  initialMessages: Record<ChatMode, ChatMessageWithAttachments[]>;
  attemptsCount: number;
  openedAt: number | null;
}

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocked?: boolean;
  attachments?: MessageAttachment[];
}

function toUi(msgs: ChatMessageWithAttachments[]): UiMessage[] {
  return msgs.map((m) => ({
    id: `db-${m.id}`,
    role: m.role,
    content: m.content,
    attachments: m.attachments,
  }));
}

export default function Chat({
  problemId,
  initialMessages,
  attemptsCount,
  openedAt,
}: ChatProps) {
  const [mode, setMode] = useState<ChatMode>("socratic");
  const [byMode, setByMode] = useState<Record<ChatMode, UiMessage[]>>(() => ({
    socratic: toUi(initialMessages.socratic ?? []),
    hints: toUi(initialMessages.hints ?? []),
    rigor: toUi(initialMessages.rigor ?? []),
    exam: toUi(initialMessages.exam ?? []),
    solution: toUi(initialMessages.solution ?? []),
  }));
  const [attempts, setAttempts] = useState(attemptsCount);
  const [now, setNow] = useState(() => Date.now());
  const solutionUnlocked = canUnlockSolution({
    attempts,
    openedAt,
    now,
  });

  // Notify the server we've opened this problem so the timer-based unlock
  // can begin counting down. Fire-and-forget; the server upserts the row
  // only if absent so revisits never reset the clock.
  useEffect(() => {
    void fetch("/api/problem-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemId }),
    }).catch(() => {});
  }, [problemId]);

  // Poll the clock every 30s so the timer-based unlock kicks in without a
  // page refresh. Listen for an "attempt-recorded" custom event so the
  // attempts-based path unlocks instantly after Submit.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 30_000);
    const onAttempt = () => setAttempts((a) => a + 1);
    window.addEventListener("math-tutor:attempt-recorded", onAttempt);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("math-tutor:attempt-recorded", onAttempt);
    };
  }, []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [photo, setPhoto] = useState<{
    base64: string;
    mime: "image/jpeg" | "image/png" | "image/webp";
    dataUrl: string;
  } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const onSelectFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setPhotoError(null);
      const allowed = ["image/jpeg", "image/png", "image/webp"] as const;
      if (!allowed.includes(file.type as (typeof allowed)[number])) {
        setPhotoError("Only JPEG, PNG, or WEBP images are supported.");
        return;
      }
      try {
        // Compress client-side to keep upload payloads small. If compression
        // fails (e.g., a tiny test fixture or unsupported codec path), fall
        // back to the original file so the user still gets to upload.
        let processed: File = file;
        try {
          const mod = await import("browser-image-compression");
          const compressFn = (mod.default ??
            (mod as unknown as typeof mod.default)) as (
            f: File,
            opts: {
              maxSizeMB: number;
              maxWidthOrHeight: number;
              initialQuality: number;
              useWebWorker?: boolean;
            },
          ) => Promise<File>;
          processed = await compressFn(file, {
            maxSizeMB: 5,
            maxWidthOrHeight: 1600,
            initialQuality: 0.8,
            useWebWorker: false,
          });
        } catch {
          processed = file;
        }
        const compressed = processed;
        const buf = await compressed.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const base64 = btoa(bin);
        const mime = (compressed.type || file.type) as
          | "image/jpeg"
          | "image/png"
          | "image/webp";
        setPhoto({
          base64,
          mime,
          dataUrl: `data:${mime};base64,${base64}`,
        });
      } catch (err) {
        setPhotoError(
          err instanceof Error ? err.message : "Failed to process image",
        );
      }
    },
    [],
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
    const turnPhoto = photo;
    const userMsg: UiMessage = {
      id: `local-${Date.now()}-u`,
      role: "user",
      content: text,
      attachments: turnPhoto
        ? [
            {
              id: -1,
              mime: turnPhoto.mime,
              data_base64: turnPhoto.base64,
            },
          ]
        : undefined,
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
    setPhoto(null);

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
          ...(turnPhoto
            ? { photoBase64: turnPhoto.base64, photoMime: turnPhoto.mime }
            : {}),
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
  }, [input, mode, problemId, streaming, photo]);

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
      case "solution":
        return "Ask the coach to walk through any step in detail…";
    }
  }, [mode]);

  return (
    <div className="flex h-[36rem] flex-col" data-testid="chat">
      <div role="tablist" className="mb-3 flex gap-1 border-b border-neutral-200 dark:border-neutral-700">
        {CHAT_MODES.map((m) => {
          const disabled = m === "solution" && !solutionUnlocked;
          return (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              aria-disabled={disabled}
              disabled={disabled}
              data-testid={`chat-tab-${m}`}
              data-locked={disabled ? "true" : undefined}
              title={
                disabled
                  ? "Make at least one attempt or spend 15 minutes on this problem to unlock Solution mode."
                  : undefined
              }
              onClick={() => {
                if (disabled) return;
                onSwitchMode(m);
              }}
              className={`px-3 py-1.5 text-sm transition ${
                mode === m
                  ? "border-b-2 border-neutral-900 font-medium text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                  : disabled
                    ? "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              {MODE_LABELS[m]}
              {disabled ? " 🔒" : ""}
            </button>
          );
        })}
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
                {m.attachments && m.attachments.length > 0 && (
                  <div
                    data-testid="chat-message-attachments"
                    className="mt-2 flex flex-wrap gap-2"
                  >
                    {m.attachments.map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.id}
                        src={`data:${a.mime};base64,${a.data_base64}`}
                        alt="attachment"
                        data-testid="chat-attachment-thumb"
                        className="max-h-32 max-w-[8rem] rounded border border-neutral-300 object-cover dark:border-neutral-700"
                      />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {photo && (
        <div
          data-testid="chat-photo-preview"
          className="mt-3 flex items-center gap-2 rounded border border-neutral-200 bg-white p-2 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.dataUrl}
            alt="upload preview"
            className="max-h-16 rounded border border-neutral-300 dark:border-neutral-700"
          />
          <span className="text-neutral-500">Will be sent with next message</span>
          <button
            type="button"
            data-testid="chat-photo-remove"
            onClick={() => setPhoto(null)}
            aria-label="Remove photo"
            className="ml-auto rounded px-2 py-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            ×
          </button>
        </div>
      )}
      {photoError && (
        <p
          data-testid="chat-photo-error"
          className="mt-2 text-xs text-red-600 dark:text-red-400"
        >
          {photoError}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          data-testid="chat-photo-input"
          onChange={onSelectFile}
          className="hidden"
        />
        <button
          type="button"
          data-testid="chat-photo-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={streaming}
          aria-label="Attach photo"
          title="Attach a photo of your work"
          className="self-end rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          📎
        </button>
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
