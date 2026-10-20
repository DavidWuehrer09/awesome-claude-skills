import { ExaminerHome, type Tab } from "./home";

export const metadata = { title: "My English Examiner" };

const TABS: Tab[] = ["overview", "materials", "profile", "exams", "weaknesses"];

export default async function ExaminerPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <ExaminerHome initialTab={TABS.includes(tab as Tab) ? (tab as Tab) : "overview"} />;
}
