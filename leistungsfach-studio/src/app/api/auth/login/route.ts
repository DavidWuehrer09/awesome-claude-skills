import { z } from "zod";
import { NextResponse } from "next/server";
import { createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/session";
import { AppError, readJson, route } from "@/server/http";

const Body = z.object({ password: z.string().min(1).max(500) });

export const POST = route(async (request: Request) => {
  const { password } = await readJson(request, Body);
  if (!(await passwordMatches(password))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    throw new AppError("wrong_password", "That password is not correct.", 401);
  }
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
});
