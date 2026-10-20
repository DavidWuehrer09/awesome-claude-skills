"use client";

/**
 * Offline-first review queue (IndexedDB). Every answer is written here first,
 * then flushed to /api/learn/reviews in batches. Events carry client ids so
 * resubmission is harmless; acknowledged events are removed, events that the
 * server rejected permanently are kept in a "failed" list for visibility.
 */
import { api } from "./api";

const DB_NAME = "academy-offline";
const STORE = "reviews";
const KV = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "clientEventId" });
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export type QueuedReview = Record<string, unknown> & { clientEventId: string; reviewedAt: string };

export async function enqueueReview(ev: QueuedReview) {
  await tx(STORE, "readwrite", (s) => s.put({ ...ev, _status: "pending" }));
  notify();
}

export async function pendingReviews(): Promise<(QueuedReview & { _status: string })[]> {
  return ((await tx(STORE, "readonly", (s) => s.getAll())) as (QueuedReview & { _status: string })[]) ?? [];
}

export async function removeReview(id: string) {
  await tx(STORE, "readwrite", (s) => s.delete(id));
  notify();
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await tx(KV, "readonly", (s) => s.get(key))) as T | undefined;
}
export async function kvSet(key: string, value: unknown) {
  await tx(KV, "readwrite", (s) => s.put(value, key));
}

type FlushResult = { sent: number; failed: number; offline: boolean };
let flushing: Promise<FlushResult> | null = null;

export function flushReviews(): Promise<FlushResult> {
  flushing ??= (async () => {
    try {
      const all = (await pendingReviews()).filter((e) => e._status === "pending");
      if (!all.length) return { sent: 0, failed: 0, offline: false };
      let sent = 0;
      let failed = 0;
      for (let i = 0; i < all.length; i += 100) {
        const batch = all.slice(i, i + 100).map(({ _status, ...ev }) => { void _status; return ev; });
        const { results } = await api<{ results: { clientEventId: string; error?: string; retry?: boolean }[] }>("/api/learn/reviews", { method: "POST", json: { events: batch } });
        for (const r of results) {
          if (!r.error) {
            await removeReview(r.clientEventId);
            sent++;
          } else if (!r.retry) {
            await tx(STORE, "readwrite", (s) => s.put({ ...all.find((e) => e.clientEventId === r.clientEventId)!, _status: "failed", _error: r.error }));
            failed++;
          }
        }
      }
      return { sent, failed, offline: false };
    } catch {
      return { sent: 0, failed: 0, offline: true };
    } finally {
      flushing = null;
      notify();
    }
  })();
  return flushing;
}

const listeners = new Set<() => void>();
export function onQueueChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => fn());
}

export function newEventId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
