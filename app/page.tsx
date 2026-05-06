import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { listModules, seedModules } from "@/lib/curriculum/repo";
import { parseCurriculumYaml } from "@/lib/curriculum/schema";

function ensureSeeded() {
  const db = getDb();
  let modules = listModules(db);
  if (modules.length === 0) {
    const yamlPath = path.resolve(process.cwd(), "curriculum.yaml");
    if (fs.existsSync(yamlPath)) {
      const text = fs.readFileSync(yamlPath, "utf8");
      const curriculum = parseCurriculumYaml(text);
      seedModules(db, curriculum);
      console.log(
        `[home] seeded ${curriculum.modules.length} module(s) from curriculum.yaml`,
      );
      modules = listModules(db);
    }
  }
  return modules;
}

export const dynamic = "force-dynamic";

export default function Home() {
  const modules = ensureSeeded();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Math Tutor</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Curriculum modules from prerequisites through ML-paper-ready math.
        </p>
      </header>
      {modules.length === 0 ? (
        <p className="text-neutral-500">
          No modules yet. Run <code>npx tsx scripts/seed-curriculum.ts</code>.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {modules.map((m) => (
            <li key={m.id} className="py-3">
              <Link
                href={`/modules/${m.id}`}
                className="text-lg font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                {m.title}
              </Link>
              <span className="ml-2 text-xs uppercase tracking-wide text-neutral-500">
                {m.id}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
