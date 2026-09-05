// help/page.tsx — คู่มือเริ่มต้นในแอป 1 หน้า (WO 9.4 §0.3 ข้อ 9 · deliverable F)
// อ่านอย่างเดียวล้วน (ไม่มี query DB เพิ่มเติมนอกด่านสิทธิ์) — เข้าถึงได้จาก ⌘K "สร้างด่วน" และเช็กลิสต์หน้าหลัก
import Link from "next/link";
import { requireAccountPage } from "@/lib/modules/account/guard";
import { PageHeader } from "@/components/ui/PageHeader";
import { AccountIcon } from "@/components/account-v2/AccountIcon";

const CHECKLIST = [
  { label: "ตั้งค่ากิจการ", desc: "ชื่อ ที่อยู่ เลขผู้เสียภาษี และตั้งว่าจดทะเบียน VAT หรือไม่", href: "settings" },
  { label: "เพิ่มช่องทางเงิน", desc: "บัญชีธนาคาร/เงินสด/e-Wallet อย่างน้อย 1 ช่องทาง ก่อนรับ-จ่ายเงินได้", href: "finance" },
  { label: "เพิ่มลูกค้า/สินค้า", desc: "ผู้ติดต่อ (ลูกค้า/ผู้ขาย) หรือรายการสินค้า/บริการที่จะใช้ในเอกสาร", href: "contacts" },
  { label: "ออกเอกสารใบแรก", desc: "ลองออกใบเสนอราคาหรือใบแจ้งหนี้ใบแรกดูสักใบ", href: "docs/QUOTATION/new" },
  { label: "เชื่อมระบบ", desc: "เชื่อมกับ POS/คลังสินค้า (ถ้ามี) ให้ข้อมูลไหลเข้าบัญชีอัตโนมัติ", href: "settings" },
] as const;

const MENU_GROUPS = [
  { label: "หน้าหลัก", desc: "ภาพรวมกิจการ: ค้างรับ/ค้างจ่าย เงินคงเหลือ กราฟรายรับ-รายจ่าย และเอกสารล่าสุด" },
  { label: "รายรับ", desc: "ออกใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี ใบรับเงินมัดจำ ใบลด/เพิ่มหนี้ และใบวางบิล" },
  { label: "รายจ่าย", desc: "บันทึกซื้อสินค้า/ค่าใช้จ่าย ใบสั่งซื้อ ใบกำกับภาษีซื้อ ใบจ่ายเงินมัดจำ และใบรวมจ่าย" },
  { label: "ผู้ติดต่อ", desc: "ทะเบียนลูกค้า/ผู้ขาย เครดิตเทอม ยอดค้างต่อราย และตัวช่วยรวมผู้ติดต่อที่ซ้ำกัน" },
  { label: "สินค้า", desc: "ทะเบียนสินค้า/บริการ หน่วยนับ สต็อกคงเหลือ การเบิก/คืน และปรับต้นทุน" },
  { label: "การเงิน", desc: "บัญชีเงินสด/ธนาคาร/e-Wallet เงินสดย่อย กระทบยอดธนาคาร และหัก ณ ที่จ่าย/เช็ค" },
  { label: "บัญชี", desc: "ผังบัญชี สมุดรายวัน รายงาน (งบทดลอง/กำไรขาดทุน/งบฐานะ) ปิดงวด และทะเบียนสินทรัพย์" },
  { label: "คลังเอกสาร", desc: "เก็บไฟล์บิล/ใบเสร็จทั้งหมด ผูกกับเอกสารบัญชี และกล่องขาเข้าให้ AI ช่วยอ่านบิล" },
  { label: "ตั้งค่า", desc: "ข้อมูลกิจการ เลขที่เอกสาร นโยบายบัญชี สิทธิ์ผู้ใช้งาน และการเชื่อมต่อระบบอื่น" },
] as const;

const MONTHLY_FLOW = [
  { step: "1. ออกใบแจ้งหนี้", desc: "ออกให้ลูกค้าเมื่อส่งของ/บริการเสร็จ", href: "docs/INVOICE/new" },
  { step: "2. รับชำระ", desc: "เปิดใบแจ้งหนี้ที่รอชำระ แล้วบันทึกรับเงินที่ใบนั้น", href: "docs/INVOICE?tab=awaiting_payment" },
  { step: "3. กระทบยอด", desc: "เทียบยอดในบัญชีกับ statement ธนาคารทุกช่องทางให้ตรงกัน", href: "finance/reconcile" },
  { step: "4. ยื่นภาษี", desc: "ตรวจ ภ.พ.30 / ภ.ง.ด.3/53 ของเดือนนั้นก่อนนำส่งสรรพากร", href: "tax" },
  { step: "5. ปิดงวด", desc: "ล็อกเดือนนั้นไม่ให้แก้ไขย้อนหลัง หลังยื่นภาษีเรียบร้อยแล้ว", href: "periods" },
] as const;

const FAQ = [
  {
    q: "เอกสาร \"ร่าง\" (DRAFT) ต่างจากที่ \"ออกแล้ว\" ยังไง?",
    a: "ร่างยังไม่ลงบัญชีและไม่กินเลขที่เอกสาร แก้ไข/ลบได้อิสระ (ปุ่มลบร่างเลิกทำได้ภายใน 5 นาที) ส่วนเอกสารที่ออกแล้วลงบัญชีจริงแล้ว แก้ไขไม่ได้ ต้องใช้ปุ่มยกเลิกหรือออกใบปรับปรุงแทน",
  },
  {
    q: "ลบเอกสารที่ออกแล้วได้ไหม?",
    a: "ไม่ได้ — เอกสารที่มีผลแล้วลบไม่ได้เพื่อรักษาความถูกต้องของบัญชี ใช้ปุ่ม \"ยกเลิก\" แทน ระบบจะกลับรายการบัญชีให้อัตโนมัติ",
  },
  {
    q: "กระทบยอดธนาคารคืออะไร ทำไมต้องทำทุกเดือน?",
    a: "คือการเทียบยอดเงินในบัญชีของเรากับ statement ธนาคารจริง เพื่อจับรายการที่ตกหล่นหรือบันทึกผิดก่อนที่จะปิดงวด ควรทำทุกเดือนก่อนยื่นภาษี",
  },
  {
    q: "ปิดงวดแล้ว แก้ไขเอกสารในเดือนนั้นได้อีกไหม?",
    a: "แก้ไม่ได้จนกว่าจะเปิดงวดคืน (ต้องมีสิทธิ์เฉพาะ) — ปิดงวดมีไว้กันไม่ให้แก้บัญชีที่ยื่นภาษีไปแล้วโดยไม่ตั้งใจ",
  },
  {
    q: "หัก ณ ที่จ่าย (WHT) ต้องทำตอนไหน?",
    a: "ตอนรับหรือจ่ายเงินที่เข้าเงื่อนไขต้องหักภาษี ณ ที่จ่าย เลือกประเภทเงินได้และอัตราที่หน้าบันทึกรับ/จ่ายเงิน ระบบจะออกหนังสือรับรอง (50 ทวิ) ให้อัตโนมัติ",
  },
  {
    q: "ตั้งราคาสินค้าแบบ \"แยก VAT\" หรือ \"รวม VAT\" ดี?",
    a: "แล้วแต่วิธีตั้งราคาหน้าร้าน — ราคาป้ายรวม VAT แล้ว (เช่น ขายปลีก) ใช้ \"รวม VAT\" ราคาที่ต้องบวก VAT เพิ่ม (เช่น ขายส่ง/B2B) ใช้ \"แยก VAT\" ตั้งค่าเริ่มต้นได้ที่หน้านโยบายบัญชี",
  },
  {
    q: "มีผู้ติดต่อซ้ำกัน (คนละชื่อ แต่เป็นคนเดียวกัน) ทำยังไง?",
    a: "ไปที่ ผู้ติดต่อ › รวมผู้ติดต่อซ้ำ ระบบจะจับคู่ที่น่าจะซ้ำให้ (จากเลขภาษี/เบอร์/ชื่อคล้ายกัน) เลือกรวมหรือกด \"ไม่ใช่คนเดียวกัน\" ได้ (ข้ามได้ก็เลิกทำได้ภายใน 5 นาที)",
  },
  {
    q: "⌘K (หรือ Ctrl+K) ใช้ยังไง?",
    a: "กดที่ไหนก็ได้ในโมดูลบัญชีเพื่อเปิดแผง \"สร้างด่วน\" พิมพ์ชนิดเอกสาร+ชื่อผู้ติดต่อ+จำนวนเงินรวดเดียว (เช่น \"ใบแจ้งหนี้ ณัฐพล 24900\") หรือพิมพ์ชื่อหน้าที่ต้องการ (เช่น \"กระทบยอด\") เพื่อไปหน้านั้นตรง ๆ",
  },
  {
    q: "\"เลิกทำ\" ใช้ได้กับอะไรบ้าง และใช้ได้กี่นาที?",
    a: "ใช้ได้กับการกระทำที่ไม่กินเลขที่เอกสาร/ไม่ลงเงิน เช่น เก็บถาวรผู้ติดต่อ/สินค้า/ไฟล์แนบ ลบแท็ก ข้ามคู่ซ้ำ ย้ายโฟลเดอร์ แยกไฟล์ออกจากเอกสาร ลบร่าง และปักหมุดบัญชีที่ติดตาม — เลิกทำได้ภายใน 5 นาทีหลังทำ และเฉพาะคนที่ทำรายการนั้นเองเท่านั้น",
  },
  {
    q: "ไม่เห็นเมนู/ปุ่มบางอย่าง ต้องทำยังไง?",
    a: "แต่ละเมนูผูกกับสิทธิ์ผู้ใช้งาน — ให้ผู้ดูแลระบบของร้านไปที่ ตั้งค่า › สิทธิ์ผู้ใช้งาน เพื่อเปิดสิทธิ์ที่ต้องการให้บัญชีของคุณ",
  },
] as const;

export default async function AccountHelpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAccountPage(id, "account.doc.view");
  const base = `/app/sys/${id}/account`;

  return (
    <div className="flex flex-col gap-6 pb-16" data-testid="account-help-page">
      <PageHeader title="เริ่มใช้บัญชี SHARK ใน 10 นาที" desc="คู่มือเริ่มต้นหน้าเดียว — เลื่อนอ่านได้ทั้งหน้า" />

      <section className="card flex flex-col gap-3" data-testid="help-checklist">
        <h2 className="text-sm font-semibold">เช็กลิสต์ 5 ขั้นแรก</h2>
        <ol className="flex flex-col gap-2">
          {CHECKLIST.map((s, i) => (
            <li key={s.label} className="flex items-start gap-3 text-sm">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: "var(--color-surface-2)" }}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <Link href={`${base}/${s.href}`} className="font-medium hover:underline">
                  {s.label}
                </Link>
                <span className="block text-[color:var(--color-muted)]">{s.desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card flex flex-col gap-3" data-testid="help-menu-groups">
        <h2 className="text-sm font-semibold">9 หมวดเมนู — สรุปหมวดละบรรทัด</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MENU_GROUPS.map((g) => (
            <li key={g.label} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
              <span className="font-medium">{g.label}</span>
              <span className="block text-[color:var(--color-muted)]">{g.desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex flex-col gap-3" data-testid="help-monthly-flow">
        <h2 className="text-sm font-semibold">งานประจำเดือน</h2>
        <ol className="flex flex-col gap-2">
          {MONTHLY_FLOW.map((s) => (
            <li key={s.step} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <Link href={`${base}/${s.href}`} className="font-medium hover:underline">
                {s.step}
              </Link>
              <span className="text-[color:var(--color-muted)]">— {s.desc}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card flex flex-col gap-2" data-testid="help-faq">
        <h2 className="text-sm font-semibold">คำถามที่พบบ่อย</h2>
        {FAQ.map((f) => (
          <details key={f.q} className="group rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
              {f.q}
              <AccountIcon
                name="chevron-down"
                className="h-4 w-4 shrink-0 text-[color:var(--color-muted)] transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="mt-1.5 text-sm text-[color:var(--color-muted)]">{f.a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
