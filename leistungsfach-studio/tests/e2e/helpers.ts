import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const SOURCE = `[Practice text written for the test suite]
The town council has announced that the youth centre will close next spring. Officials say the decision is purely financial.
"We cannot keep paying for empty rooms," the mayor said (l. 3).`;

export const ESSAY = `The article deals with the planned closure of a youth centre and criticises the council's decision.

The author uses a quotation from the mayor to show his opinion. He also discusses about the consequences for teenagers.

In conclusion, the author uses many stylistic devices to convince the reader that the closure is a mistake.`;

export function tempDb() {
  return mkdtempSync(path.join(tmpdir(), "studio-e2e-extra-"));
}

/** Starts an extra production server (for restart, misconfiguration and auth scenarios). */
export async function startServer(port: number, env: Record<string, string>): Promise<{ url: string; stop: () => Promise<void> }> {
  const child: ChildProcess = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...process.env, LOG_LEVEL: "silent", ...env },
    stdio: "ignore",
    detached: true,
  });
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.status === 200 || r.status === 503) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server on ${port} did not start`);
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    url,
    stop: async () => {
      try { process.kill(-child.pid!, "SIGTERM"); } catch { /* already gone */ }
      await new Promise((r) => setTimeout(r, 1500));
    },
  };
}

export async function createEssayViaApi(baseUrl: string, title = "API essay") {
  const r = await fetch(`${baseUrl}/api/essays`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, taskType: "nonfiction_analysis", operator: "analyse", taskPrompt: "Analyse how the author tries to convince the reader.", sourceText: SOURCE, essayText: ESSAY }),
  });
  if (!r.ok) throw new Error(`create failed ${r.status}`);
  return (await r.json()).data as { id: string };
}
