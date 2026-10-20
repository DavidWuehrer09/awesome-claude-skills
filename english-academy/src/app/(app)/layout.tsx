import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getDb } from "@/db/client";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/repos/learning";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await getSettings(await getDb(), user.id);
  if (!settings.onboarded) redirect("/onboarding");
  return <AppShell user={user}>{children}</AppShell>;
}
