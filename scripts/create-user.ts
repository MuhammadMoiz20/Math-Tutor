#!/usr/bin/env tsx
import { openDb } from "@/lib/db";
import { createUser } from "@/lib/users/repo";

function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-user.ts <email> <password>");
    process.exit(1);
  }
  const db = openDb(process.env.DB_PATH ?? "math-tutor.db");
  try {
    const id = createUser(db, email, password);
    console.log(`Created user id=${id} email=${email}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to create user: ${msg}`);
    process.exit(1);
  }
}

main();
