import { Sparkles } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { PRACTICE_MODES } from "@/domain/learning/modes";
import { SENTENCE_LAB } from "@/domain/writing/library";

export const metadata = { title: "Practice" };

export default function PracticePage() {
  return (
    <>
      <PageHeader title="Practice" subtitle="Every mode works on any topic and feeds the same learning history. Modes marked AI generate fresh exercises with the configured provider." />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRACTICE_MODES.map((m, i) => (
          <li key={m.slug}>
            <Link href={m.ai ? `/practice/${m.slug}` : (m.href ?? "/practice")}
              className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)] transition-colors hover:border-navy">
              <span className="flex items-center gap-2 text-xs text-ink-3">Mode {i + 1}{m.ai && <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent"><Sparkles className="size-3" aria-hidden /> AI</span>}</span>
              <span className="mt-1 font-display text-lg text-ink">{m.title}</span>
              <span className="mt-1 text-sm text-ink-2">{m.description}</span>
            </Link>
          </li>
        ))}
      </ol>
      <h2 className="mt-10 text-xl">Other tools</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["/vocabulary?list=difficult", "Difficult-word collection", "Words you marked or keep forgetting."],
          ["/vocabulary?list=favorites", "Personal notebook", "Your favourites, notes and mnemonics."],
          ["/tutor?ask=Compare%20words%20I%20often%20confuse", "Confusable words", "Ask the tutor to compare near-synonyms."],
          ["/writing/new?section=sentence", `Sentence Laboratory (${SENTENCE_LAB.length})`, "Precision, concision and register."],
        ].map(([href, t, d]) => (
          <li key={href}><Link href={href} className="block rounded-xl border border-line bg-surface p-4 hover:border-navy"><span className="font-medium">{t}</span><span className="block text-sm text-ink-2">{d}</span></Link></li>
        ))}
      </ul>
    </>
  );
}
