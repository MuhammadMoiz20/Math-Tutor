import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { listDueReviews } from "@/lib/progress/review";

export const dynamic = "force-dynamic";

function fmtDueSince(now: number, dueAt: number): string {
  const delta = now - dueAt;
  if (delta < 0) {
    const mins = Math.round(-delta / 60);
    if (mins < 60) return `due in ${mins}m`;
    const hrs = Math.round(-delta / 3600);
    if (hrs < 24) return `due in ${hrs}h`;
    return `due in ${Math.round(-delta / 86400)}d`;
  }
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.round(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.round(delta / 3600)}h ago`;
  return `${Math.round(delta / 86400)}d ago`;
}

export default async function ReviewPage() {
  const session = await auth();
  const userIdRaw = (session?.user as { id?: string } | undefined)?.id;
  if (!userIdRaw) redirect("/signin");
  const userId = Number(userIdRaw);

  const db = getDb();
  const now = (Date.now() / 1000) | 0;
  const due = listDueReviews(db, userId, now);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Review</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Spaced repetition: problems re-surface as their interval elapses.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-blue-700 hover:underline dark:text-blue-400"
        >
          ← Home
        </Link>
      </header>

      {due.length === 0 ? (
        <div
          className="rounded border border-neutral-200 p-6 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400"
          data-testid="review-empty"
        >
          Nothing due right now. New attempts will schedule their next review
          here.
        </div>
      ) : (
        <ul
          className="divide-y divide-neutral-200 dark:divide-neutral-800"
          data-testid="review-list"
        >
          {due.map((r) => (
            <li key={r.problem_id} className="py-3" data-testid="review-item">
              <Link
                href={`/problems/${r.problem_id}?review=1`}
                className="text-lg font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                {r.title}
              </Link>
              <div className="mt-1 text-xs text-neutral-500">
                <span className="uppercase tracking-wide">{r.module_id}</span>
                <span className="mx-2">·</span>
                <span>{fmtDueSince(now, r.due_at)}</span>
                <span className="mx-2">·</span>
                <span>
                  reps {r.reps}, last interval {r.interval_days}d
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
