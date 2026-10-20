import { aiStatus } from "@/server/ai/service";
import { allowanceFor } from "@/server/ai/usage";
import { isAdmin } from "@/server/auth";
import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { emailConfigured, pushConfigured } from "@/server/notifications";
import { getSettings } from "@/server/repos/learning";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return {
    user: { ...user, isAdmin: isAdmin(user) },
    allowance: await allowanceFor(db, user.id),
    settings: await getSettings(db, user.id),
    ai: aiStatus(),
    push: { configured: pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY ?? null },
    email: { configured: emailConfigured() },
  };
});
