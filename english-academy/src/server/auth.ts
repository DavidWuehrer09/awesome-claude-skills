import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDb, type Db } from "@/db/client";
import { sessions, users, userSettings } from "@/db/schema";
import { HttpError } from "./http";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const SESSION_COOKIE = "academy_session";
const SESSION_DAYS = 30;
const N = 16384;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

export type CurrentUser = { id: string; email: string; displayName: string | null };

export async function createUser(db: Db, email: string, password: string, displayName?: string): Promise<CurrentUser> {
  const normalized = email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized));
  if (existing.length) throw new HttpError(409, "An account with this email already exists", "exists");
  const [u] = await db
    .insert(users)
    .values({ email: normalized, passwordHash: await hashPassword(password), displayName: displayName?.trim() || null })
    .returning();
  await db.insert(userSettings).values({ userId: u.id });
  return { id: u.id, email: u.email, displayName: u.displayName };
}

export async function authenticate(db: Db, email: string, password: string): Promise<CurrentUser | null> {
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!u) {
    await hashPassword(password); // equalise timing
    return null;
  }
  return (await verifyPassword(password, u.passwordHash)) ? { id: u.id, email: u.email, displayName: u.displayName } : null;
}

export async function createSession(db: Db, userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.insert(sessions).values({ id: tokenId(token), userId, expiresAt: expires });
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  return { token, expires };
}

export async function userForToken(db: Db, token: string | undefined): Promise<CurrentUser | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, tokenId(token)), gt(sessions.expiresAt, new Date())));
  return rows[0] ?? null;
}

export async function destroySession(db: Db, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.id, tokenId(token)));
}

export async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    path: "/",
    expires,
  });
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForToken(await getDb(), token);
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Please sign in", "unauthenticated");
  return u;
}
