import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/server/db/client";

const dir = mkdtempSync(path.join(tmpdir(), "studio-db-"));
process.env.PGLITE_DIR = dir;

afterAll(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("database persistence", () => {
  it("applies migrations and keeps data after the connection is closed and reopened (app restart)", async () => {
    const db = await getDb();
    const [row] = await db
      .insert(schema.essays)
      .values({ title: "Persistence check", taskType: "comment", essayText: "Some text.", wordCount: 2 })
      .returning();
    await closeDb();

    const db2 = await getDb();
    const found = await db2.select().from(schema.essays).where(eq(schema.essays.id, row.id));
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe("Persistence check");
  });
});
