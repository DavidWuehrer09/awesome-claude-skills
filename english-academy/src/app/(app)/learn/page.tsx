import { BookCheck, Download, Layers, Repeat, Shuffle } from "lucide-react";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { RATING_LABELS } from "@/domain/learning/scheduler";
import { requireUser } from "@/server/auth";
import { dashboardCounts } from "@/server/repos/progress";
import { topicTree } from "@/server/repos/vocab";
import { OfflineDownload } from "./offline-download";

export const metadata = { title: "Learn" };
export const dynamic = "force-dynamic";

export default async function LearnPage() {
  const user = await requireUser();
  const db = await getDb();
  const [counts, topics] = await Promise.all([dashboardCounts(db, user.id), topicTree(db, user.id)]);
  return (
    <>
      <PageHeader title="Learn" subtitle="Adaptive sessions decide what to show next: overdue reviews first, then weak spots and new words, interleaved across topics." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <Layers className="size-6 text-navy" aria-hidden />
          <h2 className="mt-2 text-xl">Smart session</h2>
          <p className="mt-1 text-sm text-ink-2">{counts.dueToday} due · {counts.newAvailable} new · about {counts.estimatedMinutes} min. Exercise types get more demanding as words become familiar.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton href="/learn/session?mode=mixed" variant="primary">Start</LinkButton>
            <LinkButton href="/learn/session?mode=mixed&minutes=5">5-minute version</LinkButton>
          </div>
        </Card>
        <Card>
          <Repeat className="size-6 text-navy" aria-hidden />
          <h2 className="mt-2 text-xl">Reviews only</h2>
          <p className="mt-1 text-sm text-ink-2">Just the words that are due, no new ones.</p>
          <div className="mt-4"><LinkButton href="/learn/session?mode=review">Review {counts.dueToday} words</LinkButton></div>
        </Card>
        <Card>
          <Shuffle className="size-6 text-navy" aria-hidden />
          <h2 className="mt-2 text-xl">Focus on a topic</h2>
          <p className="mt-1 text-sm text-ink-2">Due and new words from one topic (including its subtopics).</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {topics.slice(0, 12).map((t) => (
              <li key={t.id}><LinkButton size="sm" href={`/learn/session?mode=focused&topic=${t.id}`}>{t.name}</LinkButton></li>
            ))}
            {!topics.length && <li className="text-sm text-ink-3">No topics yet.</li>}
          </ul>
        </Card>
        <Card>
          <BookCheck className="size-6 text-navy" aria-hidden />
          <h2 className="mt-2 text-xl">Mastery check</h2>
          <p className="mt-1 text-sm text-ink-2">Tests a topic across recognition, spelling, collocations and your own sentences, then shows what is secure.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {topics.slice(0, 8).map((t) => (
              <li key={t.id}><LinkButton size="sm" href={`/learn/session?check=1&topic=${t.id}`}>{t.name}</LinkButton></li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mt-4">
        <h2 className="text-lg">How the ratings work</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(RATING_LABELS).map(([k, v]) => (
            <div key={k}><dt className="font-medium">{v.label}</dt><dd className="text-sm text-ink-2">{v.meaning}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-ink-3">Typed answers are checked objectively. Picking from options or using a hint counts as at most “Hard”, so recognition is never mistaken for recall. Even mastered words return occasionally (at least once a year).</p>
      </Card>
      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg"><Download className="size-4" aria-hidden /> Study offline</h2>
            <p className="text-sm text-ink-2">Prepare a session now to continue on the train or without Wi-Fi. Answers sync automatically when you are back online.</p>
          </div>
          <OfflineDownload />
        </div>
      </Card>
    </>
  );
}
