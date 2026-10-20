import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { log } from "./log";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "bad_request", details);
export const notFound = (what = "Not found") => new HttpError(404, what, "not_found");
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, "conflict", details);

/**
 * Reject cross-site state-changing requests. Same-origin fetches from the app
 * always send Origin (or at least Sec-Fetch-Site: same-origin).
 */
export function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Cross-site request blocked", "csrf");
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    try {
      if (new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked", "csrf");
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(403, "Invalid origin", "csrf");
    }
  }
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>, maxBytes = 512_000): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new HttpError(413, "Request too large", "too_large");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new HttpError(413, "Request too large", "too_large");
    raw = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw badRequest("Body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest("Invalid input", z.treeifyError(parsed.error));
  return parsed.data;
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: "Invalid input", code: "bad_request" }, { status: 400 });
  }
  log.error("unhandled_error", { error: e instanceof Error ? e.message : String(e) });
  return NextResponse.json({ error: "Something went wrong. Your data was not changed.", code: "internal" }, { status: 500 });
}

type Ctx<P> = { params: Promise<P> };

/** Wrap a route handler with origin checks and uniform error handling. */
export function route<P = Record<string, string>>(
  fn: (req: NextRequest, params: P) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await fn(req, params);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
