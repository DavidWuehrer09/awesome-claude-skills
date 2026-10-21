# Online and offline use, files, AI access and known limitations

## What works offline

The app is a PWA: install it with **Add to Home Screen** on iPhone or iPad, or with the install button in Chrome or Edge.

| Works without a connection | How |
|---|---|
| Reviewing a study session you already started or downloaded ("Download 30-minute session" on Learn) | The session is stored on the device. Answers are queued in IndexedDB and sent automatically when you are back online. Each answer has a unique ID, so it is never counted twice, and late answers never rewind the schedule. |
| Browsing your word list and topics | The last loaded copy is served from the service worker cache. |
| Pages you opened before | Network first, with the cached copy as a fallback. Otherwise an offline page is shown. |
| Writing a Writing Lab draft or an exam answer | Every keystroke is backed up on the device. Autosave resumes when you are online, and conflicts with another device are detected. |

| Needs a connection | Why |
|---|---|
| Signing in, creating an account | Sessions are checked on the server |
| Building a new study session, importing, editing words | The data is on the server |
| Everything with AI: explanations, answer checking beyond the built-in rules, writing and exam assessment, exam generation, OCR, tutor, Improvement Lab | AI runs only on the server |
| Push and e-mail reminders | They are sent by the server |

Logging out clears the device caches and the offline queue. Unsent answers are sent first if possible.

## Files and OCR

- **Where uploads are stored.** Vocabulary imports are read and discarded; only the parsed words are saved. Documents uploaded to My English Examiner are stored in the database (original file and extracted text), at most 10 MB each, so **no separate file storage service is needed**. A database backup includes them. Export them via My Examiner → Overview → Export (JSON, with links to the original files).
- **Text extraction without AI.** TXT, CSV, DOCX, XLSX and PDFs with a text layer are read on the server.
- **OCR** for photos and scanned PDFs uses the configured AI provider's vision capability; there is no separate OCR engine. Without an AI provider, these files are stored but must be typed in by hand. The app never guesses unreadable text; it marks it, and you check every transcription before the document is used.

## AI access: why a consumer subscription cannot be used

Users need no AI account. The **operator** connects the app to an AI provider's **API** with a server-side key (an Anthropic API key from the Claude Console), billed per use (see COSTS.md).

A personal Claude, ChatGPT or similar subscription is a different product. It is for one person in that company's own apps, and it does not authorise another application to send requests on your behalf. The app therefore never asks for such logins, never uses browser sessions, and never automates a consumer website.

- `AI_MODEL` selects the model.
- `ANTHROPIC_BASE_URL` (read by the official SDK) points the client at another endpoint, such as a gateway or proxy that speaks the same API.
- Other providers need an adapter in `src/server/ai/provider.ts` (see DEPLOYMENT.md).

## Known limitations and next steps

- **Payments.** There is no payment integration; operators assign plans by hand on /admin.
- **AI providers.** There is one real adapter, for Anthropic. Others must be written against the `AIProvider` interface.
- **Not verified with real services yet.** These have only been tested in demo mode or with a mocked provider:
  - real AI output quality
  - Web Push and e-mail delivery
  - hosted PostgreSQL (tests use the embedded PGlite engine)
  - installation and push on a physical iPhone or iPad
- **Demo mode** gives honest but very limited feedback: rule-based checks only, no rewriting, no model answers.
- **Language.** The interface is in English; German appears only in vocabulary data.
- **Accessibility.** Keyboard use and labels are tested; a full screen-reader audit has not been done.
- **Weekly trends** are bucketed in seven-day steps from a Monday, so a week that contains a daylight-saving change may be off by one hour at its edges.
- **Legal.** A privacy notice, imprint and terms for a public German site are not included (see DEPLOYMENT.md).
- **Backups.** These are the database provider's responsibility; the app has no built-in backup schedule.

Candidate next steps: payments for paid plans, a second AI adapter, test runs with real services and devices, an accessibility audit, and German interface texts.
