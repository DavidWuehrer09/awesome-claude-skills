import Link from "next/link";
import { CurriculumPanel, DataPanel, PatternsPanel, SettingsPanel, SkillsPanel, TeacherPanel, type AiRunView, type CalibrationView, type FeedbackView, type NoteView, type PatternView, type ProfileView, type SkillView } from "@/components/profile/Panels";
import { cx, PageHeader } from "@/components/ui";
import { aiStatus } from "@/lib/ai/client";
import { ABITUR_FORMAT, ASSESSMENT_RULES, CURRICULUM_SOURCES, EA_REQUIREMENTS, RESEARCH_LIMITATION } from "@/lib/curriculum";
import { desc } from "drizzle-orm";
import { getDb, getDbKind, schema } from "@/server/db/client";
import { computeCalibration } from "@/server/services/calibration";
import { listCurriculumNotes } from "@/server/services/curriculum";
import { recentAiRuns } from "@/server/services/data";
import { getLearnerOverview } from "@/server/services/learner";
import { getProfile } from "@/server/services/profile";

export const metadata = { title: "Learner Profile & Settings" };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "skills", label: "Skills" },
  { id: "patterns", label: "Recurring errors" },
  { id: "teacher", label: "Teacher calibration" },
  { id: "curriculum", label: "Curriculum sources" },
  { id: "settings", label: "Settings" },
  { id: "data", label: "Data & privacy" },
] as const;

/** Serialises Dates etc. for client components. */
const plain = <T,>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = TABS.some((t) => t.id === rawTab) ? rawTab! : "skills";
  let body: React.ReactNode = null;
  if (tab === "skills" || tab === "patterns") {
    const o = await getLearnerOverview();
    body = tab === "skills" ? <SkillsPanel skills={plain<SkillView[]>(o.skills)} /> : <PatternsPanel patterns={plain<PatternView[]>(o.patterns)} />;
  } else if (tab === "teacher") {
    const db = await getDb();
    const [cal, fbs] = await Promise.all([computeCalibration(), db.select().from(schema.teacherFeedback).orderBy(desc(schema.teacherFeedback.createdAt))]);
    const feedback: FeedbackView[] = fbs.map((f) => ({ id: f.id, essayId: f.essayId, teacherScore: f.teacherScore, comments: f.comments, criteria: f.criteria, analysed: Boolean(f.analysis), createdAt: f.createdAt.toISOString() }));
    body = <TeacherPanel cal={plain<CalibrationView>(cal)} feedback={feedback} />;
  } else if (tab === "curriculum") {
    const notes = plain<NoteView[]>(await listCurriculumNotes());
    body = <CurriculumPanel requirements={EA_REQUIREMENTS} sources={CURRICULUM_SOURCES} notes={notes} limitation={RESEARCH_LIMITATION} assessmentRule={ASSESSMENT_RULES.label} abiturNotes={[
      `Written Abitur eA: listening ~30 min (20 %), writing (55 %), mediation (25 %); writing + mediation ${ABITUR_FORMAT.writingAndMediationMinutesEA} min; source text ≤ ${ABITUR_FORMAT.sourceTextMaxWordsEA} words; mediation source ≤ ${ABITUR_FORMAT.mediationSourceMaxWords} words (reported, unverified).`,
      ...ABITUR_FORMAT.notes,
    ]} />;
  } else if (tab === "settings") {
    body = <SettingsPanel profile={plain<ProfileView>(await getProfile())} />;
  } else {
    body = <DataPanel ai={aiStatus()} runs={plain<AiRunView[]>(await recentAiRuns())} db={await getDbKind()} />;
  }
  return (
    <>
      <PageHeader title="Learner Profile & Settings" intro="What the tutor believes about your skills, and the evidence behind it. You can correct anything that is wrong." />
      <nav aria-label="Profile sections" className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link key={t.id} href={`/profile?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm", tab === t.id ? "border-accent font-semibold text-accent" : "border-transparent text-ink-2 hover:text-ink")}>{t.label}</Link>
        ))}
      </nav>
      {body}
    </>
  );
}
