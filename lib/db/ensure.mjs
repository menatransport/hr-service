// @ts-check
/**
 * เทียบดัชนีบนฐานจริงกับที่ประกาศไว้ใน `registry.mjs` + สร้างตัวที่ขาด — ใช้ร่วมกันสองทาง:
 * `ensureIndexesOnce()` ตอนแอปรัน (`lib/db/index.ts`) และ `node ensure_db.mjs` ที่รากโปรเจกต์
 *
 * กติกาที่ห้ามหลุด:
 * - **ไม่ลบอะไรเลย** — ดัชนีที่มีบนฐานแต่ไม่ได้ประกาศ (extra) แค่รายงาน จะลบต้องตัดสินใจเองทีละตัว
 * - **ไม่แตะคอลเลกชัน `external`** และไม่แตะ `Boom_ETL` (ไม่อยู่ใน `HR` ตั้งแต่แรก)
 * - ชื่อตรงแต่คีย์/ออปชันต่าง หรือคีย์ตรงแต่ชื่อต่าง = conflict → **ไม่สร้างทับ** เพราะ `createIndexes`
 *   จะ error อยู่ดี ต้องไล่แก้ด้วยมือ
 */
import { BUCKETS, HR, INDEXES } from "./registry.mjs";

/** @typedef {import("mongodb").Db} Db */
/** @typedef {import("mongodb").IndexDescription} IndexDescription */
/** @typedef {keyof typeof HR} HrKey */

/**
 * @typedef {object} CollectionDiff
 * @property {HrKey} key
 * @property {string} name
 * @property {boolean} exists
 * @property {string[]} ok          ดัชนีที่ตรงกันทั้งชื่อ คีย์ และออปชัน
 * @property {IndexDescription[]} missing   ประกาศไว้แต่ไม่มีบนฐาน
 * @property {{ name: string, key: unknown }[]} extra   มีบนฐานแต่ไม่ได้ประกาศ (ไม่นับ `_id_`)
 * @property {{ declared: IndexDescription, live: Record<string, unknown>, reason: string }[]} conflicts
 */

/** ออปชันที่ถ้าต่างกัน `createIndexes` จะถือว่าเป็นคนละดัชนี */
const OPTION_KEYS = /** @type {const} */ ([
  "unique",
  "sparse",
  "partialFilterExpression",
  "expireAfterSeconds",
  "collation",
]);

/** คอลเลกชันที่เราเป็นเจ้าของ (ไม่ใช่ `external`) พร้อมดัชนีที่ประกาศไว้ */
export function managedCollections() {
  const keys = /** @type {HrKey[]} */ (Object.keys(HR));
  return keys
    .filter((key) => !("external" in HR[key] && HR[key].external))
    .map((key) => ({ key, name: HR[key].name, indexes: INDEXES[key] ?? [] }));
}

/** คอลเลกชันของระบบอื่นที่เราแค่อ่าน */
export function externalCollections() {
  const keys = /** @type {HrKey[]} */ (Object.keys(HR));
  return keys.filter((key) => "external" in HR[key] && HR[key].external).map((key) => HR[key].name);
}

/** คีย์ดัชนีต้องตรงทั้งฟิลด์ ทิศ และ **ลำดับ** (`{a:1,b:1}` ≠ `{b:1,a:1}`) */
function sameKey(/** @type {unknown} */ a, /** @type {unknown} */ b) {
  return JSON.stringify(Object.entries(a ?? {})) === JSON.stringify(Object.entries(b ?? {}));
}

/** คืนชื่อออปชันแรกที่ต่าง — `undefined` = ตรงกันหมด */
function optionMismatch(
  /** @type {IndexDescription} */ declared,
  /** @type {Record<string, unknown>} */ live,
) {
  const d = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (declared));
  for (const opt of OPTION_KEYS) {
    const same =
      opt === "unique" || opt === "sparse"
        ? Boolean(d[opt]) === Boolean(live[opt])
        : JSON.stringify(d[opt] ?? null) === JSON.stringify(live[opt] ?? null);
    if (!same) return opt;
  }
  return undefined;
}

/** `listIndexes` ของคอลเลกชันที่ยังไม่มีจะโยน NamespaceNotFound (26) — ถือว่าไม่มีดัชนี */
async function liveIndexes(/** @type {Db} */ db, /** @type {string} */ name) {
  try {
    return /** @type {Record<string, unknown>[]} */ (await db.collection(name).indexes());
  } catch (err) {
    if (/** @type {{ code?: number }} */ (err)?.code === 26) return [];
    throw err;
  }
}

/**
 * เทียบของจริงกับที่ประกาศ — **อ่านอย่างเดียว** (`listCollections` + `listIndexes`)
 * @param {Db} db  database `hr_service`
 */
export async function diffIndexes(db) {
  const liveNames = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );

  /** @type {CollectionDiff[]} */
  const collections = [];
  for (const { key, name, indexes } of managedCollections()) {
    const exists = liveNames.has(name);
    const live = exists ? await liveIndexes(db, name) : [];
    /** @type {CollectionDiff} */
    const diff = { key, name, exists, ok: [], missing: [], extra: [], conflicts: [] };

    for (const spec of indexes) {
      const byName = live.find((ix) => ix.name === spec.name);
      if (byName) {
        if (!sameKey(spec.key, byName.key)) {
          diff.conflicts.push({ declared: spec, live: byName, reason: "ชื่อตรงแต่คีย์ต่าง" });
          continue;
        }
        const opt = optionMismatch(spec, byName);
        if (opt) diff.conflicts.push({ declared: spec, live: byName, reason: `ออปชัน ${opt} ต่าง` });
        else diff.ok.push(String(spec.name));
        continue;
      }
      const byKey = live.find((ix) => sameKey(spec.key, ix.key));
      if (byKey) diff.conflicts.push({ declared: spec, live: byKey, reason: "คีย์ตรงแต่ชื่อต่าง" });
      else diff.missing.push(spec);
    }

    const declaredNames = new Set(indexes.map((s) => s.name));
    for (const ix of live) {
      const ixName = String(ix.name);
      if (ixName === "_id_" || declaredNames.has(ixName)) continue;
      diff.extra.push({ name: ixName, key: ix.key });
    }
    collections.push(diff);
  }

  const known = new Set([
    ...Object.values(HR).map((def) => def.name),
    ...Object.values(BUCKETS).flatMap((b) => [`${b}.files`, `${b}.chunks`]),
  ]);
  const unregistered = [...liveNames].filter((n) => !known.has(n) && !n.startsWith("system.")).sort();
  const external = externalCollections().map((name) => ({ name, exists: liveNames.has(name) }));

  return { collections, unregistered, external };
}

/**
 * สร้าง **เฉพาะดัชนีที่ขาด** จากผลของ `diffIndexes()` — conflict ไม่แตะ · ไม่ลบอะไร
 * (ใช้กับ `node ensure_db.mjs --apply` เท่านั้น)
 * @param {Db} db
 * @param {Awaited<ReturnType<typeof diffIndexes>>} diff
 */
export async function applyMissingIndexes(db, diff) {
  /** @type {{ name: string, created: string[] }[]} */
  const done = [];
  for (const c of diff.collections) {
    if (!c.missing.length) continue;
    const created = await db.collection(c.name).createIndexes([...c.missing]);
    done.push({ name: c.name, created });
  }
  return done;
}

/**
 * ยิง `createIndexes` ทุกคอลเลกชันที่ประกาศดัชนีไว้ — มีครบแล้ว = no-op ฝั่งเซิร์ฟเวอร์
 * ล้มทีละคอลเลกชันไม่ลากตัวอื่น (`allSettled`) แล้วคืนรายการที่ล้มให้คนเรียกตัดสินใจเอง
 * (ใช้กับ `ensureIndexesOnce()` ตอนแอปรัน)
 * @param {Db} db
 */
export async function createDeclaredIndexes(db) {
  const targets = managedCollections().filter((c) => c.indexes.length);
  const results = await Promise.allSettled(
    targets.map((c) => db.collection(c.name).createIndexes([...c.indexes])),
  );
  /** @type {{ name: string, error: string }[]} */
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const err = r.reason;
      failed.push({ name: targets[i].name, error: err instanceof Error ? err.message : String(err) });
    }
  });
  return { failed };
}
