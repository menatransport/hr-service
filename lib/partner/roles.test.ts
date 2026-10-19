import assert from "node:assert/strict"
import { test } from "node:test"

import type { Role } from "@/lib/partner/rbac"
import { resolveRoleWith } from "@/lib/partner/roles"

const users = new Map<string, Role>([
  ["fleet@menatransport.co.th", "fleet"],
  ["fin@menatransport.co.th", "finance"],
])
const load = async () => users
const empty = async () => new Map<string, Role>()
const down = async (): Promise<Map<string, Role>> => { throw new Error("db down") }

test("พบใน app_users → บทบาทที่ตั้ง (ไม่สนตัวพิมพ์/ช่องว่าง)", async () => {
  assert.equal(await resolveRoleWith(" Fleet@MenaTransport.co.th ", load, []), "fleet")
  assert.equal(await resolveRoleWith("fin@menatransport.co.th", load, []), "finance")
})

test("SUPERADMIN_EMAILS มาก่อน app_users", async () => {
  assert.equal(await resolveRoleWith("fleet@menatransport.co.th", load, ["fleet@menatransport.co.th"]), "superadmin")
})

test("ไม่มีอีเมล (คุกกี้เก่า) → viewer", async () => {
  assert.equal(await resolveRoleWith(undefined, load, []), "viewer")
  assert.equal(await resolveRoleWith("", load, []), "viewer")
})

test("ตัด grandfather: คนในโดเมนที่ไม่มีบทบาท → viewer (เดิม salesperson)", async () => {
  assert.equal(await resolveRoleWith("new@menatransport.co.th", load, []), "viewer")
})

test("ตัด grandfather: app_users ว่าง + ไม่ตั้ง superadmin → viewer (เดิม admin)", async () => {
  assert.equal(await resolveRoleWith("anyone@menatransport.co.th", empty, []), "viewer")
})

test("ตัด grandfather: ฐานล่ม → viewer (เดิม admin)", async () => {
  assert.equal(await resolveRoleWith("fleet@menatransport.co.th", down, []), "viewer")
})
