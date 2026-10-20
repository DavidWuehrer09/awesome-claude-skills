import { SubmissionReport } from "./report";

export const metadata = { title: "Feedback" };

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubmissionReport id={id} />;
}
