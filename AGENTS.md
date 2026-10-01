<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## โครงสร้างไฟล์ของโปรเจกต์นี้

### โมดูลอยู่รวมโฟลเดอร์เดียว (colocation)
โค้ดของโมดูลใดโมดูลหนึ่งอยู่ใต้ route ของตัวเองทั้งหมด ไม่กระจายไป `components/` กับ `lib/`:

```
app/recruitment/
├─ _components/        ← UI เฉพาะโมดูลนี้ (admin/ · landing/)
├─ _lib/               ← data / types / logic เฉพาะโมดูลนี้ (drivers/ อยู่ในนี้)
├─ _docs/              ← ความต้องการระบบ, บันทึกการตัดสินใจ
└─ page.tsx  apply/  status/  privacy/  admin/
```

โฟลเดอร์ขึ้นต้นด้วย `_` = Next.js ไม่สร้าง route ให้ (private folder) จึงวางอะไรก็ได้
import ผ่าน `@/app/recruitment/_lib/...` และ `@/app/recruitment/_components/...`

> **ยกเว้น route handler** — `app/api/recruitment/` และ `app/api/drivers/` ยังอยู่ที่เดิม
> เพราะผูกกับ URL จริง ย้ายแล้วต้องตาม `proxy.ts` กับ fetch ทุกจุด ไม่คุ้ม

### กติกา: เมื่อไหร่ถึงแตกไฟล์ใหม่
แตกไฟล์ใหม่เมื่อเข้าเงื่อนไข **ข้อใดข้อหนึ่ง** เท่านั้น:

1. มีที่เรียกใช้ **ตั้งแต่ 2 ที่ขึ้นไป** — หรือ
2. ไฟล์แม่จะยาวเกิน **~400 บรรทัด** — หรือ
3. ติด **client/server boundary** (ตัวที่ต้อง `"use client"` แยกออกจาก server component)

**ห้าม**แตกไฟล์เพราะ "ดูเป็นระเบียบดี" — คอมโพเนนต์ 80 บรรทัดที่มีคนเรียกคนเดียว
ให้อยู่ในไฟล์ของคนเรียกนั้น การแยกออกมาได้แค่ทำให้ต้องเปิดหลายแท็บเวลาแก้ถ้อยคำ

### ขึ้นไปอยู่ส่วนกลางเมื่อไหร่
ย้ายขึ้น `components/ui/` หรือ `lib/` **ต่อเมื่อมีโมดูลอื่นเรียกใช้จริงแล้ว**
ไม่ใช่เพราะ "น่าจะได้ใช้" — ของกลางที่มีผู้ใช้คนเดียวคือหนี้ ไม่ใช่การลงทุน
