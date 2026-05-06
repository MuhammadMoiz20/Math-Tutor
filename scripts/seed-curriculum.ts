import fs from "node:fs";
import path from "node:path";
import { parseCurriculumYaml } from "@/lib/curriculum/schema";
import { seedModules } from "@/lib/curriculum/repo";
import { getDb } from "@/lib/db";
import { createUser, verifyUser } from "@/lib/users/repo";

export const TEST_USER_EMAIL = "test@math-tutor.local";
export const TEST_USER_PASSWORD = "test-password-12345";

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

  if (process.env.MATH_TUTOR_SEED_TEST_USER === "1") {
    if (!verifyUser(db, TEST_USER_EMAIL, TEST_USER_PASSWORD)) {
      try {
        createUser(db, TEST_USER_EMAIL, TEST_USER_PASSWORD);
        console.log(`Created test user ${TEST_USER_EMAIL}`);
      } catch (e) {
        console.warn(`Test user create skipped: ${(e as Error).message}`);
      }
    } else {
      console.log(`Test user ${TEST_USER_EMAIL} already present`);
    }
  }
}

main();
