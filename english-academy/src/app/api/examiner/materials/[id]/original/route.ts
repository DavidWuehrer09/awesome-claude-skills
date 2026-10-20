import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { getMaterialOriginal } from "@/server/repos/examiner";

const INLINE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]);

/** The uploaded file as stored. Served with a sandbox CSP so it can never run script in the app's origin. */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  const m = await getMaterialOriginal(db, user.id, id);
  const type = INLINE.has(m.mediaType) ? m.mediaType : "application/octet-stream";
  const name = m.filename.replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(m.original!), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${type === "application/octet-stream" ? "attachment" : "inline"}; filename="${name}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
