// Password-based single-user session, signed with HMAC-SHA256 (Web Crypto; works in proxy and route handlers).
// The signing key is derived from APP_PASSWORD (+ optional SESSION_SECRET), so changing the password logs out all sessions.

export const SESSION_COOKIE = "studio_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthMode = "open" | "password" | "misconfigured";

export function authMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  if (env.APP_PASSWORD && env.APP_PASSWORD.length > 0) return "password";
  if (env.NODE_ENV === "production" && env.ALLOW_NO_PASSWORD !== "true") return "misconfigured";
  return "open";
}

const enc = new TextEncoder();

async function key(env: NodeJS.ProcessEnv) {
  const material = `${env.APP_PASSWORD ?? ""}::${env.SESSION_SECRET ?? "leistungsfach-studio"}`;
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(now = Date.now(), env: NodeJS.ProcessEnv = process.env) {
  const expires = String(now + SESSION_TTL_MS);
  const sig = toHex(await crypto.subtle.sign("HMAC", await key(env), enc.encode(`v1.${expires}`)));
  return `v1.${expires}.${sig}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now(), env: NodeJS.ProcessEnv = process.env) {
  if (!token) return false;
  const [v, expires, sig] = token.split(".");
  if (v !== "v1" || !expires || !sig || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (!(Number(expires) > now)) return false;
  const bytes = new Uint8Array(sig.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", await key(env), bytes, enc.encode(`v1.${expires}`));
}

/** Constant-time string comparison for the password check. */
export async function passwordMatches(candidate: string, env: NodeJS.ProcessEnv = process.env) {
  const expected = env.APP_PASSWORD ?? "";
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(candidate)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0 && expected.length > 0;
}
