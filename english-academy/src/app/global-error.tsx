"use client";

import { useEffect } from "react";

/** Last-resort error page when the root layout itself fails; it cannot use the app's stylesheet. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f5f0", color: "#1f2937" }}>
        <title>Something went wrong – English Academy</title>
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "64px 16px", textAlign: "center" }}>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 500 }}>Something went wrong</h1>
          <p>The app could not start this page. Your saved work is not affected.</p>
          {error.digest && <p style={{ fontSize: 12, color: "#6b7280" }}>Error reference: {error.digest}</p>}
          <button onClick={() => retry()} style={{ marginTop: 16, padding: "10px 16px", borderRadius: 8, border: 0, background: "#223a5e", color: "#fff", fontSize: 15 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
