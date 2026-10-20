import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { MindMapView } from "./view";

export const metadata = { title: "Mind Maps" };

export default function MindMapsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <MindMapView />
    </Suspense>
  );
}
