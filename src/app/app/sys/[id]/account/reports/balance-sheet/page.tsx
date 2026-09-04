import Link from "next/link";
import { balanceSheet, type BSRow } from "@/lib/modules/account/reports";
import { ledgerDrillHref, shiftPeriod } from "@/lib/modules/account/report-drill";
import { MoneyText } from "@/components/ui/MoneyText";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap, WarnBanner } from "../_shared";
import ReportToolbar from "../ReportToolbar";

export default async function BalanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asOf?: string; to?: string; cmp?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const asOf = sp.asOf || sp.to || currentPeriodKey();
  const compare = sp.cmp === "1";
  // "งวดก่อน" ของงบฐานะ = ณ สิ้นเดือนก่อนหน้า (งบ ณ วันที่ ⇒ เทียบจุดเวลา ไม่ใช่เทียบช่วง)
  const prevAsOf = shiftPeriod(asOf, -1);
  const [bs, bsPrev] = await Promise.all([
    balanceSheet({ tenantId, systemId }, asOf),
    compare ? balanceSheet({ tenantId, systemId }, prevAsOf) : Promise.resolve(null),
  ]);
  const prevAmt = (code: string) =>
    [...(bsPrev?.assets.rows ?? []), ...(bsPrev?.liabilities.rows ?? []), ...(bsPrev?.equity.rows ?? [])].find(
      (r) => r.code === code,
    )?.amount ?? 0;

  // คลิกตัวเลข = drill-down ไปแยกประเภทของบัญชีนั้น ตั้งแต่ต้นปีบัญชีถึงสิ้นงวด (§11.3)
  const rows = (list: BSRow[]) =>
    list.map((r) => (
      <tr key={r.code} className="border-b last:border-0" data-testid={`bs-row-${r.code}`}>
        <td className="px-3 py-1.5 pl-6"><span className="font-mono text-xs">{r.code}</span> {r.name}</td>
        <td className="px-3 py-1.5 text-right">
          <Link href={ledgerDrillHref(base, r.code, bs.fiscalYearStartKey, asOf)} className="hover:underline" data-testid={`bs-amt-${r.code}`}>
            <MoneyText satang={r.amount} decimals />
          </Link>
        </td>
        {compare && (
          <td className="px-3 py-1.5 text-right text-[color:var(--color-muted)]" data-testid={`bs-prev-${r.code}`}>
            <MoneyText satang={prevAmt(r.code)} decimals />
          </td>
        )}
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
        <ReportHeader
          base={base}
          title="งบแสดงฐานะการเงิน"
          subtitle={`ณ สิ้นเดือน ${asOf}${compare ? ` · เทียบ ณ สิ้นเดือน ${prevAsOf}` : ""}`}
        />
      </div>
      <ReportToolbar filename={`งบฐานะการเงิน-${asOf}`} csv={csv} mode="asof" to={asOf} compare={compare} />
      {!bs.balanced && (
        <WarnBanner base={base}>
          สินทรัพย์ <MoneyText satang={bs.assets.total} decimals /> ≠ หนี้สิน+ทุน <MoneyText satang={bs.totalLiabilitiesEquity} decimals />
        </WarnBanner>
      )}
      <TableWrap>
        <tbody>
          <tr className="bg-[color:var(--color-surface-2)] font-medium"><td className="px-3 py-1.5" colSpan={compare ? 3 : 2}>สินทรัพย์</td></tr>
          {rows(bs.assets.rows)}
          <tr className="border-b-2 font-semibold"><td className="px-3 py-2">รวมสินทรัพย์</td><td className="px-3 py-2 text-right" data-testid="bs-total-assets"><MoneyText satang={bs.assets.total} decimals /></td>{compare && <td className="px-3 py-2 text-right text-[color:var(--color-muted)]"><MoneyText satang={bsPrev!.assets.total} decimals /></td>}</tr>
          <tr className="bg-[color:var(--color-surface-2)] font-medium"><td className="px-3 py-1.5" colSpan={compare ? 3 : 2}>หนี้สิน</td></tr>
          {rows(bs.liabilities.rows)}
          <tr className="border-b font-medium"><td className="px-3 py-1.5 pl-3">รวมหนี้สิน</td><td className="px-3 py-1.5 text-right"><MoneyText satang={bs.liabilities.total} decimals /></td>{compare && <td className="px-3 py-1.5 text-right text-[color:var(--color-muted)]"><MoneyText satang={bsPrev!.liabilities.total} decimals /></td>}</tr>
          <tr className="bg-[color:var(--color-surface-2)] font-medium"><td className="px-3 py-1.5" colSpan={compare ? 3 : 2}>ส่วนของเจ้าของ</td></tr>
          {rows(bs.equity.rows)}
          <tr className="border-b last:border-0"><td className="px-3 py-1.5 pl-6">กำไรสะสม</td><td className="px-3 py-1.5 text-right"><MoneyText satang={bs.retainedEarnings} decimals /></td>{compare && <td className="px-3 py-1.5 text-right text-[color:var(--color-muted)]"><MoneyText satang={bsPrev!.retainedEarnings} decimals /></td>}</tr>
          <tr className="border-b last:border-0"><td className="px-3 py-1.5 pl-6">กำไร(ขาดทุน)งวดปัจจุบัน</td><td className="px-3 py-1.5 text-right"><MoneyText satang={bs.currentPeriodProfit} decimals /></td>{compare && <td className="px-3 py-1.5 text-right text-[color:var(--color-muted)]"><MoneyText satang={bsPrev!.currentPeriodProfit} decimals /></td>}</tr>
          <tr className="border-b font-medium"><td className="px-3 py-1.5 pl-3">รวมส่วนของเจ้าของ</td><td className="px-3 py-1.5 text-right"><MoneyText satang={bs.totalEquity} decimals /></td>{compare && <td className="px-3 py-1.5 text-right text-[color:var(--color-muted)]"><MoneyText satang={bsPrev!.totalEquity} decimals /></td>}</tr>
          <tr className="border-t-2 text-base font-bold"><td className="px-3 py-2.5">รวมหนี้สินและส่วนของเจ้าของ</td><td className="px-3 py-2.5 text-right" data-testid="bs-total-le"><MoneyText satang={bs.totalLiabilitiesEquity} decimals /></td>{compare && <td className="px-3 py-2.5 text-right text-[color:var(--color-muted)]"><MoneyText satang={bsPrev!.totalLiabilitiesEquity} decimals /></td>}</tr>
        </tbody>
      </TableWrap>
      <p className="text-xs text-[color:var(--color-muted)] print:hidden">
        คลิกตัวเลขเพื่อดูที่มา → บัญชีแยกประเภท → ใบสำคัญ → เอกสารต้นทาง
      </p>
    </div>
  );
}
