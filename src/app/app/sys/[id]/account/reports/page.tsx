import Link from "next/link";
import { loadReport } from "./_shared";

const REPORTS = [
  { slug: "trial-balance", title: "งบทดลอง", desc: "ยอดยกมา · เคลื่อนไหว · ยอดคงเหลือ — Σ เดบิต = เครดิต" },
  { slug: "profit-loss", title: "งบกำไรขาดทุน", desc: "รายได้ − ต้นทุน − ค่าใช้จ่าย · เทียบงวดก่อน" },
  { slug: "balance-sheet", title: "งบแสดงฐานะการเงิน", desc: "สินทรัพย์ = หนี้สิน + ส่วนของเจ้าของ ณ วันที่" },
  { slug: "cash-flow", title: "งบกระแสเงินสด", desc: "วิธีตรง · แยกกิจกรรมดำเนินงาน/ลงทุน/จัดหาเงิน" },
  { slug: "pp30", title: "ภ.พ.30 + รายงานภาษี", desc: "ภาษีขาย − ภาษีซื้อ · แยกอัตรา · เครดิตยกมา" },
];

export default async function ReportsIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadReport(id);
  const base = `/app/sys/${id}/account`;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">งบและรายงาน</h1>
        <p className="text-sm text-[color:var(--color-muted)]">คำนวณสด ๆ จากสมุดรายวัน (immutable)</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.slug} href={`${base}/reports/${r.slug}`} className="card hover:bg-[color:var(--color-surface-2,#f5f5f5)]">
            <div className="font-medium">{r.title}</div>
            <div className="mt-1 text-xs text-[color:var(--color-muted)]">{r.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
