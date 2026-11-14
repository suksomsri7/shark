import { AccountIcon } from "@/components/account-v2/AccountIcon";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { loadReport } from "./_shared";

const REPORTS = [
  { slug: "trial-balance", title: "งบทดลอง", desc: "ยอดยกมา · เคลื่อนไหว · ยอดคงเหลือ — Σ เดบิต = เครดิต" },
  { slug: "profit-loss", title: "งบกำไรขาดทุน", desc: "รายได้ − ต้นทุน − ค่าใช้จ่าย · เทียบงวดก่อน" },
  { slug: "balance-sheet", title: "งบแสดงฐานะการเงิน", desc: "สินทรัพย์ = หนี้สิน + ส่วนของเจ้าของ ณ วันที่" },
  { slug: "cash-flow", title: "งบกระแสเงินสด", desc: "วิธีตรง · แยกกิจกรรมดำเนินงาน/ลงทุน/จัดหาเงิน" },
  { slug: "pp30", title: "ภ.พ.30 + รายงานภาษี", desc: "ภาษีขาย − ภาษีซื้อ · แยกอัตรา · เครดิตยกมา" },
  { slug: "revenue-novat", title: "รายได้ที่ไม่มี VAT", desc: "เอกสารขาย + บิล POS ต่อเดือน · ยกเว้น / 0% / ไม่คิด VAT" },
  { slug: "audit-trail", title: "รายงานการแก้ไขของบัญชี", desc: "ใคร ทำอะไร เมื่อไร · เหตุผลการยกเลิก · กลับรายการ · การเข้าระบบ" }, // ACC T4.4 ◂
  { slug: "pos-link", title: "ขายหน้าร้าน (POS) กับสมุดบัญชี", desc: "กระทบยอดรายวัน · บิลที่ยังไม่ลงบัญชี · เงินขาด/เกินปิดกะ · ทิป" }, // ACC T4.7 ◂
  { slug: "dorm-deposits", title: "ตรวจเงินประกันหอพัก", desc: "เงินประกันเทียบค่าเช่า · ระยะสัญญา · คำเตือนถือเป็นรายได้" }, // ACC T4.8 ◂
  { slug: "points-outstanding", title: "แต้มสะสมคงค้าง ณ วันสิ้นงวด", desc: "แต้มคงค้างย้อนวันได้ · มูลค่าตามอัตราแลก" }, // ACC T4.8 ◂
];

// รายงานที่อยู่นอกโฟลเดอร์ reports/ แต่อยู่ในชุดเดียวกันตาม §11.3 (แถบเครื่องมือเดียวกัน)
const OTHER = [
  { href: "ledger", title: "บัญชีแยกประเภท", desc: "ยอดยกมา · เคลื่อนไหวรายบรรทัด · ยอดยกไป — ปลายทางของ drill-down" },
  { href: "wht?tab=deduct", title: "ภ.ง.ด.3 / 53", desc: "หนังสือรับรองหัก ณ ที่จ่าย · ไฟล์รายการ CSV ช่วยกรอกแบบ" },
  { href: "aging", title: "อายุหนี้ (ลูกหนี้-เจ้าหนี้)", desc: "ยอดค้างแยกช่วงเกินกำหนด ณ วันนี้" },
  { href: "tax/parked-vat", title: "ภาษีขายที่ค้างพัก", desc: "VAT ที่ยังไม่เข้า ภ.พ.30 ต่อใบแจ้งหนี้ · อายุ · ปล่อยด้วยการออกใบกำกับ" },
  { href: "tax/pending-input-vat", title: "ใบกำกับภาษีซื้อรอรับ", desc: "ภาษีซื้อที่พักรอใบกำกับจากผู้ขาย · อายุ · เดือนสุดท้ายที่ยังเคลมได้ · บันทึกรับ" },
];

export default async function ReportsIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadReport(id);
  const base = `/app/sys/${id}/account`;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="งบและรายงาน"
        back={{ href: base, label: "ระบบบัญชี" }}
        desc="คำนวณสด ๆ จากสมุดรายวัน"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.slug} href={`${base}/reports/${r.slug}`} className="card hover:bg-[color:var(--color-surface-2)]">
            <div className="font-medium">{r.title}</div>
            <div className="mt-1 text-xs text-[color:var(--color-muted)]">{r.desc}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OTHER.map((r) => (
          <Link key={r.href} href={`${base}/${r.href}`} className="card hover:bg-[color:var(--color-surface-2)]">
            <div className="font-medium">{r.title}</div>
            <div className="mt-1 text-xs text-[color:var(--color-muted)]">{r.desc}</div>
          </Link>
        ))}
        {/* §11.6 — DBD e-Filing ยังไม่เปิด (เตรียมจาก งบฐานะ + กำไรขาดทุน + ปีบัญชี) */}
        <div className="card cursor-not-allowed opacity-50" title="เตรียมจากงบแสดงฐานะการเงิน + งบกำไรขาดทุน + ปีบัญชี" data-testid="reports-dbd-soon">
          <div className="flex items-center gap-1.5 font-medium">ยื่นงบ DBD e-Filing <AccountIcon name="clock" className="h-4 w-4" /></div>
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">เร็ว ๆ นี้</div>
        </div>
      </div>
    </div>
  );
}
