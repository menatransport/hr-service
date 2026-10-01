/**
 * ตั้งกฎ lifecycle ของ bucket: **ไฟล์ร่างของผู้สมัครที่ไม่ได้กดส่ง ลบทิ้งเองเมื่อครบ 1 วัน**
 * (`mass-image/applications/_drafts/` — ดู `lib/media.ts`)
 *
 *   node setup_media_lifecycle.mjs          → เพิ่ม/อัปเดตกฎของเรา แล้วพิมพ์กฎทั้งหมดของ bucket
 *   node setup_media_lifecycle.mjs --show   → ดูอย่างเดียว ไม่แก้อะไร
 *
 * ⚠️ bucket นี้ใช้ร่วมกับระบบอื่น (mena-go) และ `PutBucketLifecycleConfiguration` **เขียนทับ
 * กฎทั้ง bucket** — สคริปต์จึงอ่านกฎเดิมก่อน แล้วแทนเฉพาะกฎที่ `ID` ตรงกับของเรา กฎของ
 * ระบบอื่นต้องอยู่ครบเหมือนเดิม · รันซ้ำได้ปลอดภัย
 */
import fs from "node:fs";
import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL(".env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const RULE = {
  ID: "hr-service-mass-image-drafts-1d",
  Status: "Enabled",
  Filter: { Prefix: "mass-image/applications/_drafts/" },
  Expiration: { Days: 1 },
};

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});
const Bucket = env.S3_BUCKET;

async function current() {
  try {
    return (await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket }))).Rules ?? [];
  } catch (err) {
    if (err?.name === "NoSuchLifecycleConfiguration") return [];
    throw err;
  }
}

const before = await current();
if (!process.argv.includes("--show")) {
  const rules = [...before.filter((r) => r.ID !== RULE.ID), RULE];
  await s3.send(
    new PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: { Rules: rules } }),
  );
  console.log(`ตั้งกฎ ${RULE.ID} แล้ว (กฎของระบบอื่นที่มีอยู่ ${before.filter((r) => r.ID !== RULE.ID).length} ข้อ คงไว้ตามเดิม)`);
}
console.log(JSON.stringify(await current(), null, 2));
