import { getDb } from "@/lib/mongo";
import { deleteMediaFolder, mediaKeys } from "@/lib/s3";
import { todayInBangkok } from "./registry";
import { resignedMediaPurgeDate } from "./types";

/**
 * ลบรูปประจำตัวและเอกสารในแฟ้มของ พจส. ที่ **พ้นสภาพครบ 1 เดือน** — ฝั่งเซิร์ฟเวอร์เท่านั้น
 * (ตามคำสั่งเจ้าของงาน 1 ต.ค. 2026) · เรียกวันละครั้งจาก `GET /api/cron/media-retention`
 *
 * เงื่อนไข: `statusOverride = "resigned"` (ฝ่ายบุคคลกดพ้นสภาพในระบบนี้) **และ** วันนี้ถึง
 * `resignedMediaPurgeDate(resignation.dateISO)` แล้ว · คนที่กลับมาทำงาน (กด “ปฏิบัติงาน”)
 * ถูกล้าง `resignation` ทิ้งจึงไม่โดน · คนที่ ETL บอกว่าออกแต่ไม่มีบันทึกพ้นสภาพ **ไม่มีวันที่
 * ให้นับ จึงไม่ถูกลบ** — ต้องกดพ้นสภาพให้มีวันที่ก่อน
 *
 * ลบทั้งโฟลเดอร์ `mass-image/drivers/{drivercode}/` บน S3 ก่อน แล้วค่อยล้าง `photoUrl` /
 * `documents` ในฐาน + ประทับ `mediaPurgedAt` · ลำดับนี้ทำให้ล้มกลางทางแล้วรอบหน้าลองใหม่ได้
 * (ถ้าล้างฐานก่อนแล้วลบ S3 ไม่ติด ไฟล์จะค้างโดยไม่มีอะไรชี้กลับมาหามันอีก)
 *
 * ข้อมูลการพ้นสภาพ (วันที่ เหตุผล) **ไม่ถูกลบ** — ลบเฉพาะไฟล์รูปและเอกสาร
 */

export interface MediaPurgeReport {
  today: string;
  dryRun: boolean;
  /** รหัสที่ลบแล้ว (หรือจะถูกลบ ถ้า `dryRun`) พร้อมจำนวนไฟล์บน S3 */
  purged: { drivercode: string; resignedOn: string; files: number }[];
  failed: { drivercode: string; error: string }[];
}

export async function purgeResignedDriverMedia(
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<MediaPurgeReport> {
  const today = todayInBangkok();
  const collection = (await getDb()).collection("master_driver");

  /* คัดกว้างด้วย Mongo แล้วตัดสินวันที่ด้วย `resignedMediaPurgeDate()` ตัวเดียวกับป้าย
     บนหน้าจอ — วันบนจอกับวันที่ลบจริงจะไม่มีวันคลาดกัน */
  const candidates = await collection
    .find(
      {
        statusOverride: "resigned",
        "resignation.dateISO": { $type: "string", $lt: today },
        mediaPurgedAt: { $exists: false },
      },
      { projection: { drivercode: 1, resignation: 1 } },
    )
    .toArray();

  const report: MediaPurgeReport = { today, dryRun, purged: [], failed: [] };

  for (const doc of candidates) {
    const drivercode = String(doc.drivercode ?? "").trim();
    const resignedOn = String((doc.resignation as { dateISO?: unknown })?.dateISO ?? "");
    const due = resignedMediaPurgeDate(resignedOn);
    if (!drivercode || !due || due > today) continue;

    if (dryRun) {
      report.purged.push({ drivercode, resignedOn, files: 0 });
      continue;
    }

    try {
      const files = await deleteMediaFolder(mediaKeys.driverFolder(drivercode));
      await collection.updateOne(
        { drivercode, statusOverride: "resigned" },
        { $set: { photoUrl: "", documents: [], mediaPurgedAt: new Date() } },
      );
      report.purged.push({ drivercode, resignedOn, files });
    } catch (err) {
      report.failed.push({
        drivercode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
