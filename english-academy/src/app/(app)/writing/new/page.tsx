import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { NewWritingTask } from "./new-task";

export const metadata = { title: "New writing task" };

export default function NewWritingPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <NewWritingTask />
    </Suspense>
  );
}
