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
import { listAttachmentsForMessages } from "@/lib/chat/attachments";

export interface MessageAttachment {
  id: number;
  mime: string;
  data_base64: string;
}
export type ChatMessageWithAttachments = ChatMessage & {
  attachments: MessageAttachment[];
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function ProblemPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const reviewMode = sp.review === "1";

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
  const initialMessages: Record<ChatMode, ChatMessageWithAttachments[]> = {
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
      const msgs = listMessages(db, userId, problem.id, m);
      const attMap = listAttachmentsForMessages(
        db,
        msgs.map((x) => x.id),
      );
      initialMessages[m] = msgs.map((x) => ({
        ...x,
        attachments: (attMap.get(x.id) ?? []).map((a) => ({
          id: a.id,
          mime: a.mime,
          data_base64: a.data_base64,
        })),
      }));
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
        {reviewMode ? (
          <div
            className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
            data-testid="review-banner"
          >
            Review session — answer to schedule next interval.
          </div>
        ) : null}
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
