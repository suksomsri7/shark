import { baht } from "@/lib/modules/account/service";
import { balanceSheet, type BSRow } from "@/lib/modules/account/reports";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap, WarnBanner } from "../_shared";
import ReportToolbar from "../ReportToolbar";

export default async function BalanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const asOf = sp.asOf || currentPeriodKey();
  const bs = await balanceSheet({ tenantId, systemId }, asOf);

  const rows = (list: BSRow[]) =>
    list.map((r) => (
      <tr key={r.code} className="border-b last:border-0">
        <td className="px-3 py-1.5 pl-6"><span className="font-mono text-xs">{r.code}</span> {r.name}</td>
        <td className="px-3 py-1.5 text-right">{baht(r.amount)}</td>
      </tr>
    ));
  const csv = {
    headers: ["หมวด", "รหัส", "ชื่อบัญชี", "จำนวน (บาท)"],
    rows: [
      ...bs.assets.rows.map((r) => ["สินทรัพย์", r.code, r.name, r.amount / 100] as (string | number)[]),
      ...bs.liabilities.rows.map((r) => ["หนี้สิน", r.code, r.name, r.amount / 100] as (string | number)[]),
      ...bs.equity.rows.map((r) => ["ส่วนของเจ้าของ", r.code, r.name, r.amount / 100] as (string | number)[]),
      ["ส่วนของเจ้าของ", "", "กำไรสะสม", bs.retainedEarnings / 100],
      ["ส่วนของเจ้าของ", "", "กำไร(ขาดทุน)งวดปัจจุบัน", bs.currentPeriodProfit / 100],
    ],
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <ReportHeader base={base} title="งบแสดงฐานะการเงิน" subtitle={`ณ สิ้นเดือน ${asOf}`} />
        <ReportToolbar filename={`งบฐานะการเงิน-${asOf}`} csv={csv} />
      </div>
      <form className="flex gap-2 print:hidden">
        <input name="asOf" defaultValue={asOf} placeholder="YYYY-MM" className="rounded-lg border px-2 py-1.5 text-sm" />
        <button className="btn text-sm">ดู</button>
      </form>
      {!bs.balanced && (
        <WarnBanner base={base}>
          สินทรัพย์ {baht(bs.assets.total)} ≠ หนี้สิน+ทุน {baht(bs.totalLiabilitiesEquity)}
        </WarnBanner>
      )}
      <TableWrap>
        <tbody>
          <tr className="bg-[color:var(--color-bg,#fafafa)] font-medium"><td className="px-3 py-1.5" colSpan={2}>สินทรัพย์</td></tr>
          {rows(bs.assets.rows)}
          <tr className="border-b-2 font-semibold"><td className="px-3 py-2">รวมสินทรัพย์</td><td className="px-3 py-2 text-right">{baht(bs.assets.total)}</td></tr>
          <tr className="bg-[color:var(--color-bg,#fafafa)] font-medium"><td className="px-3 py-1.5" colSpan={2}>หนี้สิน</td></tr>
          {rows(bs.liabilities.rows)}
          <tr className="border-b font-medium"><td className="px-3 py-1.5 pl-3">รวมหนี้สิน</td><td className="px-3 py-1.5 text-right">{baht(bs.liabilities.total)}</td></tr>
          <tr className="bg-[color:var(--color-bg,#fafafa)] font-medium"><td className="px-3 py-1.5" colSpan={2}>ส่วนของเจ้าของ</td></tr>
          {rows(bs.equity.rows)}
          <tr className="border-b last:border-0"><td className="px-3 py-1.5 pl-6">กำไรสะสม</td><td className="px-3 py-1.5 text-right">{baht(bs.retainedEarnings)}</td></tr>
          <tr className="border-b last:border-0"><td className="px-3 py-1.5 pl-6">กำไร(ขาดทุน)งวดปัจจุบัน</td><td className="px-3 py-1.5 text-right">{baht(bs.currentPeriodProfit)}</td></tr>
          <tr className="border-b font-medium"><td className="px-3 py-1.5 pl-3">รวมส่วนของเจ้าของ</td><td className="px-3 py-1.5 text-right">{baht(bs.totalEquity)}</td></tr>
          <tr className="border-t-2 text-base font-bold"><td className="px-3 py-2.5">รวมหนี้สินและส่วนของเจ้าของ</td><td className="px-3 py-2.5 text-right">{baht(bs.totalLiabilitiesEquity)}</td></tr>
        </tbody>
      </TableWrap>
    </div>
  );
}
