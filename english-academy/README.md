# English Academy

A web app for German Gymnasium students who want to master C1/C2 vocabulary and prepare for the Bavarian English Abitur. It's a multi-user web application: anyone can create an account, and **users need no Claude account, Claude Code or AI subscription**. AI runs on the server with the operator's API key, within configurable allowances.

- **Deploying:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Costs** (development vs. hosting, database, email and AI, each listed separately): [docs/COSTS.md](docs/COSTS.md)
- **How the learning engine decides what to study:** [docs/LEARNING-ENGINE.md](docs/LEARNING-ENGINE.md)

## What it does

| Area | Highlights |
|---|---|
| **My Vocabulary** | Import from pasted lists, TXT/CSV/Word/Excel/PDF, or photos (AI transcription). A review step comes before anything is saved. Topics and subtopics, duplicate detection, search, a rich word editor. |
| **Learn** | FSRS spaced repetition (deterministic, one-year cap) with eight separate mastery dimensions. Typed answers distinguish typos, wrong forms, confusables and valid alternatives. Overdue words are never dropped. |
| **Practice** | 16 modes: flashcards, typed recall, cloze, collocations, word families, confusables, error correction, translation, sentence building and more. |
| **Mind Maps** | Topic maps with labelled relations (synonym, contrast, collocation…); the learner's own links; AI link suggestions. |
| **Writing Lab** | Sentence-to-essay tasks; autosave; locked submissions and revisions with a diff; feedback quoting your text, separating errors from style; disputes. |
| **AI Tutor** | Streaming tutor that knows your words and weaknesses (with consent) and guides instead of doing the work. |
| **Abitur Academy → My English Examiner** | Upload Klausuren, rubrics and corrections (shown below). |
| **Progress** | Retention, mastery, streaks, weak areas, recommendations. |
| **Reminders** | In-app, Web Push and e-mail, with time zone and quiet hours; at most one per channel per day. |
| **Offline** | Installable PWA; reviews are queued offline and synced idempotently. |
| **Operators** | `/admin`: AI cost by day, feature and user; budgets; plan assignment. |

Uploading to My English Examiner works like this:
1. You confirm each document's type and check its extracted text.
2. You build an evidence-linked course profile. Every statement is labelled with where it comes from: the teacher's words, a pattern in your documents, or a general principle.
3. You generate **original** practice exams in your course's format, with an originality check against your old exams.
4. You write them under exam conditions: timer, autosave, hidden expectations.
5. You get teacher-style feedback: an indicative 0–15 range, an Improvement Lab, a model answer, disputes, and weakness tracking with adaptive difficulty.

## Users, AI access and costs

- **Accounts.** Sign-up uses e-mail and password; each user's data is isolated in every query. Operators can close registration (`SIGNUPS=closed`).
- **AI on the server only.**
  - The API key lives in server environment variables and is never sent to the browser.
  - `AI_PROVIDER` is `anthropic`, `demo` or `none`.
  - A provider interface (`src/server/ai/provider.ts`) lets you add another provider without touching features.
  - Demo mode is clearly labelled and never presented as real feedback.
- **Allowances.** Each account has a plan with a monthly allowance per category: vocabulary exercises, exam generation, essay/exam assessment, tutor, documents. There is also an optional cost cap per account.
  - The built-in **Free** plan is the default for new accounts.
  - Plans are configured with `AI_PLANS`, with no code change. Users see what's left in Settings.
- **Budgets and limits.**
  - Site-wide daily and monthly budgets pause AI gracefully. Everything else keeps working.
  - A rate limiter stored in the database works across instances.
  - A per-user daily safety cap guards against runaway use.
  - Every request is logged with tokens and estimated cost, but never its text.
- **Not included.** Payments or subscriptions for users (plans are assigned by operators), and a legal privacy notice or imprint.

## Run it locally

```bash
cd english-academy
npm install
npm run dev            # http://localhost:3000, embedded database, demo AI, no keys needed
```

Optional: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` with `AI_PROVIDER=anthropic` for real AI output. That is billed to your API key.

## Use it on iPhone or iPad

iOS only installs web apps (Add to Home Screen, offline mode, push) from secure `https://` addresses. There are two ways.

**At home, from your computer (no accounts needed):**

```bash
npm run start:https     # builds, then serves https://<your-computer>:3443 on your Wi-Fi
```

1. The terminal shows a QR code. Scan it with the iPhone/iPad camera to open the setup page, `http://<your-computer>:3080`.
2. The setup page walks you through a one-time install of the computer's local certificate (download, install, enable trust).
3. Open the app and tap **Share → Add to Home Screen**.

About the local certificate:
- It is created on your computer in `.certs/`, which is git-ignored. Keep that folder private.
- It is limited by name constraints to private network addresses and local names, so it can never vouch for a real website.
- It works only while the computer is running and the device is on the same network.

**Online, from anywhere:** deploy with the Render Blueprint (`render.yaml` in the repository root) or another host. You get a public `https://` address with a regular certificate and no setup on the device. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tests

| Command | What | Last result (2026-10-20) |
|---|---|---|
| `npm test` | Unit + integration tests (FSRS, answer checking, parsing, time zones, examiner honesty checks, allowances and budgets, reminders, local HTTPS certificates, repositories on an in-memory Postgres) | 106 passed |
| `npm run test:e2e` | Production build + Playwright: onboarding, import, study session, practice, mind map, writing, tutor, reminders, examiner flow, data isolation, admin access, iPhone layout | 16 passed |
| `npm run lint`, `npm run typecheck` | ESLint, TypeScript | clean |

## Verified vs. not verified

- **Verified here:**
  - every flow above in demo mode, in a real browser
  - allowance and budget enforcement, the shared rate limiter, and AI output validation (with a mocked provider)
  - the production build
- **Not verified:**
  - calls to the real Claude API (no key was used during development)
  - real Web Push and e-mail delivery
  - deployment to any host
  - PostgreSQL other than the embedded PGlite engine
  - the quality of AI transcription of photos

  See DEPLOYMENT.md for the checks to do after deploying.

## Project layout

```
src/app/(app)/…        pages (vocabulary, learn, practice, mind-maps, writing, tutor, abitur, progress, settings, admin)
src/app/api/…          JSON API (session + same-origin checks; health, cron (secret) and signed unsubscribe links excepted)
src/domain/…           pure logic: learning engine, parsing, examiner honesty checks (unit-tested)
src/server/ai/…        provider interface, prompts + output schemas, allowances, budgets
src/server/repos/…     database access, always filtered by user
src/db/schema.ts       Drizzle schema; migrations in drizzle/
tests/                 unit, integration (PGlite) and e2e (Playwright)
```

## Relation to the `english-examiner` Claude skill

An earlier version of My English Examiner was built as a Claude Code skill, on branch `add-english-examiner-skill`. It needs Claude Code to run, so it is **not** suitable for app users. The in-app examiner described above replaces it for end users. The skill branch is left unchanged and is not part of this app.
