import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyGoogleIdToken, type GoogleJwk } from "./google";

const CLIENT = "client-123.apps.googleusercontent.com";
const NOW = 1_800_000_000;

const b64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (obj: unknown) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function keypair(kid: string) {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const jwk: GoogleJwk = { kid, kty: "RSA", alg: "RS256", n: pub.n!, e: pub.e! };
  return { privateKey: pair.privateKey, jwk };
}

async function sign(privateKey: CryptoKey, claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1" }) {
  const body = `${enc(header)}.${enc(claims)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

const good = {
  iss: "https://accounts.google.com",
  aud: CLIENT,
  exp: NOW + 600,
  email: "Somchai@MenaTransport.co.th",
  email_verified: true,
  hd: "menatransport.co.th",
};

describe("verifyGoogleIdToken", async () => {
  const k1 = await keypair("k1");
  const other = await keypair("k1");
  const opts = { clientId: CLIENT, nowSec: NOW, loadJwks: async () => [k1.jwk] };

  it("token ถูกต้อง → คืนอีเมลตัวพิมพ์เล็ก", async () => {
    const { email } = await verifyGoogleIdToken(await sign(k1.privateKey, good), opts);
    assert.equal(email, "somchai@menatransport.co.th");
  });

  it("ลายเซ็นจากกุญแจอื่น (ปลอม) → โยน", async () => {
    await assert.rejects(verifyGoogleIdToken(await sign(other.privateKey, good), opts), /ลายเซ็น/);
  });

  it("แก้ payload หลังเซ็น (เปลี่ยนอีเมล) → โยน", async () => {
    const token = await sign(k1.privateKey, good);
    const [h, , s] = token.split(".");
    const forged = `${h}.${enc({ ...good, email: "boss@menatransport.co.th" })}.${s}`;
    await assert.rejects(verifyGoogleIdToken(forged, opts), /ลายเซ็น/);
  });

  it("alg none / kid ไม่รู้จัก → โยน", async () => {
    await assert.rejects(verifyGoogleIdToken(`${enc({ alg: "none" })}.${enc(good)}.`, opts));
    await assert.rejects(
      verifyGoogleIdToken(await sign(k1.privateKey, good, { alg: "RS256", kid: "zzz" }), opts),
      /ไม่พบกุญแจ/,
    );
  });

  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ["iss ผิด", { iss: "https://evil.example" }, /Google/],
    ["aud ของแอปอื่น", { aud: "other-client" }, /แอปนี้/],
    ["หมดอายุ", { exp: NOW - 3600 }, /หมดอายุ/],
    ["อีเมลยังไม่ยืนยัน", { email_verified: false }, /ยืนยัน/],
    ["อีเมลนอกโดเมน", { email: "x@gmail.com", hd: undefined }, /บริษัท/],
    ["hd ไม่ตรง", { hd: "other.co.th" }, /บริษัท/],
  ];
  for (const [name, patch, re] of cases) {
    it(`${name} → โยน`, async () => {
      await assert.rejects(verifyGoogleIdToken(await sign(k1.privateKey, { ...good, ...patch }), opts), re);
    });
  }

  it("aud เป็น array ที่มี client เรา → ผ่าน", async () => {
    const token = await sign(k1.privateKey, { ...good, aud: [CLIENT, "x"] });
    assert.equal((await verifyGoogleIdToken(token, opts)).email, "somchai@menatransport.co.th");
  });
});
