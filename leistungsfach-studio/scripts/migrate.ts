// Applies database migrations without starting the app (the app also migrates automatically on start).
// Usage: npm run db:migrate            (PGlite in ./data/pglite, or PGLITE_DIR)
//        DATABASE_URL=postgres://… npm run db:migrate
import path from "node:path";
import { mkdirSync } from "node:fs";

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function main() {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await migrate(drizzle(pool), { migrationsFolder });
    await pool.end();
    console.log("Migrations applied to PostgreSQL (DATABASE_URL).");
    return;
  }
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "pglite");
  mkdirSync(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dir);
  await migrate(drizzle(client), { migrationsFolder });
  await client.close();
  console.log(`Migrations applied to the local database in ${dir}.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
