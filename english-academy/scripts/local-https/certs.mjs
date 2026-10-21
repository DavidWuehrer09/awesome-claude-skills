// Local HTTPS certificates for testing on iPhone/iPad over the home network.
//
// Creates (once) a private certificate authority for this computer and, on
// every start, a server certificate for its current network addresses. The CA
// is installed and trusted on the iPhone/iPad one time; after that Safari
// treats the app as a normal secure site (Add to Home Screen, service worker,
// push). Built only on node:crypto: ECDSA P-256 keys, SHA-256 signatures, DER
// encoded by hand below.
import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, sign, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------- minimal DER

const len = (n) => (n < 0x80 ? Buffer.from([n]) : (() => {
  const bytes = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
})());
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const int = (buf) => tlv(0x02, buf[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buf]) : buf);
const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0]));
const octets = (buf) => tlv(0x04, buf);
const bits = (buf, unused = 0) => tlv(0x03, Buffer.concat([Buffer.from([unused]), buf]));
const utf8 = (s) => tlv(0x0c, Buffer.from(s, "utf8"));
const explicit = (n, body) => tlv(0xa0 + n, body);
function oid(dotted) {
  const [a, b, ...rest] = dotted.split(".").map(Number);
  const out = [40 * a + b];
  for (const n of rest) {
    const chunk = [n & 0x7f];
    for (let v = n >> 7; v > 0; v >>= 7) chunk.unshift((v & 0x7f) | 0x80);
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}
function time(d) {
  const p = (n) => String(n).padStart(2, "0");
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(s)); // UTCTime (valid for years before 2050)
}

const ECDSA_SHA256 = seq(oid("1.2.840.10045.4.3.2"));
const name = (cn) => seq(set(seq(oid("2.5.4.10"), utf8("English Academy (local testing)"))), set(seq(oid("2.5.4.3"), utf8(cn))));
const ext = (id, critical, value) => seq(oid(id), ...(critical ? [bool(true)] : []), octets(value));
const keyId = (spki) => createHash("sha1").update(spki).digest();

function certificate({ subject, issuer, spki, signer, days, extensions }) {
  const now = Date.now();
  const serial = randomBytes(16);
  serial[0] = (serial[0] & 0x7f) | 0x01;
  const tbs = seq(
    explicit(0, int(Buffer.from([2]))), // v3
    int(serial),
    ECDSA_SHA256,
    issuer,
    seq(time(new Date(now - 60 * 60 * 1000)), time(new Date(now + days * 86400000))),
    subject,
    spki,
    explicit(3, seq(...extensions)),
  );
  const signature = sign("sha256", tbs, signer); // DER-encoded ECDSA signature, as X.509 expects
  return seq(tbs, ECDSA_SHA256, bits(signature));
}

const pem = (der, label) => `-----BEGIN ${label}-----\n${der.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;

// ---------------------------------------------------------------- addresses

/** IPv4 addresses on the local network plus host names the iPad might use. */
export function localAddresses() {
  const ips = new Set(["127.0.0.1"]);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) ips.add(a.address);
  }
  const host = os.hostname().toLowerCase().replace(/\.local$/, "");
  const dns = new Set(["localhost", host, `${host}.local`]);
  return { ips: [...ips], dns: [...dns].filter((d) => /^[a-z0-9.-]+$/.test(d)) };
}

/** The address to show first: a private LAN address if there is one. */
export function primaryAddress(ips) {
  return ips.find((ip) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(ip)) ?? ips.find((ip) => ip !== "127.0.0.1") ?? "127.0.0.1";
}

// ---------------------------------------------------------------- CA and server certificate

export function ensureCertificates(dir) {
  mkdirSync(dir, { recursive: true });
  const f = (n) => path.join(dir, n);
  const writePrivate = (file, data) => {
    writeFileSync(file, data);
    try { chmodSync(file, 0o600); } catch { /* Windows */ }
  };

  if (!existsSync(f("ca.key")) || !existsSync(f("ca.crt"))) {
    // Name constraints: this CA can only vouch for private network addresses and local
    // host names, never for real websites, even if its key were stolen.
    const { ips: ipsNow, dns: dnsNow } = localAddresses();
    const net = (addr, bitsLen) => {
      const a = addr.split(".").map(Number);
      const m = [0, 1, 2, 3].map((i) => (bitsLen >= (i + 1) * 8 ? 255 : bitsLen > i * 8 ? (0xff << (8 - (bitsLen - i * 8))) & 0xff : 0));
      return tlv(0x87, Buffer.from([...a.map((x, i) => x & m[i]), ...m]));
    };
    const privateNets = [net("10.0.0.0", 8), net("172.16.0.0", 12), net("192.168.0.0", 16), net("127.0.0.0", 8), net("169.254.0.0", 16)];
    const extraIps = ipsNow.filter((ip) => !/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)).map((ip) => net(ip, 32));
    const permitted = [...new Set(["localhost", "local", ...dnsNow])].map((d) => seq(tlv(0x82, Buffer.from(d, "ascii"))))
      .concat([...privateNets, ...extraIps].map((n) => seq(n)));
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const spki = publicKey.export({ type: "spki", format: "der" });
    const caName = name(`English Academy Local CA (${os.hostname().replace(/\.local$/i, "")})`);
    const der = certificate({
      subject: caName, issuer: caName, spki, signer: privateKey, days: 3650,
      extensions: [
        ext("2.5.29.19", true, seq(bool(true), int(Buffer.from([0])))), // CA, path length 0: can only sign server certificates
        ext("2.5.29.15", true, bits(Buffer.from([0x06]), 1)), // keyCertSign, cRLSign
        ext("2.5.29.30", true, seq(tlv(0xa0, Buffer.concat(permitted)))), // nameConstraints: permittedSubtrees
        ext("2.5.29.14", false, octets(keyId(spki))),
      ],
    });
    writePrivate(f("ca.key"), privateKey.export({ type: "pkcs8", format: "pem" }));
    writeFileSync(f("ca.crt"), pem(der, "CERTIFICATE"));
    writeFileSync(f("ca.cer"), der); // DER copy: what iOS installs as a profile
  }

  const caCert = new X509Certificate(readFileSync(f("ca.crt")));
  const caKey = createPrivateKey(readFileSync(f("ca.key")));
  const { ips, dns } = localAddresses();

  // Reuse the server certificate unless an address changed or it expires within 30 days.
  if (existsSync(f("server.crt")) && existsSync(f("server.key"))) {
    const cur = new X509Certificate(readFileSync(f("server.crt")));
    const san = cur.subjectAltName ?? "";
    const covered = ips.every((ip) => san.includes(`IP Address:${ip}`)) && dns.every((d) => san.includes(`DNS:${d}`));
    const fresh = new Date(cur.validTo).getTime() - Date.now() > 30 * 86400000;
    if (covered && fresh && cur.verify(caCert.publicKey)) return { dir, ca: f("ca.crt"), caDer: f("ca.cer"), key: f("server.key"), cert: f("server.crt"), ips, dns };
  }

  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const caSpki = caCert.publicKey.export({ type: "spki", format: "der" });
  const sanBody = Buffer.concat([
    ...dns.map((d) => tlv(0x82, Buffer.from(d, "ascii"))), // dNSName
    ...ips.map((ip) => tlv(0x87, Buffer.from(ip.split(".").map(Number)))), // iPAddress
  ]);
  const der = certificate({
    subject: name(dns[1] ?? "localhost"),
    issuer: name(caCert.subject.split("\n").find((l) => l.startsWith("CN="))?.slice(3) ?? "English Academy Local CA"),
    spki, signer: caKey,
    days: 397, // Apple rejects longer-lived server certificates
    extensions: [
      ext("2.5.29.19", true, seq()), // not a CA
      ext("2.5.29.15", true, bits(Buffer.from([0x80]), 7)), // digitalSignature
      ext("2.5.29.37", false, seq(oid("1.3.6.1.5.5.7.3.1"))), // serverAuth
      ext("2.5.29.17", false, tlv(0x30, sanBody)),
      ext("2.5.29.14", false, octets(keyId(spki))),
      ext("2.5.29.35", false, seq(tlv(0x80, keyId(caSpki)))),
    ],
  });
  writePrivate(f("server.key"), privateKey.export({ type: "pkcs8", format: "pem" }));
  writeFileSync(f("server.crt"), pem(der, "CERTIFICATE"));
  return { dir, ca: f("ca.crt"), caDer: f("ca.cer"), key: f("server.key"), cert: f("server.crt"), ips, dns };
}
