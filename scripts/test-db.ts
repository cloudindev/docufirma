/**
 * Applies all migrations to a throwaway PostgreSQL database and runs the SQL tests in
 * supabase/tests/*.test.sql. Works against a bare Postgres (a small shim emulates the
 * Supabase `auth` / `storage` schemas) or a local Supabase database.
 *
 *   TEST_DATABASE_URL=postgresql://postgres@localhost:54329/postgres pnpm test:db
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseDir, withMigratedDatabase } from "./lib/temp-db";

const adminUrl = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:54329/postgres";

async function main() {
  const failures = await withMigratedDatabase(adminUrl, async (db) => {
    await db.query(readFileSync(join(supabaseDir, "tests", "helpers.sql"), "utf8"));
    let failed = 0;
    const tests = readdirSync(join(supabaseDir, "tests"))
      .filter((f) => f.endsWith(".test.sql"))
      .sort();
    for (const file of tests) {
      const sql = readFileSync(join(supabaseDir, "tests", file), "utf8");
      try {
        await db.query("begin");
        await db.query(sql);
        console.log(`✓ ${file}`);
      } catch (error) {
        failed += 1;
        console.error(`✗ ${file}\n  ${(error as Error).message}`);
      } finally {
        await db.query("rollback").catch(() => undefined);
        await db.query("reset role").catch(() => undefined);
      }
    }
    return failed;
  });

  if (failures > 0) {
    console.error(`\n${failures} SQL test file(s) failed`);
    process.exit(1);
  }
  console.log("\nAll SQL tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
