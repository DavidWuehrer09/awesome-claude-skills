import { VocabularyManager, type VocabEntry } from "@/components/vocab/VocabularyManager";
import { PageHeader } from "@/components/ui";
import { listVocab } from "@/server/services/vocab";

export const metadata = { title: "Vocabulary" };
export const dynamic = "force-dynamic";

export default async function VocabularyPage() {
  const rows = await listVocab();
  const initial = JSON.parse(JSON.stringify(rows)) as VocabEntry[];
  return (
    <>
      <PageHeader title="Vocabulary & expression" intro="Your personal bank of precise, natural expressions — with collocations, register and pitfalls. Practise by recalling them and, more importantly, by using them in sentences of your own." />
      <VocabularyManager initial={initial} />
    </>
  );
}
