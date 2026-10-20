import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { aiStatus } from "@/server/ai/service";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/repos/learning";
import { Onboarding } from "./onboarding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = await getSettings(await getDb(), user.id);
  if (settings.onboarded) redirect("/home");
  return <Onboarding name={user.displayName} ai={aiStatus()} />;
}
