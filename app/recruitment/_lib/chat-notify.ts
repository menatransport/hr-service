/**
 * แจ้ง Google Chat ของฝ่ายสรรหาเมื่อมีใบสมัครใหม่จากหน้า `/recruitment/apply` — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ทำไมต้องมี: ผู้ใช้แจ้งว่า "ข้อมูลมาช้า" (4 พ.ย. 2569) ทั้งที่ใบลงฐานทันที — คนหลังบ้าน
 * ไม่รู้ว่ามีใบเข้าจนกว่าจะเปิดหน้าเอง · การ์ดนี้มีปุ่มเปิดใบนั้นตรง ๆ (`?ref=`)
 *
 * - ลิงก์ webhook เก็บใน env `RECRUIT_CHAT_WEBHOOK` (ในลิงก์มี key + token) — ไม่มีค่า = ไม่ส่ง
 * - รูปหน้าตรงอยู่บน S3 private และ `/api/media` ต้องล็อกอิน — Google ดึงรูปเองไม่ได้ จึงใช้
 *   ลิงก์ presigned อายุสูงสุด 7 วัน (เพดาน SigV4) · Chat เก็บสำเนารูปไว้เองตอนแสดงการ์ด
 * - ส่งไม่ผ่าน**ห้าม**ทำให้การส่งใบสมัครพัง — ผู้เรียกใช้ใน `after()` และฟังก์ชันนี้ไม่ throw
 */

import { presignMedia } from "@/lib/s3";

import { levelOf, type RatingLevel } from "./driver-rating";

const APP_URL = "https://menahr-service.vercel.app";
const TIMEOUT_MS = 5000;
const PORTRAIT_LINK_SECONDS = 7 * 24 * 60 * 60;

export interface NewApplicationNotice {
  ref: string;
  /** คำนำหน้าที่ผู้สมัครเลือก (นาย/นาง/น.ส.) · `""` = ไม่มีข้อนี้ */
  title: string;
  fullName: string;
  phone: string;
  /** เจ้าหน้าที่ที่ผู้สมัครระบุว่าเคยคุยไว้ (`declaredContact`) · `""` = ไม่ได้ระบุ */
  contact: string;
  /** S3 key ของรูปหน้าตรง · `null` = ไม่ได้แนบ */
  portraitKey: string | null;
  workZone: string;
  readyToStart: string;
  /** ช่องที่บังคับแนบแล้ว / ทั้งหมด */
  requiredDocs: { done: number; total: number };
  fileCount: number;
  /** Driver Rating จากคำตอบในฟอร์ม (`summarizeRating`) · `null` = ยังไม่มีข้อที่ให้คะแนนได้ */
  rating: { average: number | null };
  createdAt: string;
}

function bangkokTime(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** คำตอบมาจากคนนอก — กัน `<a>`/`<font>` ที่พิมพ์มาเองไม่ให้ Chat แปลงเป็น HTML */
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ไม่มีคำตอบ = ขีด ไม่ปล่อยช่องว่าง (Chat ตัดแถวที่ข้อความว่างทิ้ง) */
const orDash = (v: string) => esc(v.trim()) || "—";

function field(icon: string, label: string, text: string) {
  return { decoratedText: { startIcon: { knownIcon: icon }, topLabel: label, text } };
}

/** `นาย สมชาย ใจดี` — ผู้สมัครบางคนพิมพ์คำนำหน้าติดชื่อมาแล้ว ไม่ต่อซ้ำ */
function displayName(title: string, name: string): string {
  const t = title.trim();
  const n = name.trim();
  return t && !n.startsWith(t) ? `${t} ${n}` : n;
}

/** สีปุ่มคะแนนตามระดับ — ชุดเดียวกับป้ายในตาราง (`hr-document-rating.tsx`: เขียว/เหลือง/แดง) */
const RATING_COLOR: Record<RatingLevel["tone"], { red: number; green: number; blue: number; alpha: number }> = {
  excellent: { red: 0.06, green: 0.46, blue: 0.43, alpha: 1 },
  good: { red: 0.06, green: 0.46, blue: 0.43, alpha: 1 },
  fair: { red: 0.71, green: 0.33, blue: 0.04, alpha: 1 },
  low: { red: 0.73, green: 0.11, blue: 0.11, alpha: 1 },
  risk: { red: 0.73, green: 0.11, blue: 0.11, alpha: 1 },
};

/** ปุ่ม `★ 4.1` ท้ายแถว — หน้าตาเดียวกับป้าย Driver Rating ในตารางผู้สมัคร · ไม่มีคะแนน = ไม่มีปุ่ม */
function ratingButton(average: number | null, url: string) {
  if (average === null) return {};
  const tone = levelOf(average)?.tone ?? "fair";
  return {
    button: {
      text: `★ ${average.toFixed(1)}`,
      color: RATING_COLOR[tone],
      onClick: { openLink: { url } },
    },
  };
}

/**
 * การ์ด cardsV2 คอลัมน์เดียว (ไม่ใช้ columns — กล่องแชทไม่ขยาย) — หัวโลโก้ · ผู้ติดต่อกลับ (เด่นสุด) ·
 * รูปหน้าตรงที่หัวการ์ด (แทนโลโก้) · ผู้สมัคร · ความพร้อม + ปุ่ม `★ 4.1` ท้ายแถวแรก · ปุ่มกลับเข้าระบบ · `portraitUrl` ต้องเป็นลิงก์ที่ Google เปิดได้โดยไม่ล็อกอิน
 */
export function buildApplicationCard(n: NewApplicationNotice, portraitUrl: string | null = null) {
  const base = APP_URL;
  const open = `${base}/recruitment/admin/candidates?ref=${encodeURIComponent(n.ref)}`;
  const docs = n.requiredDocs.total
    ? n.requiredDocs.done === n.requiredDocs.total
      ? `<font color="#0F7B5F">ครบ ${n.requiredDocs.total} รายการที่จำเป็น</font> · รวม ${n.fileCount} ไฟล์`
      : `<font color="#C2410C">ขาด ${n.requiredDocs.total - n.requiredDocs.done} รายการที่จำเป็น</font> · รวม ${n.fileCount} ไฟล์`
    : `${n.fileCount} ไฟล์`;

  return {
    text: `ใบสมัครใหม่ ${n.ref} · ${displayName(n.title, n.fullName)} · ผู้ติดต่อกลับ: ${n.contact || "ยังไม่ระบุ"}`,
    cardsV2: [
      {
        cardId: `application-${n.ref}`,
        card: {
          header: {
            title: "ใบสมัครใหม่ · พนักงานขับรถ",
            subtitle: `${n.ref} · รอการติดต่อ`,
            /* รูปหน้าตรงขึ้นที่หัวการ์ด — ตำแหน่งเดียวที่รูปใหญ่กว่าไอคอนท้ายแถวโดยกล่องไม่ขยาย
               (Bew 4 พ.ย. 2569) · ไม่ได้แนบรูปค่อยใช้โลโก้ */
            imageUrl: portraitUrl ?? `${base}/mena-logo.png`,
            imageType: "CIRCLE",
            imageAltText: portraitUrl ? "รูปหน้าตรง" : "MENA",
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    startIcon: { knownIcon: "MEMBERSHIP" },
                    topLabel: "ผู้ติดต่อกลับ · ผู้สมัครระบุ",
                    text: n.contact
                      ? `<font color="#0B57D0"><b>${esc(n.contact)}</b></font>`
                      : `<font color="#C2410C"><b>ยังไม่ระบุ</b></font>`,
                    ...(n.contact ? {} : { bottomLabel: "รอคนรับเรื่อง" }),
                  },
                },
              ],
            },
            {
              header: "ผู้สมัคร",
              widgets: [
                {
                  decoratedText: {
                    startIcon: { knownIcon: "PERSON" },
                    topLabel: "ชื่อ-นามสกุล",
                    text: `<b>${orDash(displayName(n.title, n.fullName))}</b>`,
                  },
                },
                field("PHONE", "เบอร์ติดต่อ", orDash(n.phone)),
              ],
            },
            {
              header: "ความพร้อม",
              widgets: [
                {
                  decoratedText: {
                    ...field("MAP_PIN", "เขตงานที่สะดวก", orDash(n.workZone)).decoratedText,
                    ...ratingButton(n.rating.average, open),
                  },
                },
                field("EVENT_SEAT", "พร้อมเริ่มงาน", orDash(n.readyToStart)),
                field("DESCRIPTION", "เอกสารแนบ", docs),
              ],
            },
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: "เปิดใบสมัคร",
                        color: { red: 0.05, green: 0.42, blue: 0.36, alpha: 1 },
                        onClick: { openLink: { url: open } },
                      },
                      {
                        text: "รายการรอติดต่อทั้งหมด",
                        onClick: { openLink: { url: `${base}/recruitment/admin/candidates` } },
                      },
                    ],
                  },
                },
                {
                  textParagraph: {
                    text: `<font color="#6B7280">ส่งเมื่อ ${bangkokTime(n.createdAt)} น.</font>`,
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

/** ส่งการ์ดเข้า Google Chat — เงียบเมื่อไม่ได้ตั้ง env · พังก็แค่ log ไม่ throw */
export async function notifyNewApplication(n: NewApplicationNotice): Promise<void> {
  const webhook = process.env.RECRUIT_CHAT_WEBHOOK;
  if (!webhook) return;
  try {
    /* ลิงก์รูปพังก็ยังส่งการ์ดได้ — แค่ไม่มีรูปท้ายชื่อ */
    const portraitUrl = n.portraitKey
      ? await presignMedia(n.portraitKey, PORTRAIT_LINK_SECONDS).catch(() => null)
      : null;
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(buildApplicationCard(n, portraitUrl)),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.error("[recruit-chat] ส่งไม่ผ่าน", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("[recruit-chat] ส่งไม่ผ่าน", err);
  }
}
