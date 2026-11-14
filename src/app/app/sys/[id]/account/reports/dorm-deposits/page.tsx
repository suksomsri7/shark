import { MoneyText } from "@/components/ui/MoneyText";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { dormDepositReport } from "@/lib/modules/account/deposits-points";
import { loadReport, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T4.8 (I4) — ตรวจเงินประกันหอพัก: ≤ N เท่าของค่าเช่ารายเดือน · สัญญา ≤ M ปี (ค่าจากตารางค่ากฎหมาย) — ฝั่งบัญชีเท่านั้น (ตัวตรวจหอพักเดิมไม่แตะ)
const STATUS_TH: Record<string, string> = { DRAFT: "ร่าง", ACTIVE: "มีผล", NOTICE: "แจ้งออก" };

export default async function DormDepositsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const r = await dormDepositReport({ tenantId, systemId }, new Date());
  const csv = {
    headers: ["หอ", "ห้อง", "สถานะ", "เริ่ม", "สิ้นสุด", "เดือน", "ค่าเช่า (บาท)", "เงินประกัน (บาท)", "เท่าของค่าเช่า", "เกินเพดาน"],
    rows: r.rows.map((x) => [x.unitName, x.roomNumber, STATUS_TH[x.status] ?? x.status, x.startDate, x.endDate ?? "", x.contractMonths ?? "", (x.rentSatang / 100).toFixed(2), (x.depositSatang / 100).toFixed(2), x.multiple ?? "", x.overMultiple || x.overYears ? "ใช่" : ""]),
  };
  return (
    <div className="flex max-w-6xl flex-col gap-5" data-testid="dorm-deposits-page">
      <ReportHeader base={base} title="ตรวจเงินประกันหอพัก" subtitle={`เงินประกันไม่ถือเป็นรายได้เมื่อไม่เกิน ${r.maxMultiple} เท่าของค่าเช่ารายเดือน และสัญญาไม่เกิน ${r.maxYears} ปี · ${r.rows.length} สัญญา · เกินเพดาน ${r.flagged}`} />
      <ReportToolbar filename="ตรวจเงินประกันหอพัก" csv={csv} mode="none" showCompare={false} />
      {r.warnings.length > 0 && <LegalWarnings warnings={r.warnings} compact testId="dorm-deposits-warnings" />}
      <TableWrap>
        <thead>
          <tr className="text-left text-[color:var(--color-muted)]">
            <th className="px-3 py-2">หอ · ห้อง</th>
            <th className="px-3 py-2">สัญญา</th>
            <th className="px-3 py-2 text-right">ค่าเช่า/เดือน</th>
            <th className="px-3 py-2 text-right">เงินประกัน</th>
            <th className="px-3 py-2 text-right">เท่า</th>
            <th className="px-3 py-2">คำเตือน</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.length === 0 ? (
            <tr className="border-t">
              <td colSpan={6} className="px-3 py-4 text-center text-[color:var(--color-muted)]">ไม่มีสัญญาเช่าของหอที่เชื่อมกับสมุดนี้</td>
            </tr>
          ) : (
            r.rows.map((x) => (
              <tr key={x.leaseId} className="border-t align-top" data-testid="dorm-deposit-row" data-flag={x.overMultiple || x.overYears ? "1" : "0"}>
                <td className="px-3 py-1.5">{x.unitName} · {x.roomNumber}</td>
                <td className="px-3 py-1.5">{STATUS_TH[x.status] ?? x.status} · {x.startDate} – {x.endDate ?? "ไม่กำหนด"}{x.contractMonths !== null ? ` (${x.contractMonths} เดือน)` : ""}</td>
                <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={x.rentSatang} decimals /></td>
                <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={x.depositSatang} decimals /></td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${x.overMultiple ? "font-medium text-[color:var(--color-danger)]" : ""}`}>{x.multiple ?? "—"}</td>
                <td className="px-3 py-1.5">{x.warnings.length ? <LegalWarnings warnings={x.warnings} compact collapsible testId={`dorm-deposit-warn-${x.leaseId}`} /> : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
