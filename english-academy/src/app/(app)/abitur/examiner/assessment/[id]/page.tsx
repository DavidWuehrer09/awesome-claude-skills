import { AssessmentReport } from "./report";

export const metadata = { title: "Exam feedback" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssessmentReport id={id} />;
}
