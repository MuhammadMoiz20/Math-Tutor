"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export interface ScratchpadProps {
  problemId: string;
  scratch: string;
  setScratch: (v: string) => void;
  answer: string;
  setAnswer: (v: string) => void;
}

const DEBOUNCE_MS = 250;

function scratchKey(id: string): string {
  return `scratchpad:${id}`;
}
function answerKey(id: string): string {
  return `final-answer:${id}`;
}

export default function Scratchpad({
  problemId,
  scratch,
  setScratch,
  answer,
  setAnswer,
}: ScratchpadProps) {
  const [hydrated, setHydrated] = useState(false);
  const scratchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore from localStorage on mount.
  useEffect(() => {
    try {
      const s = window.localStorage.getItem(scratchKey(problemId));
      const a = window.localStorage.getItem(answerKey(problemId));
      if (s !== null) setScratch(s);
      if (a !== null) setAnswer(a);
    } catch {
      // ignore
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  useEffect(() => {
    if (!hydrated) return;
    if (scratchTimer.current) clearTimeout(scratchTimer.current);
    scratchTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(scratchKey(problemId), scratch);
      } catch {
        /* ignore */
      }
    }, DEBOUNCE_MS);
    return () => {
      if (scratchTimer.current) clearTimeout(scratchTimer.current);
    };
  }, [scratch, problemId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (answerTimer.current) clearTimeout(answerTimer.current);
    answerTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(answerKey(problemId), answer);
      } catch {
        /* ignore */
      }
    }, DEBOUNCE_MS);
    return () => {
      if (answerTimer.current) clearTimeout(answerTimer.current);
    };
  }, [answer, problemId, hydrated]);

  const onChange = useCallback(
    (value: string) => {
      setScratch(value);
    },
    [setScratch],
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        data-testid="scratchpad"
      >
        <div className="rounded border border-neutral-300 dark:border-neutral-700">
          <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            Scratchpad (markdown + KaTeX)
          </div>
          <CodeMirror
            value={scratch}
            onChange={onChange}
            extensions={[markdown()]}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
            }}
            height="320px"
            data-testid="scratchpad-editor"
          />
        </div>
        <div className="rounded border border-neutral-300 dark:border-neutral-700">
          <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
            Preview
          </div>
          <div
            className="prose prose-neutral max-w-none px-4 py-3 text-sm dark:prose-invert"
            data-testid="scratchpad-preview"
          >
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[[rehypeKatex, { strict: false }]]}
            >
              {scratch}
            </ReactMarkdown>
          </div>
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
          Final answer
        </span>
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="e.g. {1, 3}"
          className="rounded border border-neutral-300 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950"
          data-testid="final-answer-input"
        />
      </label>
    </div>
  );
}
