import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { Tutor } from "./tutor";

export const metadata = { title: "AI Tutor" };

export default function TutorPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Tutor />
    </Suspense>
  );
}
