"use client";

import { ArrowLeft, Check, ScanText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DocTypeBadge, formatBytes, type MaterialRow, STATUS_LABEL } from "@/components/examiner/shared";
import { Badge, Button, Card, Field, Input, Notice, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { DOC_TYPE_LABEL, DOC_TYPES, type DocType } from "@/domain/examiner/model";
import { api, errorMessage } from "@/lib/api";

type Material = Omit<MaterialRow, "snippets" | "duplicateOf" | "chars"> & { text: string; originalText: string; textHistory: { version: number; at: string; note: string }[] };

export function MaterialReview({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [m, setM] = useState<Material | null>(null);
  const [text, setText] = useState("");
  const [docType, setDocType] = useState<DocType | "">("");
  const [labels, setLabels] = useState({ title: "", topic: "", examType: "", yearLevel: "", date: "", importance: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((x: Material) => {
    setM(x);
    setText(x.text);
    setDocType(x.docType ?? "");
    setLabels({ title: x.labels.title ?? "", topic: x.labels.topic.join(", "), examType: x.labels.examType ?? "", yearLevel: x.labels.yearLevel ?? "", date: x.labels.date ?? "", importance: x.labels.importance ?? "" });
  }, []);
  useEffect(() => {
    api<{ material: Material }>(`/api/examiner/materials/${id}`).then((r) => apply(r.material)).catch((e) => setError(errorMessage(e)));
  }, [id, apply]);

  const patch = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const r = await api<{ material: Material }>(`/api/examiner/materials/${id}`, { method: "PATCH", json: body });
      apply(r.material);
      toast({ tone: "sage", text: "Saved" });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const transcribe = async () => {
    setBusy("ocr");
    setError(null);
    try {
      apply((await api<{ material: Material }>(`/api/examiner/materials/${id}/transcribe`, { method: "POST" })).material);
      toast({ tone: "sage", text: "Transcribed. Compare it line by line with the original." });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!confirm("Delete this document? Profile entries that cite it will be marked as unsupported.")) return;
    await api(`/api/examiner/materials/${id}`, { method: "DELETE" });
    router.push("/abitur/examiner?tab=materials");
  };

  if (error && !m) return <Notice tone="danger">{error}</Notice>;
  if (!m) return <Spinner />;
  const isImage = m.mediaType.startsWith("image/");
  const isPdf = m.mediaType === "application/pdf";
  const dirty = text !== m.text;
  return (
    <>
      <Link href="/abitur/examiner?tab=materials" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="size-4" aria-hidden /> My Materials</Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-2xl">{m.labels.title || m.filename}</h1>
        <DocTypeBadge m={m} />
        <Badge tone={m.extractionStatus === "reviewed" ? "sage" : "warn"}>{STATUS_LABEL[m.extractionStatus]}</Badge>
        {m.usable && <Badge tone="sage">usable as evidence</Badge>}
      </div>
      {!m.usable && <div className="mb-4"><Notice tone="warn">Before this document is used for your profile, exams or grading: confirm its type and check the text below against the original.</Notice></div>}
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {(isImage || isPdf) && (
            <Card>
              <div className="flex items-center gap-2">
                <h2 className="flex-1 text-base font-semibold">Original</h2>
                <a className="text-sm underline" href={`/api/examiner/materials/${id}/original`} target="_blank" rel="noreferrer">Open</a>
              </div>
              {isImage && (
                // eslint-disable-next-line @next/next/no-img-element -- private, same-origin file; next/image optimisation does not apply
                <img src={`/api/examiner/materials/${id}/original`} alt={`Original of ${m.filename}`} className="mt-2 max-h-[32rem] w-full rounded-lg border border-line object-contain" />
              )}
              {(m.extractionStatus === "needs_transcription" || isImage || m.extractionMethod === "scanned_pdf") && (
                <div className="mt-3">
                  <Button onClick={transcribe} loading={busy === "ocr"}><ScanText className="size-4" aria-hidden /> Transcribe with AI</Button>
                  <p className="mt-1 text-xs text-ink-3">Needs an AI provider. Unreadable passages are marked, never guessed.</p>
                </div>
              )}
            </Card>
          )}
          <Card>
            <h2 className="text-base font-semibold">Extracted text</h2>
            <p className="mt-1 text-sm text-ink-2">Correct anything that was read wrongly. Saving your correction marks the text as reviewed; earlier versions are kept.</p>
            {m.extractionNotes.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-ink-3">{m.extractionNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            <Textarea aria-label="Extracted text" className="mt-3 min-h-[24rem] font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" disabled={!dirty} loading={busy === "text"} onClick={() => patch({ text, note: "your correction" }, "text")}>Save correction</Button>
              {m.extractionStatus !== "reviewed" && !dirty && m.text.trim() && (
                <Button loading={busy === "rev"} onClick={() => patch({ reviewed: true }, "rev")}><Check className="size-4" aria-hidden /> The text is correct</Button>
              )}
              {dirty && <Button variant="ghost" onClick={() => setText(m.text)}>Undo changes</Button>}
            </div>
            {m.textHistory.length > 0 && <p className="mt-2 text-xs text-ink-3">{m.textHistory.length} earlier version{m.textHistory.length === 1 ? "" : "s"} kept ({m.textHistory.map((h) => h.note).join(", ")}).</p>}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-semibold">What is this document?</h2>
            <p className="mt-1 text-sm text-ink-2">Suggested: {DOC_TYPE_LABEL[m.guess]} ({m.guessConfidence} confidence).</p>
            <Select aria-label="Document type" className="mt-2" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
              <option value="" disabled>Choose…</option>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
            </Select>
            <Button className="mt-2" size="sm" disabled={!docType || docType === m.docType} loading={busy === "type"} onClick={() => patch({ docType }, "type")}>Confirm type</Button>
          </Card>
          <Card>
            <h2 className="text-base font-semibold">Labels</h2>
            <div className="mt-2 space-y-2">
              <Field label="Title" htmlFor="l-t"><Input id="l-t" value={labels.title} onChange={(e) => setLabels({ ...labels, title: e.target.value })} /></Field>
              <Field label="Topics" htmlFor="l-top" hint="Comma-separated"><Input id="l-top" value={labels.topic} onChange={(e) => setLabels({ ...labels, topic: e.target.value })} /></Field>
              <Field label="Exam type" htmlFor="l-e"><Input id="l-e" value={labels.examType} onChange={(e) => setLabels({ ...labels, examType: e.target.value })} placeholder="Schulaufgabe, Klausur…" /></Field>
              <Field label="Year level" htmlFor="l-y"><Input id="l-y" value={labels.yearLevel} onChange={(e) => setLabels({ ...labels, yearLevel: e.target.value })} /></Field>
              <Field label="Importance" htmlFor="l-i">
                <Select id="l-i" value={labels.importance} onChange={(e) => setLabels({ ...labels, importance: e.target.value })}>
                  <option value="">Normal</option><option value="essential">Essential</option><option value="high">High</option><option value="low">Low</option>
                </Select>
              </Field>
              <Field label="Date" htmlFor="l-d"><Input id="l-d" type="date" value={labels.date} onChange={(e) => setLabels({ ...labels, date: e.target.value })} /></Field>
              <Button size="sm" loading={busy === "labels"} onClick={() => patch({ labels: { title: labels.title, topic: labels.topic.split(",").map((s) => s.trim()).filter(Boolean), examType: labels.examType, yearLevel: labels.yearLevel, date: labels.date, importance: labels.importance || "normal" } }, "labels")}>Save labels</Button>
            </div>
          </Card>
          <Card>
            <p className="text-xs text-ink-3">{m.filename} · {formatBytes(m.bytes)} · uploaded {new Date(m.createdAt).toLocaleDateString()}</p>
            <Button className="mt-2" variant="danger" size="sm" onClick={remove}><Trash2 className="size-4" aria-hidden /> Delete document</Button>
          </Card>
        </div>
      </div>
    </>
  );
}
