import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { SessionLoader } from "./loader";

export const metadata = { title: "Study session" };

export default function SessionPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SessionLoader />
    </Suspense>
  );
}
