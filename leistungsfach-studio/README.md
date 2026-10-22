# Leistungsfach Studio

A personal English tutor for the Bavarian Gymnasium **English Leistungsfach** (erhöhtes Anforderungsniveau, Jahrgangsstufe 12/13, Abitur preparation).

It assesses your essays against the task and the curriculum, explains every judgement with quotations from your own text, shows you an improved version change by change, remembers your recurring mistakes and strengths, and builds targeted practice from them.

> Scores are **estimates with a range**, not official grades and not a prediction of your teacher's mark.

## What it does

| Area | What you can do |
| --- | --- |
| **Dashboard** | Score estimates over time, performance by criterion, improving skills and skills needing attention, recurring errors, exercise and vocabulary statistics, exam simulations, recommended next steps, and an AI progress review that is only allowed to quote your real statistics |
| **Essay Examiner** | Submit the task, operator, source text, your essay and any rubric. Choose *Supportive*, *Teacher standard* or *Strict*. Optional timed exam simulation. You get a 0–15 range with confidence, strengths and weaknesses (major vs. minor) with quotations, a per-criterion breakdown and a prioritised action plan |
| **Aim for 15** | One click on an essay (or "Save and aim for 15" in the Examiner): a strict assessment, then your essay rewritten as a 15-point version, with phrase upgrades (your wording → a sophisticated, natural alternative, which you can save to your vocabulary) and concrete ideas, ordered by impact, for what to improve yourself |
| **Revision Studio** | Original vs. improved version: inline changes, side-by-side view, readable final version. Colours are always labelled: green = kept, yellow = changed, blue = added, red = removed. Every change has a category, an explanation, the principle behind it and how to apply it yourself. Accept or reject each change. Use "Explain this change" for depth |
| **Personal Training** | Your three most valuable priorities, chosen with stated reasons, plus exercises: diagnostic, sentence improvement, device analysis, evidence, paragraph reconstruction, collocations, grammar from your actual errors, timed tasks and transfer tasks. Model answers stay hidden until you have answered. Difficulty adapts, and recurring errors come back for spaced review |
| **Vocabulary** | A searchable bank with meaning, collocations, register, example, pitfalls and source. Practise recall, then use the expression in your own sentence |
| **Essay History** | Every essay with all its assessments, revisions, exercises, teacher feedback and later versions |
| **Learner Profile & Settings** | Skill levels with confidence, trend, status and the evidence behind them (you can remove anything inaccurate), recurring errors, teacher calibration, curriculum sources with evidence labels, settings, data export and full deletion |

## Quick start (on your own computer)

You need **Node.js 20.9 or newer** (from https://nodejs.org, LTS version). Then, in a terminal inside this folder:

```bash
npm install
cp .env.example .env.local      # then open .env.local and paste your API key (see below)
npm run dev
```

Open http://localhost:3000. That's all: the database is created automatically in `./data/pglite`, with no account and no installation, and it survives restarts.

### Getting an Anthropic API key

1. Create an account at https://console.anthropic.com and add a payment method (the API is pay-as-you-go and separate from a Claude.ai subscription).
2. Under **API keys**, create a key and paste it into `.env.local` as `ANTHROPIC_API_KEY=sk-ant-…`.
3. Restart `npm run dev`.

Without a key the app still runs: you can save essays and vocabulary, and a banner explains what is missing. Never share the key or commit `.env.local` (it is git-ignored).

### Expected costs

The app uses `claude-opus-5-5` by default (USD 4 per million input tokens and USD 20 per million output tokens, according to Anthropic's price list at the time of writing; check https://www.anthropic.com/pricing). These are **rough estimates** for a 600–900-word essay with a source text:

| Action | Approximate cost |
| --- | --- |
| Assessment + learner-profile update | USD 0.15–0.40 |
| Revision | USD 0.10–0.30 |
| One exercise (create + evaluate) | USD 0.05–0.12 |
| Vocabulary sentence check | under USD 0.01 |

Heavy use (about 20 essays, 100 exercises and daily vocabulary in a month) comes to roughly **USD 10–25 per month**. To lower costs you can set `CLAUDE_MODEL=claude-sonnet-5-5` in `.env.local` (cheaper; feedback quality may differ). In the Anthropic Console you can set a monthly spending limit. Hosting on your own computer is free.

## Honesty and privacy

- **Curriculum.** Requirements come from the official Bavarian LehrplanPLUS and ISB documents. The build environment could not open those sites, so they are labelled **"official, reported — unverified"** until you paste the passage you read yourself (*Profile → Curriculum sources*). See `docs/CURRICULUM_RESEARCH.md` for every source and claim.
- **Your teacher.** Teacher feedback is kept separate from official rules. The teacher-standard estimate is only calibrated after at least 3 essays carry both your teacher's mark and an estimate.
- **Evidence.** Only your own writing counts as evidence of skill. Reading explanations or accepting AI rewrites never raises a level.
- **No lost work.** Essays and answers are saved before any AI call. AI failures are recorded, and nothing is overwritten.
- **Your data.** Everything is stored in the app's own database. Essay text is sent only to the Anthropic API. You can export everything as JSON and delete everything (*Profile → Data & privacy*).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build && npm start` | Production build and server (`npm start` requires `APP_PASSWORD`, or `ALLOW_NO_PASSWORD=true` for local-only use) |
| `npm test` | Unit and integration tests (Vitest, temporary database, mock AI) |
| `npm run test:e2e` | Builds the app, then runs browser tests (Playwright, mock AI) |
| `npm run typecheck`, `npm run lint` | Static checks |
| `npm run skills:check` | Validates the Claude Code Skills in `.claude/skills/` |
| `npm run db:generate` | Creates a new SQL migration after a schema change |
| `npm run db:migrate` | Applies migrations without starting the app (the app also does this on start) |
| `AI_PROVIDER=mock npm run dev` | Offline demo with a mock tutor (a banner marks all results as not real) |

## More documentation

- `docs/ARCHITECTURE.md`: the design, layers, AI operations and scoring rules
- `docs/CURRICULUM_RESEARCH.md`: the sources, findings and their evidence status
- `docs/DATABASE.md`: the schema
- `docs/DEPLOYMENT.md`: hosting the app so you can use it on your phone
- `CLAUDE.md` and `.claude/skills/`: guidance for developing the app with Claude Code (not used by the running app)
