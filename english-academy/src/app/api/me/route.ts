import { aiStatus } from "@/server/ai/service";
import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { emailConfigured, pushConfigured } from "@/server/notifications";
import { getSettings } from "@/server/repos/learning";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return {
    user,
    settings: await getSettings(db, user.id),
    ai: aiStatus(),
    push: { configured: pushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY ?? null },
    email: { configured: emailConfigured() },
  };
});
