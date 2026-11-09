"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, ImageUp, PenLine, UserRound, X } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import {
  SignatureLoader,
  SignatureLoaderOverlay,
} from "@/app/recruitment/_components/signature-loader";
import { SegmentedControl } from "@/components/ui/summary-panel";
import { requestJson } from "@/lib/http";
import { alertError, confirm, runAction } from "@/lib/swal";
import { thaiShortDateTime } from "@/app/recruitment/_lib/hr-documents";
import {
  DOC_SIGN_SLOTS,
  MAX_SIGNATURE_CHARS,
  signKey,
  type DocSignature,
  type DocSignatures,
  type MySignature,
  type SignKey,
  type SignSlot,
} from "@/app/recruitment/_lib/hr-signatures";
import type { HrDocId } from "@/app/recruitment/_lib/hr-documents";

/**
 * ลายเซ็นในกล่องทำเอกสาร (8 พ.ย. 2569) — กติกาอยู่ที่หัวไฟล์ `hr-signatures.ts`
 *
 * - `useMySignature()` ลายเซ็นของเจ้าหน้าที่ตาม session (โหลดครั้งเดียวตอนเปิดกล่อง)
 * - `SignaturePanel` แผงซ้าย: ทุกช่องลงนามของฉบับที่เลือก (ตั้งลายเซ็นของฉันผ่านช่องเจ้าหน้าที่)
 * - `SignaturePadModal` เขียนเซ็นบนจอ หรืออัปโหลดรูปลายเซ็น (ตัดพื้นขาวให้เอง)
 */

const MY_SIGNATURE = "/api/recruitment/my-signature";

/** หมึกลายเซ็นที่เขียนบนจอ — น้ำเงินเข้มแบบปากกาลูกลื่น แยกจากตัวพิมพ์บนกระดาษได้ทันที */
const INK = "#16307a";

/** ขนาดรูปหลังย่อ — พอดีช่องลงนามบนกระดาษ A4 (~15em × 13mm) โดยไม่เปลืองที่เก็บ */
const OUT_MAX_W = 640;
const OUT_MAX_H = 220;

/* ---------------------------------------------------------- ลายเซ็นของฉัน (session) */

type MyState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; me: MySignature };

export function useMySignature(enabled: boolean) {
  const [state, setState] = useState<MyState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const me = await requestJson<MySignature>(
        MY_SIGNATURE,
        {},
        "โหลดลายเซ็นของฉันไม่สำเร็จ",
      );
      setState({ status: "ready", me });
    } catch (err) {
      setState({
        status: "error",
        message:
          err instanceof Error ? err.message : "โหลดลายเซ็นของฉันไม่สำเร็จ",
      });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดครั้งแรกตอนเปิดกล่อง
    void load();
  }, [enabled, load]);

  /** บันทึก/เปลี่ยนลายเซ็นของฉัน — โยน error ต่อ */
  async function save(image: string): Promise<MySignature> {
    const me = await requestJson<MySignature>(
      MY_SIGNATURE,
      { method: "PUT", body: { image } },
      "บันทึกลายเซ็นของฉันไม่สำเร็จ",
    );
    setState({ status: "ready", me });
    return me;
  }

  return { state, reload: load, save };
}

type MySignatureStore = ReturnType<typeof useMySignature>;

/* ------------------------------------------------------------------ แผงซ้าย */

/** ช่องที่ตัวเขียนลายเซ็นเปิดค้างอยู่ */
type PadTarget = { kind: "slot"; slot: SignSlot };

export function SignaturePanel({
  doc,
  signatures,
  applicantName,
  staffNames,
  mine,
  onSign,
}: {
  doc: HrDocId;
  signatures: DocSignatures | undefined;
  /** ชื่อผู้สมัครที่ลงในวงเล็บใต้ช่องผู้สมัคร */
  applicantName: string;
  /** ชื่อที่พิมพ์ไว้ของช่องเจ้าหน้าที่ (นายจ้าง/พยาน) — โชว์ตอนช่องยังไม่เซ็น */
  staffNames: Partial<Record<SignSlot["role"], string>>;
  mine: MySignatureStore;
  onSign: (key: SignKey, signature: DocSignature | null) => void;
}) {
  const slots = DOC_SIGN_SLOTS[doc];
  const [pad, setPad] = useState<PadTarget | null>(null);
  const [savingMine, setSavingMine] = useState(false);
  const me = mine.state.status === "ready" ? mine.state.me : null;

  if (!slots.length) return null;

  /**
   * ชื่อใต้ลายเซ็นช่องเจ้าหน้าที่ = ชื่อในรายชื่อผู้ลงนามของเอกสาร (นายจ้าง/พยาน) เสมอ
   * ถึงคนกดเซ็นจะเป็นบัญชีอื่น (Bew 9 พ.ย. 2569) · ช่องที่ไม่มีรายชื่อ (ผู้สัมภาษณ์)
   * ถึงถอยไปชื่อบัญชีที่ล็อกอิน
   */
  const signerName = (slot: SignSlot) =>
    staffNames[slot.role]?.trim() || me?.name || "";

  const staffSignature = (slot: SignSlot, image: string): DocSignature => ({
    image,
    name: signerName(slot),
    by: "staff",
    employeeId: me?.employeeId ?? "",
    signedAt: new Date().toISOString(),
  });

  /** ช่องเจ้าหน้าที่: มีลายเซ็นของฉันแล้ว = ลงทันที · ยังไม่มี = เปิดตัวเขียนพร้อมจำไว้ */
  async function signAsMe(slot: SignSlot) {
    if (!me) return;
    const twin = slots.find(
      (s) =>
        s.role !== slot.role &&
        signatures?.[signKey(doc, s.role)]?.employeeId === me.employeeId,
    );
    if (
      twin &&
      !(await confirm({
        title: "เซ็นซ้ำอีกช่อง?",
        text: `คุณเซ็นช่อง “${slotLabel(twin)}” ของฉบับนี้ไปแล้ว — ช่องลงนามคนละช่องปกติเป็นคนละคน`,
        confirmText: "เซ็นต่อ",
        tone: "warn",
      }))
    )
      return;
    if (me.image) onSign(signKey(doc, slot.role), staffSignature(slot, me.image));
    else setPad({ kind: "slot", slot });
  }

  async function finishPad(image: string, remember: boolean) {
    const target = pad;
    if (!target) return;

    if (remember) {
      const out = await runAction({
        confirm: false,
        success: false,
        failureTitle: "บันทึกลายเซ็นของฉันไม่สำเร็จ",
        run: async () => {
          setSavingMine(true);
          try {
            return await mine.save(image);
          } finally {
            setSavingMine(false);
          }
        },
      });
      if (out.status !== "done") return;
    }

    onSign(
      signKey(doc, target.slot.role),
      target.slot.staff
        ? staffSignature(target.slot, image)
        : {
            image,
            name: applicantName,
            by: "applicant",
            employeeId: "",
            signedAt: new Date().toISOString(),
          },
    );
    setPad(null);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="flex items-baseline justify-between gap-2 text-12-5 font-medium">
        ลายเซ็น
        <span className="text-11 font-normal text-mut">
          กดบันทึกเพื่อเก็บลายเซ็นในเอกสาร
        </span>
      </p>

      {/* ไม่มีการ์ด “ลายเซ็นของฉัน” แยก (Bew — เดี๋ยวงง) · ตั้ง/เปลี่ยนลายเซ็นของฉันทำผ่าน
          ปุ่มของช่องเจ้าหน้าที่เท่านั้น · โหลดไม่สำเร็จเท่านั้นถึงขึ้นแถบให้ลองใหม่ */}
      {mine.state.status === "loading" ? (
        <SignatureLoader size="sm" label="กำลังโหลดลายเซ็นของฉัน…" />
      ) : mine.state.status === "error" ? (
        <div className="flex items-center justify-between gap-2 rounded-field border border-alert/30 bg-alert-soft px-3 py-2 text-12 text-alert">
          <span>{mine.state.message}</span>
          <button
            type="button"
            onClick={() => void mine.reload()}
            className="flex-none underline"
          >
            ลองใหม่
          </button>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {slots.map((slot) => {
          const key = signKey(doc, slot.role);
          const sig = signatures?.[key];
          const name = slot.staff
            ? staffNames[slot.role]?.trim() || sig?.name || ""
            : applicantName;
          return (
            /* ข้อมูลบน · ปุ่มล่างเต็มแถว — แผงกว้าง 360px ปุ่มสองปุ่มวางข้างข้อความแล้วชื่อถูกบีบ */
            <li
              key={key}
              className="flex flex-col gap-2 rounded-field border border-line p-2"
            >
              <div className="flex items-center gap-2.5">
                <SignaturePreview image={sig?.image} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-12-5 font-medium">
                    {slotLabel(slot)}
                    {slot.label !== "ผู้สมัคร" ? (
                      <span className="ml-1.5 text-10-5 font-normal text-mut">
                        {slot.staff ? "เจ้าหน้าที่" : "ผู้สมัคร"}
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-11-5 text-mut">
                    {name ? `(${name})` : "ยังไม่ระบุชื่อ"}
                  </span>
                  {sig ? (
                    <span className="text-10-5 text-mut">
                      เซ็นเมื่อ {thaiShortDateTime(sig.signedAt)}
                    </span>
                  ) : null}
                </div>
                {sig ? (
                  <button
                    type="button"
                    onClick={() => onSign(key, null)}
                    className="flex items-center gap-1 rounded-selector px-1.5 py-1 text-11-5 text-mut transition-colors hover:bg-base-200 hover:text-alert"
                  >
                    <X size={12} strokeWidth={2} aria-hidden />
                    ล้าง
                  </button>
                ) : null}
              </div>
              {sig ? null : (
                <div className="grid grid-cols-2 gap-1.5">
                  {slot.staff ? (
                    <button
                      type="button"
                      disabled={!me}
                      onClick={() => void signAsMe(slot)}
                      title={
                        me ? `เซ็นในชื่อ ${signerName(slot)}` : "รอโหลดลายเซ็นของฉัน"
                      }
                      className={`btn-soft flex items-center justify-center gap-1 px-2 py-1.5 text-11-5 disabled:opacity-60 ${me?.image ? "" : "col-span-2"}`}
                    >
                      <UserRound size={12} strokeWidth={2} aria-hidden />
                      {me?.image ? "ใช้ลายเซ็นของฉัน" : "ตั้งลายเซ็นแล้วเซ็น"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPad({ kind: "slot", slot })}
                      className="btn-soft col-span-2 flex items-center justify-center gap-1 px-2 py-1.5 text-11-5"
                    >
                      <PenLine size={12} strokeWidth={2} aria-hidden />
                      ให้ผู้สมัครเซ็น
                    </button>
                  )}
                  {/* ช่องเจ้าหน้าที่ที่ยังไม่เซ็น เขียน/อัปโหลดใหม่ได้ — ติ๊กในตัวเขียนถ้าจะแทนลายเซ็นของฉัน */}
                  {slot.staff && me?.image ? (
                    <button
                      type="button"
                      onClick={() => setPad({ kind: "slot", slot })}
                      className="btn-sec flex items-center justify-center gap-1 px-2 py-1.5 text-11-5 transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <PenLine size={12} strokeWidth={2} aria-hidden />
                      เซ็นใหม่ / อัปโหลด
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {pad ? (
        <SignaturePadModal
          title={
            pad.slot.staff
              ? `ลายเซ็น${slotLabel(pad.slot)} · ${signerName(pad.slot)}`
              : `ลายเซ็นผู้สมัคร · ${applicantName}`
          }
          subtitle={
            pad.slot.staff
              ? `${
                  staffNames[pad.slot.role]?.trim()
                    ? "ชื่อใต้ลายเซ็นใช้ตามรายชื่อผู้ลงนาม"
                    : "ชื่อใต้ลายเซ็นอ่านจากบัญชีที่ล็อกอิน"
                } · ${
                  me?.image
                    ? "ติ๊กด้านล่างถ้าจะใช้แทนลายเซ็นเดิมของคุณ"
                    : "ลายเซ็นนี้จะจำไว้ให้ ครั้งหน้ากดเซ็นได้ทันที"
                }`
              : "ให้ผู้สมัครเซ็นบนจอ หรืออัปโหลดรูปลายเซ็น — ชื่อใต้ลายเซ็นดึงจากชื่อผู้สมัคร"
          }
          /* ช่องเจ้าหน้าที่ที่ยังไม่มีลายเซ็นของฉัน: ติ๊กจำไว้ให้ตั้งต้น */
          remember={pad.slot.staff ? (me?.image ? "off" : "on") : "hidden"}
          onDone={(image, remember) => void finishPad(image, remember)}
          onClose={() => setPad(null)}
        />
      ) : null}
      {savingMine ? <SignatureLoaderOverlay label="กำลังบันทึกลายเซ็นของฉัน…" /> : null}
    </div>
  );
}

/** ป้ายในแผงซ้าย — พยานสองช่องบนกระดาษใช้ป้ายเดียวกัน แต่ในแผงต้องแยกให้ออก */
const slotLabel = (slot: SignSlot) =>
  slot.role === "witness1"
    ? "พยาน 1"
    : slot.role === "witness2"
      ? "พยาน 2"
      : slot.label;

function SignaturePreview({
  image,
  empty = "ยังไม่เซ็น",
}: {
  image?: string;
  empty?: string;
}) {
  return (
    <span className="flex h-11 w-24 flex-none items-center justify-center overflow-hidden rounded-selector border border-dashed border-line bg-white">
      {image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={image}
          alt="ลายเซ็น"
          className="max-h-full max-w-full object-contain p-0.5"
        />
      ) : (
        <span className="text-10-5 text-mut">{empty}</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------ ตัวเขียน/อัปโหลด */

export function SignaturePadModal({
  title,
  subtitle,
  remember: rememberMode,
  onDone,
  onClose,
}: {
  title: string;
  subtitle: string;
  /** ช่องติ๊ก “จำเป็นลายเซ็นของฉัน” — `hidden` = ไม่มี (ผู้สมัคร / ตั้งลายเซ็นของฉันอยู่แล้ว) */
  remember: "on" | "off" | "hidden";
  onDone: (image: string, remember: boolean) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [drawn, setDrawn] = useState(false);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [remember, setRemember] = useState(rememberMode === "on");
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  /* ตั้งความละเอียดตามจอจริง — ไม่งั้นเส้นบนจอ retina แตกเป็นขั้นบันได */
  useEffect(() => {
    if (mode !== "draw") return;
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(el.clientWidth * dpr);
    el.height = Math.round(el.clientHeight * dpr);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    setDrawn(false);
  }, [mode]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    last.current = p;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    /* แตะจุดเดียวก็ต้องติด (จุดบนตัว i / ขีดสั้น) */
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    setDrawn(true);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    const from = last.current;
    const mid = { x: (from.x + p.x) / 2, y: (from.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(from.x, from.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  const up = () => {
    last.current = null;
  };

  function clear() {
    const el = canvas.current;
    el?.getContext("2d")?.clearRect(0, 0, el.width, el.height);
    setDrawn(false);
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alertError("ไฟล์ไม่ใช่รูปภาพ", "เลือกรูปลายเซ็นเป็น JPG หรือ PNG");
      return;
    }
    setReading(true);
    try {
      setUploaded(await imageToSignature(file));
    } catch (err) {
      alertError(
        "อ่านรูปลายเซ็นไม่สำเร็จ",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setReading(false);
    }
  }

  function done() {
    const image =
      mode === "draw"
        ? canvas.current
          ? trimToSignature(canvas.current)
          : null
        : uploaded;
    if (!image) {
      alertError(
        "ยังไม่มีลายเซ็น",
        mode === "draw" ? "เซ็นในกรอบก่อน" : "เลือกรูปลายเซ็นก่อน",
      );
      return;
    }
    if (image.length > MAX_SIGNATURE_CHARS) {
      alertError("รูปลายเซ็นใหญ่เกินไป", "ลองใช้รูปที่ครอปมาเฉพาะลายเซ็น");
      return;
    }
    onDone(image, rememberMode !== "hidden" && remember);
  }

  const ready = mode === "draw" ? drawn : Boolean(uploaded);

  return (
    <ModalShell
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      width="600px"
      tone="plain"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {rememberMode !== "hidden" ? (
            <label className="flex cursor-pointer items-center gap-2 text-12-5">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              บันทึกเป็นลายเซ็นของฉัน ใช้ครั้งหน้า
            </label>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-sec px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={done}
              disabled={!ready}
              className="btn-pri px-4 py-2.5 text-13 font-medium disabled:bg-none disabled:opacity-60"
            >
              ใช้ลายเซ็นนี้
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <SegmentedControl
          label="วิธีลงลายเซ็น"
          value={mode}
          onChange={setMode}
          options={[
            { value: "draw", label: "เขียนเซ็นบนจอ" },
            { value: "upload", label: "อัปโหลดรูปลายเซ็น" },
          ]}
        />

        {mode === "draw" ? (
          <div className="flex flex-col gap-1.5">
            <div className="relative h-52 overflow-hidden rounded-field border border-line bg-white">
              {/* เส้นฐานให้เซ็นตรงระดับ — ไม่ติดไปกับรูป (วาดนอกแคนวาส) */}
              <span
                aria-hidden
                className="pointer-events-none absolute right-6 bottom-12 left-6 border-b border-dashed border-line-strong"
              />
              {!drawn ? (
                <span className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-12-5 text-mut">
                  ใช้นิ้ว ปากกา หรือเมาส์ เซ็นในกรอบนี้
                </span>
              ) : null}
              <canvas
                ref={canvas}
                aria-label="กรอบเขียนลายเซ็น"
                className="relative size-full cursor-crosshair touch-none"
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onPointerLeave={up}
              />
            </div>
            <button
              type="button"
              onClick={clear}
              disabled={!drawn}
              className="flex w-fit items-center gap-1.5 self-end rounded-selector px-2 py-1 text-12 text-mut transition-colors hover:bg-base-200 hover:text-ink disabled:opacity-50"
            >
              <Eraser size={13} strokeWidth={2} aria-hidden />
              ล้างแล้วเซ็นใหม่
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex h-52 cursor-pointer flex-col items-center justify-center gap-2 rounded-field border border-dashed border-line bg-white p-4 text-center transition-colors hover:border-primary/50">
              {reading ? (
                <SignatureLoader label="กำลังอ่านรูปลายเซ็น…" />
              ) : uploaded ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={uploaded}
                  alt="ลายเซ็นที่อัปโหลด"
                  className="max-h-36 max-w-full object-contain"
                />
              ) : (
                <>
                  <ImageUp
                    size={22}
                    strokeWidth={1.8}
                    aria-hidden
                    className="text-mut"
                  />
                  <span className="text-12-5">เลือกรูปลายเซ็น (JPG / PNG)</span>
                  <span className="text-11-5 text-mut">
                    เซ็นบนกระดาษขาวแล้วถ่ายรูป — ระบบตัดพื้นขาวและขอบว่างออกให้
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  void pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {uploaded ? (
              <span className="text-11-5 text-mut">กดกรอบเพื่อเปลี่ยนรูป</span>
            ) : null}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/* ---------------------------------------------------------------- จัดการรูป */

/**
 * ตัดขอบว่างรอบลายเซ็น แล้วย่อให้พอดีช่องเซ็น → PNG พื้นโปร่ง · ว่างทั้งแผ่น = `null`
 */
function trimToSignature(src: HTMLCanvasElement): string | null {
  const ctx = src.getContext("2d");
  if (!ctx) return null;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;

  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;

  const pad = Math.round(Math.max(width, height) * 0.01) + 2;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);

  const w = right - left + 1;
  const h = bottom - top + 1;
  const scale = Math.min(1, OUT_MAX_W / w, OUT_MAX_H / h);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(w * scale));
  out.height = Math.max(1, Math.round(h * scale));
  const octx = out.getContext("2d");
  if (!octx) return null;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, left, top, w, h, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/** ขอบสว่างที่ถือว่าเป็น “พื้นกระดาษ” — สว่างกว่านี้โปร่งหมด · มืดกว่า `INK_LUMA` ทึบเต็ม */
const PAPER_LUMA = 200;
const INK_LUMA = 120;

/**
 * รูปลายเซ็นจากไฟล์ — ย่อ · ตัดพื้นขาว/เทาอ่อนให้โปร่ง (ไล่ระดับขอบเส้นไม่ให้แตก) · ตัดขอบว่าง
 * รูป PNG ที่โปร่งอยู่แล้วก็ผ่านได้ (คูณกับความโปร่งเดิม)
 */
async function imageToSignature(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("เปิดรูปไม่ได้"));
      el.src = url;
    });
    const scale = Math.min(
      1,
      1400 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์นี้วาดรูปไม่ได้");
    ctx.drawImage(img, 0, 0, c.width, c.height);

    const pixels = ctx.getImageData(0, 0, c.width, c.height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const keep =
        luma >= PAPER_LUMA
          ? 0
          : luma <= INK_LUMA
            ? 1
            : (PAPER_LUMA - luma) / (PAPER_LUMA - INK_LUMA);
      d[i + 3] = Math.round(d[i + 3] * keep);
    }
    ctx.putImageData(pixels, 0, 0);

    const out = trimToSignature(c);
    if (!out) throw new Error("ไม่พบลายเซ็นในรูป — ลองรูปที่เส้นเข้มกว่านี้");
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
