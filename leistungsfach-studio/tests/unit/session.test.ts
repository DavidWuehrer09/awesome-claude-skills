import { describe, expect, it } from "vitest";
import { authMode, createSessionToken, passwordMatches, verifySessionToken } from "@/lib/auth/session";

const env = { APP_PASSWORD: "correct horse", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;

describe("session tokens", () => {
  it("verifies its own token and rejects tampering, expiry and other passwords", async () => {
    const now = Date.now();
    const t = await createSessionToken(now, env);
    expect(await verifySessionToken(t, now, env)).toBe(true);
    expect(await verifySessionToken(t.replace(/.$/, (c) => (c === "a" ? "b" : "a")), now, env)).toBe(false);
    expect(await verifySessionToken(t, now + 31 * 86400000, env)).toBe(false);
    expect(await verifySessionToken(t, now, { ...env, APP_PASSWORD: "other" })).toBe(false);
    expect(await verifySessionToken(undefined, now, env)).toBe(false);
  });
  it("compares passwords", async () => {
    expect(await passwordMatches("correct horse", env)).toBe(true);
    expect(await passwordMatches("wrong", env)).toBe(false);
    expect(await passwordMatches("", { ...env, APP_PASSWORD: "" })).toBe(false);
  });
  it("refuses to run unprotected in production unless explicitly allowed", () => {
    expect(authMode({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe("misconfigured");
    expect(authMode({ NODE_ENV: "production", ALLOW_NO_PASSWORD: "true" } as unknown as NodeJS.ProcessEnv)).toBe("open");
    expect(authMode({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)).toBe("open");
    expect(authMode(env)).toBe("password");
  });
});
