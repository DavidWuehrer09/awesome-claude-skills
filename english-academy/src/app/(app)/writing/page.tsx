import { FileText } from "lucide-react";
import Link from "next/link";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { LIBRARY, SENTENCE_LAB } from "@/domain/writing/library";
import { drillHref } from "@/domain/writing/rubrics";
import { requireUser } from "@/server/auth";
import { errorPatterns, listDrafts } from "@/server/repos/writing";

export const metadata = { title: "Writing Lab" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "sentence", letter: "A", title: "Sentence Laboratory", text: "Precision, redundancy, combining, syntax variety, register, nuance, articles, prepositions, verb patterns.", extra: `${SENTENCE_LAB.length} exercises` },
  { id: "paragraph", letter: "B", title: "Paragraph Workshop", text: "Topic sentence, claim, evidence, explanation, qualification, link." },
  { id: "vocab_context", letter: "C", title: "Academic Vocabulary in Context", text: "Use selected words naturally; see which fitted and which felt forced." },
  { id: "argument", letter: "D", title: "Argumentation Studio", text: "Thesis, counterargument, concession without surrender, conclusions." },
  { id: "refinement", letter: "E", title: "Stylistic Refinement", text: "Revise a paragraph and compare original, revision and model." },
  { id: "editing", letter: "F", title: "Editing and Proofreading", text: "Find your own mistakes in six focused passes." },
  { id: "timed", letter: "G", title: "Timed Writing", text: "Countdown, autosave and a review stage. Your text is never erased." },
  { id: "essay", letter: "H", title: "Full Essay Practice", text: "Complete texts with detailed feedback and a revision workflow." },
];

export default async function WritingLab() {
  const user = await requireUser();
  const db = await getDb();
  const [drafts, patterns] = await Promise.all([listDrafts(db, user.id), errorPatterns(db, user.id)]);
  return (
    <>
      <PageHeader title="Writing Lab" subtitle="Clear, precise, natural English: controlled sophistication rather than complicated sentences."
        actions={<LinkButton href="/writing/new" variant="primary">New writing task</LinkButton>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <Link href={`/writing/new?section=${s.id}`} className="flex h-full gap-3 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)] hover:border-navy">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 font-display text-lg text-navy">{s.letter}</span>
                  <span>
                    <span className="block font-display text-lg text-ink">{s.title}</span>
                    <span className="block text-sm text-ink-2">{s.text}</span>
                    <span className="mt-1 block text-xs text-ink-3">{s.extra ?? `${LIBRARY.filter((l) => l.section === s.id).length} ready-made prompts · AI prompts · your own`}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <h2 className="mt-8 text-xl">My drafts</h2>
          {drafts.length ? (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {drafts.map((d) => (
                <li key={d.id}>
                  <Link href={`/writing/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                    <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    {d.section && <Badge>{d.section.replace("_", " ")}</Badge>}
                    <span className="hidden text-sm text-ink-3 sm:inline">{d.words ?? 0} words</span>
                    {d.submissions > 0 && <Badge tone="navy">{d.submissions} version{d.submissions > 1 ? "s" : ""}</Badge>}
                    <span className="text-xs text-ink-3">{new Date(d.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-ink-3">No drafts yet. Pick a section above to start.</p>}
        </div>
        <aside className="space-y-4">
          <Card>
            <h2 className="text-lg">Your recurring patterns</h2>
            {patterns.length ? (
              <ul className="mt-3 space-y-3 text-sm">
                {patterns.slice(0, 6).map((p) => (
                  <li key={p.category}>
                    <div className="flex justify-between gap-2"><span className="font-medium">{p.category.replace("_", " ")}</span><span className="text-ink-3">{p.submissionsAffected} text{p.submissionsAffected === 1 ? "" : "s"}</span></div>
                    {p.examples[0] && <p className="truncate text-xs text-ink-3">e.g. “{p.examples[0]}”</p>}
                    <span className="flex flex-wrap gap-3">
                      <Link className="text-xs text-navy underline" href={`/writing/new?section=sentence&focus=${p.category}`}>Targeted practice</Link>
                      <Link className="text-xs text-navy underline" href={drillHref(p.category)}>Drills</Link>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-ink-3">Patterns appear after AI-assessed submissions. Recurring weaknesses are revisited on a spaced schedule.</p>}
          </Card>
          <Card>
            <h2 className="text-lg">Principles</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
              <li>Precise verbs over vague ones.</li>
              <li>Natural collocations over impressive-looking ones.</li>
              <li>Concise over elaborate.</li>
              <li>Qualified claims over exaggerated certainty.</li>
              <li>A simple sentence can already be excellent.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
