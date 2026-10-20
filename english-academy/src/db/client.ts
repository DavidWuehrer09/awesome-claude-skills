import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db?: Db; ready?: Promise<Db>; close?: () => Promise<void> };
const g = globalThis as unknown as { __academyDb?: Holder };
const holder: Holder = (g.__academyDb ??= {});

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * DATABASE_URL:
 *  - postgres://… / postgresql://…  → PostgreSQL (production)
 *  - pglite:<dir> or unset          → embedded PGlite at <dir> (default .data/pglite)
 *  - pglite:memory                  → in-memory (tests)
 */
export async function createDb(url = process.env.DATABASE_URL): Promise<{ db: Db; close: () => Promise<void> }> {
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 5), prepare: false });
    const db = drizzlePg(client, { schema }) as unknown as Db;
    if (process.env.AUTO_MIGRATE !== "false") {
      await migratePg(drizzlePg(client), { migrationsFolder: MIGRATIONS });
    }
    return { db, close: () => client.end() };
  }
  const target = url?.startsWith("pglite:") ? url.slice("pglite:".length) : ".data/pglite";
  if (target !== "memory") mkdirSync(path.resolve(target), { recursive: true });
  const client = target === "memory" ? new PGlite() : new PGlite(path.resolve(target));
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await migratePglite(drizzlePglite(client), { migrationsFolder: MIGRATIONS });
  return { db, close: () => client.close() };
}

export function getDb(): Promise<Db> {
  if (holder.db) return Promise.resolve(holder.db);
  holder.ready ??= createDb().then(
    ({ db, close }) => {
      holder.db = db;
      holder.close = close;
      return db;
    },
    (e) => {
      holder.ready = undefined; // allow a retry on the next request
      throw e;
    },
  );
  return holder.ready;
}

/** Test helper: install a specific database instance. */
export function setDbForTests(db: Db) {
  holder.db = db;
  holder.ready = Promise.resolve(db);
}
