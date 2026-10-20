import { MaterialReview } from "./review";

export const metadata = { title: "Check document" };

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaterialReview id={id} />;
}
