import {
  CONSENT_ITEMS,
  CONTROLLER,
  DATA_SUBJECT_RIGHTS,
} from "@/app/recruitment/_lib/consent";
import { DEFAULT_DOC_SLOTS } from "@/app/recruitment/_lib/form";

/**
 * เนื้อหานโยบายความเป็นส่วนตัวฉบับเต็ม — **ใช้ร่วมกันสองที่**
 *
 * 1. หน้า `/recruitment/privacy` (หน้าเต็ม)
 * 2. กล่องขอความยินยอมก่อนเริ่มกรอก (`consent-dialog.tsx`)
 *
 * แยกออกมาเป็นชิ้นเดียวเพราะกล่องยินยอมต้องแสดง **ฉบับเต็มจริง ๆ** ไม่ใช่สรุป —
 * ถ้าก๊อปข้อความไปวางในกล่องอีกชุด วันหนึ่งสองที่จะไม่ตรงกัน ซึ่งเท่ากับความยินยอม
 * ที่ผู้สมัครให้ไว้อ้างอิงเอกสารที่เขาไม่เคยเห็น (เหตุผลเดียวกับที่หน้านโยบาย
 * อ่านข้อความจาก `lib/recruitment/consent.ts` ไม่ได้พิมพ์ซ้ำ)
 *
 * **ไม่มีหัวเรื่องใหญ่ในนี้** — ที่เรียกใช้เป็นคนใส่เอง เพราะหน้าเต็มต้องการ `h1`
 * ส่วนในกล่องโมดัลหัวเรื่องเป็นของกล่องไปแล้ว การมี `h1` ซ้อนอีกชั้นทำให้ลำดับ
 * หัวเรื่องของหน้าเพี้ยนสำหรับ screen reader
 */
export function PrivacyPolicy() {
  return (
    <>
      <Section title="ผู้ควบคุมข้อมูลส่วนบุคคล">
        <dl className="flex flex-col gap-1.5">
          <Row term="บริษัท" detail={CONTROLLER.company} />
          <Row term="ที่อยู่" detail={CONTROLLER.address} />
          <Row term="อีเมล" detail={CONTROLLER.dpoEmail} />
          <Row term="โทรศัพท์" detail={CONTROLLER.dpoPhone} />
        </dl>
      </Section>

      <Section title="ข้อมูลที่เราเก็บ">
        <p>เราเก็บเฉพาะข้อมูลที่คุณกรอกและแนบมาในใบสมัครเท่านั้น ได้แก่</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            ข้อมูลติดต่อและข้อมูลประจำตัว — ชื่อ–นามสกุล เบอร์มือถือ เลขบัตรประชาชน
            วันเกิด และจังหวัดที่พักอาศัย
          </li>
          <li>
            ข้อมูลคุณสมบัติการขับรถ — ชนิดและวันหมดอายุใบขับขี่ ประสบการณ์ขับรถ
            และประวัติอุบัติเหตุที่คุณแจ้ง
          </li>
          <li>ภาพถ่ายเอกสาร — {DEFAULT_DOC_SLOTS.map((d) => d.label).join(" · ")}</li>
          <li>
            ข้อมูลทางเทคนิคที่แนบมากับการกดยินยอม — วันเวลา หมายเลขไอพี
            และชนิดเบราว์เซอร์ ซึ่งเก็บไว้เป็นหลักฐานการให้ความยินยอมเท่านั้น
          </li>
        </ul>
        <p>
          ข้อมูลบางรายการเป็น <b className="font-semibold text-ink">ข้อมูลอ่อนไหว</b>
          ตามมาตรา 26 ได้แก่ ผลตรวจสุขภาพจากใบรับรองแพทย์และประวัติอาชญากรรม
          เราจะเก็บและใช้ก็ต่อเมื่อคุณให้ความยินยอมแยกไว้อย่างชัดแจ้งแล้วเท่านั้น
        </p>
      </Section>

      <Section title="วัตถุประสงค์ที่เราขอความยินยอม">
        <ol className="flex list-decimal flex-col gap-2.5 pl-5">
          {CONSENT_ITEMS.map((item) => (
            <li key={item.id}>
              <b className="font-semibold text-ink">{item.title}</b>
              <span className="ml-1.5 rounded-selector bg-base-200 px-1.5 py-px font-mono text-10 text-mut">
                {item.required ? "จำเป็น" : "ไม่บังคับ"}
              </span>
              <br />
              {item.detail}
            </li>
          ))}
        </ol>
        <p>
          ความยินยอมทั้งสามข้อแยกจากกัน คุณเลือกให้เฉพาะข้อที่ต้องการได้
          และการไม่ยินยอมข้อที่ไม่บังคับจะไม่มีผลต่อการพิจารณาใบสมัครของคุณ
        </p>
      </Section>

      <Section title="ใครเข้าถึงข้อมูลได้บ้าง">
        <p>
          ข้อมูลในใบสมัครเปิดให้เฉพาะเจ้าหน้าที่ฝ่ายบุคคลและหัวหน้าสายงานที่เกี่ยวข้อง
          กับตำแหน่งที่คุณสมัครเท่านั้น เราไม่ขาย ไม่แลกเปลี่ยน
          และไม่เปิดเผยข้อมูลของคุณต่อบุคคลภายนอกเพื่อการตลาด
        </p>
        <p>
          กรณีที่กฎหมายกำหนดให้ต้องเปิดเผย เช่น คำสั่งศาลหรือหน่วยงานของรัฐที่มีอำนาจ
          เราจะเปิดเผยเท่าที่กฎหมายนั้นกำหนด
        </p>
      </Section>

      <Section title="ระยะเวลาที่เก็บ">
        <p>
          เราเก็บข้อมูลของคุณไว้เท่าที่จำเป็นต่อการพิจารณารับเข้าทำงาน
          หากคุณยินยอมให้เก็บใบสมัครไว้พิจารณาตำแหน่งอื่น เราจะเก็บต่อตามความยินยอมนั้น
          และเมื่อคุณขอยกเลิกใบสมัคร เราจะลบข้อมูลของคุณออกจากระบบทันที
        </p>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-15-5 font-semibold text-ink">{title}</h2>
      <div className="flex flex-col gap-2.5 text-13-5 leading-relaxed text-mut">
        {children}
      </div>
    </section>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 flex-none text-mut">{term}</dt>
      <dd className="m-0 min-w-0 text-ink">{detail}</dd>
    </div>
  );
}
