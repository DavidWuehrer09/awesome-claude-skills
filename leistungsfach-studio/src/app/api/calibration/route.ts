import { computeCalibration } from "@/server/services/calibration";
import { ok, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async () => ok(await computeCalibration()));
