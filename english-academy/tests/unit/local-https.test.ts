import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ensureCertificates, primaryAddress } from "../../scripts/local-https/certs.mjs";

const dir = mkdtempSync(path.join(os.tmpdir(), "academy-certs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("local HTTPS certificates", () => {
  it("creates a CA and a server certificate that iOS accepts", () => {
    const r = ensureCertificates(dir);
    const ca = new X509Certificate(readFileSync(r.ca));
    const leaf = new X509Certificate(readFileSync(r.cert));
    expect(ca.ca).toBe(true);
    expect(leaf.ca).toBe(false);
    expect(leaf.verify(ca.publicKey)).toBe(true);
    expect(leaf.checkIssued(ca)).toBe(true);
    expect(leaf.subjectAltName).toContain("DNS:localhost");
    expect(leaf.subjectAltName).toContain("IP Address:127.0.0.1");
    expect(leaf.keyUsage).toContain("1.3.6.1.5.5.7.3.1"); // serverAuth (Node lists EKU here)
    const days = (new Date(leaf.validTo).getTime() - Date.now()) / 86400000;
    expect(days).toBeLessThanOrEqual(398); // Apple's limit for server certificates
    expect(new X509Certificate(readFileSync(r.caDer)).fingerprint256).toBe(ca.fingerprint256);
  });

  it("reuses the CA and the server certificate on the next start", () => {
    const before = readFileSync(path.join(dir, "server.crt"), "utf8");
    const caBefore = readFileSync(path.join(dir, "ca.crt"), "utf8");
    ensureCertificates(dir);
    expect(readFileSync(path.join(dir, "server.crt"), "utf8")).toBe(before);
    expect(readFileSync(path.join(dir, "ca.crt"), "utf8")).toBe(caBefore);
  });

  it("prefers a private network address", () => {
    expect(primaryAddress(["127.0.0.1", "192.168.178.23"])).toBe("192.168.178.23");
    expect(primaryAddress(["127.0.0.1", "10.0.0.5"])).toBe("10.0.0.5");
    expect(primaryAddress(["127.0.0.1"])).toBe("127.0.0.1");
  });
});
