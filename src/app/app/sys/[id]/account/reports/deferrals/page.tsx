import { MoneyText } from "@/components/ui/MoneyText";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { DEFAULT_DEFERRED_CODE, deferralWarnings, listDeferrals } from "@/lib/modules/account/deferral";
import { cancelDeferralAction, createDeferralAction, recognizeDeferralsAction } from "@/lib/modules/account/t5b-actions";
import { prisma } from "@/lib/core/db";
import { loadReport, ReportHeader, TableWrap, currentPeriodKey } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T5.10 (I12) — รายได้รับล่วงหน้าทยอยรับรู้ (ค่าสมาชิกรายปี · คอร์ส · แพ็กเกจ)
const STATUS_TH: Record<string, string> = { ACTIVE: "กำลังรับรู้", DONE: "รับรู้ครบ", CANCELLED: "ยกเลิก (กลับรายการแล้ว)" };

export default async function DeferralsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const now = currentPeriodKey();
  const [rows, incomes] = await Promise.all([
    listDeferrals({ tenantId, systemId }),
    prisma.accountLedger.findMany({ where: { systemId, type: "INCOME", archivedAt: null }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  const remaining = rows.reduce((a, r) => a + r.remainingSatang, 0);
  const csv = { headers: ["รายการ", "เอกสาร", "ยอด (บาท)", "เดือนเริ่ม", "จำนวนเดือน", "รับรู้แล้ว (บาท)", "คงเหลือ (บาท)", "สถานะ"], rows: rows.map((r) => [r.description, r.docNo ?? "", r.totalSatang / 100, r.startMonth, r.months, r.recognizedSatang / 100, r.remainingSatang / 100, STATUS_TH[r.status] ?? r.status]) };
  return (
    <div className="flex max-w-5xl flex-col gap-4" data-testid="deferrals-page">
      <ReportHeader base={base} title="รายได้รับล่วงหน้าทยอยรับรู้" subtitle={`คงเหลือยังไม่รับรู้รวม ${(remaining / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`} />
      {sp.msg && <p className="rounded-lg border px-3 py-2 text-sm" data-testid="def-msg">{sp.msg}</p>}
      {sp.err && <p className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]" data-testid="def-err">{sp.err}</p>}
      <LegalWarnings warnings={deferralWarnings()} compact testId="def-warnings" />
      <ReportToolbar filename="รายได้รับล่วงหน้า" csv={csv} mode="none" showCompare={false} />

      <form action={createDeferralAction} className="grid grid-cols-1 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3 print:hidden" style={{ borderColor: "var(--color-line)" }} data-testid="def-create">
        <input type="hidden" name="systemId" value={id} />
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)] sm:col-span-3">รายการ (เช่น ค่าสมาชิกรายปี ลูกค้า ก)<input name="description" required maxLength={200} className="rounded-lg border px-2 py-1.5 text-sm" data-testid="def-desc" /></label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">ยอด (บาท)<input name="amount" required inputMode="decimal" className="rounded-lg border px-2 py-1.5 text-sm" data-testid="def-amount" /></label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">เดือนเริ่ม<input name="startMonth" type="month" required defaultValue={now} className="rounded-lg border px-2 py-1.5 text-sm" data-testid="def-start" /></label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">จำนวนเดือน<input name="months" type="number" min={1} max={120} required defaultValue={12} className="rounded-lg border px-2 py-1.5 text-sm" data-testid="def-months" /></label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">บัญชีรายได้ที่ขายลงไว้
          <select name="incomeAccountCode" defaultValue={incomes.some((l) => l.code === "4030") ? "4030" : incomes[0]?.code} className="rounded-lg border px-2 py-1.5 text-sm" data-testid="def-income">
            {incomes.map((l) => (
              <option key={l.code} value={l.code}>{l.code} {l.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">บัญชีรายได้รับล่วงหน้า<input name="deferredAccountCode" defaultValue={DEFAULT_DEFERRED_CODE} maxLength={20} className="rounded-lg border px-2 py-1.5 text-sm" /></label>
        <div className="flex items-end"><button type="submit" className="btn btn-primary btn-sm h-9" data-testid="def-submit">ตั้งรายได้รับล่วงหน้า</button></div>
      </form>

      <form action={recognizeDeferralsAction} className="flex flex-wrap items-end gap-2 print:hidden">
        <input type="hidden" name="systemId" value={id} />
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">รับรู้รายได้ถึงเดือน<input name="upTo" type="month" defaultValue={now} className="rounded-lg border px-2 py-1.5 text-sm" data-testid="def-upto" /></label>
        <button type="submit" className="btn btn-secondary btn-sm h-9" data-testid="def-recognize">ลงรายการรับรู้</button>
      </form>

      <TableWrap>
        <thead>
          <tr className="text-left text-[color:var(--color-muted)]">
            <th className="px-3 py-2">รายการ</th>
            <th className="px-3 py-2 text-right">ยอด</th>
            <th className="px-3 py-2">ช่วง</th>
            <th className="px-3 py-2 text-right">รับรู้แล้ว</th>
            <th className="px-3 py-2 text-right">คงเหลือ</th>
            <th className="px-3 py-2">สถานะ</th>
            <th className="px-3 py-2 print:hidden" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="border-t"><td colSpan={7} className="px-3 py-4 text-center text-[color:var(--color-muted)]">ยังไม่มีรายได้รับล่วงหน้า</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-t align-top" data-testid="def-row">
                <td className="px-3 py-1.5">{r.description}<div className="text-xs text-[color:var(--color-muted)]">{r.incomeAccountCode} → {r.deferredAccountCode}{r.docNo ? ` · ${r.docNo}` : ""}</div></td>
                <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totalSatang} decimals /></td>
                <td className="px-3 py-1.5">{r.startMonth} · {r.months} เดือน<div className="text-xs text-[color:var(--color-muted)]">ลงแล้ว {r.schedule.filter((s) => s.posted).length}/{r.months} เดือน</div></td>
                <td className="px-3 py-1.5 text-right tabular-nums" data-testid="def-recognized"><MoneyText satang={r.recognizedSatang} decimals /></td>
                <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.remainingSatang} decimals /></td>
                <td className="px-3 py-1.5">{STATUS_TH[r.status] ?? r.status}{r.cancelReason ? <div className="text-xs text-[color:var(--color-muted)]">เหตุผล: {r.cancelReason}</div> : null}</td>
                <td className="px-3 py-1.5 print:hidden">
                  {r.status !== "CANCELLED" && (
                    <form action={cancelDeferralAction} className="flex flex-col gap-1">
                      <input type="hidden" name="systemId" value={id} />
                      <input type="hidden" name="deferralId" value={r.id} />
                      <input name="reason" required placeholder="เหตุผลการยกเลิก" maxLength={500} className="rounded-lg border px-2 py-1 text-xs" data-testid="def-cancel-reason" />
                      <button type="submit" className="btn btn-sm btn-ghost text-[color:var(--color-danger)]" data-testid="def-cancel">ยกเลิก (กลับรายการ)</button>
                    </form>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableWrap>
    </div>
  );
}
