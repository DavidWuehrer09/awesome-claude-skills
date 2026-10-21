import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth";
import { toolsData } from "@/server/repos/tools";
import { Tools, type ToolTab } from "./tools";

export const metadata = { title: "Tools" };
export const dynamic = "force-dynamic";

const TABS: ToolTab[] = ["collocations", "phrases", "phrasal", "confusables", "text"];

export default async function ToolsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const user = await requireUser();
  const data = await toolsData(await getDb(), user.id);
  return <Tools data={data} initialTab={TABS.includes(tab as ToolTab) ? (tab as ToolTab) : "collocations"} />;
}
