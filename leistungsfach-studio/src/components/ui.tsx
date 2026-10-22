// Shared UI primitives (client-safe; no server imports).
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean };
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-55 disabled:cursor-not-allowed";
  const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-[0.95rem]" };
  const variants = {
    primary: "bg-accent text-accent-ink hover:brightness-110",
    secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
    ghost: "text-ink-2 hover:bg-surface-2",
    danger: "border border-bad/40 bg-bad-soft text-bad hover:brightness-95",
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Card({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" } & Record<string, unknown>) {
  return <As className={cx("rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]", className)} {...rest}>{children}</As>;
}

export function CardTitle({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="font-serif text-lg font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-[2.1rem]">{title}</h1>
        {intro && <div className="mt-2 text-[0.97rem] leading-relaxed text-muted">{intro}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

type Tone = "neutral" | "accent" | "good" | "warn" | "bad";
const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-accent/25",
  good: "bg-good-soft text-good border-good/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  bad: "bg-bad-soft text-bad border-bad/25",
};
export function Badge({ children, tone = "neutral", title, className }: { children: ReactNode; tone?: Tone; title?: string; className?: string }) {
  return <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", toneClass[tone], className)}>{children}</span>;
}

export function Spinner({ small }: { small?: boolean }) {
  return <span aria-hidden className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", small ? "h-3.5 w-3.5" : "h-5 w-5")} />;
}

export function LoadingNotice({ title, detail }: { title: string; detail?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-accent/25 bg-accent-soft p-4 text-ink">
      <Spinner />
      <div><p className="font-medium">{title}</p>{detail && <p className="mt-0.5 text-sm text-ink-2">{detail}</p>}</div>
    </div>
  );
}

export function ErrorNotice({ title = "Something went wrong", message, action }: { title?: string; message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-bad/30 bg-bad-soft p-4 text-bad">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <div className={cx("rounded-lg border p-3 text-sm leading-relaxed", toneClass[tone])}>{children}</div>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center">
      <p className="font-serif text-lg font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, optional }: { label: string; htmlFor: string; hint?: ReactNode; error?: string; children: ReactNode; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs leading-relaxed text-muted">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} className="text-xs font-medium text-bad">{error}</p>}
    </div>
  );
}

const inputBase = "w-full rounded-lg border border-line-strong bg-surface px-3 text-ink placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, "h-10", props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, "py-2.5 leading-relaxed", props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputBase, "h-10 pr-8", props.className)} />;
}

export function ScoreRange({ low, high, best, size = "md" }: { low: number | null; high: number | null; best?: number | null; size?: "sm" | "md" | "lg" }) {
  if (low === null || high === null) return <span className="text-muted">—</span>;
  const cls = { sm: "text-sm", md: "text-base", lg: "text-3xl" }[size];
  return (
    <span className={cx("font-serif font-semibold tabular-nums text-ink", cls)} aria-label={`Estimated ${low} to ${high} out of 15${best != null ? `, most likely ${best}` : ""}`}>
      {low === high ? low : `${low}–${high}`}<span className="text-muted font-normal">{size === "lg" ? " / 15" : "/15"}</span>
    </span>
  );
}

const provenanceTone: Record<string, Tone> = { official_verified: "good", official_reported: "warn", teacher_specific: "accent", interpretation: "neutral", ai_suggestion: "neutral" };
const provenanceText: Record<string, string> = { official_verified: "Official (verified)", official_reported: "Official, reported — unverified", teacher_specific: "Your teacher", interpretation: "Interpretation", ai_suggestion: "Suggestion" };
export function ProvenanceBadge({ p }: { p: string }) {
  return <Badge tone={provenanceTone[p] ?? "neutral"} title="Where this requirement comes from">{provenanceText[p] ?? p}</Badge>;
}

export function MockBadge({ provider }: { provider?: string | null }) {
  if (provider !== "mock") return null;
  return <Badge tone="warn" title="Produced by the offline mock provider, not by Claude">mock AI</Badge>;
}

export function Meter({ value, max = 15, label }: { value: number | null; max?: number; label: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      {...(value === null
        ? { role: "img", "aria-label": `${label}: not assessed yet` }
        : { role: "meter", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": max, "aria-valuenow": value })}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
