"use client";

import Scratchpad from "./Scratchpad";

export interface WorkspaceProps {
  problemId: string;
}

export default function Workspace({ problemId }: WorkspaceProps) {
  return (
    <div className="flex flex-col gap-6" data-testid="workspace">
      <Scratchpad problemId={problemId} />
    </div>
  );
}
