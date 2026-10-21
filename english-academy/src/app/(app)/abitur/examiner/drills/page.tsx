import { Drills } from "./drills";

export const metadata = { title: "Practice drills" };

export default async function DrillsPage({ searchParams }: { searchParams: Promise<{ skill?: string }> }) {
  const { skill } = await searchParams;
  return <Drills skill={skill ?? null} />;
}
