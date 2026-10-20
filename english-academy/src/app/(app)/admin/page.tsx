import { redirect } from "next/navigation";
import { isAdmin, requireUser } from "@/server/auth";
import { AdminUsage } from "./usage";

export const metadata = { title: "Usage & costs" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/home");
  return <AdminUsage />;
}
