"use client";

import { useEffect } from "react";

/** Fallback for unexpected errors in a page. Saved work is on the server or queued on this device. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="mt-2 text-ink-2">This page could not be shown. Your words, reviews and drafts are saved; answers given offline wait on this device until they can be sent.</p>
      {error.digest && <p className="mt-2 text-xs text-ink-3">Error reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <button className="h-10 rounded-lg bg-navy px-4 font-medium text-navy-ink" onClick={() => retry()}>Try again</button>
        <a className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4" href="/home">Go to Home</a>
      </div>
    </main>
  );
}
