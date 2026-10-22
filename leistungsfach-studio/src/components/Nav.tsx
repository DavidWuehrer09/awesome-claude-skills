"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "./ui";

const ICONS: Record<string, string> = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  examiner: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h5v2H8v-2z",
  revision: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  training: "M20.57 14.86 22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z",
  vocabulary: "M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 4h5v8l-2.5-1.5L6 12V4z",
  history: "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
  profile: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
};

export const NAV = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/examiner", label: "Essay Examiner", icon: "examiner" },
  { href: "/revision", label: "Revision Studio", icon: "revision" },
  { href: "/training", label: "Personal Training", icon: "training" },
  { href: "/vocabulary", label: "Vocabulary", icon: "vocabulary" },
  { href: "/essays", label: "Essay History", icon: "history" },
  { href: "/profile", label: "Learner Profile & Settings", icon: "profile" },
];

function Icon({ name }: { name: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 fill-current"><path d={ICONS[name]} /></svg>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[0.93rem] transition-colors",
                active ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon name={n.icon} />
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand() {
  return (
    <Link href="/" className="block rounded-lg px-3 py-1">
      <span className="block font-serif text-[1.15rem] font-semibold leading-tight text-ink">Leistungsfach Studio</span>
      <span className="block text-xs text-muted">English eA · Jahrgangsstufe 12/13</span>
    </Link>
  );
}

export function Sidebar({ showLogout }: { showLogout: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // Full reload on purpose: discards all client state of the signed-out session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm font-medium text-ink"
        >
          Menu
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <nav id="mobile-nav" className="absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto border-r border-line bg-surface p-4">
            <div className="mb-4 flex items-start justify-between"><Brand /><button className="rounded px-2 text-sm text-muted" onClick={() => setOpen(false)}>Close</button></div>
            <NavLinks onNavigate={() => setOpen(false)} />
            {showLogout && <button onClick={logout} className="mt-6 px-3 text-sm text-muted underline">Sign out</button>}
          </nav>
        </div>
      )}
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="mb-6"><Brand /></div>
        <nav aria-label="Main"><NavLinks /></nav>
        <div className="mt-auto space-y-2 px-3 text-xs text-muted">
          <p>Estimates, not official grades.</p>
          {showLogout && <button onClick={logout} className="underline">Sign out</button>}
        </div>
      </aside>
    </>
  );
}
