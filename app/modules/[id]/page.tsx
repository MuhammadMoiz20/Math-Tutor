import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { loadModuleConcept } from "@/lib/content/loader";
import { getDb } from "@/lib/db";
import { listModules } from "@/lib/curriculum/repo";

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
  try {
    const row = listModules(getDb()).find((m) => m.id === id);
    dbTitle = row?.title;
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
    </main>
  );
}
