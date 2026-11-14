import { MoneyText } from "@/components/ui/MoneyText";
import { DateInput } from "@/components/account-v2/DateInput";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { pointsOutstandingAt } from "@/lib/modules/account/deposits-points";
import { loadReport, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T4.8 (I9) — แต้มสะสมคงค้าง ณ วันสิ้นงวด (ย้อนวันได้) · มูลค่าตามอัตราแลก — สำหรับนักบัญชีเลือกตั้งหนี้สิน/รับรู้ตอนใช้
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const lastDayPrevMonth = () => {
  const d = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
};

export default async function PointsOutstandingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ asOf?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const asOf = sp.asOf && YMD.test(sp.asOf) ? sp.asOf : lastDayPrevMonth();
  const r = await pointsOutstandingAt({ tenantId, systemId }, asOf);
  const csv = { headers: ["ระบบแต้ม", "สมาชิกที่มีแต้ม", "แต้มคงค้าง", "อัตราแลก (สตางค์/แต้ม)", "มูลค่า (บาท)", "แต้มคงเหลือวันนี้"], rows: r.rows.map((x) => [x.name, x.members, x.points, x.burnRateSatang, (x.valueSatang / 100).toFixed(2), x.currentPoints]) };
  return (
    <div className="flex max-w-5xl flex-col gap-5" data-testid="points-outstanding-page">
      <ReportHeader base={base} title="แต้มสะสมคงค้าง ณ วันสิ้นงวด" subtitle={`ณ ${asOf} (สิ้นวันตามเวลาไทย)`} />
      <ReportToolbar filename={`แต้มคงค้าง-${asOf}`} csv={csv} mode="none" showCompare={false} />
      <form method="get" className="flex items-end gap-3 print:hidden">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ณ วันที่
          <DateInput name="asOf" defaultValue={asOf} testId="points-asof" />
        </label>
        <button type="submit" className="btn btn-primary btn-sm h-9" data-testid="points-apply">แสดง</button>
      </form>
      {r.warnings.length > 0 && <LegalWarnings warnings={r.warnings} compact collapsible testId="points-warnings" />}
      <TableWrap>
        <thead>
          <tr className="text-left text-[color:var(--color-muted)]">
            <th className="px-3 py-2">ระบบแต้ม</th>
            <th className="px-3 py-2 text-right">สมาชิกที่มีแต้ม</th>
            <th className="px-3 py-2 text-right">แต้มคงค้าง</th>
            <th className="px-3 py-2 text-right">มูลค่า</th>
            <th className="px-3 py-2 text-right">คงเหลือวันนี้</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.length === 0 ? (
            <tr className="border-t"><td colSpan={5} className="px-3 py-4 text-center text-[color:var(--color-muted)]">ร้านยังไม่มีระบบแต้ม</td></tr>
          ) : (
            r.rows.map((x) => (
              <tr key={x.pointSystemId} className="border-t" data-testid="points-row">
                <td className="px-3 py-1.5">{x.name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{x.members.toLocaleString("th-TH")}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{x.points.toLocaleString("th-TH")}</td>
                <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={x.valueSatang} decimals /></td>
                <td className="px-3 py-1.5 text-right tabular-nums">{x.currentPoints.toLocaleString("th-TH")}</td>
              </tr>
            ))
          )}
          <tr className="border-t font-semibold" data-testid="points-total">
            <td className="px-3 py-1.5">รวม</td>
            <td />
            <td className="px-3 py-1.5 text-right tabular-nums">{r.totalPoints.toLocaleString("th-TH")}</td>
            <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totalValueSatang} decimals /></td>
            <td />
          </tr>
        </tbody>
      </TableWrap>
    </div>
  );
}
