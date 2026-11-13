import Link from "next/link";
import { MoneyText } from "@/components/ui/MoneyText";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { legalWarning } from "@/lib/core/settings/legal/warnings";
import { editorDetailPath } from "@/lib/modules/account/doc-editor-config";
import { NOVAT_CATEGORIES, NOVAT_CATEGORY_LABEL_TH, isYm, revenueWithoutVat } from "@/lib/modules/account/revenue-novat";
import { loadReport, currentPeriodKey, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T1.9 — รายงาน "รายได้ที่ไม่มี VAT" (ปิด E13): เอกสารขาย + บิล POS ต่อเดือน แยก ยกเว้น / 0% / ไม่คิด VAT (ไม่ระบุเหตุผล)
//   ตัวคิดเดียวกับ REST `GET /reports/revenue-without-vat` (revenue-novat.ts) · CSV จากแถวเดียวกัน
const fmtDay = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export default async function RevenueNoVatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const to = isYm(sp.to) ? sp.to : currentPeriodKey();
  const from = isYm(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 4)}-01`;
  const r = await revenueWithoutVat({ tenantId, systemId }, { from, to });
  const untaxed = r.totals.UNTAXED;
  const csv = {
    headers: ["เดือน", "วันที่", "เลขที่", "ชนิด", "ที่มา", "ลูกค้า", "รายการ", "หมวด", "ยอด (บาท)"],
    rows: r.rows.map((x) => [x.month, fmtDay(x.date), x.docNo ?? "", x.docType, x.source === "POS" ? "POS" : "เอกสาร", x.contactName, x.description, NOVAT_CATEGORY_LABEL_TH[x.category], (x.amount / 100).toFixed(2)]),
  };

  return (
    <div className="flex max-w-5xl flex-col gap-5" data-testid="revenue-novat-page">
      <ReportHeader base={base} title="รายได้ที่ไม่มี VAT" subtitle={`${from} ถึง ${to} · เอกสารขาย + บิลหน้าร้าน (POS)`} />
      <ReportToolbar filename={`รายได้ไม่มีVAT-${from}-${to}`} csv={csv} mode="range" from={from} to={to} showCompare={false} />

      {!r.vatRegistered ? (
        <p className="text-sm text-[color:var(--color-muted)]" data-testid="revenue-novat-not-registered">
          สมุดนี้ไม่ได้จดทะเบียน VAT — รายได้ทั้งหมดไม่มี VAT โดยธรรมชาติ รายงานนี้มีไว้ตรวจสมุดที่จด VAT
        </p>
      ) : untaxed !== 0 ? (
        <LegalWarnings warnings={[legalWarning("SALE_WITHOUT_VAT_REGISTERED", { doc: "เอกสารขาย/บิลในช่วงนี้", amount: `(ยอดไม่คิด VAT ${(untaxed / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท)` })]} testId="revenue-novat-warning" />
      ) : null}

      <section className="flex flex-col gap-2" data-testid="revenue-novat-months">
        <h2 className="text-sm font-medium">สรุปรายเดือน</h2>
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[color:var(--color-muted)]">
                <th className="px-3 py-2">เดือน</th>
                {NOVAT_CATEGORIES.map((c) => (
                  <th key={c} className="px-3 py-2 text-right">{NOVAT_CATEGORY_LABEL_TH[c]}</th>
                ))}
                <th className="px-3 py-2 text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
              {r.byMonth.map((m) => (
                <tr key={m.month} className="border-t" data-testid={`revenue-novat-month-${m.month}`}>
                  <td className="px-3 py-1.5">{m.month}</td>
                  {NOVAT_CATEGORIES.map((c) => (
                    <td key={c} className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={m[c]} decimals /></td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums"><MoneyText satang={m.total} decimals /></td>
                </tr>
              ))}
              <tr className="border-t font-semibold" data-testid="revenue-novat-total">
                <td className="px-3 py-1.5">รวม</td>
                {NOVAT_CATEGORIES.map((c) => (
                  <td key={c} className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals[c]} decimals /></td>
                ))}
                <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.total} decimals /></td>
              </tr>
            </tbody>
          </table>
        </TableWrap>
      </section>

      <section className="flex flex-col gap-2" data-testid="revenue-novat-rows">
        <h2 className="text-sm font-medium">รายการ ({r.rows.length} บรรทัด · {r.totals.docCount} ใบ)</h2>
        <TableWrap>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[color:var(--color-muted)]">
                <th className="px-3 py-2">วันที่</th>
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2">ที่มา</th>
                <th className="px-3 py-2">ลูกค้า</th>
                <th className="px-3 py-2">รายการ</th>
                <th className="px-3 py-2">หมวด</th>
                <th className="px-3 py-2 text-right">ยอด</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x, i) => (
                <tr key={`${x.docId}-${i}`} className="border-t" data-testid="revenue-novat-row" data-category={x.category}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmtDay(x.date)}</td>
                  <td className="px-3 py-1.5">
                    {x.source === "DOC" ? <Link href={editorDetailPath(base, x.docType, x.docId)} className="underline">{x.docNo ?? "—"}</Link> : (x.docNo ?? "—")}
                  </td>
                  <td className="px-3 py-1.5">{x.source === "POS" ? "หน้าร้าน (POS)" : "เอกสาร"}</td>
                  <td className="px-3 py-1.5">{x.contactName}</td>
                  <td className="px-3 py-1.5">{x.description}</td>
                  <td className={`px-3 py-1.5 ${x.category === "UNTAXED" ? "font-medium text-[color:var(--color-danger)]" : ""}`}>{NOVAT_CATEGORY_LABEL_TH[x.category]}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={x.amount} decimals /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </section>
    </div>
  );
}
