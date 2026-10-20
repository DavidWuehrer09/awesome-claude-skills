import { DraftEditor } from "./editor";

export const metadata = { title: "Writing" };

export default async function DraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  return <DraftEditor id={draftId} />;
}
