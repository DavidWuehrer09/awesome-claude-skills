// npm run start:https
//
// Serves the production build over HTTPS on the local network so iPhone and
// iPad can use the app like the real thing (Add to Home Screen, offline mode,
// push). A small plain-HTTP setup page (port 3080) offers the certificate and a
// QR code; every other HTTP request is redirected to HTTPS.
import { randomBytes, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import next from "next";
import QRCode from "qrcode";
import { ensureCertificates, primaryAddress } from "./certs.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 3443);
const SETUP_PORT = Number(process.env.SETUP_PORT ?? 3080);

if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
  console.error("No production build found. Run `npm run build` first (or use `npm run start:https`, which builds automatically).");
  process.exit(1);
}

const certs = ensureCertificates(path.join(root, ".certs"));
const host = primaryAddress(certs.ips);
const appUrl = `https://${host}:${HTTPS_PORT}`;
const setupUrl = `http://${host}:${SETUP_PORT}`;

// Sensible defaults for a personal test server; anything set in the environment wins.
process.env.NODE_ENV = "production";
process.env.APP_URL ??= appUrl;
if (!process.env.APP_SECRET) {
  const file = path.join(root, ".data", "app-secret");
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file)) writeFileSync(file, randomBytes(48).toString("base64url"), { mode: 0o600 });
  process.env.APP_SECRET = readFileSync(file, "utf8").trim();
}

// Push reminders need VAPID keys; create and keep a pair for this computer unless configured.
if (!process.env.VAPID_PUBLIC_KEY) {
  const file = path.join(root, ".data", "vapid.json");
  if (!existsSync(file)) {
    const { default: webpush } = await import("web-push");
    writeFileSync(file, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
  }
  const keys = JSON.parse(readFileSync(file, "utf8"));
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  process.env.VAPID_SUBJECT ??= "mailto:english-academy@example.com";
}
process.env.CRON_SECRET ??= randomBytes(24).toString("base64url");

const app = next({ dev: false, dir: root, hostname: host, port: HTTPS_PORT });
const handle = app.getRequestHandler();
await app.prepare();

https.createServer({ key: readFileSync(certs.key), cert: readFileSync(certs.cert) }, (req, res) => handle(req, res))
  .listen(HTTPS_PORT, "0.0.0.0");

const caDer = readFileSync(certs.caDer);
const caName = /CN=([^\n]+)/.exec(new X509Certificate(caDer).subject)?.[1] ?? "English Academy Local CA";
const qrSvg = await QRCode.toString(appUrl, { type: "svg", margin: 1, width: 220 });
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const setupPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Set up English Academy on this device</title>
<style>
:root{--bg:#f7f5f0;--ink:#1f2937;--ink2:#4b5563;--navy:#223a5e;--card:#fffdf8;--line:#e5e0d5}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--ink:#e8e6e1;--ink2:#a8a49c;--navy:#9db7e0;--card:#1c2027;--line:#2c313a}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 48px}h1{font:600 28px/1.2 Georgia,serif;margin:8px 0 4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:16px 0}
ol{padding-left:22px}li{margin:6px 0}a.btn{display:inline-block;background:var(--navy);color:var(--bg);padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600}
code{background:var(--line);padding:1px 5px;border-radius:5px}.muted{color:var(--ink2);font-size:14px}.qr{background:#fff;display:inline-block;padding:8px;border-radius:10px}
</style></head><body><main>
<p class="muted">English Academy · local test server</p>
<h1>Set up this iPhone or iPad</h1>
<p>One-time setup so Safari trusts this computer's secure connection. Takes about a minute.</p>
<div class="card"><strong>Step 1 – Download the certificate</strong>
<p><a class="btn" href="/english-academy-local-ca.cer">Download certificate</a></p>
<p class="muted">Safari asks whether to allow the download: tap <em>Allow</em>, then <em>Close</em>.</p></div>
<div class="card"><strong>Step 2 – Install it</strong>
<ol><li>Open <em>Settings</em>. Tap <em>Profile Downloaded</em> near the top (or <em>General → VPN &amp; Device Management</em>).</li>
<li>Tap <em>Install</em>, enter your passcode, and tap <em>Install</em> again.</li></ol></div>
<div class="card"><strong>Step 3 – Turn on full trust</strong>
<ol><li><em>Settings → General → About → Certificate Trust Settings</em>.</li>
<li>Switch on <em>${esc(caName)}</em> and confirm.</li></ol></div>
<div class="card"><strong>Step 4 – Open the app</strong>
<p><a class="btn" href="${esc(appUrl)}">Open English Academy</a></p>
<p>Then tap <em>Share → Add to Home Screen</em> to install it like an app.</p>
<div class="qr">${qrSvg}</div><p class="muted">${esc(appUrl)}</p></div>
<div class="card muted"><strong>Good to know</strong><ul>
<li>This only works on your home network, while this computer is running <code>npm run start:https</code>.</li>
<li>The certificate is limited to home-network addresses and local names; it cannot vouch for real websites. Remove it any time under <em>Settings → General → VPN &amp; Device Management</em>.</li>
<li>Keep the folder <code>.certs</code> on your computer private: it contains the key that signs these certificates.</li></ul></div>
</main></body></html>`;

http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(setupPage);
  }
  if (url.pathname === "/english-academy-local-ca.cer") {
    res.writeHead(200, { "Content-Type": "application/x-x509-ca-cert", "Content-Disposition": 'attachment; filename="english-academy-local-ca.cer"' });
    return res.end(caDer);
  }
  res.writeHead(301, { Location: `${appUrl}${url.pathname}${url.search}` });
  res.end();
}).listen(SETUP_PORT, "0.0.0.0");

// Run the reminder job every 15 minutes, like a hosted scheduler would.
const runReminders = () => {
  const req = https.request({ host: "127.0.0.1", port: HTTPS_PORT, path: "/api/cron/reminders", servername: "localhost", ca: readFileSync(certs.ca), headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, Host: `localhost:${HTTPS_PORT}` } }, (res) => {
    res.resume();
    if (res.statusCode !== 200) console.warn(`Reminder job answered ${res.statusCode}`);
  });
  req.on("error", (e) => console.warn(`Reminder job failed: ${e.message}`));
  req.end();
};
setInterval(runReminders, 15 * 60 * 1000);

const qrTerminal = await QRCode.toString(setupUrl, { type: "terminal", small: true });
console.log(`
English Academy is running over HTTPS.

  On this computer:        https://localhost:${HTTPS_PORT}
  On iPhone/iPad (same Wi-Fi), first-time setup – scan or open:
                           ${setupUrl}
${qrTerminal}
  App address afterwards:  ${appUrl}
  Other addresses:         ${certs.ips.filter((ip) => ip !== host).map((ip) => `https://${ip}:${HTTPS_PORT}`).join(", ") || "–"}

Stop with Ctrl+C.`);
