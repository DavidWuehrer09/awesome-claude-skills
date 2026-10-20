import { Clock, FileText, GraduationCap, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge, Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { LIBRARY } from "@/domain/writing/library";
import { TASK_TYPES } from "@/domain/writing/rubrics";
import { daysUntil } from "@/lib/time";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/repos/learning";

export const metadata = { title: "Abitur Academy" };
export const dynamic = "force-dynamic";

const DESCRIPTIONS: Record<string, string> = {
  comment: "Take and defend a position on a statement, with a genuine counterargument.",
  discussion: "Weigh both sides with clear criteria and reach a reasoned conclusion.",
  non_fiction_analysis: "How does the author/speaker try to convince? Structure, language, effect.",
  stylistic_analysis: "Devices in context: name them only when you explain their effect.",
  literary_analysis: "Interpretation of a prose extract, poem or scene with evidence.",
  characterisation: "Traits, development and relationships, supported by the text.",
  mediation: "German source → English text for a specific addressee and purpose.",
  comparison: "Similarities and differences between texts or viewpoints, with criteria.",
  creative: "Transformative writing: a diary entry, a letter, a continuation…",
  summary: "The main points, neutral and in your own words.",
};

export default async function AbiturPage() {
  const user = await requireUser();
  const settings = await getSettings(await getDb(), user.id);
  const days = settings.examDate ? daysUntil(settings.examDate) : null;
  const abiturPrompts = LIBRARY.filter((l) => l.section === "abitur" || l.section === "timed");
  return (
    <>
      <PageHeader eyebrow="Bavarian English · erhöhtes Anforderungsniveau" title="Abitur Academy"
        subtitle="Exam-oriented writing, kept separate from general C1/C2 development. Choose a task type, a topic, difficulty and time limit."
        actions={<>
          <LinkButton href="/abitur/examiner"><GraduationCap className="size-4" aria-hidden /> My English Examiner</LinkButton>
          <LinkButton href="/writing/new?section=abitur" variant="primary">New Abitur-style task</LinkButton>
        </>} />
      {days !== null && days >= 0 && <div className="mb-4"><Notice tone="accent">Your exam is in <strong>{days} days</strong>. One timed task per week, revised after feedback, is more valuable than many untimed ones.</Notice></div>}
      <Notice title="About official requirements">
        These tasks follow general practice for German upper-secondary English exams. They are not official exam papers, and the estimates use practice rubrics. Check current requirements with your teacher and the ISB (Staatsinstitut für Schulqualität und Bildungsforschung). In <Link className="underline" href="/abitur/examiner">My English Examiner</Link> you can upload your own Klausuren and teacher criteria so practice matches your course.
      </Notice>

      <h2 className="mt-8 text-xl">Task types</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TASK_TYPES.filter((t) => t.abitur).map((t) => (
          <li key={t.id}>
            <Card className="flex h-full flex-col">
              <h3 className="text-lg">{t.label}</h3>
              <p className="mt-1 flex-1 text-sm text-ink-2">{DESCRIPTIONS[t.id]}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <LinkButton size="sm" href={`/writing/new?section=abitur`}><Sparkles className="size-3.5" aria-hidden /> Generate</LinkButton>
                {LIBRARY.some((l) => l.taskType === t.id && (l.section === "abitur" || l.section === "timed")) && <Badge tone="navy">ready-made task available</Badge>}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl">Ready-made practice tasks</h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {abiturPrompts.map((p) => (
          <li key={p.key}>
            <Link href={`/writing/new?section=${p.section}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
              <FileText className="size-4 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1">{p.title}</span>
              {p.timeLimitMinutes && <Badge><Clock className="size-3" aria-hidden /> {p.timeLimitMinutes} min</Badge>}
              {p.sourceText && <Badge tone="accent">source text</Badge>}
            </Link>
          </li>
        ))}
      </ul>

      <Card className="mt-8">
        <h2 className="text-lg">How assessment works here</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>Each task type has its own practice rubric: a summary is never judged like a comment.</li>
          <li>Feedback quotes your text, separates errors from stylistic suggestions and prioritises what matters most.</li>
          <li>An optional 0–15 point estimate is shown as a range with its basis and uncertainty. It is not an official grade.</li>
          <li>Excellent English does not replace task fulfilment, and marks are never inflated to encourage you.</li>
          <li>You can challenge any comment; valid arguments lead to a revised or withdrawn comment.</li>
        </ul>
      </Card>
    </>
  );
}
