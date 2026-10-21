# Costs

This document separates **what it costs to build the app** from **what it costs to run it**. Running costs are then split by service: hosting, database, email, push, domain and AI.

> **How reliable are these numbers?**
> - **AI prices** (marked ✅) were read from Anthropic's pricing page on 2026-10-20.
> - **Hosting, database, email and domain prices** (marked ⚠️) could **not** be confirmed on the providers' own pages from the build environment. They come from search results and may be out of date. Check every ⚠️ value on the provider's pricing page before you rely on it.
> - Nothing in this document says a service is free unless that provider itself advertises a free allowance, and those allowances are ⚠️ too.

## 1. Development cost (one-off, yours)

- **Building and changing the app.** Your own time, plus any tools you use while developing, such as a Claude Code subscription. That subscription is a developer tool. **App users never need it**, and the app does not use it.
- **Local development is free of service charges.** Without any configuration the app uses an embedded database (PGlite), demo AI, and no email or push. So you can develop and test without accounts or API keys.
- **Optional.** Testing real AI output locally uses your Anthropic API key and is billed per token like production (see §3).

## 2. Operating cost: infrastructure

Pick **one** hosting option. Every option needs a PostgreSQL database in production; the embedded database is only for local use and single-server setups with a persistent disk.

### Option A: Vercel + Neon (serverless) ⚠️

| Item | What the providers advertise (unverified) | Notes |
|---|---|---|
| Vercel Hobby | $0 | Reported as **personal, non-commercial use only**. **Cron jobs run at most once a day**, so 30-minute reminders need Pro or an external scheduler (see DEPLOYMENT.md). |
| Vercel Pro | about $20 per member per month | Allows frequent cron jobs and longer function durations. |
| Neon Free | $0: 0.5 GB storage per project, limited compute hours | Fine for a small user base; compute is suspended when idle. |
| Neon paid ("Launch") | usage-based, roughly $0.11 per compute-hour plus storage | Reported to have no monthly minimum; check. |

### Option B: Render (one always-on server + Postgres) ⚠️

| Item | Advertised (unverified) |
|---|---|
| Starter web service (512 MB) | about $7/month |
| Postgres (smallest paid) | about $6/month |

The cron job can be a Render cron job or an external scheduler.

### Option C: Supabase as the database ⚠️

Free plan: 500 MB, and projects **pause after a week of inactivity**. That is unsuitable for a public app. Pro is from about $25/month.

### Email (Resend) ⚠️, optional

- **Free:** about 3,000 emails/month, at most about 100/day, 1 domain.
- **Paid:** about $20/month for 50,000 emails.
- You need your own domain with DNS records for sending. Without `RESEND_API_KEY`, email reminders are simply switched off.

### Web Push, optional

The app sends push messages directly to the browser vendors' push services using VAPID keys. No push provider account is involved. I found no authoritative statement of the vendors' pricing, so I make **no claim** that it is free. No fee is known to me, but it is unverified.

### Domain ⚠️

A .de domain is roughly €3–15 per year depending on the registrar. You need a domain for email sending, and a custom address is good practice for a public app.

## 3. Operating cost: AI (usage-based) ✅

Users never pay the AI provider and never need an AI account. **You, the operator, pay** for every real AI request through your API key.

**Prices** (Anthropic, per million tokens, read 2026-10-20):

| Model | Input | Output |
|---|---|---|
| claude-opus-5-5 (default `AI_MODEL`) | $4.00 | $20.00 |
| claude-sonnet-5-5 | $2.00 | $10.00 |
| claude-haiku-5-5 (prompts up to 100k tokens) | $0.10 | $0.50 |

Batch processing is half price, and US-only inference costs 1.1× (neither is used by the app). Reasoning ("thinking") tokens are billed as output.

### Rough cost per request

These figures are **assumptions, not measurements**. The token counts are my estimates for typical inputs, and real usage varies, especially output and reasoning length. After launch, use the measured figures on **/admin → By feature** instead.

| Feature (allowance category) | Assumed tokens in / out | On Opus 5.5 | On Haiku 5.5 via `AI_FAST_MODEL`* |
|---|---|---|---|
| Answer check, word enrichment (exercises) | 1,500 / 600 | ≈ $0.02 | ≈ $0.0005 |
| Generated exercises (exercises) | 2,000 / 2,500 | ≈ $0.06 | n/a (uses `AI_MODEL`) |
| Tutor message (tutor) | 3,000 / 700 | ≈ $0.03 | n/a |
| Essay assessment (assessment) | 4,000 / 6,000 | ≈ $0.14 | n/a |
| Exam generation (exam generation) | 6,000 / 10,000 | ≈ $0.22 | n/a |
| Exam assessment (assessment) | 12,000 / 14,000 | ≈ $0.33 | n/a |
| Photo or scan transcription (documents) | 2,500 / 2,000 | ≈ $0.05 | n/a |

\* `AI_FAST_MODEL` is used only for small tasks: word enrichment, topic sorting, answer checking, mind-map links and follow-up questions. Check the quality before switching.

When an AI answer fails the honesty checks, the app asks once more. That request is billed too, so a single feature can occasionally cost twice as much.

### Free accounts and their worst case

A new account gets `DEFAULT_PLAN` (by default `free`). The built-in Free plan allows, per calendar month:

| Category | Free | Plus | Unlimited |
|---|---|---|---|
| Exercises, word help and sentence feedback (incl. Improvement Lab) | 60 | 600 | ∞ |
| Exam generation | 2 | 15 | ∞ |
| Essay and exam assessment | 4 | 30 | ∞ |
| AI tutor messages | 30 | 300 | ∞ |
| Document reading | 5 | 40 | ∞ |
| **Cost cap per account** | **$2** | **$15** | none |

Whichever limit is reached first stops AI for that account until the 1st of the next month (UTC). **Worst case for free users:** about $2 × the number of *active* free users per month, plus at most one request of overshoot each, because a request's cost is only known after it finishes. All values are configurable with `AI_PLANS` without code changes.

There is currently **no payment integration**. Operators assign the Plus plan by hand on /admin. Selling plans would need a payment provider, which is not built.

### Site-wide safety limits

Set both of these before going public:

1. **`AI_BUDGET_DAILY_USD` and `AI_BUDGET_MONTHLY_USD`.** When either is reached, AI pauses for everyone with a clear message, while reviews, flashcards and all non-AI features keep working.
2. **A spend limit in the Claude Console** (Billing → Spend limits; per-workspace limits are also possible). This is independent of the app and catches anything the app's estimates miss.

The app's figures are estimates from list prices. **Your provider's invoice is authoritative.**

## 4. Example: putting it together

For 50 active free users, assuming every user hits the $2 cap (the worst case):

| Item | Monthly |
|---|---|
| AI (worst case, Opus 5.5 everywhere) | up to about $100 |
| Hosting + database | from $0 on free tiers (check their terms: Vercel Hobby is non-commercial) to roughly $13–45 on paid tiers ⚠️ |
| Email | $0 within Resend's free tier ⚠️ |
| Domain | about €1/month ⚠️ |

AI is the cost to watch. Lower it by:
- reducing the Free plan (`AI_PLANS`),
- setting `AI_FAST_MODEL`,
- setting `AI_PROVIDER=none`, which keeps everything except AI features working.
