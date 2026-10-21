import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { SENTENCE_LAB } from "@/domain/writing/library";
import { PracticeMenu } from "./practice-menu";

export const metadata = { title: "Practice" };

export default function PracticePage() {
  return (
    <>
      <PageHeader title="Practice" subtitle="Every mode works on any topic and feeds the same learning history. Modes marked AI generate fresh exercises with the configured provider." />
      <PracticeMenu />
      <h2 className="mt-10 text-xl">Other tools</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          ["/vocabulary?list=difficult", "Difficult-word collection", "Words you marked or keep forgetting."],
          ["/vocabulary?list=favorites", "Personal notebook", "Your favourites, notes and mnemonics."],
          ["/tools?tab=confusables", "Confusable words", "Your near-synonyms side by side, with practice."],
          ["/tools?tab=phrases", "Academic phrase bank", "Phrases for introducing, contrasting, conceding, concluding."],
          ["/writing/new?section=sentence", `Sentence Laboratory (${SENTENCE_LAB.length})`, "Precision, concision and register."],
        ].map(([href, t, d]) => (
          <li key={href}><Link href={href} className="block rounded-xl border border-line bg-surface p-4 hover:border-navy"><span className="font-medium">{t}</span><span className="block text-sm text-ink-2">{d}</span></Link></li>
        ))}
      </ul>
    </>
  );
}
