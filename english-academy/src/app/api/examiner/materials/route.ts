import { z } from "zod";
import { DOC_TYPES } from "@/domain/examiner/model";
import { ctx } from "@/server/ctx";
import { MAX_UPLOAD_BYTES } from "@/server/files";
import { badRequest, HttpError, route } from "@/server/http";
import { labelsSchema, listMaterials, materialFilterSchema, uploadMaterials } from "@/server/repos/examiner";

export const GET = route(async (req) => {
  const { user, db } = await ctx();
  const q = Object.fromEntries(req.nextUrl.searchParams);
  const filter = materialFilterSchema.safeParse(Object.fromEntries(Object.entries(q).filter(([, v]) => v)));
  if (!filter.success) throw badRequest("Invalid filter");
  return { materials: await listMaterials(db, user.id, filter.data) };
});

/** multipart/form-data: one or more `files`, optional `docType` and `labels` (JSON). */
export const POST = route(async (req) => {
  const { user, db } = await ctx();
  if (Number(req.headers.get("content-length") ?? 0) > 10 * MAX_UPLOAD_BYTES + 200_000) throw new HttpError(413, "Upload too large", "too_large");
  const form = await req.formData().catch(() => {
    throw badRequest("Expected a file upload");
  });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const docType = z.enum(DOC_TYPES).nullable().catch(null).parse(form.get("docType"));
  let labels = {};
  const raw = form.get("labels");
  if (typeof raw === "string" && raw) {
    try {
      labels = labelsSchema.parse(JSON.parse(raw));
    } catch {
      throw badRequest("Invalid labels");
    }
  }
  const prepared = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  return { materials: await uploadMaterials(db, user.id, prepared, { labels, docType }) };
});
