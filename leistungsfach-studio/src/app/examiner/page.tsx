import { EssayForm, type ParentEssay } from "@/components/examiner/EssayForm";
import { PageHeader } from "@/components/ui";
import type { AssessmentMode } from "@/lib/curriculum";
import { getEssay } from "@/server/services/essays";
import { getProfile } from "@/server/services/profile";

export const metadata = { title: "Essay Examiner" };
export const dynamic = "force-dynamic";

export default async function ExaminerPage({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
  const { parent: parentId } = await searchParams;
  const profile = await getProfile();
  let parent: ParentEssay = null;
  if (parentId) {
    try {
      const e = await getEssay(parentId);
      parent = { id: e.id, title: e.title, taskType: e.taskType, operator: e.operator, taskPrompt: e.taskPrompt, sourceText: e.sourceText, rubricText: e.rubricText, essayText: e.essayText };
    } catch { parent = null; }
  }
  return (
    <>
      <PageHeader
        title="Essay Examiner"
        intro="Submit a task, its material and your essay. The examiner assesses it against the task type's criteria, explains every judgement with quotations from your text, and gives a score range with its uncertainty."
      />
      <EssayForm defaultMode={profile.defaultMode as AssessmentMode} parent={parent} />
    </>
  );
}
