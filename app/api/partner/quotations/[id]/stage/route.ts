import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { moveStage, holdDeal, resumeDeal, closeLost, attachFile, saveFields, getDeal, type Actor, setLossReason } from "@/lib/partner/deal-actions"
import { checkAdvance, screeningChecklist, type DealFields } from "@/lib/partner/deal-stage"
import { listLossReasons, reasonsForStage } from "@/lib/partner/loss-reason"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

/**
 * การกระทำกับดีลในไปป์ไลน์ — กติกาทั้งหมดตรวจซ้ำฝั่ง server เสมอ
 * (หน้าเว็บตรวจให้ผู้ใช้เห็นก่อน แต่เรียก API ตรงก็ต้องผ่านกติกาเดียวกัน)
 */

type Ctx = { params: Promise<{ id: string }> }

/** GET — สิ่งที่ต้องใช้บนหน้าดีล: ขยับได้ไหม ขาดอะไร เช็กลิสต์ และเหตุผลที่เลือกได้ */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const session = await getPartnerSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = (await partnerDb())
  const deal = await getDeal(db, id)
  if (!deal) return NextResponse.json({ error: "ไม่พบดีล" }, { status: 404 })

  const stage = String(deal.stage ?? "LEAD")
  const lostAt = stage === "ON_HOLD" ? String(deal.stageBeforeHold ?? "LEAD")
    : stage === "CLOSED_LOST" ? String(deal.lostAtStage ?? "LEAD")
    : stage
  const reasons = await listLossReasons(db)

  return NextResponse.json({
    stage,
    advance: checkAdvance(deal as DealFields),
    screening: screeningChecklist(deal as DealFields),
    lossReasons: reasonsForStage(reasons, lostAt),
    // ดีลที่ระบบปิดเอง (เงียบเกิน 30 วัน) — เซลล์ต้องกลับมาระบุเหตุผลจริง
    needsRealReason: stage === "CLOSED_LOST" && reasons.some((r) => r.isSystem && String(r._id) === String(deal.lossReasonId)),
  })
}

/** POST — action: advance | move | hold | resume | close | reason | fields | attach */
export async function POST(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("sales")
  if (perm instanceof Response) return perm

  const { id } = await params
  const session = await getPartnerSession()
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const actor: Actor = {
    email: session.user.email,
    isAdmin: ["admin", "superadmin"].includes(session.user.role ?? ""),
  }
  const b = await req.json().catch(() => null)
  if (!b?.action) return NextResponse.json({ error: "ไม่ได้ระบุการกระทำ" }, { status: 400 })

  const db = (await partnerDb())
  let result

  switch (b.action) {
    case "advance": {
      const deal = await getDeal(db, id)
      if (!deal) return NextResponse.json({ error: "ไม่พบดีล" }, { status: 404 })
      const next = checkAdvance(deal as DealFields)
      if (!next.to) return NextResponse.json({ error: next.error ?? "ขยับต่อไม่ได้" }, { status: 400 })
      result = await moveStage(db, id, next.to, actor, b.note)
      break
    }
    case "move":
      result = await moveStage(db, id, String(b.to ?? ""), actor, b.note)
      break
    case "hold":
      result = await holdDeal(db, id, actor, String(b.holdReason ?? ""), String(b.nextFollowUpDate ?? ""))
      break
    case "resume":
      result = await resumeDeal(db, id, actor)
      break
    case "close":
      result = await closeLost(db, id, actor, String(b.lossReasonId ?? ""), b.lossNote)
      break
    case "reason":
      result = await setLossReason(db, id, actor, String(b.lossReasonId ?? ""), b.lossNote)
      break
    case "fields":
      result = await saveFields(db, id, actor, (b.fields ?? {}) as Record<string, unknown>)
      break
    case "attach":
      result = await attachFile(db, id, actor, String(b.type ?? ""), String(b.url ?? ""), b.label)
      break
    default:
      return NextResponse.json({ error: "การกระทำไม่ถูกต้อง" }, { status: 400 })
  }

  if (!result.ok) {
    const missing = result.missing ?? []
    const error = result.error ?? (missing.length ? `ข้อมูลบังคับยังไม่ครบ: ${missing.join(" · ")}` : "ทำรายการไม่ได้")
    return NextResponse.json({ error, missing }, { status: 400 })
  }
  const deal = await getDeal(db, id)
  return NextResponse.json({ ok: true, deal: { ...deal, _id: String(deal?._id) } })
}
