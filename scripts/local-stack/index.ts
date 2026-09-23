/**
 * Docker-free local Supabase for development and e2e tests.
 *
 *   pnpm stack:up            # start (creates the database on first run)
 *   pnpm stack:up --reset    # drop and recreate the local database
 *
 * Requires a PostgreSQL ≥ 15 server reachable at LOCAL_PG_ADMIN_URL (trust/password auth).
 * Downloads GoTrue (Supabase Auth) and PostgREST release binaries from GitHub (linux x64)
 * into .local-stack/bin, applies supabase/migrations, emulates Storage, and serves the whole
 * thing behind a Kong-like gateway at http://localhost:54321 — the same URL layout as
 * `supabase start`. Writes the Supabase keys into .env.local.
 *
 * If you have Docker, prefer the official `pnpm supabase:start`.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { startGateway } from "./gateway";
import { signJwt } from "./jwt";
import { startStorageEmulator } from "./storage-emulator";

const ROOT = join(__dirname, "..", "..");
const STACK = join(ROOT, ".local-stack");
const BIN = join(STACK, "bin");
const ADMIN_URL =
  process.env.LOCAL_PG_ADMIN_URL ?? "postgresql://postgres@localhost:54329/postgres";
const DB_NAME = process.env.LOCAL_DB_NAME ?? "docufirma_local";
const JWT_SECRET =
  process.env.LOCAL_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const PORTS = { gateway: 54321, auth: 54322, rest: 54323, storage: 54324 };
const SITE_URL = process.env.LOCAL_SITE_URL ?? "http://localhost:3000";
const AUTOCONFIRM = process.env.LOCAL_AUTH_AUTOCONFIRM !== "false";

const RELEASES = {
  postgrest:
    "https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz",
  auth: "https://github.com/supabase/auth/releases/download/v2.170.0/auth-v2.170.0-x86.tar.gz",
};

const children: ChildProcess[] = [];

function log(msg: string) {
  console.log(`[stack] ${msg}`);
}

function ensureBinaries() {
  mkdirSync(BIN, { recursive: true });
  if (!existsSync(join(BIN, "postgrest"))) {
    log("downloading PostgREST…");
    execFileSync("sh", ["-c", `curl -fsSL "${RELEASES.postgrest}" | tar -xJ -C "${BIN}"`], {
      stdio: "inherit",
    });
  }
  if (!existsSync(join(BIN, "auth"))) {
    log("downloading Supabase Auth (GoTrue)…");
    execFileSync("sh", ["-c", `curl -fsSL "${RELEASES.auth}" | tar -xz -C "${BIN}"`], {
      stdio: "inherit",
    });
  }
}

function dbUrl(user = "postgres") {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB_NAME}`;
  url.username = user;
  url.password = user === "postgres" ? url.password : "";
  return url.toString();
}

async function prepareDatabase(reset: boolean) {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  if (reset) {
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    rmSync(join(STACK, "storage"), { recursive: true, force: true });
  }
  const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [DB_NAME]);
  const created = rowCount === 0;
  if (created) await admin.query(`create database ${DB_NAME}`);
  await admin.end();

  if (created) {
    const db = new Client({ connectionString: dbUrl() });
    await db.connect();
    await db.query(readFileSync(join(ROOT, "supabase", "tests", "shim.sql"), "utf8"));
    await db.query("create schema if not exists auth");
    await db.end();
    log(`created database ${DB_NAME}`);
  }
  return created;
}

async function applyMigrations(seed: boolean) {
  const db = new Client({ connectionString: dbUrl() });
  await db.connect();
  await db.query("create schema if not exists local_stack");
  await db.query(
    "create table if not exists local_stack.migrations (name text primary key, applied_at timestamptz default now())",
  );
  const applied = new Set(
    (await db.query<{ name: string }>("select name from local_stack.migrations")).rows.map(
      (r) => r.name,
    ),
  );
  const files = readdirSync(join(ROOT, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    await db.query("begin");
    try {
      await db.query(readFileSync(join(ROOT, "supabase", "migrations", file), "utf8"));
      await db.query("insert into local_stack.migrations (name) values ($1)", [file]);
      await db.query("commit");
      log(`migration ${file}`);
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  }
  if (seed) await db.query(readFileSync(join(ROOT, "supabase", "seed.sql"), "utf8"));
  // Local users need the auth schema grants the hosted platform provides.
  await db.query("grant usage on schema auth to anon, authenticated, service_role");
  await db.end();
}

function spawnService(
  name: string,
  command: string,
  args: string[],
  env: Record<string, string>,
  cwd = BIN,
) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = (line: string) => `[${name}] ${line}`;
  child.stdout?.on(
    "data",
    (d: Buffer) => process.env.STACK_VERBOSE && process.stdout.write(prefix(d.toString())),
  );
  child.stderr?.on("data", (d: Buffer) => process.stderr.write(prefix(d.toString())));
  child.on(
    "exit",
    (code) => code !== null && code !== 0 && log(`${name} exited with code ${code}`),
  );
  children.push(child);
  return child;
}

async function waitFor(url: string, name: string, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${name} did not become ready at ${url}`);
}

function writeEnvLocal(keys: Record<string, string>) {
  const path = join(ROOT, ".env.local");
  const existing = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  const kept = existing.filter((line) => !Object.keys(keys).some((k) => line.startsWith(`${k}=`)));
  const next = [
    ...kept.filter((l, i, arr) => l !== "" || i < arr.length - 1),
    ...Object.entries(keys).map(([k, v]) => `${k}=${v}`),
  ];
  writeFileSync(path, `${next.join("\n")}\n`, { mode: 0o600 });
}

async function main() {
  const reset = process.argv.includes("--reset");
  ensureBinaries();
  const created = await prepareDatabase(reset);

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 24 * 365 * 10;
  const anonKey = signJwt({ iss: "supabase-local", role: "anon", iat, exp }, JWT_SECRET);
  const serviceKey = signJwt({ iss: "supabase-local", role: "service_role", iat, exp }, JWT_SECRET);

  spawnService("auth", join(BIN, "auth"), [], {
    GOTRUE_API_HOST: "127.0.0.1",
    PORT: String(PORTS.auth),
    API_EXTERNAL_URL: `http://localhost:${PORTS.gateway}/auth/v1`,
    GOTRUE_DB_DRIVER: "postgres",
    DATABASE_URL: `${dbUrl()}?sslmode=disable&search_path=auth`,
    GOTRUE_DB_MIGRATIONS_PATH: join(BIN, "migrations"),
    GOTRUE_SITE_URL: SITE_URL,
    GOTRUE_URI_ALLOW_LIST: `${SITE_URL}/**`,
    GOTRUE_JWT_SECRET: JWT_SECRET,
    GOTRUE_JWT_EXP: process.env.LOCAL_JWT_EXP ?? "3600",
    // Same refresh-token rotation behaviour as hosted Supabase (10 s reuse window).
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "true",
    GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: "10",
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_DISABLE_SIGNUP: "false",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_MAILER_AUTOCONFIRM: String(AUTOCONFIRM),
    GOTRUE_PASSWORD_MIN_LENGTH: "8",
    GOTRUE_RATE_LIMIT_EMAIL_SENT: "1000",
    GOTRUE_SMTP_HOST: "127.0.0.1",
    GOTRUE_SMTP_PORT: "2500",
    GOTRUE_SMTP_ADMIN_EMAIL: "no-reply@docufirma.local",
    GOTRUE_LOG_LEVEL: "warn",
  });
  await waitFor(`http://127.0.0.1:${PORTS.auth}/health`, "auth");
  log("auth ready");

  await applyMigrations(created);

  spawnService("rest", join(BIN, "postgrest"), [], {
    PGRST_DB_URI: dbUrl("authenticator"),
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_PORT: String(PORTS.rest),
    PGRST_SERVER_HOST: "127.0.0.1",
    PGRST_DB_USE_LEGACY_GUCS: "false",
    PGRST_LOG_LEVEL: "warn",
  });
  await waitFor(`http://127.0.0.1:${PORTS.rest}/`, "rest");
  log("rest ready");

  startStorageEmulator({
    root: join(STACK, "storage"),
    jwtSecret: JWT_SECRET,
    port: PORTS.storage,
  });
  startGateway(PORTS.gateway, {
    "/auth/v1": PORTS.auth,
    "/rest/v1": PORTS.rest,
    "/storage/v1": PORTS.storage,
  });

  writeEnvLocal({
    NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${PORTS.gateway}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    SUPABASE_DB_URL: dbUrl(),
  });
  log(
    `Supabase (local, Docker-free) running at http://localhost:${PORTS.gateway} — keys written to .env.local`,
  );

  const shutdown = () => {
    children.forEach((c) => c.kill("SIGTERM"));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  children.forEach((c) => c.kill("SIGTERM"));
  process.exit(1);
});
