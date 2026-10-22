import "server-only";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { log } from "@/server/log";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type DbHandle = { db: Db; kind: "pglite" | "postgres"; close: () => Promise<void> };

const g = globalThis as unknown as { __studioDb?: Promise<DbHandle> };

export function migrationsFolder() {
  return path.join(process.cwd(), "drizzle");
}

/**
 * Opens the database once per process and applies pending migrations.
 * DATABASE_URL set → PostgreSQL via node-postgres. Otherwise → embedded PGlite in PGLITE_DIR (default ./data/pglite).
 * PGLITE_DIR=memory:// gives a throwaway in-memory database (tests).
 */
export async function openDatabase(): Promise<DbHandle> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, max: 5 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: migrationsFolder() });
    log.info("db.open", { kind: "postgres" });
    return { db: db as unknown as Db, kind: "postgres", close: () => pool.end() };
  }
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "pglite");
  if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  log.info("db.open", { kind: "pglite", dir: dir.startsWith("memory://") ? "memory" : dir });
  return { db: db as unknown as Db, kind: "pglite", close: () => client.close() };
}

export async function getDb(): Promise<Db> {
  if (!g.__studioDb) {
    g.__studioDb = openDatabase().catch((err) => {
      g.__studioDb = undefined;
      log.error("db.open_failed", { error: String(err) });
      throw err;
    });
  }
  return (await g.__studioDb).db;
}

export async function getDbKind() {
  if (!g.__studioDb) await getDb();
  return (await g.__studioDb!).kind;
}

/** Test helper: close and forget the cached connection (simulates an application restart). */
export async function closeDb() {
  if (g.__studioDb) {
    const h = await g.__studioDb;
    g.__studioDb = undefined;
    await h.close();
  }
}

export { schema };
