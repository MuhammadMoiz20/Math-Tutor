import { spawnSync } from "node:child_process";

export default async function globalSetup() {
  // Seed curriculum + a known test user into the dev DB used by the
  // Playwright webServer. The dev server reads DB_PATH from .env.local.
  const result = spawnSync("npx", ["tsx", "scripts/seed-curriculum.ts"], {
    env: { ...process.env, MATH_TUTOR_SEED_TEST_USER: "1" },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `seed-curriculum.ts exited with status ${result.status}`,
    );
  }
}
