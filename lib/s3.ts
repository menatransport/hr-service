import { randomBytes } from "node:crypto";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { MEDIA_ROOT } from "@/lib/media";

/**
 * ที่เก็บไฟล์บน S3 (DigitalOcean Spaces `sgp1`) — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * โครงโฟลเดอร์และกติกาอายุการเก็บอยู่ที่หัวไฟล์ `lib/media.ts`
 *
 * ต่างจาก `lib/uploads.ts` (presign API ของ mena-go) โดยตั้งใจ: ทางนั้นเปิดสาธารณะทุกไฟล์
 * และรับแค่ชื่อรูป ซึ่งยังเหมาะกับรูปแนบคำร้องที่แอปมือถือต้องเปิดได้ · ทางนี้ **private
 * ทุกไฟล์** คุยกับ bucket ตรงด้วยคีย์ของเราเอง ใช้กับเอกสารส่วนบุคคลของ Mass Recruitment
 *
 * env: `S3_ENDPOINT` `S3_REGION` `S3_BUCKET` `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY`
 */

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

let client: S3Client | undefined;

function config() {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } =
    process.env;
  if (!S3_ENDPOINT || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new StorageError(
      "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (S3_ENDPOINT · S3_REGION · S3_BUCKET · S3_ACCESS_KEY_ID · S3_SECRET_ACCESS_KEY)",
      500,
    );
  }
  client ??= new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  return { s3: client, bucket: S3_BUCKET };
}

async function run<T>(what: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (err) {
    if (err instanceof StorageError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new StorageError(`${what}ไม่สำเร็จ (${reason})`);
  }
}

/* ------------------------------------------------------------------ ชื่อไฟล์ */

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** ส่วนหนึ่งของ path — รหัสที่มีอักษรแปลก/ไทยถูกแทนด้วย `_` key จะได้อ่านออกและไม่แตก */
export function keyPart(raw: string): string {
  return raw.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "_") || "_";
}

/** `20261001-142233-a1b2c3.jpg` — เวลาไทย เรียงตามเวลาได้ด้วยชื่อ · สุ่มท้ายกันชนกัน */
export function fileLeaf(contentType: string): string {
  const t = new Date(Date.now() + 7 * 3_600_000).toISOString();
  const stamp = `${t.slice(0, 10).replaceAll("-", "")}-${t.slice(11, 19).replaceAll(":", "")}`;
  return `${stamp}-${randomBytes(3).toString("hex")}.${EXT[contentType] ?? "bin"}`;
}

export const mediaKeys = {
  driverAvatar: (drivercode: string, contentType: string) =>
    `${MEDIA_ROOT}/drivers/${keyPart(drivercode)}/avatar/${fileLeaf(contentType)}`,
  driverDocument: (drivercode: string, docType: string, contentType: string) =>
    `${MEDIA_ROOT}/drivers/${keyPart(drivercode)}/documents/${keyPart(docType)}/${fileLeaf(contentType)}`,
  driverFolder: (drivercode: string) => `${MEDIA_ROOT}/drivers/${keyPart(drivercode)}/`,
  applicationDraft: (draftId: string, slot: string, contentType: string) =>
    `${MEDIA_ROOT}/applications/_drafts/${keyPart(draftId)}/${keyPart(slot)}/${fileLeaf(contentType)}`,
  applicationFile: (ref: string, slot: string, contentType: string) =>
    `${MEDIA_ROOT}/applications/${keyPart(ref)}/${keyPart(slot)}/${fileLeaf(contentType)}`,
  applicationFolder: (ref: string) => `${MEDIA_ROOT}/applications/${keyPart(ref)}/`,
};

/* ---------------------------------------------------------------- อ่าน/เขียน */

/** อัปไฟล์ขึ้น — private เสมอ (ค่าตั้งต้นของ bucket) */
export async function putMedia(key: string, file: File): Promise<void> {
  const { s3, bucket } = config();
  const body = new Uint8Array(await file.arrayBuffer());
  await run("อัปโหลดไฟล์", () =>
    s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: file.type || "application/octet-stream",
        ACL: "private",
      }),
    ),
  );
}

/** คัดลอกภายใน bucket — ใช้ย้ายไฟล์ร่างของผู้สมัครเข้าโฟลเดอร์ใบสมัครตอนกดส่ง */
export async function copyMedia(from: string, to: string): Promise<void> {
  const { s3, bucket } = config();
  await run("คัดลอกไฟล์", () =>
    s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: to,
        CopySource: `${bucket}/${from.split("/").map(encodeURIComponent).join("/")}`,
        ACL: "private",
      }),
    ),
  );
}

/** ลิงก์เปิดไฟล์อายุสั้น — คนเรียกต้องตรวจสิทธิ์มาก่อนเสมอ */
export async function presignMedia(key: string, seconds = 600): Promise<string> {
  const { s3, bucket } = config();
  return run("สร้างลิงก์เปิดไฟล์", () =>
    getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: seconds,
    }),
  );
}

/** ลบไฟล์เดียว — ไม่มีไฟล์นั้นอยู่แล้วก็ถือว่าสำเร็จ (S3 ตอบ 204 เหมือนกัน) */
export async function deleteMedia(key: string): Promise<void> {
  const { s3, bucket } = config();
  await run("ลบไฟล์", () => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })));
}

/**
 * ลบทั้งโฟลเดอร์ — คืนจำนวนไฟล์ที่ลบ · **บังคับให้อยู่ใต้ `mass-image/<หมวด>/<รหัส>/`**
 * กันพลาดส่ง prefix สั้นจนกวาดทั้ง bucket (ซึ่งมีไฟล์ของระบบอื่นอยู่ด้วย)
 */
export async function deleteMediaFolder(prefix: string): Promise<number> {
  if (!/^mass-image\/[^/]+\/[^/]+\/$/.test(prefix) && !prefix.startsWith(`${MEDIA_ROOT}/applications/_drafts/`)) {
    throw new StorageError(`ไม่ยอมลบโฟลเดอร์ “${prefix}” — กว้างเกินไป`, 500);
  }
  const { s3, bucket } = config();
  let removed = 0;
  let token: string | undefined;
  do {
    const page = await run("อ่านรายการไฟล์", () =>
      s3.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      ),
    );
    const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (keys.length) {
      await run("ลบไฟล์", () =>
        s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } })),
      );
      removed += keys.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return removed;
}
