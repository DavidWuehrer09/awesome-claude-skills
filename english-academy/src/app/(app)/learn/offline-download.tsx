"use client";

import { useState } from "react";
import { Button, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { kvSet } from "@/lib/offline";

export function OfflineDownload() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const built = await api<{ cards: unknown[] }>("/api/learn/session", { method: "POST", json: { mode: "mixed", minutes: 30 } });
      await kvSet("last-session", { at: Date.now(), built });
      toast({ tone: "sage", text: `${built.cards.length} cards saved for offline study` });
    } catch (e) {
      toast({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return <Button onClick={download} loading={busy}>Download 30-minute session</Button>;
}
