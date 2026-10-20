import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  CarFront,
  ClipboardList,
  Hash,
  IdCard,
  Landmark,
  MapPin,
  MessageSquareText,
  Phone,
  ShieldOff,
  Siren,
  Truck,
  User,
  UserMinus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DriverAvatar } from "@/app/recruitment/_components/admin/driver-avatar";
import { DriverDocumentSlots } from "@/app/recruitment/_components/admin/driver-document-slots";
import { DriverProfileEdit } from "@/app/recruitment/_components/admin/driver-profile-edit";
import { DriverProfileTabs } from "@/app/recruitment/_components/admin/driver-profile-tabs";
import { DriverStatusControl } from "@/app/recruitment/_components/admin/driver-status-control";
import { DriverWorkYear } from "@/app/recruitment/_components/admin/driver-work-year";
import { ResignDocumentsButton } from "@/app/recruitment/_components/admin/resign-document-maker";
import {
  expiryState,
  formatExpiryGap,
  formatLicenseGap,
  formatTenure,
  formatThaiDate,
  formatBankAccount,
  formatThaiDateTime,
  isProbation,
  DRIVER_BANK_NAME,
  licenseState,
  missingRequiredDocs,
  resignedMediaPurgeDate,
  type DriverProfileTab,
  type DriverRecord,
} from "@/app/recruitment/_lib/drivers/types";
import { formatNationalId } from "@/app/recruitment/_lib/form";
import { exitTypeLabel } from "@/app/recruitment/_lib/resign-reasons/types";

/**
 * ประวัติคนขับรายคน — ประวัติมาจากการนำเข้า Excel ทะเบียน 2026 / หน้าติดตามพนักงานใหม่
 *
 * **แก้ได้ทุกช่อง** ผ่านปุ่ม “แก้ไขข้อมูล” (`driver-profile-edit.tsx` · ช่องที่แก้แล้วการนำเข้า Excel
 * รอบหน้าไม่ทับ) · รูปประจำตัว สถานะการจ้าง วันหมดอายุบัตร และแฟ้มเอกสาร มีตัวแก้ของตัวเองในที่
 *
 * ไม่แสดงชื่อคอลเลกชันต้นทางบนหน้าจอ (Bew 19 ต.ค. 2569) — เป็นศัพท์ไอที ผู้ใช้ไม่ได้ใช้
 *
 * **หน้าตาต่างกันสองแบบตามสถานะ** — ดู `DriverProfile` ว่าอะไรถูกซ่อนบ้าง
 * เมื่อคนคนนั้นพ้นสภาพแล้ว
 *
 * เป็น server component เกือบทั้งก้อน — มีแค่รูปประจำตัวกับปุ่มเปลี่ยนสถานะ
 * ที่เป็น client component
 */
export function DriverProfile({
  driver,
  tab = "info",
}: {
  driver: DriverRecord;
  /** แท็บที่เปิดตอนโหลด — จาก `?tab=` */
  tab?: DriverProfileTab;
}) {
  const expiry = licenseState(driver.licenseDaysLeft);
  const idCardState = expiryState(driver.idCardDaysLeft);
  const idCardTone = idCardState === "expired" ? "alert" : idCardState === "soon" ? "sla" : "mut";

  /**
   * พ้นสภาพแล้ว = **ซ่อนข้อมูลส่วนบุคคลที่ไม่มีเหตุให้ใช้ต่อ**
   * (เบอร์โทรศัพท์ · ใบขับขี่ · บัตรประชาชน · ผู้ติดต่อฉุกเฉิน · บัญชีรับเงิน)
   *
   * เก็บไว้ในฐานข้อมูลเหมือนเดิม แค่ไม่แสดงบนหน้าจอ — ข้อมูลพวกนี้มีไว้ใช้ตอน
   * จ่ายงานกับตามตัว ซึ่งหมดความจำเป็นไปพร้อมกับการพ้นสภาพ · สิ่งที่ยังต้องใช้
   * ต่อคือ **ตัวตนกับประวัติการจ้าง** (ชื่อ รหัส สังกัด วันเริ่ม–วันพ้นสภาพ เหตุผล)
   * ซึ่งยังโชว์ครบ เพราะต้องตอบคำถามย้อนหลังได้
   *
   * ถ้าจะเพิ่มฟิลด์ที่เป็นข้อมูลส่วนบุคคลในอนาคต **ต้องมาเพิ่มเงื่อนไขตรงนี้ด้วย**
   */
  const hidePersonal = !driver.active;
  const statusText = driver.active ? "ปฏิบัติงานอยู่" : "พ้นสภาพแล้ว";

  return (
    <div className="flex flex-col gap-5 animate-rise">
      {/* ทั้งหน้าแบนอยู่บนแผ่นเนื้อหาแผ่นเดียว (13 ต.ค. 2569) — หัวคั่นจากเนื้อหาด้วยเส้นเต็มแผ่น
          แต่ละส่วนข้างล่างคั่นด้วยเส้นบาง ไม่มีการ์ดซ้อน */}
      <header className="sheet-bleed flex flex-col gap-4 px-(--sheet-px) pt-4 sm:pt-5">
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
        {/* กดที่วงรูปเพื่อเพิ่ม/เปลี่ยนรูป — บันทึกลง `master_driver` */}
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

      {/* แบ่งเป็นแท็บ (19 ต.ค. 2569) — ข้อมูลทั่วไป / เอกสาร / ปฏิทิน · แถบเตือนกับข้อมูลพ้นสภาพ
          อยู่เหนือแท็บ เพราะต้องเห็นไม่ว่าจะเปิดแท็บไหน */}
      <DriverProfileTabs
        initial={tab}
        missingDocs={missingRequiredDocs(driver.documents).length}
        info={
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-0">
            <div className="flex flex-col gap-6 lg:pr-6">
              <Section
                title="ข้อมูลการจ้าง"
                action={<DriverProfileEdit driver={driver} scope="info" />}
                note={
                  driver.profileEditedAt
                    ? `แก้ไขล่าสุด ${formatThaiDateTime(driver.profileEditedAt)}${
                        driver.profileEditedBy ? ` · ${driver.profileEditedBy}` : ""
                      }`
                    : undefined
                }
              >
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Field icon={Hash} label="รหัสพนักงานขับรถ" value={driver.drivercode} mono />
                  <Field icon={User} label="ชื่อ – สกุล" value={driver.name} />
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
                    icon={BadgeCheck}
                    label="สถานะในทะเบียน"
                    value={statusText}
                    note={
                      driver.resignation
                        ? `พ้นสภาพ ${formatThaiDate(driver.resignation.dateISO)}`
                        : undefined
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
                  <Field icon={Building2} label="ลูกค้า" value={driver.customer} />
                  <Field
                    icon={MapPin}
                    label="แพล้นท์"
                    value={driver.plant}
                    note={driver.position || undefined}
                  />
                </dl>
              </Section>

            </div>
            <div className="flex flex-col gap-6 border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              <Section title="ช่องทางติดต่อ">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  {hidePersonal ? (
                    <>
                      <Hidden icon={Phone} label="เบอร์โทรศัพท์" />
                      <Hidden icon={Siren} label="ผู้ติดต่อฉุกเฉิน" />
                    </>
                  ) : (
                    <>
                      <Field
                        icon={Phone}
                        label="เบอร์โทรศัพท์"
                        value={driver.phone}
                        href={driver.phone ? `tel:${driver.phone.replace(/[^\d+]/g, "")}` : undefined}
                        note={driver.phoneAlt ? `เบอร์อื่น ${driver.phoneAlt}` : undefined}
                        mono
                      />
                      {/* ชื่อกับเบอร์ผู้ติดต่อฉุกเฉินอยู่ช่องเดียวกัน — ไม่ต้องไล่หาสองที่ */}
                      <Field
                        icon={Siren}
                        label="ผู้ติดต่อฉุกเฉิน"
                        value={[
                          driver.emergencyContactName,
                          driver.emergencyContactRelation ? `(${driver.emergencyContactRelation})` : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        note={driver.emergencyContactPhone || undefined}
                        noteHref={
                          driver.emergencyContactPhone
                            ? `tel:${driver.emergencyContactPhone.replace(/[^\d+]/g, "")}`
                            : undefined
                        }
                      />
                    </>
                  )}
                </dl>
              </Section>


              <Section title="รถที่ประจำการ">
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
                    <Field icon={Building2} label="กลุ่มรถ (ETL)" value={driver.vehicle.fleet} />
                    <Field icon={MapPin} label="แพล้นท์ของรถ (ETL)" value={driver.vehicle.plant} />
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
          </div>
        }
        docs={
          <div className="flex flex-col gap-6">
            {/* แก้ทุกช่องรวมวันหมดอายุผ่านปุ่ม “แก้ไข” ที่เดียว · ซ่อนข้อมูลส่วนบุคคลเมื่อพ้นสภาพแล้ว */}
            <Section
              title="เอกสารประจำตัว · บัญชีรับเงิน"
              action={<DriverProfileEdit driver={driver} scope="docs" />}
            >
              <div className="flex flex-col divide-y divide-line">
                <DocGroup icon={IdCard} title="บัตรประชาชน">
                  {hidePersonal ? (
                    <Hidden label="เลขบัตรประชาชน" />
                  ) : (
                    <>
                      <Field
                        label="เลขบัตรประชาชน"
                        value={driver.nationalId ? formatNationalId(driver.nationalId) : ""}
                        mono
                      />
                      <Field
                        label="วันหมดอายุ"
                        value={formatThaiDate(driver.idCardExpiryISO, "full")}
                        note={driver.idCardExpiryISO ? formatExpiryGap(driver.idCardDaysLeft) : undefined}
                        noteTone={idCardTone}
                      />
                    </>
                  )}
                </DocGroup>

                <DocGroup
                  icon={CarFront}
                  title="ใบขับขี่"
                  badge={!hidePersonal && driver.licenseType ? `ชนิด ${driver.licenseType}` : undefined}
                >
                  {hidePersonal ? (
                    <Hidden label="เลขที่ใบขับขี่" />
                  ) : (
                    <>
                      <Field label="เลขที่ใบขับขี่" value={driver.licenseNo} mono />
                      <Field
                        label="วันหมดอายุ"
                        value={formatThaiDate(driver.licenseExpiryISO, "full")}
                        note={
                          driver.licenseExpiryISO ? formatLicenseGap(driver.licenseDaysLeft) : undefined
                        }
                        noteTone={expiry === "expired" ? "alert" : expiry === "soon" ? "sla" : "mut"}
                      />
                    </>
                  )}
                </DocGroup>

                <DocGroup icon={Landmark} title={`บัญชี${DRIVER_BANK_NAME}`}>
                  {hidePersonal ? (
                    <Hidden label="เลขที่บัญชี" />
                  ) : (
                    <>
                      <Field
                        label="เลขที่บัญชี"
                        value={driver.bankAccountNo ? formatBankAccount(driver.bankAccountNo) : ""}
                        mono
                      />
                      <Field label="สาขาธนาคาร" value={driver.bankBranch} />
                    </>
                  )}
                </DocGroup>
              </div>
            </Section>

            <div className="border-t border-line pt-6">
              <DriverDocumentSlots driver={driver} hidePersonal={hidePersonal} />
            </div>
          </div>
        }
        work={
          driver.work ? (
            <DriverWorkYear driver={driver} work={driver.work} />
          ) : (
            <section className="flex flex-col gap-2">
              <Blank>ไม่พบบันทึกสถานะการทำงานของรหัสนี้</Blank>
              <p className="text-11-5 text-mut">
                วันเริ่มงาน {formatThaiDate(driver.startDateISO, "full") || "ไม่มีข้อมูล"}
                {driver.tenureMonths !== null
                  ? ` · อายุงาน ${formatTenure(driver.tenureMonths, driver.tenureDays)}`
                  : ""}
              </p>
            </section>
          )
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------ ชิ้นย่อย */

function Section({
  title,
  action,
  note,
  children,
}: {
  title: string;
  /** ปุ่มท้ายหัวกล่อง เช่น “แก้ไขข้อมูล” */
  action?: React.ReactNode;
  /** บรรทัดเล็กใต้หัวกล่อง */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-14 font-semibold">{title}</h2>
          {action ? <div className="flex flex-none items-center gap-2">{action}</div> : null}
        </div>
        {note ? <p className="text-11-5 text-mut">{note}</p> : null}
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
  noteHref,
  mono,
}: {
  /** ไม่ใส่ = ไม่มีไอคอนหน้าช่อง (ช่องในกลุ่มเอกสาร — หัวกลุ่มมีไอคอนแล้ว) */
  icon?: LucideIcon;
  label: string;
  value: string;
  note?: string;
  noteTone?: "mut" | "sla" | "alert" | "primary";
  href?: string;
  /** ลิงก์ของบรรทัดรอง เช่น เบอร์ผู้ติดต่อฉุกเฉิน */
  noteHref?: string;
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
      {Icon ? (
        <Icon size={15} strokeWidth={1.7} aria-hidden className="mt-0.5 flex-none text-mut" />
      ) : null}
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
          {note ? (
            noteHref ? (
              <a
                href={noteHref}
                className={`w-fit font-mono text-12 transition-colors hover:text-primary ${tone}`}
              >
                {note}
              </a>
            ) : (
              <span className={`text-11-5 ${tone}`}>{note}</span>
            )
          ) : null}
        </dd>
      </div>
    </div>
  );
}

/**
 * เอกสารหนึ่งใบ = หนึ่งแถว — หัวแถว (ไอคอน + ชื่อเอกสาร) ซ้าย ช่องของใบนั้นขวา
 * ช่องในแถวจึงตั้งชื่อสั้นได้ (“วันหมดอายุ”) เพราะหัวแถวบอกแล้วว่าของใบไหน
 * จอเล็ก = หัวแถวขึ้นบรรทัดบน ช่องเรียงลงมา
 */
function DocGroup({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** บรรทัดเล็กใต้ชื่อเอกสาร เช่น ชนิดใบขับขี่ */
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-field bg-primary/10 text-primary">
          <Icon size={15} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
          <h3 className="text-13 font-semibold leading-tight">{title}</h3>
          {badge ? <span className="text-11-5 text-mut">{badge}</span> : null}
        </div>
      </div>
      <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">{children}</dl>
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
function Hidden({ icon: Icon, label }: { icon?: LucideIcon; label: string }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      {Icon ? (
        <Icon size={15} strokeWidth={1.7} aria-hidden className="mt-0.5 flex-none text-mut" />
      ) : null}
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
