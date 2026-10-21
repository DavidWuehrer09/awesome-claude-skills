# Deployment

The app is one Next.js server with a PostgreSQL database. Anyone can sign up with an e-mail address and password. Users need **no** Claude account, Claude Code or AI subscription. All AI calls run on the server with the operator's API key.

> **Status:** I have not deployed this app to any host. The production build and all tests pass locally (see the README), but none of the hosting steps below has been verified on a real account. Prices are in [COSTS.md](COSTS.md).

## 1. Requirements

- Node.js 20.9 or newer (tested with 22)
- PostgreSQL 15 or newer for production. A serverless host has no persistent disk, so the embedded database won't work there.
- An Anthropic API key from the Claude Console if you want real AI. Without one, set `AI_PROVIDER=demo` (labelled demo output) or `none`.

## 2. Configuration

Copy `.env.example` and fill in values on your host. Never commit real values. The minimum for a public site:

| Variable | Why |
|---|---|
| `DATABASE_URL=postgres://…` | Production database |
| `APP_URL=https://your-domain` | Links in e-mails |
| `APP_SECRET` | At least 32 random characters (`openssl rand -base64 48`) |
| `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` | Real AI (server-side only; never use a `NEXT_PUBLIC_` name) |
| `AI_BUDGET_DAILY_USD`, `AI_BUDGET_MONTHLY_USD` | Site-wide spending limits |
| `ADMIN_EMAILS` | Who may open `/admin` (usage, costs, plans) |
| `CRON_SECRET` | Protects the reminder job endpoint |

Optional:
- `DEFAULT_PLAN`, `AI_PLANS`: free-account allowances (see COSTS.md)
- `SIGNUPS=closed`: stop new registrations
- `AI_FAST_MODEL`: a cheaper model for small tasks
- `VAPID_*`: push reminders
- `RESEND_API_KEY`, `EMAIL_FROM`: e-mail reminders

### Switching the AI provider

`AI_PROVIDER` selects the adapter.
- To change the model, change `AI_MODEL`. No code change.
- To add a different provider, write one adapter implementing `AIProvider` in `src/server/ai/provider.ts` and register its key variable in `PROVIDER_KEYS` (`src/server/ai/config.ts`). Prompts, validation, allowances and logging stay as they are.

## 3. Database migrations

Migrations live in `drizzle/` and are additive SQL files.
- By default, the app applies them on its first database connection.
- In CI/CD, prefer running them explicitly and turning auto-migration off:

```bash
DATABASE_URL=postgres://… npm run db:migrate
# then set AUTO_MIGRATE=false on the app
```

After you change `src/db/schema.ts`, create a new migration with `npm run db:generate` and commit it.

## 4. Hosting options

### A. Vercel + Neon

1. Create a Neon project and copy its connection string (`postgres://…?sslmode=require`).
2. Import the repository in Vercel and set **Root Directory** to `english-academy`.
3. Add the environment variables above.
4. Optional: set the build command to `npm run db:migrate && npm run build` and `AUTO_MIGRATE=false`.
5. Deploy, then open `https://…/api/health`. It should answer `{"ok":true}`.

Caveats (⚠️ reported, not verified):
- **Vercel Hobby** is described as non-commercial and only runs cron jobs once a day.
- Exam generation and assessment use up to 300 s (`maxDuration`). That is reported as the Hobby maximum.

### B. Render (Blueprint: web service + PostgreSQL, HTTPS included)

`render.yaml` in the **repository root** describes both services.
1. In the Render dashboard, choose **New → Blueprint**, then pick the repository and the branch (`english-academy-app`).
2. Render creates the database and the web service. It generates `APP_SECRET` and `CRON_SECRET` and starts in demo AI mode.
3. After the first deploy, set `APP_URL` (the `https://….onrender.com` address) and `ADMIN_EMAILS` in the service's Environment tab.
4. For real AI, also set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, and both `AI_BUDGET_*` variables.

Notes:
- The blueprint uses Render's `free` plans. Render limits those: a free web service sleeps when idle, and free databases are limited or temporary ⚠️. Switch to paid plans for real use.
- The blueprint follows Render's published examples, but **has not been deployed yet**. If Render reports an error, tell me the message.

### C. Your own server (VPS)

1. Run `npm ci && npm run build`, then `npm start` behind a reverse proxy with HTTPS (Caddy or nginx).
2. Use PostgreSQL. `pglite:/var/lib/academy` works for a small single-server setup with backups, but isn't recommended for many users.

HTTPS is required in production: the session cookie is `Secure`. `INSECURE_COOKIES=true` exists only for testing over plain HTTP on a local network.

### D. Testing on iPhone/iPad at home (local HTTPS)

`npm run start:https` builds the app and serves it at `https://<computer-address>:3443`, using a certificate from a private certificate authority created on first start in `.certs/`.
- A plain-HTTP setup page on port 3080 (with a QR code in the terminal) lets the device install and trust that authority once. After that, Safari treats the app as a normal secure site.
- The authority is limited by X.509 name constraints to private network addresses (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16) and local names. Certificates it signs for any other site are rejected.
- The server certificate is renewed automatically when the computer's address changes, and lasts 397 days, as Apple requires.
- Ports can be changed with `HTTPS_PORT` and `SETUP_PORT`.
- `APP_SECRET` is generated and kept in `.data/app-secret` unless you set one.
- Push keys (VAPID) are generated and kept in `.data/vapid.json` unless you set them.
- The server runs the reminder job itself every 15 minutes, so no external scheduler is needed at home.
- Apple's push service may reject the placeholder `VAPID_SUBJECT`; if it does, set it to `mailto:` plus your own address.

Verified here: certificates validated by OpenSSL and Node.js; HTTPS requests with full certificate checking; a secure context with the service worker active in Chromium. **Not verified on a physical iPhone or iPad.**

## 5. Reminder job (cron)

Reminders are sent by `GET /api/cron/reminders` with the header `Authorization: Bearer $CRON_SECRET`. Call it every 15–30 minutes. Each user gets at most one reminder per channel per local day, even if the job runs more often or is retried.

Options:
- **Vercel Pro:** add a `vercel.json` to the `english-academy` folder:

  ```json
  { "crons": [{ "path": "/api/cron/reminders", "schedule": "*/30 * * * *" }] }
  ```

  Vercel is documented to send `CRON_SECRET` as a Bearer token when that variable is set (⚠️ not verified here). Not included by default, because a schedule this frequent is reported to fail on Hobby.
- **Vercel Hobby:** use a daily schedule such as `"0 15 * * *"`. Reminders then arrive once a day at that time, not at each user's chosen time. Alternatively, use an external scheduler.
- **Any host:** an external scheduler (a Render cron job, a server crontab, GitHub Actions `schedule`, or a hosted cron service) running:

  ```bash
  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/reminders
  ```

## 6. Push and e-mail

- **Web Push.** Generate keys once with `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT=mailto:you@your-domain`. On iPhone and iPad, push only works after the user adds the app to the home screen. The settings page explains this.
- **E-mail.** Verify your domain in Resend, then set `RESEND_API_KEY` and `EMAIL_FROM` on that domain. Every e-mail has a signed one-click unsubscribe link.

Neither channel has been tested against the real services. The code paths are unit-tested with mocked delivery. Use "Send test" under Reminders in Settings after deployment.

## 7. Go-live checklist

- [ ] `/api/health` returns `{"ok":true}`
- [ ] Sign up, finish onboarding, import words and do a study session
- [ ] `ADMIN_EMAILS` contains your address and `/admin` opens
- [ ] `AI_BUDGET_DAILY_USD` and `AI_BUDGET_MONTHLY_USD` are set, and a spend limit is set in the Claude Console
- [ ] One real AI request appears on `/admin` with a cost, and you've compared it with the Console's usage page
- [ ] The free plan allowances in `AI_PLANS` match what you can afford (COSTS.md §3)
- [ ] The reminder job runs (check `reminder_deliveries`, or receive a test e-mail or push)
- [ ] Database backups are enabled at your database provider
- [ ] Privacy notice and imprint (Impressum) for a public German site. Not included in the app; get legal advice.
