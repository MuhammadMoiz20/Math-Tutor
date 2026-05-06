import fs from "node:fs";
import path from "node:path";
import { parseCurriculumYaml } from "@/lib/curriculum/schema";
import { seedModules } from "@/lib/curriculum/repo";
import { getDb } from "@/lib/db";

function main(): void {
  const yamlPath = path.resolve(process.cwd(), "curriculum.yaml");
  const text = fs.readFileSync(yamlPath, "utf8");
  const curriculum = parseCurriculumYaml(text);
  const db = getDb();
  seedModules(db, curriculum);
  console.log(
    `Seeded ${curriculum.modules.length} module(s): ${curriculum.modules
      .map((m) => m.id)
      .join(", ")}`,
  );
}

main();
