// Apply the SQL migrations in ./drizzle to DATABASE_URL (PostgreSQL or pglite:<dir>).
// The app also migrates on first connection unless AUTO_MIGRATE=false; use this in CI/CD instead.
import { mkdirSync } from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL ?? "pglite:.data/pglite";
const migrationsFolder = path.join(process.cwd(), "drizzle");

if (/^postgres(ql)?:\/\//.test(url)) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1, prepare: false });
  await migrate(drizzle(client), { migrationsFolder });
  await client.end();
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = url.replace(/^pglite:/, "");
  if (dir !== "memory") mkdirSync(path.resolve(dir), { recursive: true });
  const client = dir === "memory" ? new PGlite() : new PGlite(path.resolve(dir));
  await migrate(drizzle(client), { migrationsFolder });
  await client.close();
}
console.log("Migrations applied.");
