import "server-only";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { log } from "./log";

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError("not_found", `${what} not found.`, 404);

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "Some fields are invalid.", details: z.flattenError(err).fieldErrors } },
      { status: 400 },
    );
  }
  if (err instanceof AppError) {
    if (err.status >= 500) log.error("app_error", { code: err.code, message: err.message });
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  log.error("unhandled_error", { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong on the server. Your saved work is unaffected." } }, { status: 500 });
}

/** Wraps a route handler: consistent JSON envelope and error handling. */
export function route<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("invalid_json", "Request body must be JSON.");
  }
  return schema.parse(body);
}
