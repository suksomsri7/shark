import { baht } from "@/lib/modules/account/service";
import { pp30, type Pp30Side } from "@/lib/modules/account/reports";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

function sideBlock(title: string, s: Pp30Side) {
  return (
    <TableWrap>
      <thead>
        <tr className="border-b bg-[color:var(--color-surface-2,#fafafa)] text-left">
          <th className="px-3 py-2" colSpan={4}>{title}</th>
        </tr>
        <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
          <th className="px-3 py-1.5">เลขที่</th>
          <th className="px-3 py-1.5">คู่ค้า</th>
          <th className="px-3 py-1.5 text-right">ฐานภาษี</th>
          <th className="px-3 py-1.5 text-right">ภาษี</th>
        </tr>
      </thead>
      <tbody>
        {s.byRate.map((g) => (
          <tr key={g.rateBp} className="border-b bg-[color:var(--color-surface-2,#fafafa)] text-xs font-medium">
            <td className="px-3 py-1" colSpan={2}>อัตรา {g.rateBp / 100}%</td>
            <td className="px-3 py-1 text-right">{baht(g.base)}</td>
            <td className="px-3 py-1 text-right">{baht(g.vat)}</td>
          </tr>
        ))}
        {s.rows.map((r, i) => (
          <tr key={`${r.docNo}-${i}`} className="border-b last:border-0">
            <td className="px-3 py-1.5 font-mono text-xs">{r.docNo}</td>
            <td className="px-3 py-1.5">{r.contactName || "—"}<span className="text-xs text-[color:var(--color-muted)]"> {r.taxId}</span></td>
            <td className="px-3 py-1.5 text-right">{baht(r.base)}</td>
            <td className="px-3 py-1.5 text-right">{baht(r.vat)}</td>
          </tr>
        ))}
        <tr className="border-t-2 font-semibold">
          <td className="px-3 py-2" colSpan={2}>รวม</td>
          <td className="px-3 py-2 text-right">{baht(s.base)}</td>
          <td className="px-3 py-2 text-right">{baht(s.total)}</td>
        </tr>
      </tbody>
    </TableWrap>
  );
}

export default async function Pp30Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; carry?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const period = sp.period || currentPeriodKey();
  const carryForward = Math.round((Number(sp.carry) || 0) * 100);
  const pp = await pp30({ tenantId, systemId }, period, { carryForward });

  const csv = {
    headers: ["ประเภท", "เลขที่", "คู่ค้า", "เลขภาษี", "อัตรา%", "ฐาน (บาท)", "ภาษี (บาท)"],
    rows: [
      ...pp.output.rows.map((r) => ["ภาษีขาย", r.docNo, r.contactName, r.taxId, r.rateBp / 100, r.base / 100, r.vat / 100] as (string | number)[]),
      ...pp.input.rows.map((r) => ["ภาษีซื้อ", r.docNo, r.contactName, r.taxId, r.rateBp / 100, r.base / 100, r.vat / 100] as (string | number)[]),
    ],
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <ReportHeader base={base} title="ภ.พ.30 + รายงานภาษีขาย/ซื้อ" subtitle={`เดือนภาษี ${period}`} />
        <ReportToolbar filename={`ภพ30-${period}`} csv={csv} />
      </div>
      <form className="flex flex-wrap gap-2 print:hidden">
        <input name="period" defaultValue={period} placeholder="YYYY-MM" className="rounded-lg border px-2 py-1.5 text-sm" />
        <input name="carry" defaultValue={sp.carry ?? ""} placeholder="เครดิตยกมา (บาท)" className="rounded-lg border px-2 py-1.5 text-sm" />
        <button className="btn text-sm">คำนวณ</button>
      </form>

      <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-3">
        <div><div className="text-xs text-[color:var(--color-muted)]">ภาษีขาย</div><div className="text-lg font-semibold">{baht(pp.output.total)}</div></div>
        <div><div className="text-xs text-[color:var(--color-muted)]">ภาษีซื้อ</div><div className="text-lg font-semibold">{baht(pp.input.total)}</div></div>
        <div>
          <div className="text-xs text-[color:var(--color-muted)]">{pp.netPayable >= 0 ? "ต้องชำระ" : "เครดิตยกไป"}</div>
          <div className="text-lg font-bold">{baht(Math.abs(pp.netPayable))}</div>
        </div>
      </div>
      {pp.carryForward > 0 && (
        <div className="text-xs text-[color:var(--color-muted)]">หักเครดิตภาษียกมา {baht(pp.carryForward)} · เครดิตยกไปเดือนถัดไป {baht(pp.creditCarry)}</div>
      )}

      <div className="flex flex-col gap-4">
        {sideBlock("รายงานภาษีขาย (2200)", pp.output)}
        {sideBlock("รายงานภาษีซื้อ (1150)", pp.input)}
      </div>
    </div>
  );
}
