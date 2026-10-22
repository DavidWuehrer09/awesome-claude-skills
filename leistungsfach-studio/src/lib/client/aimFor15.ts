import { api } from "./api";

/** One-click "Aim for 15": strict assessment, then a full 15-point revision with coaching. */
export async function aimFor15(essayId: string, onStep?: (step: "assessing" | "revising") => void): Promise<string> {
  onStep?.("assessing");
  await api(`/api/essays/${essayId}/assess`, { body: { mode: "strict" } });
  onStep?.("revising");
  const rev = await api<{ id: string }>(`/api/essays/${essayId}/revisions`, { body: { depth: "exemplary" } });
  return rev.id;
}
