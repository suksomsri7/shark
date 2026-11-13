// HR H3.8 ▸ หน้าจอสลิป (ภาพ 07c) · ประวัติรายปี · หนังสือรับรองเงินเดือน (brief R14 · notes §5 §6)
//   server component ล้วน (ไม่มี "use client") — เบราว์เซอร์ได้แค่ข้อความ/ตัวเลขจาก DTO ของ payslip.ts (ไม่มีเลขบัญชีเต็ม/เลขประจำตัว/หมายเหตุ) ·
//   ไฟล์ PDF = ลิงก์ <a download> ไปเส้นทาง GET (ไม่มี action ที่ redirect ไปไฟล์) · ปุ่มเขียน = <form action> ของ payslip-actions ·
//   ช่องว่างจากภาพ (§6): ไม่แสดงอัตรา × ตัวคูณ (M1) · ไม่มี "5% เพดาน"/"ไม่ถึงเกณฑ์" — แสดงฐานที่บันทึกไว้แทน (M2) ·
//   บัญชีธนาคาร = บัญชีที่บันทึกในระบบตอนนี้ (M3) · "รวมรับ" = รายได้ก่อนรายการหัก (M4) · 390 ก่อน · ≥ 44 px · token สีเท่านั้น ◂
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "./privacy";
import { selfActorOf } from "./self";
import { SLIP_PURPOSES, bkkDayOf, finalizedOf, slipState, slipTextFor, slipView, taxYearOf, type SlipLine, type SlipState, type SlipTextKey } from "./payslip-rules";
import { canUseSalaryCerts, listMySalaryCertificates, listSalaryCertEmployees, listSalaryCertificates, mySlips, slipHistory, type SlipRowDto, type YearDto } from "./payslip";
import { cancelSalaryCertRequestAction, issueSalaryCertAction, rejectSalaryCertAction, requestSalaryCertAction, voidSalaryCertAction } from "./payslip-actions";

const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const muted = "text-[color:var(--color-muted)]";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const primary = "btn btn-primary min-h-[44px] text-sm";
const input = "min-h-[44px] rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm";
const rowCls = "flex min-h-[44px] items-baseline gap-2 py-1.5 text-[15px] tabular-nums";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** สตางค์ → "16,000" (บาทเต็ม) | "46,416.67" (มีสตางค์) */
const amt = (satang: number) => {
  const a = Math.abs(satang);
  const whole = a % 100 === 0;
  return (a / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
};
type Tr = (key: string, values?: Record<string, string | number>) => string;
const yearOf = (y: number, locale: string) => (locale === "en" ? y : y + 543);
/** "2031-02" → "ก.พ. 2574" */
const periodText = (p: string, t: Tr, locale: string) => {
  const m = Number(p.slice(5, 7));
  return /^\d{4}-\d{2}$/.test(p) && m >= 1 && m <= 12 ? `${t(`mon${m}`)} ${yearOf(Number(p.slice(0, 4)), locale)}` : p;
};
/** "2031-10-02" → "2 ต.ค. 2574" */
const dayText = (d: string, t: Tr, locale: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(8, 10))} ${periodText(d.slice(0, 7), t, locale)}` : d);

// ═════════════ การ์ดสลิป (07c) ═════════════
export type SlipCardDto = {
  runId: string;
  periodKey: string;
  payDate: string;
  status: string;
  state: SlipState;
  employee: { name: string; position: string | null; code: string | null };
  earnings: SlipLine[];
  deductions: SlipLine[];
  earningsSatang: number;
  deductionsSatang: number;
  netSatang: number;
  ssoBaseSatang: number;
  bankMasked: string | null;
};
function qtyText(l: SlipLine, t: Tr): string {
  if (l.qty !== null && l.qty > 0) return l.code === "PRORATION" ? t("qtyDays", { n: l.qty }) : t("qtyHours", { n: Math.round((l.qty / 60) * 100) / 100 });
  return l.count > 1 ? t("qtyCount", { n: l.count }) : "";
}
async function Lines({ lines, sec, ssoBase }: { lines: SlipLine[]; sec: "e" | "d"; ssoBase: number }) {
  const t = (await getTranslations("hr.slip")) as unknown as Tr;
  const tl = (await getTranslations("hr.slipLine")) as unknown as Tr;
  return (
    <>
      {lines.map((l) => {
        const sub = l.code === "SSO" ? t("ssoBase", { amount: amt(ssoBase) }) : qtyText(l, t);
        const neg = sec === "d" ? l.amountSatang > 0 : l.amountSatang < 0;
        return (
          <div key={`${sec}-${l.code}`} className={rowCls} data-testid={`hr-slip-line-${sec}-${l.code}`}>
            <span>{tl(l.code)}</span>
            {sub ? <small className={`text-[13px] ${muted}`}>{sub}</small> : null}
            <span className="flex-1" />
            <b className={`font-semibold ${neg && sec === "d" ? "text-[color:var(--color-danger)]" : ""}`}>{`${neg ? "−" : ""}${amt(l.amountSatang)}`}</b>
          </div>
        );
      })}
    </>
  );
}
/** การ์ดสลิป — หัว (ย้อนกลับ · ชื่อ · ชิปสถานะ) · การ์ดดำรับสุทธิ · รายได้ · รายการหัก · ปุ่ม PDF/หนังสือรับรอง · ย้อนหลัง · หมายเหตุ */
export async function SlipCard({ d, backHref, pdfHref, certHref, history }: { d: SlipCardDto; backHref: string; pdfHref: string | null; certHref: string | null; history: SlipRowDto[] | null }) {
  const t = (await getTranslations("hr.slip")) as unknown as Tr;
  const locale = await getLocale();
  const tx = slipTextFor(locale);
  const banner = d.state === "ISSUED" ? null : t(`state${d.state}`);
  // บรรทัดประกันสังคม: แสดงฐานที่บันทึกไว้ในรอบ (ไม่ใช่อัตรา/เพดาน — M2)
  const deductions = d.deductions;
  return (
    <article data-testid="hr-slip" className="mx-auto flex w-full max-w-md flex-col gap-3">
      <header className="flex min-h-[44px] items-center gap-2">
        <Link href={backHref} aria-label={t("back")} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[color:var(--color-line)]">
          ←
        </Link>
        <h1 className="text-xl font-semibold">{t("title", { period: periodText(d.periodKey, t, locale) })}</h1>
        <span className="flex-1" />
        <span data-testid="hr-slip-status" className="inline-flex min-h-[28px] items-center rounded-full border border-[color:var(--color-line)] px-2.5 text-xs">
          {t(`status${d.status}`)}
        </span>
      </header>
      {banner ? (
        <p data-testid="hr-slip-state" role="note" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]">
          {banner}
        </p>
      ) : null}
      <section data-testid="hr-slip-net" className="rounded-[20px] bg-[color:var(--color-ink)] px-5 py-4 text-[color:var(--color-surface)]">
        <div className="text-[13px] opacity-80">{t("net")}</div>
        <div className="text-[38px] font-bold tabular-nums tracking-tight">{`฿${amt(d.netSatang)}`}</div>
        {d.bankMasked ? (
          <div data-testid="hr-slip-bank" className="mt-1 text-[12.5px] opacity-80">
            {d.status === "PAID" ? t("bankPaid", { bank: d.bankMasked, date: dayText(d.payDate, t, locale) }) : t("bankOnFile", { bank: d.bankMasked })}
          </div>
        ) : null}
      </section>
      <section className="flex flex-col">
        <div data-testid="hr-slip-earnings" className="flex flex-col">
          <h2 className={`text-[12.5px] font-bold ${muted}`}>{t("earnings")}</h2>
          <Lines lines={d.earnings} sec="e" ssoBase={d.ssoBaseSatang} />
          <div data-testid="hr-slip-earnings-total" className={`${rowCls} border-t-[1.5px] border-[color:var(--color-ink)] font-bold`}>
            <span>{t("totalEarnings")}</span>
            <span className="flex-1" />
            <b>{amt(d.earningsSatang)}</b>
          </div>
        </div>
        <div data-testid="hr-slip-deductions" className="mt-2.5 flex flex-col">
          <h2 className={`text-[12.5px] font-bold ${muted}`}>{t("deductions")}</h2>
          <Lines lines={deductions} sec="d" ssoBase={d.ssoBaseSatang} />
          <div data-testid="hr-slip-deductions-total" className={`${rowCls} border-t-[1.5px] border-[color:var(--color-ink)] font-bold`}>
            <span>{t("totalDeductions")}</span>
            <span className="flex-1" />
            <b>{`${d.deductionsSatang > 0 ? "−" : ""}${amt(d.deductionsSatang)}`}</b>
          </div>
        </div>
      </section>
      {pdfHref || certHref ? (
        <div className="grid grid-cols-2 gap-2.5">
          {pdfHref ? (
            <a href={pdfHref} download data-testid="hr-slip-pdf" className={`${ghost} ring-2 ring-[color:var(--color-accent)]`}>
              {t("pdf")}
            </a>
          ) : (
            <span />
          )}
          {certHref ? (
            <Link href={certHref} data-testid="hr-slip-cert" className={ghost}>
              {t("cert")}
            </Link>
          ) : null}
        </div>
      ) : null}
      {history && history.length ? (
        <section data-testid="hr-slip-history" className="flex flex-col">
          <h2 className="text-[13.5px] font-bold">{t("history")}</h2>
          {history.map((h) => (
            <Link key={h.runId} href={h.href} data-testid={`hr-slip-hist-${h.runId}`} className="flex min-h-[44px] items-center gap-2.5 border-t border-[color:var(--color-line)] py-2.5 text-[15px] tabular-nums first:border-t-0">
              <span>{periodText(h.periodKey, t, locale)}</span>
              <span className="flex-1" />
              <b>{`฿${amt(h.netSatang)}`}</b>
              <span aria-hidden className={muted}>
                ›
              </span>
            </Link>
          ))}
        </section>
      ) : null}
      <p data-testid="hr-slip-note" role="note" className={`text-xs ${muted}`}>
        {tx.slipNote}
      </p>
    </article>
  );
}

/** ผลของตัวโหลด hotfix (privacy.loadPayslipForViewer) → การ์ด — ตัวเลขจาก slipView เท่านั้น · ข้อมูลเสีย = null */
export function slipCardFromHotfix(slip: { run: { id: string; periodKey: string; payDate: Date; status: string; engineVersion: number; stepsJson: unknown }; item: unknown; employee: { name: string; position: string | null } }): SlipCardDto | null {
  const v = slipView({ engineVersion: slip.run.engineVersion, item: slip.item });
  if (!v.ok) return null;
  return {
    runId: slip.run.id,
    periodKey: slip.run.periodKey,
    payDate: bkkDayOf(slip.run.payDate),
    status: String(slip.run.status),
    state: slipState({ status: String(slip.run.status), engineVersion: slip.run.engineVersion, finalized: finalizedOf(slip.run.stepsJson) }),
    employee: { name: slip.employee.name, position: slip.employee.position, code: null },
    earnings: v.earnings,
    deductions: v.deductions,
    earningsSatang: v.earningsSatang,
    deductionsSatang: v.deductionsSatang,
    netSatang: v.netSatang,
    ssoBaseSatang: v.ssoBaseSatang,
    bankMasked: null,
  };
}
/** ข้อความเมื่อข้อมูลสลิปเสีย (SLIP_DATA) */
export async function SlipDataNotice() {
  const tx = slipTextFor(await getLocale());
  return (
    <p data-testid="hr-slip-state" role="alert" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]">
      {tx.slipData}
    </p>
  );
}
/** ประวัติรายปีของพนักงาน 1 คน (ผู้ดูเงินเดือน — หน้าสลิปฝั่งผู้ดูแล) */
export async function GateSlipHistory({ systemId, employeeId, taxYear }: { systemId: string; employeeId: string; taxYear: number }) {
  const auth = await requireTenant();
  const r = await slipHistory({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { employeeId, taxYear });
  if (!r.ok) return null;
  return <YearCard y={r.year} />;
}
/** ประวัติล่าสุดของฉัน (หน้าสลิปของฉัน — ไม่รวมรอบที่เปิดอยู่) */
export async function mySlipHistory(currentRunId: string): Promise<SlipRowDto[]> {
  const auth = await requireTenant();
  const r = await mySlips(selfActorOf(auth));
  if (!r.ok) return [];
  return r.years.flatMap((y) => y.slips).filter((s) => s.runId !== currentRunId).slice(0, 6);
}

// ═════════════ ประวัติรายปี ═════════════
async function YearCard({ y }: { y: YearDto }) {
  const t = (await getTranslations("hr.slip")) as unknown as Tr;
  const locale = await getLocale();
  return (
    <section data-testid={`hr-slip-year-${y.taxYear}`} className={card}>
      <h3 className="text-base font-semibold">{t("taxYear", { year: yearOf(y.taxYear, locale) })}</h3>
      <p className="text-sm tabular-nums">{t("yearLine", { count: y.count, net: amt(y.netSatang), gross: amt(y.grossSatang) })}</p>
      <p className={`text-xs tabular-nums ${muted}`}>{t("yearTax", { income: amt(y.incomeSatang), tax: amt(y.taxSatang), sso: amt(y.ssoSatang) })}</p>
      <div className="flex flex-col">
        {y.slips.map((h) => (
          <Link key={h.runId} href={h.href} data-testid={`hr-slip-hist-${h.runId}`} className="flex min-h-[44px] items-center gap-2.5 border-t border-[color:var(--color-line)] py-2 text-[15px] tabular-nums">
            <span>{periodText(h.periodKey, t, locale)}</span>
            <span className="flex-1" />
            <b>{`฿${amt(h.netSatang)}`}</b>
            <span aria-hidden className={muted}>
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
/** สลิปของฉันแยกตามปีภาษี (หน้า "เงินเดือน" ของฉัน) */
export async function MySlipYears() {
  const auth = await requireTenant();
  const r = await mySlips(selfActorOf(auth));
  const t = (await getTranslations("hr.slip")) as unknown as Tr;
  if (!r.ok) return r.code === "SLIP_DATA" ? <SlipDataNotice /> : null;
  return (
    <section data-testid="hr-slip-years" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{t("years")}</h2>
      {r.years.length === 0 ? <p className={`text-sm ${muted}`}>{t("noSlips")}</p> : null}
      {r.years.map((y) => (
        <YearCard key={y.taxYear} y={y} />
      ))}
    </section>
  );
}

// ═════════════ หนังสือรับรองเงินเดือน ═════════════
const MSG_KEY: Record<string, SlipTextKey> = {
  NO: "no", CERT_REQ_OPEN: "certReqOpen", CERT_NO_SLIP: "certNoSlip", CERT_NO_BASE: "certNoBase", PROFILE: "profile", OWN: "own", CERT_VOID_OWNER: "certVoidOwner",
  VOID_REASON: "voidReason", VOIDED: "voided", CERT_CHANGED: "certChanged", PURPOSE: "purpose", NOT_DECIDABLE: "notDecidable", INACTIVE: "inactive", SLIP_DATA: "slipData",
};
const OK_CODES = ["requested", "cancelled", "issued", "rejected", "voided"];
async function flashOf(code: string | undefined): Promise<{ ok: boolean; text: string } | null> {
  if (!code) return null;
  const t = (await getTranslations("hr.salaryCert")) as unknown as Tr;
  if (OK_CODES.includes(code)) return { ok: true, text: t(`ok_${code}`) };
  const key = MSG_KEY[code];
  return key ? { ok: false, text: slipTextFor(await getLocale())[key] } : null;
}
function Flash({ f }: { f: { ok: boolean; text: string } | null }) {
  if (!f) return null;
  return (
    <p role={f.ok ? "status" : "alert"} className={`text-sm ${f.ok ? "font-semibold" : "text-[color:var(--color-danger)]"}`}>
      {f.text}
    </p>
  );
}
async function PurposeSelect({ testId }: { testId?: string }) {
  const t = (await getTranslations("hr.salaryCert")) as unknown as Tr;
  return (
    <label className="flex flex-col gap-1 text-sm">
      {t("purpose")}
      <select name="purpose" required defaultValue="GENERAL" className={input} data-testid={testId}>
        {SLIP_PURPOSES.map((p) => (
          <option key={p} value={p}>
            {t(`p${p}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** การ์ดหนังสือรับรองของฉัน — ขอ (เฉพาะพนักงานที่ยังทำงาน) · รายการ · ดาวน์โหลด · ยกเลิกคำขอ */
export async function MySalaryCertCard({ canWrite, sc }: { canWrite: boolean; sc?: string }) {
  const auth = await requireTenant();
  const r = await listMySalaryCertificates(selfActorOf(auth));
  if (!r.ok) return null;
  const t = (await getTranslations("hr.salaryCert")) as unknown as Tr;
  const locale = await getLocale();
  const tx = slipTextFor(locale);
  const ts = (await getTranslations("hr.slip")) as unknown as Tr;
  const f = await flashOf(sc);
  const hasOpen = r.items.some((x) => x.status === "REQUESTED");
  return (
    <section id="hr-salarycert-mine" data-testid="hr-salarycert-mine" className={card} aria-labelledby="hr-salarycert-mine-title">
      <h2 id="hr-salarycert-mine-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <Flash f={f} />
      {canWrite ? (
        hasOpen ? (
          <p className={`text-sm ${muted}`}>{tx.certReqOpen}</p>
        ) : (
          <form action={requestSalaryCertAction} className="flex flex-col gap-2">
            <PurposeSelect testId="hr-salarycert-purpose" />
            <button type="submit" className={primary} data-testid="hr-salarycert-submit">
              {t("submit")}
            </button>
          </form>
        )
      ) : (
        <p className={`text-sm ${muted}`}>{tx.inactive}</p>
      )}
      {r.items.length === 0 ? <p className={`text-sm ${muted}`}>{t("none")}</p> : null}
      <ul className="flex flex-col gap-2">
        {r.items.map((c) => (
          <li key={c.id} data-testid={`hr-salarycert-mine-${c.id}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-line)] pt-2">
            <span className="flex flex-col text-sm">
              <span className="font-medium">{c.docNo ?? t(`st${c.status}`)}</span>
              <span className={`text-xs ${muted}`}>
                {t(`p${c.purpose}`)} · {dayText(bkkDayOf(c.issuedAt ?? c.requestedAt ?? new Date(0).toISOString()), ts, locale)}
              </span>
            </span>
            {c.status === "ISSUED" && c.docNo ? (
              <a href={`/app/me/hr/salary-cert/${encodeURIComponent(c.id)}`} download data-testid={`hr-salarycert-dl-${c.id}`} className={`${ghost} ring-2 ring-[color:var(--color-accent)]`}>
                {t("download")}
              </a>
            ) : null}
            {c.canCancel ? (
              <form action={cancelSalaryCertRequestAction}>
                <input type="hidden" name="certId" value={c.id} />
                <button type="submit" className={ghost} data-testid={`hr-salarycert-cancel-${c.id}`}>
                  {t("cancel")}
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      <p className={`text-xs ${muted}`}>{tx.certNote}</p>
    </section>
  );
}

/** ส่วนหนังสือรับรองบนหน้าเงินเดือน (ผู้ผ่านด่านหนังสือรับรองเท่านั้น — อื่น ๆ ไม่แสดงอะไรเลย) */
export async function SalaryCertSection({ systemId, sc }: { systemId: string; sc?: string }) {
  if (!ID_RE.test(systemId)) return null;
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const v = hrViewerOf(auth);
  if (!(await canUseSalaryCerts(ctx, v))) return null;
  const [list, emps] = await Promise.all([listSalaryCertificates(ctx, v, {}), listSalaryCertEmployees(ctx, v)]);
  if (!list.ok || !emps.ok) return null;
  const t = (await getTranslations("hr.salaryCert")) as unknown as Tr;
  const ts = (await getTranslations("hr.slip")) as unknown as Tr;
  const locale = await getLocale();
  const tx = slipTextFor(locale);
  const f = await flashOf(sc);
  const reqs = list.items.filter((x) => x.status === "REQUESTED");
  const issued = list.items.filter((x) => x.status === "ISSUED" || x.status === "REJECTED");
  const owner = v.role === "OWNER";
  return (
    <section id="hr-salarycert" data-testid="hr-salarycert" className={card} aria-labelledby="hr-salarycert-title">
      <h2 id="hr-salarycert-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <Flash f={f} />
      <h3 className="text-sm font-semibold">{t("requests")}</h3>
      {reqs.length === 0 ? <p className={`text-sm ${muted}`}>{t("none")}</p> : null}
      {reqs.map((c) => (
        <div key={c.id} data-testid={`hr-salarycert-req-${c.id}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-line)] pt-2">
          <span className="flex flex-col text-sm">
            <span className="font-medium">{c.name}</span>
            <span className={`text-xs ${muted}`}>
              {t(`p${c.purpose}`)} · {c.requestedAt ? dayText(bkkDayOf(c.requestedAt), ts, locale) : ""}
            </span>
          </span>
          <span className="flex flex-wrap gap-2">
            <form action={issueSalaryCertAction}>
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="requestId" value={c.id} />
              <button type="submit" className={primary} data-testid={`hr-salarycert-issue-${c.id}`}>
                {t("issue")}
              </button>
            </form>
            <form action={rejectSalaryCertAction}>
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="requestId" value={c.id} />
              <button type="submit" className={ghost} data-testid={`hr-salarycert-reject-${c.id}`}>
                {t("reject")}
              </button>
            </form>
          </span>
        </div>
      ))}
      <form action={issueSalaryCertAction} data-testid="hr-salarycert-new" className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-line)] p-3">
        <h3 className="text-sm font-semibold">{t("newTitle")}</h3>
        <input type="hidden" name="systemId" value={systemId} />
        <label className="flex flex-col gap-1 text-sm">
          {t("employee")}
          <select name="employeeId" required className={input}>
            {emps.items.map((e) => (
              <option key={e.employeeId} value={e.employeeId}>
                {e.code ? `${e.code} · ${e.name}` : e.name}
              </option>
            ))}
          </select>
        </label>
        <PurposeSelect />
        <button type="submit" className={primary}>
          {t("issue")}
        </button>
      </form>
      <h3 className="text-sm font-semibold">{t("issued")}</h3>
      {issued.length === 0 ? <p className={`text-sm ${muted}`}>{t("none")}</p> : null}
      {issued.map((c) => (
        <div key={c.id} data-testid={`hr-salarycert-row-${c.id}`} className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-col text-sm">
              <span className="font-medium">{`${c.docNo ?? t(`st${c.status}`)} · ${c.name}`}</span>
              <span className={`text-xs ${muted}`}>
                {t(`p${c.purpose}`)} · {c.voided ? t("voided") : t(`st${c.status}`)} · {t("downloads", { n: c.downloads })}
              </span>
            </span>
            {c.status === "ISSUED" && !c.voided ? (
              <a href={`/app/sys/${systemId}/hr/payroll/salary-cert/${encodeURIComponent(c.id)}`} download data-testid={`hr-salarycert-gdl-${c.id}`} className={`${ghost} ring-2 ring-[color:var(--color-accent)]`}>
                {t("download")}
              </a>
            ) : null}
          </div>
          {owner && c.status === "ISSUED" && !c.voided ? (
            <form action={voidSalaryCertAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="certId" value={c.id} />
              <label className="flex flex-1 flex-col gap-1 text-sm">
                {t("voidReason")}
                <input name="reason" required minLength={1} maxLength={200} className={input} />
              </label>
              <button type="submit" className={ghost} data-testid={`hr-salarycert-void-${c.id}`}>
                {t("void")}
              </button>
            </form>
          ) : null}
        </div>
      ))}
      <p className={`text-xs ${muted}`}>{tx.certNote}</p>
    </section>
  );
}
/** ลิงก์ไฟล์ PDF ของสลิป (GET route · หน้าใช้กับ <a download>) */
export const mySlipPdfHref = (runId: string) => `/app/me/hr/pay/${encodeURIComponent(runId)}/pdf`;
export const gateSlipPdfHref = (systemId: string, runId: string, employee: string) => `/app/sys/${systemId}/payroll/${encodeURIComponent(runId)}/slip/${encodeURIComponent(employee)}/pdf`;
/** ปีภาษีของวันที่จ่าย (หน้าสลิปฝั่งผู้ดูแลใช้เลือกปีของประวัติ) */
export const slipTaxYear = (payDate: Date) => taxYearOf(payDate);
// ◂ HR H3.8
