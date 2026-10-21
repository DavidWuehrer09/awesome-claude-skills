import { z } from "zod";
import { AIError, streamTutor } from "@/server/ai/service";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { addMessage, demoTutorReply, getConversation, tutorContext } from "@/server/repos/tutor";

export const maxDuration = 120;

/** Streams the tutor's reply as plain text. The learner's message is saved before the AI call. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  const { content } = await parseJson(req, z.object({ content: z.string().trim().min(1).max(6000) }));
  const { conversation, messages, attached } = await getConversation(db, user.id, id);
  await addMessage(db, user.id, id, "user", content);
  const history = [...messages.slice(-20).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), { role: "user" as const, content }];
  const system = await tutorContext(db, user.id, attached, conversation.topicId);
  const demoText = await demoTutorReply(db, user.id, content, attached);
  const stream = await streamTutor(db, user.id, system, history, () => demoText);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of stream.chunks()) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        await addMessage(db, user.id, id, "assistant", full, stream.demo);
      } catch (e) {
        const msg = e instanceof AIError ? e.message : "The tutor is unavailable right now.";
        if (full) await addMessage(db, user.id, id, "assistant", `${full}\n\n[interrupted: ${msg}]`, stream.demo);
        controller.enqueue(encoder.encode(`\n\n⚠️ ${msg}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Tutor-Demo": String(stream.demo) } });
});
