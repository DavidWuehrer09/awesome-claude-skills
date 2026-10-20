import { notFound, redirect } from "next/navigation";
import { PRACTICE_MODES } from "@/domain/learning/modes";
import { GeneratedPractice } from "./generated";

export default async function ModePage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  const m = PRACTICE_MODES.find((x) => x.slug === mode);
  if (!m) notFound();
  if (!m.ai) redirect(m.href ?? "/practice");
  return <GeneratedPractice mode={m} />;
}
