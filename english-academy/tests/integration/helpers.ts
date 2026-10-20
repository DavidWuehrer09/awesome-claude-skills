import { createDb, setDbForTests, type Db } from "@/db/client";
import { createUser } from "@/server/auth";

export async function freshDb() {
  const { db, close } = await createDb("pglite:memory");
  setDbForTests(db);
  return { db, close };
}

export async function twoUsers(db: Db) {
  const alice = await createUser(db, "alice@example.com", "correct horse battery", "Alice");
  const bob = await createUser(db, "bob@example.com", "another long password", "Bob");
  return { alice, bob };
}
