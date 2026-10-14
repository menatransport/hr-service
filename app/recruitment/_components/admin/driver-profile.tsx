import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  ClipboardList,
  Hash,
  IdCard,
  MapPin,
  MessageSquareText,
  Phone,
  ShieldOff,
  Truck,
  User,
  UserMinus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DriverAvatar } from "@/app/recruitment/_components/admin/driver-avatar";
import { DriverDocumentSlots } from "@/app/recruitment/_components/admin/driver-document-slots";
import { DriverIdCardExpiry } from "@/app/recruitment/_components/admin/driver-id-card-expiry";
import { DriverStatusControl } from "@/app/recruitment/_components/admin/driver-status-control";
import { DriverWorkYear } from "@/app/recruitment/_components/admin/driver-work-year";
import { ResignDocumentsButton } from "@/app/recruitment/_components/admin/resign-document-maker";
import {
  formatLicenseGap,
  formatTenure,
  formatThaiDate,
  formatThaiDateTime,
  isProbation,
  licenseState,
  resignedMediaPurgeDate,
  type DriverRecord,
} from "@/app/recruitment/_lib/drivers/types";
import { exitTypeLabel } from "@/app/recruitment/_lib/resign-reasons/types";

/**
 * ประวัติคนขับรายคน — **ช่องที่มาจาก ETL อ่านอย่างเดียวทั้งหมด**
 *
 * แก้ได้เฉพาะสามอย่างที่เป็นฟิลด์ของ hr-service เอง ซึ่ง sync ไม่แตะ: รูปประจำตัว
 * สถานะการจ้าง และวันหมดอายุบัตรประชาชน · **อย่าเปิดช่องแก้ให้ฟิลด์อื่น** รอบ sync
 * ถัดไปจะดันกลับเงียบ ๆ แล้วหน้าจอจะโกหกว่าบันทึกไว้แล้ว
 *
 * ทุกกล่องติด **ป้ายชื่อคอลเลกชันต้นทาง** ไว้มุมขวา (`main_driver` / `vehicles` /
 * `employee_work_status`) — เวลาข้อมูลไม่ตรง ฝ่ายบุคคลชี้ให้ไอทีได้ทันทีว่าต้องไป
 * ตามที่ระบบไหน แทนที่จะแจ้งว่า “ข้อมูลในเว็บผิด” แล้วไล่หากันเอง
 *
 * **หน้าตาต่างกันสองแบบตามสถานะ** — ดู `DriverProfile` ว่าอะไรถูกซ่อนบ้าง
 * เมื่อคนคนนั้นพ้นสภาพแล้ว
 *
 * เป็น server component เกือบทั้งก้อน — มีแค่รูปประจำตัวกับปุ่มเปลี่ยนสถานะ
 * ที่เป็น client component
 */
export function DriverProfile({ driver }: { driver: DriverRecord }) {
  const expiry = licenseState(driver.licenseDaysLeft);

  /**
   * พ้นสภาพแล้ว = **ซ่อนข้อมูลส่วนบุคคลที่ไม่มีเหตุให้ใช้ต่อ**
   * (เบอร์โทรศัพท์ · วันหมดอายุใบขับขี่ · เลขบัตรประชาชนเมื่อระบบมีวันหลัง)
   *
   * เก็บไว้ในฐานข้อมูลเหมือนเดิม แค่ไม่แสดงบนหน้าจอ — ข้อมูลพวกนี้มีไว้ใช้ตอน
   * จ่ายงานกับตามตัว ซึ่งหมดความจำเป็นไปพร้อมกับการพ้นสภาพ · สิ่งที่ยังต้องใช้
   * ต่อคือ **ตัวตนกับประวัติการจ้าง** (ชื่อ รหัส สังกัด วันเริ่ม–วันพ้นสภาพ เหตุผล)
   * ซึ่งยังโชว์ครบ เพราะต้องตอบคำถามย้อนหลังได้
   *
   * ถ้าจะเพิ่มฟิลด์ที่เป็นข้อมูลส่วนบุคคลในอนาคต **ต้องมาเพิ่มเงื่อนไขตรงนี้ด้วย**
   */
  const hidePersonal = !driver.active && !driver.noWorkRecord;
  const statusText = driver.active
    ? "ปฏิบัติงานอยู่"
    : driver.noWorkRecord
      ? "ไม่มีข้อมูลการทำงาน"
      : "พ้นสภาพแล้ว";

  return (
    <div className="flex flex-col gap-5 animate-rise">
      {/* ทั้งหน้าแบนอยู่บนแผ่นเนื้อหาแผ่นเดียว (13 ต.ค. 2569) — หัวคั่นจากเนื้อหาด้วยเส้นเต็มแผ่น
          แต่ละส่วนข้างล่างคั่นด้วยเส้นบาง ไม่มีการ์ดซ้อน */}
      <header className="sheet-bleed flex flex-col gap-4 border-b border-line px-(--sheet-px) pt-4 pb-5 sm:pt-5">
        <Link
          href="/recruitment/admin/drivers"
          className="group flex w-fit items-center gap-1.5 text-13 text-mut transition-colors hover:text-primary"
        >
          <ArrowLeft
            size={15}
            strokeWidth={1.8}
            aria-hidden
            className="transition-transform duration-200 group-hover:-translate-x-0.5"
          />
          กลับไปทะเบียนประวัติ
        </Link>

        <div className="flex flex-wrap items-center gap-4">
        {/* กดที่วงรูปเพื่อเพิ่ม/เปลี่ยนรูป — บันทึกลง `master_driver` ของเราเอง
            ไม่ใช่ `Boom_ETL` จึงไม่หายเมื่อ ETL sync รอบถัดไป */}
        <DriverAvatar driver={driver} size="xl" />

        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">
            {driver.name || "ไม่มีชื่อในทะเบียน"}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-12-5 text-mut">{driver.drivercode}</span>
            <Chip tone={driver.active ? "live" : "done"}>
              {statusText}
            </Chip>
            {driver.ownerTypeLabel ? <Chip tone="done">{driver.ownerTypeLabel}</Chip> : null}
            {driver.siteLabel ? <Chip tone="done">{driver.siteLabel}</Chip> : null}
          </div>
        </div>

        <div className="ml-auto flex flex-col items-end gap-1.5">
          <span className="text-11-5 text-mut">สถานะการจ้าง</span>
          <DriverStatusControl driver={driver} variant="panel" />
        </div>
        </div>
      </header>

      {/* ใบขับขี่หมดอายุไม่ใช่เรื่องต้องเตือนสำหรับคนที่ไม่ได้ทำงานแล้ว */}
      {expiry === "expired" && !hidePersonal ? (
        <p
          role="alert"
          className="flex items-center gap-2.5 rounded-box border border-alert/30 bg-[color-mix(in_oklab,var(--color-alert)_6%,var(--color-base-100))] px-4 py-3 text-12-5 text-alert text-pretty"
        >
          <IdCard size={16} strokeWidth={1.8} aria-hidden className="flex-none" />
          ใบขับขี่{formatLicenseGap(driver.licenseDaysLeft)} — ต้องระงับการจ่ายงานจนกว่าจะต่ออายุ
        </p>
      ) : null}

      {hidePersonal ? <ResignPanel driver={driver} /> : null}

      {/* ไม่มี `items-start` โดยตั้งใจ — คอลัมน์ขวา (ช่องแนบเอกสาร) ต้องยืดเท่าแถว
          แล้วเลื่อนข้างในเอง ไม่งั้นกล่องที่ยาวกว่าจะดันแถวจนฝั่งซ้ายเหลือช่องว่างห้อยท้าย
          (ดูคอมเมนต์ใน `driver-document-slots.tsx`) */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-0">
        <div className="flex flex-col gap-6 lg:pr-6">
          <Section title="ข้อมูลทะเบียน" source="main_driver">
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Field icon={Hash} label="รหัสพนักงานขับรถ" value={driver.drivercode} mono />
              <Field icon={User} label="ชื่อ – สกุล" value={driver.name} />
              {hidePersonal ? (
                <Hidden icon={Phone} label="เบอร์โทรศัพท์" />
              ) : (
                <Field
                  icon={Phone}
                  label="เบอร์โทรศัพท์"
                  value={driver.phone}
                  href={driver.phone ? `tel:${driver.phone.replace(/[^\d+]/g, "")}` : undefined}
                  mono
                />
              )}
              <Field
                icon={Building2}
                label="ประเภทพนักงาน"
                value={driver.ownerTypeLabel}
                /* ป้ายที่แปลแล้วกับรหัสดิบไม่ตรงกันเมื่อไร ให้เห็นรหัสดิบด้วย
                   จะได้ตามกลับไปที่ต้นทางถูก (ดู `OWNER_TYPE_LABELS`) */
                note={
                  driver.ownerTypeLabel !== driver.ownerType ? `รหัส ${driver.ownerType}` : undefined
                }
              />
              <Field
                icon={MapPin}
                label="สาขา"
                value={driver.siteLabel}
                note={driver.siteKey ? undefined : `รหัสสาขา ${driver.branch || "ว่าง"}`}
              />
              <Field
                icon={CalendarDays}
                label="วันเริ่มงาน"
                value={formatThaiDate(driver.startDateISO, "full")}
                note={
                  driver.tenureMonths !== null
                    ? `อายุงาน ${formatTenure(driver.tenureMonths, driver.tenureDays)}`
                    : undefined
                }
                noteTone={isProbation(driver.tenureMonths) ? "primary" : "mut"}
              />
              {hidePersonal ? (
                <Hidden icon={IdCard} label="ใบขับขี่หมดอายุ" />
              ) : (
                <Field
                  icon={IdCard}
                  label="ใบขับขี่หมดอายุ"
                  value={formatThaiDate(driver.licenseExpiryISO, "full")}
                  note={
                    driver.licenseExpiryISO ? formatLicenseGap(driver.licenseDaysLeft) : undefined
                  }
                  noteTone={expiry === "expired" ? "alert" : expiry === "soon" ? "sla" : "mut"}
                />
              )}
              {/* บัตรประชาชนเป็นช่องเดียวในกล่องนี้ที่กรอกเองได้ — ไม่มีใน ETL
                  (ดูหัวไฟล์ `driver-id-card-expiry.tsx`) · ซ่อนตามกติกาเดียวกับ
                  ใบขับขี่เมื่อพ้นสภาพแล้ว ไม่งั้นเปิดช่องให้แก้ข้อมูลส่วนบุคคล
                  ของคนที่ไม่ได้ทำงานแล้ว */}
              {hidePersonal ? (
                <Hidden icon={IdCard} label="บัตรประชาชนหมดอายุ" />
              ) : (
                <DriverIdCardExpiry driver={driver} />
              )}
              <Field
                icon={BadgeCheck}
                label="สถานะในทะเบียน"
                value={statusText}
                note={
                  driver.resignation
                    ? `พ้นสภาพ ${formatThaiDate(driver.resignation.dateISO)}`
                    : undefined
                }
              />
            </dl>
          </Section>

          <Section title="รถที่ประจำการ" source="vehicles">
            {driver.vehicle ? (
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Field icon={Hash} label="เลขรถ" value={driver.vehicle.code} mono />
                <Field icon={Truck} label="ทะเบียนรถ" value={driver.vehicle.plateNo} mono />
                <Field
                  icon={Truck}
                  label="ประเภทรถ"
                  value={driver.vehicle.vehicleType}
                  note={driver.vehicle.mix ?? undefined}
                />
                <Field
                  icon={Truck}
                  label="ยี่ห้อ / รุ่น"
                  value={[driver.vehicle.brand, driver.vehicle.model].filter(Boolean).join(" / ")}
                />
                <Field icon={Building2} label="ลูกค้า" value={driver.vehicle.fleet} />
                <Field icon={MapPin} label="แพล้นท์" value={driver.vehicle.plant} />
              </dl>
            ) : (
              <Blank>
                {driver.vehicleRef
                  ? `ทะเบียนรถไม่มีรายการ “${driver.vehicleRef}” — รถอาจถูกถอนออกจากทะเบียนแล้ว`
                  : "ยังไม่ได้ประจำรถคันใด"}
              </Blank>
            )}
          </Section>
        </div>

        {/* คอลัมน์ขวา — ช่องแนบเอกสาร ต่อที่เก็บจริงแล้ว · บัตรประชาชน/ใบขับขี่สแกน
            วันหมดอายุตอนแนบ (ดูหัวไฟล์ `driver-document-slots.tsx`) */}
        <DriverDocumentSlots driver={driver} hidePersonal={hidePersonal} />
      </div>

      {/* ปฏิทินอยู่นอก grid สองคอลัมน์ — ปฏิทินรายวันต้องการความกว้างเต็มหน้า
          ช่องวันถึงจะใหญ่พอใส่ทั้งวันที่และรหัสสถานะให้อ่านออก */}
      {driver.work ? (
        <DriverWorkYear driver={driver} work={driver.work} />
      ) : (
        <section className="flex flex-col gap-2 border-t border-line pt-6">
          <div className="flex items-center gap-2.5">
            <CalendarDays size={16} strokeWidth={1.8} aria-hidden className="text-mut" />
            <h2 className="text-14 font-semibold">ปฏิทินการทำงาน</h2>
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-10-5 text-mut">
              employee_work_status
            </span>
          </div>
          <Blank>ไม่พบบันทึกสถานะการทำงานของรหัสนี้</Blank>
          <p className="text-11-5 text-mut">
            วันเริ่มงาน {formatThaiDate(driver.startDateISO, "full") || "ไม่มีข้อมูล"}
            {driver.tenureMonths !== null
              ? ` · อายุงาน ${formatTenure(driver.tenureMonths, driver.tenureDays)}`
              : ""}
          </p>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ ชิ้นย่อย */

function Section({
  title,
  source,
  children,
}: {
  title: string;
  /** ชื่อคอลเลกชันต้นทางของข้อมูลในกล่องนี้ */
  source: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-14 font-semibold">{title}</h2>
        <span
          title="คอลเลกชันต้นทางของข้อมูลในกล่องนี้"
          className="flex-none rounded-full border border-line px-2 py-0.5 font-mono text-10-5 text-mut"
        >
          {source}
        </span>
      </div>
      {children}
    </section>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  note,
  noteTone = "mut",
  href,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
  noteTone?: "mut" | "sla" | "alert" | "primary";
  href?: string;
  mono?: boolean;
}) {
  const tone =
    noteTone === "alert"
      ? "text-alert font-medium"
      : noteTone === "sla"
        ? "text-sla font-medium"
        : noteTone === "primary"
          ? "text-primary font-medium"
          : "text-mut";

  const text = value.trim();
  const body = text ? (
    <span className={mono ? "font-mono text-13" : "text-13-5"}>{text}</span>
  ) : (
    <span className="text-13 text-mut">ยังไม่ระบุ</span>
  );

  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon size={15} strokeWidth={1.7} aria-hidden className="mt-0.5 flex-none text-mut" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-11-5 text-mut">{label}</dt>
        <dd className="m-0 flex flex-col gap-0.5">
          {href && text ? (
            <a href={href} className="w-fit transition-colors hover:text-primary">
              {body}
            </a>
          ) : (
            body
          )}
          {note ? <span className={`text-11-5 ${tone}`}>{note}</span> : null}
        </dd>
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "live" | "done"; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-11-5 font-medium ${
        tone === "live" ? "bg-st-live text-st-live-ink" : "bg-st-done text-st-done-ink"
      }`}
    >
      {tone === "live" ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

function Blank({ children }: { children: React.ReactNode }) {
  return <p className="text-12-5 text-mut text-pretty">{children}</p>;
}

/**
 * ช่องที่ถูกซ่อนเพราะคนคนนี้พ้นสภาพแล้ว
 *
 * **ขึ้นเป็นช่องว่างที่บอกว่าซ่อน ไม่ใช่เอาแถวออกไปเงียบ ๆ** — แถวที่หายไปเฉย ๆ
 * อ่านได้ว่า “ระบบไม่เคยมีข้อมูลนี้” ซึ่งไม่จริง และคนที่ต้องใช้จริงจะไม่รู้ว่า
 * ต้องไปขอจากใคร
 */
function Hidden({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon size={15} strokeWidth={1.7} aria-hidden className="mt-0.5 flex-none text-mut" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-11-5 text-mut">{label}</dt>
        <dd className="m-0 flex items-center gap-1.5">
          <ShieldOff size={13} strokeWidth={1.8} aria-hidden className="flex-none text-mut" />
          <span className="text-12-5 text-mut">ซ่อนไว้ — พ้นสภาพแล้ว</span>
        </dd>
      </div>
    </div>
  );
}

/**
 * แถบสรุปการพ้นสภาพ — อยู่บนสุดของหน้าเมื่อคนคนนี้ไม่ได้ทำงานแล้ว
 *
 * วางไว้เหนือทุกกล่องโดยตั้งใจ เพราะมันคือคำตอบของคำถามแรกที่คนเปิดหน้านี้ถาม
 * (“ออกไปตั้งแต่เมื่อไร เพราะอะไร”) ส่วนข้อมูลทะเบียนที่เหลือเป็นรายละเอียดรอง
 */
function ResignPanel({ driver }: { driver: DriverRecord }) {
  const resignation = driver.resignation;

  if (!resignation) {
    return (
      <section className="flex items-start gap-2.5 rounded-box border border-line bg-base-200 px-4 py-3">
        <UserMinus size={16} strokeWidth={1.8} aria-hidden className="mt-0.5 flex-none text-mut" />
        <div className="flex flex-col gap-0.5">
          <p className="text-13 font-semibold">พ้นสภาพแล้ว</p>
          <p className="text-12 text-mut text-pretty">
            สถานะนี้มาจากระบบต้นทาง ยังไม่มีการบันทึกวันที่และเหตุผล —
            กด “พ้นสภาพ” ที่มุมขวาบนเพื่อบันทึกให้ครบ
          </p>
        </div>
        <span className="ml-auto flex-none">
          <ResignDocumentsButton driver={driver} variant="label" />
        </span>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3.5 rounded-box border border-line bg-base-200 p-5">
      <div className="flex items-center gap-2.5">
        <UserMinus size={16} strokeWidth={1.8} aria-hidden className="flex-none text-mut" />
        <h2 className="text-14 font-semibold">ข้อมูลการพ้นสภาพ</h2>
        <span className="rounded-full border border-line bg-base-100 px-2 py-0.5 font-mono text-10-5 text-mut">
          hr_service
        </span>
        {/* ใบลาออก + แบบสอบถามลาออก เติมจากข้อมูลชุดนี้ */}
        <span className="ml-auto">
          <ResignDocumentsButton driver={driver} variant="label" />
        </span>
      </div>

      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Field
          icon={CalendarDays}
          label="วันที่พ้นสภาพ"
          value={formatThaiDate(resignation.dateISO, "full")}
        />
        <Field
          icon={ClipboardList}
          label="เหตุผล"
          value={
            /* ระเบียนก่อนมี Reason Code Master ไม่มีหมวดและประเภทการออก — แสดงเท่าที่มี */
            resignation.categoryLabel
              ? `${resignation.reasonCode} · ${resignation.reasonLabel}`
              : resignation.reasonLabel
          }
        />
        {resignation.exitType ? (
          <Field
            icon={UserMinus}
            label="ประเภทการออก"
            value={`${exitTypeLabel(resignation.exitType)}${
              resignation.categoryLabel ? ` · หมวด${resignation.categoryLabel}` : ""
            }`}
          />
        ) : null}
        {resignation.note ? (
          <div className="sm:col-span-2">
            <Field icon={MessageSquareText} label="หมายเหตุ" value={resignation.note} />
          </div>
        ) : null}
      </dl>

      <p className="border-t border-line pt-2.5 text-11-5 text-mut">
        บันทึกโดย {resignation.recordedBy || "—"}
        {resignation.recordedAt ? ` · ${formatThaiDateTime(resignation.recordedAt)}` : ""}
      </p>
      {/* นโยบายเก็บ 1 เดือนหลังพ้นสภาพ (`media-retention.ts`) — บอกล่วงหน้า ไม่ให้แฟ้มว่างเงียบ ๆ */}
      <p className="-mt-2 text-11-5 text-alert">
        {driver.mediaPurgedAt
          ? `รูปประจำตัวและเอกสารในแฟ้มถูกลบแล้วเมื่อ ${formatThaiDateTime(driver.mediaPurgedAt)} (เก็บ 1 เดือนหลังพ้นสภาพ)`
          : `รูปประจำตัวและเอกสารในแฟ้มจะถูกลบอัตโนมัติวันที่ ${formatThaiDate(resignedMediaPurgeDate(resignation.dateISO), "full")} (เก็บ 1 เดือนหลังพ้นสภาพ)`}
      </p>
    </section>
  );
}
