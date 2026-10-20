"use client";

import clsx from "clsx";
import { MessageSquarePlus, Paperclip, Send, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Badge, Button, Dialog, Input, Notice, PageHeader, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type Conversation = { id: string; title: string; updatedAt: string; attachedEntryIds: string[] };
type Message = { id: string; role: "user" | "assistant"; content: string; isDemo: boolean };
type Entry = { id: string; headword: string; translationDe?: string | null; definitionEn?: string | null };

const ACTIONS: { label: string; prompt: (w: string) => string }[] = [
  { label: "Explain the nuance", prompt: (w) => `Explain the nuance of ${w}: meaning, register, typical contexts, and how it differs from close alternatives.` },
  { label: "Give me a C1 example", prompt: (w) => `Give me three increasingly sophisticated but natural example sentences with ${w}, and explain what makes each one work.` },
  { label: "Test me", prompt: (w) => `Test me on ${w}. Ask one question at a time and wait for my answer before giving feedback.` },
  { label: "Compare alternatives", prompt: (w) => `Compare ${w} with the words learners often confuse it with. When is each the best choice?` },
  { label: "Use this in an essay", prompt: (w) => `Show me how to use ${w} naturally in a formal commentary or literary analysis. Then give me a one-sentence writing challenge.` },
];

export function Tutor() {
  const params = useSearchParams();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(params.get("c"));
  const [messages, setMessages] = useState<Message[]>([]);
  const [attached, setAttached] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const bootstrapped = useRef(false);

  const loadList = useCallback(async () => {
    const r = await api<{ conversations: Conversation[] }>("/api/tutor");
    setConversations(r.conversations);
    return r.conversations;
  }, []);

  const open = useCallback(async (id: string) => {
    setActiveId(id);
    const r = await api<{ messages: Message[]; attached: Entry[] }>(`/api/tutor/${id}`);
    setMessages(r.messages);
    setAttached(r.attached);
    setDemo(r.messages.some((m) => m.isDemo));
  }, []);

  const send = useCallback(async (text: string, convId?: string) => {
    const id = convId ?? activeId;
    if (!id || !text.trim() || streaming) return;
    setError(null);
    setStreaming(true);
    setInput("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: text, isDemo: false }, { id: "streaming", role: "assistant", content: "", isDemo: false }]);
    try {
      const res = await fetch(`/api/tutor/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }) });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "The tutor is unavailable." }));
        throw new Error(err.error);
      }
      const isDemo = res.headers.get("X-Tutor-Demo") === "true";
      setDemo(isDemo);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === "streaming" ? { ...x, content: acc, isDemo } : x)));
      }
      await open(id);
      void loadList();
    } catch (e) {
      setError(errorMessage(e));
      setMessages((m) => m.filter((x) => x.id !== "streaming"));
    } finally {
      setStreaming(false);
    }
  }, [activeId, streaming, open, loadList]);

  const newConversation = useCallback(async (attachIds: string[] = []) => {
    const r = await api<{ conversation: Conversation }>("/api/tutor", { method: "POST", json: { attachedEntryIds: attachIds } });
    await loadList();
    await open(r.conversation.id);
    return r.conversation.id;
  }, [loadList, open]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        const list = await loadList();
        const attach = params.get("attach");
        const ask = params.get("ask");
        if (attach || ask) {
          const id = await newConversation(attach ? [attach] : []);
          router.replace(`/tutor?c=${id}`);
          if (ask) await send(ask, id);
        } else if (activeId) await open(activeId);
        else if (list[0]) await open(list[0].id);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [loadList, newConversation, open, params, router, send, activeId]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages]);

  useEffect(() => {
    if (!pickOpen) return;
    const t = setTimeout(() => {
      api<{ items: Entry[] }>(`/api/vocab?limit=30${search ? `&q=${encodeURIComponent(search)}` : "&list=recent"}`).then((r) => setResults(r.items)).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [search, pickOpen]);

  const setAttachments = async (ids: string[]) => {
    if (!activeId) return;
    await api(`/api/tutor/${activeId}`, { method: "PATCH", json: { attachedEntryIds: ids } });
    await open(activeId);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    await api(`/api/tutor/${id}`, { method: "DELETE" });
    const list = await loadList();
    if (id === activeId) {
      setMessages([]);
      setActiveId(null);
      if (list[0]) await open(list[0].id);
    }
  };

  const wordsLabel = attached.length ? attached.map((a) => `“${a.headword}”`).join(", ") : null;

  return (
    <>
      <PageHeader title="AI Tutor" subtitle="Ask about meaning, nuance, collocations, register or your own sentences. The tutor guides you to the answer rather than just handing it over."
        actions={<Button variant="primary" onClick={() => newConversation()}><MessageSquarePlus className="size-4" aria-hidden /> New conversation</Button>} />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id} className="group flex items-center">
                <button type="button" onClick={() => { void open(c.id); router.replace(`/tutor?c=${c.id}`); }}
                  className={clsx("min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm", c.id === activeId ? "bg-navy/10 font-medium text-navy" : "text-ink-2 hover:bg-surface-2")}>{c.title}</button>
                <button type="button" onClick={() => remove(c.id)} className="rounded p-1 text-ink-3 opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${c.title}`}><Trash2 className="size-4" /></button>
              </li>
            ))}
            {!conversations.length && <li className="px-3 text-sm text-ink-3">No conversations yet.</li>}
          </ul>
        </aside>

        <section className="flex min-h-[60vh] flex-col rounded-xl border border-line bg-surface" aria-label="Conversation">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
            <select aria-label="Conversation" className="max-w-[60%] rounded-md border border-line bg-surface px-2 py-1 text-sm lg:hidden" value={activeId ?? ""} onChange={(e) => e.target.value && open(e.target.value)}>
              {conversations.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            {attached.map((a) => (
              <Badge key={a.id} tone="navy">{a.headword}<button type="button" aria-label={`Detach ${a.headword}`} onClick={() => setAttachments(attached.filter((x) => x.id !== a.id).map((x) => x.id))}><X className="size-3" /></button></Badge>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setPickOpen(true)} disabled={!activeId}><Paperclip className="size-4" aria-hidden /> Attach words</Button>
            {demo && <Badge tone="warn">demo mode: answers only from your saved data</Badge>}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {!activeId && <p className="text-ink-3">Start a new conversation or pick one.</p>}
            {activeId && !messages.length && (
              <div className="text-sm text-ink-3">
                <p>Try: “What is the difference between subtle, nuanced and implicit?” or “Is <em>exacerbate</em> too formal for a commentary?”</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={clsx("max-w-[92%] rounded-2xl px-4 py-3", m.role === "user" ? "ml-auto bg-navy text-navy-ink" : "bg-surface-2 text-ink")}>
                {m.role === "assistant" ? (m.content ? <Markdown text={m.content} /> : <Spinner label="Thinking" />) : <p className="whitespace-pre-wrap">{m.content}</p>}
              </div>
            ))}
            {error && <Notice tone="danger">{error}</Notice>}
            <div ref={bottom} />
          </div>

          {activeId && (
            <div className="border-t border-line p-3">
              <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
                {ACTIONS.map((a) => (
                  <button key={a.label} type="button" disabled={streaming || !wordsLabel} onClick={() => wordsLabel && send(a.prompt(wordsLabel))}
                    title={wordsLabel ? undefined : "Attach a word first"}
                    className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:border-navy disabled:opacity-40">{a.label}</button>
                ))}
              </div>
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
                <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} aria-label="Message"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
                  placeholder="Ask anything about English usage…" className="min-h-[44px] flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3 py-2 outline-none focus:border-navy" />
                <Button type="submit" variant="primary" loading={streaming} disabled={!input.trim()} aria-label="Send"><Send className="size-4" /></Button>
              </form>
            </div>
          )}
        </section>
      </div>

      <Dialog open={pickOpen} onClose={() => setPickOpen(false)} title="Attach words from your vocabulary">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label="Search words" autoFocus />
        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
          {results.map((r) => {
            const on = attached.some((a) => a.id === r.id);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => setAttachments(on ? attached.filter((a) => a.id !== r.id).map((a) => a.id) : [...attached.map((a) => a.id), r.id])}
                  className={clsx("flex w-full justify-between rounded-lg px-3 py-2 text-left", on ? "bg-navy/10 text-navy" : "hover:bg-surface-2")}>
                  <span>{r.headword}</span><span className="text-sm text-ink-3">{r.translationDe ?? r.definitionEn ?? ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
