import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const root = join(__dirname, "..", "..", "supabase");

/** Creates a throwaway database with every migration applied (plus the Supabase shim on bare Postgres). */
export async function withMigratedDatabase<T>(
  adminUrl: string,
  fn: (db: Client) => Promise<T>,
  { quiet = false }: { quiet?: boolean } = {},
): Promise<T> {
  const dbName = `docufirma_tmp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  const log = (msg: string) => (quiet ? undefined : console.log(msg));
  try {
    const { rows } = await db.query(
      "select exists (select 1 from information_schema.schemata where schema_name = 'auth') as has_auth",
    );
    if (!rows[0].has_auth) {
      await db.query(readFileSync(join(root, "tests", "shim.sql"), "utf8"));
      await db.query(readFileSync(join(root, "tests", "shim-auth.sql"), "utf8"));
      log("• applied Supabase shim");
    }
    for (const file of readdirSync(join(root, "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      try {
        await db.query(readFileSync(join(root, "migrations", file), "utf8"));
      } catch (error) {
        console.error(`✗ migration ${file} failed`);
        throw error;
      }
      log(`• migration ${file}`);
    }
    await db.query(readFileSync(join(root, "seed.sql"), "utf8"));
    return await fn(db);
  } finally {
    await db.end();
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  }
}

export const supabaseDir = root;
