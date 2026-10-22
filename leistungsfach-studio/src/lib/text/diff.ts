// Word-level diff used by the Revision Studio. Pure and deterministic.
export type DiffOp =
  | { type: "retained"; text: string }
  | { type: "removed"; text: string }
  | { type: "added"; text: string }
  | { type: "modified"; from: string; to: string };

export function tokenize(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

/** LCS-based word diff; adjacent removal+addition runs are merged into "modified". */
export function diffWords(original: string, revised: string): DiffOp[] {
  const a = tokenize(original);
  const b = tokenize(revised);
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  type Raw = { type: "retained" | "removed" | "added"; word: string };
  const raw: Raw[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { raw.push({ type: "retained", word: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { raw.push({ type: "removed", word: a[i] }); i++; }
    else { raw.push({ type: "added", word: b[j] }); j++; }
  }
  while (i < n) raw.push({ type: "removed", word: a[i++] });
  while (j < m) raw.push({ type: "added", word: b[j++] });

  // Group into runs, then merge removed/added runs that sit between the same retained words.
  const ops: DiffOp[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].type === "retained") {
      const words: string[] = [];
      while (k < raw.length && raw[k].type === "retained") words.push(raw[k++].word);
      ops.push({ type: "retained", text: words.join(" ") });
      continue;
    }
    const removed: string[] = [], added: string[] = [];
    while (k < raw.length && raw[k].type !== "retained") {
      (raw[k].type === "removed" ? removed : added).push(raw[k].word);
      k++;
    }
    if (removed.length && added.length) ops.push({ type: "modified", from: removed.join(" "), to: added.join(" ") });
    else if (removed.length) ops.push({ type: "removed", text: removed.join(" ") });
    else ops.push({ type: "added", text: added.join(" ") });
  }
  return ops;
}

export function diffStats(ops: DiffOp[]) {
  const count = (s: string) => tokenize(s).length;
  const stats = { retained: 0, modified: 0, added: 0, removed: 0 };
  for (const op of ops) {
    if (op.type === "modified") stats.modified += count(op.to);
    else stats[op.type] += count(op.text);
  }
  return stats;
}
