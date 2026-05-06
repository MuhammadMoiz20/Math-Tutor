"use client";

import { useCallback, useRef, useState } from "react";
import Scratchpad from "./Scratchpad";
import Submit from "./Submit";

export interface WorkspaceProps {
  problemId: string;
  expectedAnswer: string | null;
}

export default function Workspace({
  problemId,
  expectedAnswer,
}: WorkspaceProps) {
  const [scratch, setScratch] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const scratchRef = useRef(scratch);
  const answerRef = useRef(answer);
  scratchRef.current = scratch;
  answerRef.current = answer;

  const getAnswer = useCallback(() => answerRef.current, []);
  const getWork = useCallback(() => scratchRef.current, []);

  return (
    <div className="flex flex-col gap-6" data-testid="workspace">
      <Scratchpad
        problemId={problemId}
        scratch={scratch}
        setScratch={setScratch}
        answer={answer}
        setAnswer={setAnswer}
      />
      <Submit
        problemId={problemId}
        expectedAnswer={expectedAnswer}
        getAnswer={getAnswer}
        getWork={getWork}
      />
    </div>
  );
}
