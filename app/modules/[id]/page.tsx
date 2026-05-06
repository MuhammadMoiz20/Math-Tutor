import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { loadModuleConcept } from "@/lib/content/loader";
import { getDb } from "@/lib/db";
import { listModules } from "@/lib/curriculum/repo";
import { listProblemsByModule } from "@/lib/problems/repo";
import { seedProblemsForModule } from "@/lib/problems/seed";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ModuleConceptPage({ params }: PageProps) {
  const { id } = await params;

  let loaded;
  try {
    loaded = loadModuleConcept(id);
  } catch {
    notFound();
  }

  const { source, frontmatter } = loaded;
  let dbTitle: string | undefined;
  let problems: Awaited<ReturnType<typeof listProblemsByModule>> = [];
  try {
    const db = getDb();
    const row = listModules(db).find((m) => m.id === id);
    dbTitle = row?.title;
    seedProblemsForModule(db, id);
    problems = listProblemsByModule(db, id);
  } catch {
    dbTitle = undefined;
  }
  const title =
    dbTitle ??
    (typeof frontmatter.title === "string" ? frontmatter.title : id);

  return (
    <main className="prose prose-neutral mx-auto max-w-3xl px-6 py-10 dark:prose-invert">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Module · {id}
        </p>
        <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
      </header>
      <article>
        <MDXRemote
          source={source}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkMath],
              rehypePlugins: [[rehypeKatex, { strict: false }]],
            },
          }}
        />
      </article>
      {problems.length > 0 && (
        <section className="not-prose mt-10 border-t border-neutral-200 pt-8 dark:border-neutral-800">
          <h2 className="mb-4 text-xl font-semibold">Problems</h2>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {problems.map((p) => (
              <li key={p.id} className="py-3">
                <Link
                  href={`/problems/${p.id}`}
                  className="text-base font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  {p.title}
                </Link>
                <span className="ml-2 text-xs uppercase tracking-wide text-neutral-500">
                  {p.type}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
