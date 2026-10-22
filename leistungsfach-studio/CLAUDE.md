# Leistungsfach Training Studio — development guide

A personal English tutor web app for one student in the Bavarian Gymnasium English Leistungsfach (eA, Years 12/13, Abitur). Next.js 16 + TypeScript, PostgreSQL (PGlite locally) via Drizzle, Claude API server-side.

@AGENTS.md

## Rule hierarchy

1. **This file** — project-wide rules (below). Short on purpose.
2. **`.claude/skills/bavarian-english-leistungsfach`** — the canonical curriculum: provenance labels, requirements, task types, dimensions, bands, modes, teaching principles. All other Skills defer to it.
3. **Feature Skills** — `essay-assessment`, `essay-revision`, `learner-modelling`, `adaptive-tutoring`, `progress-evaluation`. Each owns one subsystem; they reference the foundation instead of repeating it.
4. **Runtime instructions** — `src/lib/curriculum/*` and `src/lib/ai/prompts/*`. These are what the deployed app uses; Skills are development-time only. The app must never depend on Claude Code or read `.claude/`.

## Non-negotiable rules

- **Honesty:** no invented curriculum requirements, grading weights, teacher preferences, quotations, essay history or statistics. Unknown → say so. Keep the provenance label on every curriculum claim.
- **No lost work:** save user input before any AI call; AI results are new rows; failures are recorded (`ai_runs`) and never overwrite or delete earlier data.
- **Evidence-based learner model:** only the student's own production is evidence (see learner-modelling).
- **Secrets:** `ANTHROPIC_API_KEY` only in server code (`src/lib/ai/anthropic.ts`); never in client components, `NEXT_PUBLIC_*`, logs or commits.
- **Validated AI output:** every AI response is parsed, Zod-validated and semantically validated before saving.
- **Accessibility:** colour is never the only signal; keyboard reachable; WCAG AA contrast in both themes.

## Layout

- `src/app` pages and `src/app/api` route handlers (thin: validate → service → JSON)
- `src/server/services` application logic; `src/server/db` schema, client, repositories
- `src/lib/ai` provider, prompts, schemas; `src/lib/curriculum`; `src/lib/learner`; `src/lib/scoring`; `src/lib/text`; `src/lib/progress`
- `src/components` UI. Client components must not import `src/server/*`.

## Commands

```bash
npm run dev            # http://localhost:3000 (PGlite in ./data/pglite)
npm test               # vitest unit + integration
npm run test:e2e       # playwright, mock AI provider, temporary DB
npm run typecheck && npm run lint && npm run build
npm run db:generate    # after editing src/server/db/schema.ts → new SQL migration in drizzle/
npm run skills:check   # validates .claude/skills/*/SKILL.md frontmatter
```

`AI_PROVIDER=mock` runs the app with the deterministic mock provider (tests and demos only; the UI shows a "mock AI" banner and results are flagged `mock`).

## Conventions

- Pure logic in `src/lib/**` with unit tests; services orchestrate; no business logic in route handlers or components.
- Bump `PROMPT_VERSION` in a prompt module when its wording changes.
- New table/column → edit schema, `npm run db:generate`, commit the migration, update `docs/DATABASE.md`.
- Next.js 16: `params`/`searchParams` are Promises; `proxy.ts` replaces middleware; pages that read the DB use `export const dynamic = "force-dynamic"`.
