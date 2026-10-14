/**
 * ตัวช่วยร่วมของสคริปต์ `node *.mjs` ที่รากโปรเจกต์ — อ่าน `.env.local` + เลือก database
 * (เดิมก๊อปตัวอ่าน env ชุดเดียวกันไว้ทุกไฟล์ · ชื่อ db/คอลเลกชันมาจาก `lib/db/registry.mjs`)
 *
 * **seed ทุกตัวเขียนได้เฉพาะ `hr_service_dev`** (`seedTargetDb()`) — จะลงฐานจริงต้องใส่ `--force` เอง
 * กันกด seed ผิดเครื่องแล้วข้อมูลตัวอย่างไปปนกับของจริง
 */
import fs from "node:fs";

import { DB } from "./lib/db/registry.mjs";

/** database สำหรับข้อมูลตัวอย่าง — seed ไม่มี `--force` เขียนได้ที่นี่ที่เดียว */
export const DEV_DB = "hr_service_dev";

/** อ่าน `.env.local` แบบเดียวกับที่ทุกสคริปต์เคยทำ (บรรทัด `KEY=value` · ตัดเครื่องหมายคำพูดหัวท้าย) */
export function loadEnv() {
  return Object.fromEntries(
    fs
      .readFileSync(new URL(".env.local", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

/** database `hr_service` ตาม env — ตัวเดียวกับที่แอปใช้ (`MONGO_DB` ก่อน ไม่มีค่อยใช้ค่าตั้งต้น) */
export function hrDbName(/** @type {Record<string, string>} */ env) {
  return env.MONGO_DB || DB.hr;
}

/** ค่าของ `--db <name>` หรือ `--db=<name>` */
function dbFlag(/** @type {string[]} */ argv) {
  const eq = argv.find((a) => a.startsWith("--db="));
  if (eq) return eq.slice("--db=".length);
  const i = argv.indexOf("--db");
  if (i < 0) return undefined;
  const value = argv[i + 1];
  if (!value || value.startsWith("--")) {
    console.error("--db ต้องตามด้วยชื่อ database เช่น --db hr_service_dev");
    process.exit(1);
  }
  return value;
}

/**
 * database ปลายทางของสคริปต์ seed — `--db` ก่อน แล้วค่อย `MONGO_DB` แล้วค่อยค่าตั้งต้น
 * **ไม่ใช่ `hr_service_dev` และไม่มี `--force` = หยุดทันที** (ก่อนเปิด connection) · พิมพ์ปลายทางเสมอ
 * @param {Record<string, string>} env
 * @param {string[]} [argv]
 */
export function seedTargetDb(env, argv = process.argv) {
  const target = dbFlag(argv) || hrDbName(env);
  const force = argv.includes("--force");
  console.log(`ปลายทาง: database "${target}"`);

  if (target !== DEV_DB && !force) {
    console.error(
      `หยุด — seed เขียนได้เฉพาะ "${DEV_DB}" (ใส่ --db ${DEV_DB} หรือตั้ง MONGO_DB=${DEV_DB})\n` +
        `ถ้าตั้งใจลง "${target}" จริง ๆ ให้ใส่ --force`,
    );
    process.exit(1);
  }
  if (target !== DEV_DB) console.warn(`--force: กำลังเขียนลง "${target}" ซึ่งไม่ใช่ฐานทดลอง`);
  return target;
}
