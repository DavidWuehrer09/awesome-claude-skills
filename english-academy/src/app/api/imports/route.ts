import { z } from "zod";
import { runFeature } from "@/server/ai/service";
import { ctx } from "@/server/ctx";
import { extractFile, MAX_UPLOAD_BYTES } from "@/server/files";
import { badRequest, HttpError, parseJson, route } from "@/server/http";
import { createImportJob, recentImports, saveCandidates } from "@/server/repos/imports";
import type { ParsedCandidate } from "@/domain/vocab/parse";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return { imports: await recentImports(db, user.id) };
});

const pasteSchema = z.object({ text: z.string().min(1).max(200_000), useAI: z.boolean().default(false) });

/** Accepts JSON {text} for pasted lists or multipart form-data with a `file`. */
export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 100_000) throw new HttpError(413, "File too large (max 10 MB)", "too_large");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("No file uploaded");
    const useAI = form.get("useAI") === "true";
    const extracted = await extractFile(new Uint8Array(await file.arrayBuffer()), file.name);
    if (extracted.kind === "text") {
      if (useAI) return aiImport(db, user.id, { text: extracted.text }, file.name, "file", extracted.notes);
      return { job: await createImportJob(db, user.id, { text: extracted.text, sourceKind: "file", filename: file.name, extraNotes: extracted.notes }) };
    }
    // Images and scanned PDFs need OCR. We use a vision-capable AI model; nothing is guessed without it.
    const input = extracted.kind === "image" ? { images: [{ mediaType: extracted.mediaType, base64: extracted.base64 }] } : { pdfBase64: extracted.base64 };
    return aiImport(db, user.id, input, file.name, "image", extracted.notes);
  }
  const body = await parseJson(req, pasteSchema, 400_000);
  if (body.useAI) return aiImport(db, user.id, { text: body.text }, undefined, "paste", []);
  return { job: await createImportJob(db, user.id, { text: body.text, sourceKind: "paste" }) };
});

async function aiImport(
  db: Awaited<ReturnType<typeof ctx>>["db"], userId: string,
  input: { text?: string; images?: { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string }[]; pdfBase64?: string },
  filename: string | undefined, sourceKind: "file" | "image" | "paste", notes: string[],
) {
  const { data, meta } = await runFeature(db, userId, "parseList", input);
  const parsed: ParsedCandidate[] = data.entries.map((e) => ({
    headword: e.headword, translationDe: e.translationDe ?? undefined, definitionEn: e.definitionEn ?? undefined, example: e.example ?? undefined,
    partOfSpeech: e.partOfSpeech ?? undefined, heading: e.heading ?? undefined, uncertain: e.uncertain, raw: e.headword,
  }));
  const job = await saveCandidates(db, userId, parsed, {
    sourceKind, filename, format: meta.demo ? "demo" : "ai",
    notes: [...notes, ...data.notes, ...data.unreadable.map((u) => `Unreadable: ${u}`), `Parsed with ${meta.demo ? "demo rules" : `AI (${meta.model})`}; check every entry.`],
    uncertainAll: sourceKind === "image" ? "Read from an image: compare with the original" : undefined,
  });
  return { job };
}
