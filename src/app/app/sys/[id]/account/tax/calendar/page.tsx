import Link from "next/link";
import { MoneyText } from "@/components/ui/MoneyText";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { StampDutyRefForm } from "@/components/account-v2/TaxT5Forms";
import { loadAccountSystem, accountPageGate } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { calendarDueWarning, taxCalendar, ymdTh, type CalendarItem } from "@/lib/modules/account/tax-calendar";
import { taxChecks } from "@/lib/modules/account/tax-checks";
import { vatThreshold } from "@/lib/modules/account/vat-threshold";
import { setStampDutyRefAction } from "@/lib/modules/account/tax-t5-actions";
import { editorDetailPath } from "@/lib/modules/account/doc-editor-config";
import type { AccountDocType } from "@prisma/client";

// ACC T5.1 + T5.3 + T5.6 (เลน 2) — ปฏิทินภาษีของร้าน · ยอดขายเทียบเกณฑ์จด VAT · ตรวจภาษีประจำเดือน
//   ตัวคิดเดียวกับ REST `settings.tax.deadlines` (calendar) · `tax.vat-threshold` · `tax.checks`
const left = (n: number) => (n > 0 ? `อีก ${n} วัน` : n === 0 ? "วันนี้" : `เลยมาแล้ว ${-n} วัน`);
const isYm = (v: string | undefined): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export default async function TaxCalendarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  accountPageGate(auth, "account.report.view");
  assertAccountCan(auth, "account.report.view");
  const ctx = { tenantId, systemId };
  const base = `/app/sys/${id}/account`;
  const [cal, vt] = await Promise.all([taxCalendar(ctx), vatThreshold(ctx)]);
  const period = isYm(sp.period) ? sp.period : cal.asOf.slice(0, 7);
  const checks = await taxChecks(ctx, { period });
  const soon = cal.items.filter((i) => i.cadence === "ANNUAL" && i.paper && i.paper.daysLeft >= 0 && i.paper.daysLeft <= cal.remindDays).map(calendarDueWarning).filter((w): w is NonNullable<typeof w> => !!w);

  return (
    <div className="flex max-w-5xl flex-col gap-5" data-testid="tax-calendar-page">
      <div>
        <Link href={`${base}/reports`} className="text-sm text-[color:var(--color-muted)]">← งบและรายงาน</Link>
        <h1 className="mt-1 text-2xl font-semibold">ปฏิทินภาษีของร้าน</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          ณ {ymdTh(cal.asOf)} · {cal.entityKindLabel} · {cal.vatRegistered ? "จดทะเบียน VAT" : "ไม่จดทะเบียน VAT"} · วันที่ทุกบรรทัดจากตารางกำหนดยื่น (
          <Link href={`${base}/settings/tax`} className="underline">ตั้งค่า › ภาษี</Link>) · ระบบเตือนเท่านั้น ไม่ได้ยื่นแบบแทนร้าน
        </p>
      </div>
      <LegalWarnings warnings={[...cal.warnings, ...soon]} testId="tax-calendar-warnings" />

      <section className="card flex flex-col gap-2 p-5" data-testid="tax-calendar">
        <h2 className="text-base font-semibold">กำหนดยื่นที่กำลังจะถึง</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="py-1 pr-3">แบบ</th>
                <th className="py-1 pr-3">งวด</th>
                <th className="py-1 pr-3">ยื่นกระดาษ</th>
                <th className="py-1 pr-3">ยื่นทางอินเทอร์เน็ต</th>
                <th className="py-1 pr-3">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {cal.items.map((i) => (
                <CalendarRow key={`${i.form}-${i.periodKey}`} i={i} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card flex flex-col gap-2 p-5" data-testid="vat-threshold-card">
        <h2 className="text-base font-semibold">ยอดขายเทียบเกณฑ์จดทะเบียน VAT</h2>
        {vt.vatRegistered ? (
          <p className="text-sm text-[color:var(--color-muted)]" data-testid="vat-threshold-registered">สมุดนี้จดทะเบียน VAT แล้ว — ไม่ต้องติดตามเกณฑ์</p>
        ) : (
          <>
            <p className="text-sm" data-testid="vat-threshold-summary">
              {vt.yearLabel}: ยอดขายสะสม <MoneyText satang={vt.sales} decimals /> จากเกณฑ์ {vt.threshold !== null ? <MoneyText satang={vt.threshold} decimals /> : "-"} บาท
              {vt.ratioBp !== null && ` (${(vt.ratioBp / 100).toFixed(2)}%)`}
            </p>
            <div className="h-2 w-full overflow-hidden rounded bg-[color:var(--color-surface-2)]" aria-hidden>
              <div className="h-2" style={{ width: `${Math.min(100, (vt.ratioBp ?? 0) / 100)}%`, background: vt.status === "EXCEEDED" ? "var(--color-danger)" : "var(--color-ink)" }} />
            </div>
            <LegalWarnings warnings={vt.warnings} testId="vat-threshold-warnings" />
          </>
        )}
      </section>

      <section className="card flex flex-col gap-3 p-5" data-testid="tax-checks">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-base font-semibold">ตรวจภาษีประจำเดือน</h2>
          <form className="flex items-end gap-2" data-testid="tax-checks-period">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              เดือนภาษี
              <input type="month" name="period" defaultValue={period} className="input text-sm" />
            </label>
            <button className="btn btn-ghost btn-sm" data-testid="tax-checks-apply">แสดง</button>
          </form>
        </div>
        <div className="flex flex-col gap-1" data-testid="tax-checks-apportion">
          <h3 className="text-sm font-medium">เฉลี่ยภาษีซื้อ (รายได้ยกเว้น VAT ปนรายได้ที่เสีย VAT)</h3>
          {!checks.vatRegistered ? (
            <p className="text-xs text-[color:var(--color-muted)]">สมุดนี้ไม่จดทะเบียน VAT — ไม่มีภาษีซื้อให้เฉลี่ย</p>
          ) : checks.apportionment.warning ? (
            <LegalWarnings warnings={[checks.apportionment.warning]} testId="apportion-warning" />
          ) : (
            <p className="text-xs text-[color:var(--color-muted)]">เดือน {period}: ไม่มีรายได้ยกเว้น VAT ที่ปนกับภาษีซื้อ</p>
          )}
        </div>
        <div className="flex flex-col gap-1" data-testid="tax-checks-pp36">
          <h3 className="text-sm font-medium">ภ.พ.36 — ค่าบริการจากต่างประเทศ</h3>
          {!checks.vatRegistered ? (
            <p className="text-xs text-[color:var(--color-muted)]">สมุดนี้ไม่จดทะเบียน VAT — ผู้ให้บริการต่างประเทศเสีย VAT เอง</p>
          ) : checks.pp36.length === 0 ? (
            <p className="text-xs text-[color:var(--color-muted)]">เดือน {period}: ไม่มีการจ่ายให้ผู้ขายต่างประเทศ</p>
          ) : (
            <LegalWarnings warnings={checks.pp36.map((x) => x.warning)} testId="pp36-warnings" />
          )}
        </div>
        <div className="flex flex-col gap-2" data-testid="tax-checks-stamp">
          <h3 className="text-sm font-medium">อากรแสตมป์ — สัญญาจ้างทำของ</h3>
          {checks.stamp.length === 0 ? (
            <p className="text-xs text-[color:var(--color-muted)]">เดือน {period}: ไม่มีใบเสนอราคาที่ลูกค้ายอมรับหรือใบสั่งซื้อที่มีรายการบริการ</p>
          ) : (
            checks.stamp.map((s) => (
              <div key={s.documentId} className="flex flex-col gap-1 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }} data-testid={`stamp-${s.documentId}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link href={editorDetailPath(base, s.docType as AccountDocType, s.documentId)} className="font-medium underline">{s.docNo ?? "(ยังไม่มีเลข)"}</Link>
                  <span className="text-xs text-[color:var(--color-muted)]">{ymdTh(s.date)} · {s.contactName} · ผู้เสียอากร: {s.payer === "SHOP" ? "ร้าน" : "ผู้ขาย"} · อากรประมาณ <MoneyText satang={s.duty} decimals /> บาท</span>
                </div>
                <LegalWarnings warnings={[s.warning]} testId={`stamp-warning-${s.documentId}`} compact collapsible />
                <StampDutyRefForm systemId={systemId} documentId={s.documentId} initial={s.stampDutyRef} save={setStampDutyRefAction} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function CalendarRow({ i }: { i: CalendarItem }) {
  return (
    <tr className="border-t align-top" data-testid={`cal-${i.form}`} data-period={i.periodKey}>
      <td className="py-1.5 pr-3 font-medium">{i.formLabel}</td>
      <td className="py-1.5 pr-3">{i.periodLabel}</td>
      <td className="py-1.5 pr-3">{i.paper ? `${ymdTh(i.paper.date)} (${left(i.paper.daysLeft)})` : (i.whenTh ?? "-")}</td>
      <td className="py-1.5 pr-3">{i.online ? `${ymdTh(i.online.date)} (${left(i.online.daysLeft)})` : i.paper ? "ไม่มีช่วงขยายที่มีผล" : "-"}</td>
      <td className="py-1.5 pr-3 text-xs text-[color:var(--color-muted)]">{i.conditionTh ?? ""}</td>
    </tr>
  );
}
