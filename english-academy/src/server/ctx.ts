import "server-only";
import { getDb } from "@/db/client";
import { requireUser } from "./auth";

/** Resolve the signed-in user and database for a request. */
export async function ctx() {
  const user = await requireUser();
  return { user, db: await getDb() };
}
