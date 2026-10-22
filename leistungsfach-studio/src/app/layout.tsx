import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/components/Nav";
import { aiStatus } from "@/lib/ai/client";
import { authMode } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Leistungsfach Studio", template: "%s · Leistungsfach Studio" },
  description: "Personal English training for the Bavarian Leistungsfach (eA, Years 12/13).",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

function SystemBanner() {
  const ai = aiStatus();
  if (ai.provider === "mock") {
    return (
      <div role="note" className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-center text-sm text-warn">
        Mock AI mode — results are generated offline for testing and are <strong>not</strong> real feedback.
      </div>
    );
  }
  if (!ai.configured) {
    return (
      <div role="note" className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-center text-sm text-warn">
        The AI tutor is not configured yet. You can save essays and vocabulary; add <code>ANTHROPIC_API_KEY</code> to <code>.env.local</code> to enable assessment (see README).
      </div>
    );
  }
  return null;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded bg-accent px-3 py-2 text-accent-ink">Skip to content</a>
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar showLogout={authMode() === "password"} />
          <div className="min-w-0 flex-1">
            <SystemBanner />
            <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
