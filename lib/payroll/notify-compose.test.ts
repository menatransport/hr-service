import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GMAIL_URL_LIMIT,
  gmailCompose,
  parseRecipients,
  type ComposeDraft,
} from "@/lib/payroll/notify-compose";

const draft = (body: string): ComposeDraft => ({
  to: ["a@x.co"],
  cc: ["b@x.co"],
  subject: "หัวเรื่อง",
  body,
  shortBody: "ย่อ https://x/y",
});

test("เนื้อสั้นพอ เปิดฉบับเต็ม พร้อม to/cc/authuser และไม่มี + ในลิงก์", () => {
  const { url, shortened } = gmailCompose(draft("สวัสดี ครับ"), "me@x.co");
  assert.equal(shortened, false);
  assert.ok(url.startsWith("https://mail.google.com/mail/?view=cm&fs=1"));
  assert.ok(url.includes("to=a%40x.co") && url.includes("cc=b%40x.co"));
  assert.ok(url.includes("authuser=me%40x.co"));
  assert.ok(!url.includes("+"));
});

test("เนื้อยาวเกินเพดาน ใช้ฉบับย่อ และ URL ที่ได้ไม่เกินเพดาน", () => {
  const long = draft("ก".repeat(2000));
  const { url, shortened } = gmailCompose(long, null);
  assert.equal(shortened, true);
  assert.ok(url.length <= GMAIL_URL_LIMIT);
  assert.ok(url.includes(encodeURIComponent("ย่อ").slice(0, 9)));
  assert.ok(!url.includes("authuser"));
});

test("ไม่มี cc ไม่ใส่พารามิเตอร์ cc", () => {
  const { url } = gmailCompose({ ...draft("x"), cc: [] }, null);
  assert.ok(!url.includes("cc="));
});

/* ---- ผู้รับที่คนพิมพ์เอง ---- */

test("แยกผู้รับได้ทุกตัวคั่น และตัดตัวซ้ำโดยคงลำดับที่พิมพ์", () => {
  const { emails, invalid } = parseRecipients("a@x.co, b@x.co; c@x.co\n a@x.co  d@x.co");
  assert.deepEqual(emails, ["a@x.co", "b@x.co", "c@x.co", "d@x.co"]);
  assert.deepEqual(invalid, []);
});

test("ที่อยู่ที่ผิดรูปถูกแยกออกมาบอก ไม่ถูกทิ้งเงียบ", () => {
  const { emails, invalid } = parseRecipients("ดี@x.co, somchai, b@x, c@x.co");
  assert.deepEqual(emails, ["ดี@x.co", "c@x.co"]);
  assert.deepEqual(invalid, ["somchai", "b@x"]);
});

test("ช่องว่างเปล่า ได้รายชื่อว่าง ไม่ใช่ที่อยู่ว่างหนึ่งตัว", () => {
  assert.deepEqual(parseRecipients("   \n  ").emails, []);
  assert.deepEqual(parseRecipients("").invalid, []);
});
