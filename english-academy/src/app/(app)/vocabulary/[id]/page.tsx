import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { EntryEditor } from "./editor";

export const metadata = { title: "Word" };

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<Spinner />}>
      <EntryEditor id={id} />
    </Suspense>
  );
}
