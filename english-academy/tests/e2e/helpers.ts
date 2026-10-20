import type { APIRequestContext, Page } from "@playwright/test";

let counter = 0;

/** Create a fresh, onboarded user (with the sample collection) and sign the browser in. */
export async function signUp(page: Page, opts: { sample?: boolean } = {}) {
  const email = `e2e-${Date.now()}-${counter++}@example.com`;
  const req = page.request;
  const r = await req.post("/api/auth/signup", { data: { email, password: "a-long-test-password", displayName: "Tess" } });
  if (!r.ok()) throw new Error(`signup failed: ${r.status()} ${await r.text()}`);
  await req.patch("/api/settings", { data: { onboarded: true, timezone: "Europe/Berlin" } });
  if (opts.sample !== false) await req.post("/api/sample");
  return { email };
}

export async function api<T>(req: APIRequestContext, method: "get" | "post" | "patch" | "delete", url: string, data?: unknown): Promise<T> {
  const r = await req[method](url, data !== undefined ? { data } : undefined);
  if (!r.ok()) throw new Error(`${method} ${url} -> ${r.status()} ${await r.text()}`);
  return (await r.json()) as T;
}
