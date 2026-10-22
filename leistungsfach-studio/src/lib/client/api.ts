// Browser-side fetch helper for the app's own API. Never holds secrets.
export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
      headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
  } catch {
    throw new ApiError("network", "Could not reach the app server. Check that it is running and try again.", 0);
  }
  let json: { data?: T; error?: { code: string; message: string; details?: unknown } } | null = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON (e.g. a proxy error page)
  }
  if (!res.ok || !json || json.error) {
    // A full reload to the sign-in page is intended when the session has expired.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(json?.error?.code ?? "http_error", json?.error?.message ?? `The server responded with ${res.status}.`, res.status, json?.error?.details);
  }
  return json.data as T;
}

export function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unexpected error.";
}
