import { ProfileUpdate, getProfile, updateProfile } from "@/server/services/profile";
import { ok, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async () => ok(await getProfile()));
export const PATCH = route(async (req: Request) => ok(await updateProfile(await readJson(req, ProfileUpdate))));
