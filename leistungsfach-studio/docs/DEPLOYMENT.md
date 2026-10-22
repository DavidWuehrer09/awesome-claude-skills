# Running and deploying

## Option A — your own computer (recommended to start; free)

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

For a faster, production-mode server on the same machine:

```bash
npm run build
ALLOW_NO_PASSWORD=true npm start     # or set APP_PASSWORD in .env.local
```

Your data lives in `./data/pglite`. Back it up by copying that folder while the app is stopped, or use *Profile → Data & privacy → Download everything*.

To use it from a phone or tablet on the same Wi-Fi, run `npm start -- -H 0.0.0.0`, set `APP_PASSWORD`, and open `http://<your-computer's-IP>:3000`.

## Option B — hosted (use it anywhere)

The app needs (1) a Node.js host that runs `next start`, and (2) PostgreSQL via `DATABASE_URL`. The embedded PGlite database needs a persistent disk, so on serverless hosts (Vercel, Netlify) you **must** use `DATABASE_URL`.

Suggested low-cost setup:

1. **Database:** create a free PostgreSQL project (e.g. Supabase or Neon) and copy its connection string. Supabase: *Project settings → Database → Connection string*, "Session pooler" URI.
2. **Hosting:** import this folder's Git repository into Vercel (set *Root Directory* to `leistungsfach-studio`), or use any Node host (Railway, Render, Fly.io).
3. **Environment variables** (in the host's dashboard, never in code):
   - `ANTHROPIC_API_KEY`
   - `DATABASE_URL`
   - `APP_PASSWORD`: a long passphrase. The production server refuses to serve without it.
   - `SESSION_SECRET`: a random string
4. Deploy. Migrations run automatically on the first request. Check `https://<your-app>/api/health`.

### Limits to know about
- AI requests can take 30–120 s. On Vercel the route limit is set with `maxDuration` (300 s for assessments). Plans with lower limits can cut off long assessments; the essay stays saved and you can retry.
- Free database tiers pause after inactivity on some providers; the first request after a pause is slow.
- Costs: hosting and database can be free at this scale. API usage is pay-as-you-go (see the README).

## Security checklist
- [ ] `APP_PASSWORD` set on every deployment reachable from the internet
- [ ] The API key only lives in the host's environment variables or `.env.local`
- [ ] A spending limit is set in the Anthropic Console
- [ ] Data exported occasionally as a backup
