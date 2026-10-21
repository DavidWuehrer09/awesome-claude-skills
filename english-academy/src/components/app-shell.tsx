"use client";

import clsx from "clsx";
import {
  BookOpen, ClipboardCheck, CloudOff, Gauge, GraduationCap, House, Layers, LineChart, LogOut, Menu, MessagesSquare, Network, PenLine, RefreshCw, Search, Settings, Target,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/lib/api";
import { flushReviews, onQueueChange, pendingReviews } from "@/lib/offline";
import { SearchDialog } from "./search-dialog";
import { ToastProvider } from "./ui";

export const NAV = [
  { href: "/home", label: "Home", icon: House },
  { href: "/vocabulary", label: "My Vocabulary", icon: BookOpen },
  { href: "/learn", label: "Learn", icon: Layers },
  { href: "/practice", label: "Practice", icon: Target },
  { href: "/mind-maps", label: "Mind Maps", icon: Network },
  { href: "/writing", label: "Writing Lab", icon: PenLine },
  { href: "/tutor", label: "AI Tutor", icon: MessagesSquare },
  { href: "/abitur", label: "Abitur Academy", icon: GraduationCap },
  { href: "/abitur/examiner", label: "My Examiner", icon: ClipboardCheck },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/settings", label: "Settings", icon: Settings },
];
const MOBILE_PRIMARY = ["/home", "/learn", "/vocabulary", "/writing"];

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

function SyncStatus() {
  const online = useOnline();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const update = () => pendingReviews().then((all) => setPending(all.filter((e) => e._status === "pending").length)).catch(() => {});
    const goOnline = () => void flushReviews();
    update();
    void flushReviews();
    const off = onQueueChange(update);
    window.addEventListener("online", goOnline);
    const t = setInterval(() => navigator.onLine && void flushReviews(), 30000);
    return () => {
      off();
      clearInterval(t);
      window.removeEventListener("online", goOnline);
    };
  }, []);
  if (online && !pending) return null;
  return (
    <button
      type="button"
      onClick={() => void flushReviews()}
      className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", online ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2")}
      title={online ? "Answers waiting to sync; click to retry" : "Offline: answers are saved on this device and sync later"}
    >
      {online ? <RefreshCw className="size-3.5" /> : <CloudOff className="size-3.5" />}
      {online ? `${pending} to sync` : `Offline${pending ? ` · ${pending} saved` : ""}`}
    </button>
  );
}

export function AppShell({ children, user, isAdmin = false }: { children: ReactNode; user: { email: string; displayName: string | null }; isAdmin?: boolean }) {
  const nav = isAdmin ? [...NAV, { href: "/admin", label: "Usage & costs", icon: Gauge }] : NAV;
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState(false);
  // The most specific matching entry wins (e.g. /abitur/examiner over /abitur).
  const best = nav.filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const active = (href: string) => href === best;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const logout = async () => {
    await flushReviews().catch(() => {});
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Personal data must not stay readable offline on a shared device.
    try {
      for (const key of await caches.keys()) if (key.startsWith("data-") || key.startsWith("pages-")) await caches.delete(key);
      indexedDB.deleteDatabase("academy-offline");
    } catch {
      /* storage APIs unavailable */
    }
    router.push("/login");
  };

  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <div className="flex min-h-dvh">
        {/* Sidebar: full on desktop, icon rail on tablet */}
        <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[72px] lg:w-60">
          <Link href="/home" className="flex h-16 items-center gap-2 px-4 lg:px-5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-navy font-display text-lg text-navy-ink">A</span>
            <span className="hidden font-display text-lg text-ink lg:inline">English Academy</span>
          </Link>
          <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2 lg:px-3">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? "page" : undefined}
                title={label}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors md:justify-center lg:justify-start",
                  active(href) ? "bg-navy/10 font-medium text-navy" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="md:sr-only lg:not-sr-only">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="border-t border-line p-3">
            <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-3 hover:bg-surface-2 md:justify-center lg:justify-start" title="Sign out">
              <LogOut className="size-4" aria-hidden />
              <span className="md:sr-only lg:not-sr-only truncate">Sign out {user.displayName ?? ""}</span>
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur md:h-16 md:px-8" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <Link href="/home" className="flex items-center gap-2 md:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-navy font-display text-navy-ink">A</span>
            </Link>
            <button
              type="button"
              onClick={() => setSearch(true)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-ink-3 hover:border-line-strong md:max-w-md"
              aria-label="Search your vocabulary"
            >
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="truncate">Search words, topics, examples…</span>
              <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[11px] lg:inline">⌘K</kbd>
            </button>
            <SyncStatus />
          </header>

          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12">{children}</main>
        </div>
      </div>

      {/* Bottom navigation on phones */}
      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {nav.filter((n) => MOBILE_PRIMARY.includes(n.href)).map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined} className={clsx("flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px]", active(href) ? "text-navy" : "text-ink-3")}>
                <Icon className="size-6" aria-hidden />
                {label.replace("My ", "").replace(" Lab", "")}
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setMore(true)} aria-expanded={more} className={clsx("flex w-full flex-col items-center gap-0.5 pt-2 pb-1 text-[11px]", more ? "text-navy" : "text-ink-3")}>
              <Menu className="size-6" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setMore(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface p-4">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            <ul className="grid grid-cols-3 gap-2">
              {nav.filter((n) => !MOBILE_PRIMARY.includes(n.href)).map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link href={href} onClick={() => setMore(false)} className={clsx("flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-center text-xs", active(href) ? "bg-navy/10 text-navy" : "bg-surface-2 text-ink-2")}>
                    <Icon className="size-6" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <button type="button" onClick={logout} className="flex w-full flex-col items-center gap-1 rounded-xl bg-surface-2 px-2 py-3 text-xs text-ink-2">
                  <LogOut className="size-6" aria-hidden />
                  Sign out
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
      <SearchDialog open={search} onClose={() => setSearch(false)} />
    </ToastProvider>
  );
}
