import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { getDb } from "@/lib/db";
import { getProblem } from "@/lib/problems/repo";
import { seedProblemsForModule } from "@/lib/problems/seed";
import { loadProblemMdx } from "@/lib/content/problems";
import Workspace from "@/components/workspace/Workspace";
import Chat from "@/components/chat/Chat";
import { auth } from "@/auth";
import {
  CHAT_MODES,
  listMessages,
  type ChatMessage,
  type ChatMode,
} from "@/lib/chat/repo";
import { listAttempts } from "@/lib/attempts/repo";
import { getOpenedAt } from "@/lib/progress/timers";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function ProblemPage({ params }: PageProps) {
  const { id } = await params;

  // Find the MDX by scanning known modules for now: derive module from DB if
  // present; otherwise fall back to filesystem search.
  const db = getDb();
  let problem = getProblem(db, id);
  if (!problem) {
    // Try to lazily seed each known module's problems, then re-query.
    // Cheap fallback: parse the id to guess the module slug ("linalg-1-...").
    // Iterate filesystem `content/` to find the file.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const contentDir = path.resolve(process.cwd(), "content");
    if (fs.existsSync(contentDir)) {
      for (const moduleId of fs.readdirSync(contentDir)) {
        const probDir = path.join(contentDir, moduleId, "problems");
        if (
          fs.existsSync(probDir) &&
          fs.existsSync(path.join(probDir, `${id}.mdx`))
        ) {
          seedProblemsForModule(db, moduleId);
          problem = getProblem(db, id);
          break;
        }
      }
    }
  }
  if (!problem) notFound();

  const loaded = loadProblemMdx(problem.module_id, problem.id);
  if (!loaded) notFound();

  const session = await auth();
  const userIdRaw = (session?.user as { id?: string } | undefined)?.id;
  const userId = userIdRaw ? Number(userIdRaw) : null;
  const initialMessages: Record<ChatMode, ChatMessage[]> = {
    socratic: [],
    hints: [],
    rigor: [],
    exam: [],
    solution: [],
  };
  let attemptsCount = 0;
  let openedAt: number | null = null;
  if (userId !== null) {
    for (const m of CHAT_MODES) {
      initialMessages[m] = listMessages(db, userId, problem.id, m);
    }
    attemptsCount = listAttempts(db, userId, problem.id).length;
    openedAt = getOpenedAt(db, userId, problem.id);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          <Link
            href={`/modules/${problem.module_id}`}
            className="hover:underline"
          >
            {problem.module_id}
          </Link>{" "}
          · Problem · {problem.type}
        </p>
        <h1 className="mt-1 text-3xl font-semibold">{problem.title}</h1>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-8">
          <article className="prose prose-neutral max-w-none dark:prose-invert">
            <MDXRemote
              source={loaded.source}
              options={{
                mdxOptions: {
                  remarkPlugins: [remarkMath],
                  rehypePlugins: [[rehypeKatex, { strict: false }]],
                },
              }}
            />
          </article>
          <Workspace
            problemId={problem.id}
            expectedAnswer={problem.expected_answer}
            problemType={problem.type}
          />
        </div>
        <aside
          className="rounded border border-neutral-200 p-4 dark:border-neutral-700"
          data-testid="chat-panel"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Coach
          </p>
          <Chat
            problemId={problem.id}
            initialMessages={initialMessages}
            attemptsCount={attemptsCount}
            openedAt={openedAt}
          />
        </aside>
      </div>
    </main>
  );
}
