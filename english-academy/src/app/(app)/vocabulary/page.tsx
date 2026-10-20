import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { VocabularyBrowser } from "./browser";

export const metadata = { title: "My Vocabulary" };

export default function VocabularyPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <VocabularyBrowser />
    </Suspense>
  );
}
