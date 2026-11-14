import { MoneyText } from "@/components/ui/MoneyText";
import { DateInput } from "@/components/account-v2/DateInput";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { posDailyRecon, posLinkWarnings, posShiftVariances, posUnpostedBills } from "@/lib/modules/account/pos-link";
import { loadBookLegal } from "@/lib/modules/account/legal-values";
import { postShiftVariancesAction, saveTipTreatmentAction } from "@/lib/modules/account/compliance-actions";
import { TIP_TREATMENTS, TIP_TREATMENT_LABEL_TH } from "@/lib/core/settings/defs/account";
import { loadReport, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T4.7 (J8 J7 J6 J2) — POS ↔ สมุดบัญชี: กระทบยอดรายวัน · บิลที่ยังไม่ลงบัญชี · เงินขาด/เกินปิดกะ (ลงบัญชีได้) · วิธีลงทิป · คำเตือนเครื่องบันทึกการเก็บเงิน
//   ตัวคิดเดียวกับ REST /pos/* (pos-link.ts)
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const bkkDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const bkkTime = (d: Date) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function PosLinkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const ctx = { tenantId, systemId };
  const base = `/app/sys/${id}/account`;
  const to = sp.to && YMD.test(sp.to) ? sp.to : bkkDay(new Date());
  const from = sp.from && YMD.test(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 8)}01`;
  const range = { from: new Date(`${from}T00:00:00.000+07:00`), to: new Date(`${to}T23:59:59.999+07:00`) };
  const [recon, unposted, variances, legal] = await Promise.all([posDailyRecon(ctx, range), posUnpostedBills(ctx, range), posShiftVariances(ctx, range), loadBookLegal(ctx)]);
  const warnings = await posLinkWarnings(ctx, { unposted, variances: variances.filter((v) => !v.posted).length });
  const tip = legal.tipTreatment ?? "LIABILITY";
  const csv = {
    headers: ["วันที่", "บิล", "ยอดรับตาม POS (บาท)", "บิลที่ลงแล้ว", "ยอดตามบัญชี (บาท)", "บิลยังไม่ลง", "ยอดยังไม่ลง (บาท)", "ผลต่าง (บาท)"],
    rows: recon.days.map((d) => [d.day, d.bills, (d.posReceivedSatang / 100).toFixed(2), d.postedBills, (d.glDebitSatang / 100).toFixed(2), d.unpostedBills, (d.unpostedSatang / 100).toFixed(2), (d.differenceSatang / 100).toFixed(2)]),
  };
  const unpostedVar = variances.filter((v) => !v.posted);

  return (
    <div className="flex max-w-6xl flex-col gap-5" data-testid="pos-link-page">
      <ReportHeader base={base} title="ขายหน้าร้าน (POS) กับสมุดบัญชี" subtitle={`${from} ถึง ${to} · ${unposted.posSystems.map((p) => p.name).join(" · ") || "ยังไม่ได้เชื่อมจุดขาย"}`} />
      <ReportToolbar filename={`กระทบยอดPOS-${from}-${to}`} csv={csv} mode="none" showCompare={false} />
      <form method="get" className="flex flex-wrap items-end gap-3 print:hidden" data-testid="pos-link-filter">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ตั้งแต่
          <DateInput name="from" defaultValue={from} testId="pos-link-from" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ถึง
          <DateInput name="to" defaultValue={to} testId="pos-link-to" />
        </label>
        <button type="submit" className="btn btn-primary btn-sm h-9" data-testid="pos-link-apply">
          แสดง
        </button>
      </form>
      {sp.msg ? <p className="text-sm" data-testid="pos-link-msg">{sp.msg}</p> : null}
      {sp.err ? <p className="text-sm text-[color:var(--color-danger)]" data-testid="pos-link-err">{sp.err}</p> : null}
      <LegalWarnings warnings={warnings} compact collapsible testId="pos-link-warnings" />

      <section className="flex flex-col gap-2" data-testid="pos-recon">
        <h2 className="text-sm font-medium">กระทบยอดรายวัน</h2>
        <TableWrap>
          <thead>
            <tr className="text-left text-[color:var(--color-muted)]">
              <th className="px-3 py-2">วันที่</th>
              <th className="px-3 py-2 text-right">บิล</th>
              <th className="px-3 py-2 text-right">ยอดรับตาม POS</th>
              <th className="px-3 py-2 text-right">ยอดตามบัญชี</th>
              <th className="px-3 py-2 text-right">บิลยังไม่ลง</th>
              <th className="px-3 py-2 text-right">ผลต่าง</th>
            </tr>
          </thead>
          <tbody>
            {recon.days.length === 0 ? (
              <tr className="border-t">
                <td colSpan={6} className="px-3 py-4 text-center text-[color:var(--color-muted)]">ไม่มีบิลขายในช่วงนี้</td>
              </tr>
            ) : (
              recon.days.map((d) => (
                <tr key={d.day} className="border-t" data-testid={`pos-recon-${d.day}`}>
                  <td className="px-3 py-1.5">{d.day}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.bills}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={d.posReceivedSatang} decimals /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={d.glDebitSatang} decimals /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.unpostedBills}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${d.differenceSatang !== 0 ? "font-medium text-[color:var(--color-danger)]" : ""}`}><MoneyText satang={d.differenceSatang} decimals /></td>
                </tr>
              ))
            )}
            <tr className="border-t font-semibold" data-testid="pos-recon-total">
              <td className="px-3 py-1.5">รวม</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{recon.totals.bills}</td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={recon.totals.posReceivedSatang} decimals /></td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={recon.totals.glDebitSatang} decimals /></td>
              <td className="px-3 py-1.5 text-right tabular-nums">{recon.totals.unpostedBills}</td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={recon.totals.differenceSatang} decimals /></td>
            </tr>
          </tbody>
        </TableWrap>
      </section>

      <section className="flex flex-col gap-2" data-testid="pos-unposted">
        <h2 className="text-sm font-medium">บิลที่ยังไม่ลงบัญชี ({unposted.count} บิล · <MoneyText satang={unposted.totalSatang} decimals />)</h2>
        {unposted.bills.length > 0 && (
          <TableWrap>
            <thead>
              <tr className="text-left text-[color:var(--color-muted)]">
                <th className="px-3 py-2">เวลา</th>
                <th className="px-3 py-2">จุดขาย</th>
                <th className="px-3 py-2">เลขที่ใบเสร็จ</th>
                <th className="px-3 py-2 text-right">ยอด</th>
                <th className="px-3 py-2 text-right">ค้าง (วัน)</th>
              </tr>
            </thead>
            <tbody>
              {unposted.bills.slice(0, 200).map((b) => (
                <tr key={b.saleId} className="border-t" data-testid="pos-unposted-row">
                  <td className="px-3 py-1.5 whitespace-nowrap">{bkkTime(b.at)}</td>
                  <td className="px-3 py-1.5">{b.posName}{b.beforeLink ? <span className="text-xs text-[color:var(--color-muted)]"> (ก่อนเชื่อมสมุด)</span> : null}</td>
                  <td className="px-3 py-1.5">{b.receiptNo ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={b.grossSatang} decimals /></td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${b.ageDays > 3 ? "text-[color:var(--color-danger)]" : ""}`}>{b.ageDays}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      <section className="flex flex-col gap-2" data-testid="pos-variances">
        <h2 className="text-sm font-medium">เงินขาด/เกินปิดกะ</h2>
        {variances.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ไม่มีกะที่นับเงินขาด/เกินในช่วงนี้</p>
        ) : (
          <TableWrap>
            <thead>
              <tr className="text-left text-[color:var(--color-muted)]">
                <th className="px-3 py-2">ปิดกะ/นับ</th>
                <th className="px-3 py-2">จุดขาย · กะ</th>
                <th className="px-3 py-2">ผู้นับ</th>
                <th className="px-3 py-2 text-right">ควรมี</th>
                <th className="px-3 py-2 text-right">นับได้</th>
                <th className="px-3 py-2 text-right">ขาด/เกิน</th>
                <th className="px-3 py-2">ลงบัญชี</th>
              </tr>
            </thead>
            <tbody>
              {variances.map((v) => (
                <tr key={v.refId} className="border-t" data-testid="pos-variance-row" data-posted={v.posted ? "1" : "0"}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{bkkTime(v.at)}</td>
                  <td className="px-3 py-1.5">{v.posName}{v.zNumber ? ` · Z${v.zNumber}` : ""}{v.refType === "PosShiftRecount" ? " (นับย้อนหลัง)" : ""}</td>
                  <td className="px-3 py-1.5">{v.countedByName ?? "—"}{v.note ? <div className="text-xs text-[color:var(--color-muted)]">{v.note}</div> : null}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={v.expectedSatang} decimals /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={v.countedSatang} decimals /></td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${v.varianceSatang < 0 ? "text-[color:var(--color-danger)]" : ""}`}><MoneyText satang={v.varianceSatang} decimals /></td>
                  <td className="px-3 py-1.5">{v.posted ? v.entryNo : "ยังไม่ลง"}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {unpostedVar.length > 0 && (
          <form action={postShiftVariancesAction} className="print:hidden">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <button type="submit" className="btn btn-primary btn-sm" data-testid="pos-variance-post">
              ลงบัญชีเงินขาด/เกิน {unpostedVar.length} กะ
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-2 print:hidden" data-testid="pos-tip">
        <h2 className="text-sm font-medium">ทิปที่รับผ่านจุดขาย</h2>
        <form action={saveTipTreatmentAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="back" value={`${base}/reports/pos-link`} />
          <select name="tipTreatment" defaultValue={tip} className="input h-9 w-auto max-w-full" data-testid="pos-tip-select">
            {TIP_TREATMENTS.map((t) => (
              <option key={t} value={t}>{TIP_TREATMENT_LABEL_TH[t]}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-ghost btn-sm h-9" data-testid="pos-tip-save">บันทึก</button>
        </form>
      </section>
    </div>
  );
}
