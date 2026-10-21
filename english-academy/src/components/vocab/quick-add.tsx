"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { TopicSelect, type TopicNode } from "./topic-select";

/** Event other pages dispatch to open the global quick-add (optionally with a prefilled word). */
export const QUICK_ADD_EVENT = "academy:quick-add";

export function openQuickAdd(headword = "") {
  window.dispatchEvent(new CustomEvent(QUICK_ADD_EVENT, { detail: { headword } }));
}

export function QuickAdd({ open, onClose, topics, defaultTopic, initialHeadword = "", onCreated }: {
  open: boolean; onClose: () => void; topics: TopicNode[]; defaultTopic?: string; initialHeadword?: string; onCreated: (id: string) => void;
}) {
  const [headword, setHeadword] = useState(initialHeadword);
  const [meaning, setMeaning] = useState("");
  const [topicId, setTopicId] = useState(defaultTopic ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const save = async () => {
    if (!headword.trim()) return setError("Enter a word or expression");
    setBusy(true);
    setError(null);
    try {
      const isGerman = /[äöüß]|\b(der|die|das|etw|jdn)\b/i.test(meaning);
      const { entry } = await api<{ entry: { id: string } }>("/api/vocab", {
        method: "POST",
        json: { headword: headword.trim(), ...(meaning.trim() ? (isGerman ? { translationDe: meaning.trim() } : { definitionEn: meaning.trim() }) : {}), topicIds: topicId ? [topicId] : [] },
      });
      setHeadword("");
      setMeaning("");
      onCreated(entry.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.details as { entryId?: string })?.entryId) {
        setError(`${e.message}.`);
        router.prefetch(`/vocabulary/${(e.details as { entryId: string }).entryId}`);
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add a word or expression"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Add</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label="Word, phrase, idiom or collocation" htmlFor="qa-head" error={error}>
          <Input id="qa-head" value={headword} onChange={(e) => setHeadword(e.target.value)} placeholder="e.g. to shed light on" autoFocus />
        </Field>
        <Field label="Meaning (optional)" htmlFor="qa-mean" hint="German translation or English definition. You can enrich the rest afterwards.">
          <Input id="qa-mean" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="e.g. Licht in etw. bringen" />
        </Field>
        <Field label="Topic" htmlFor="qa-topic">
          <TopicSelect id="qa-topic" topics={topics} value={topicId} onChange={setTopicId} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Quick-add available from every page: opened by the shell button or by `openQuickAdd()`. */
export function GlobalQuickAdd() {
  const router = useRouter();
  const [state, setState] = useState<{ open: boolean; headword: string; n: number }>({ open: false, headword: "", n: 0 });
  const [topics, setTopics] = useState<TopicNode[]>([]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const headword = (e as CustomEvent<{ headword?: string }>).detail?.headword ?? "";
      setState((s) => ({ open: true, headword, n: s.n + 1 }));
      api<{ topics: TopicNode[] }>("/api/topics").then((r) => setTopics(r.topics)).catch(() => {});
    };
    window.addEventListener(QUICK_ADD_EVENT, onOpen);
    return () => window.removeEventListener(QUICK_ADD_EVENT, onOpen);
  }, []);

  // Mounted only while open, so pages with their own quick-add never see a second form.
  if (!state.open) return null;
  return (
    <QuickAdd key={state.n} open={state.open} initialHeadword={state.headword} topics={topics}
      onClose={() => setState((s) => ({ ...s, open: false }))}
      onCreated={(id) => { setState((s) => ({ ...s, open: false })); router.push(`/vocabulary/${id}?new=1`); }} />
  );
}
