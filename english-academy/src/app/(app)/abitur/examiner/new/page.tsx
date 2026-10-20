import { DIFFICULTIES, type Difficulty } from "@/domain/examiner/model";
import { NewExam } from "./new-exam";

export const metadata = { title: "New practice exam" };

export default async function NewExamPage({ searchParams }: { searchParams: Promise<{ difficulty?: string }> }) {
  const { difficulty } = await searchParams;
  return <NewExam initialDifficulty={DIFFICULTIES.includes(difficulty as Difficulty) ? (difficulty as Difficulty) : "realistic"} />;
}
