// HR H3.4 ▸ รอบจ่ายเงินเดือนรุ่น 2 — ส่วนรอบจ่ายของหน้าเงินเดือน (ภาพ 06: ขั้น ร่าง · ตรวจ · อนุมัติ · จ่าย · ลงบัญชี · ไทล์ยอด · ตาราง + ที่มาต่อคน ·
//   รายการต้องตรวจ (รวมลูกหนี้พนักงาน) · ยืนยันชั่วโมงของสาขา · ปุ่มดึงชั่วโมงทำงาน → คำนวณรายการหักสาย/ขาด) + การ์ดรุ่นเครื่องบนหน้าตั้งค่า (เจ้าของร้าน)
//   server component ล้วน · เงินเห็นเฉพาะผู้ดูเงินเดือน (previewPayrollRunV2 ตัดสิน) · ผู้จัดการเห็นนาทีเท่านั้น · ผลการกดมาจาก ?r2= ผ่านรายการคงที่ (RUN2_MSG) ◂
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server"; // HR VIS-5a ▸ getLocale (period/day labels) ◂
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { hrViewerOf } from "./privacy";
import { getPayrollEngine, previewPayrollRunV2, RUN2_RESULT_TEXT, RUN2_REVERSE_TEXT, RUN2_TEXT, RUN2_WARN } from "./payroll";
import { LAW_MSG } from "./law";
import { WE_TEXT } from "./work-entries";
import { ATT_TEXT, attendanceInForceOf } from "./attendance-pay-rules";
import { H37_CODE_TEXT, H37_TEXT, getPayrollAccounting, payAccountsOfRun } from "./payroll"; // HR H3.7 ▸ จ่ายรอบที่ลงบัญชี: เลือกบัญชีจ่าย + วันที่จ่าย ◂
import { DateInput } from "@/components/account-v2/DateInput"; // HR H3.7 ◂
import { OPENING_TEXT } from "./payroll-opening-rules"; // HR H3.4-YTD ▸ ข้อความคงที่ของ OPENING_OVERLAP (สร้าง/คิดใหม่) ◂
import { PAY_SCOPE_EXCLUDED_TEXT } from "./scope"; // HR PRIV-2 ▸ หมายเหตุจำนวนคนที่ไม่รวม (ไทล์ยอด = แถวที่เห็นเท่านั้น) ◂
import { MONEY2_TEXT } from "./payroll"; // HR MONEY-2 ▸ R7: ข้อความปฏิเสธ REFUND_BOUND · refundStuck · RUN_LIMIT ◂
import { runFigures, workedDaysOf } from "./pay-run-view"; // HR VIS-5a ▸ stored-value figures of the run screen (Q1 · Q2) ◂
import { dayLabel, periodLabel } from "./period-label"; // HR VIS-5a ◂
import { canUseBankFiles } from "./bank-files/service"; // HR VIS-5a ▸ doc links only where the docs gates pass ◂
import { canUseFilings } from "./filings/service"; // HR VIS-5a ◂
import { hrScopeOf, isAllBranches } from "./scope"; // HR VIS-5a ▸ I1: run actions need every branch (same check as payroll-actions assertRunAllBranches) ◂
import type { ReactNode } from "react"; // HR VIS-5a ◂

const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const muted = "text-sm text-[color:var(--color-muted)]";
const chip = "inline-flex min-h-[28px] items-center rounded-full border border-[color:var(--color-line)] px-2.5 text-xs";
const baht = (s: number) => `${s < 0 ? "−" : ""}฿${(Math.abs(s) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** ข้อความคงที่ทั้งหมดที่ปุ่มของส่วนนี้คืนได้ → รหัสสั้นบน URL (?r2=) — ไม่แสดงข้อความอิสระ */
export const RUN2_MSG: Record<string, string> = Object.fromEntries([
  ...Object.entries(RUN2_TEXT).map(([k, v]) => [`r.${k}`, v]),
  ...Object.entries(RUN2_WARN).map(([k, v]) => [`w.${k}`, v]),
  ...Object.entries(LAW_MSG).map(([k, v]) => [`l.${k}`, v]),
  ...Object.entries(WE_TEXT).map(([k, v]) => [`e.${k}`, v]),
  ...Object.entries(ATT_TEXT).map(([k, v]) => [`a.${k}`, v]),
  ...Object.entries(RUN2_RESULT_TEXT).map(([k, v]) => [`p.${k}`, v]),
  ...Object.entries(RUN2_REVERSE_TEXT).map(([k, v]) => [`v.${k}`, v]),
  ...Object.entries(H37_TEXT).map(([k, v]) => [`b.${k}`, v]), // HR H3.7 ◂
  ...Object.entries(H37_CODE_TEXT).map(([k, v]) => [`c.${k}`, v]), // HR H3.7 ◂
  ...Object.entries(OPENING_TEXT).map(([k, v]) => [`y.${k}`, v]), // HR H3.4-YTD ◂
  ...Object.entries(MONEY2_TEXT).map(([k, v]) => [`m.${k}`, v]), // HR MONEY-2 ▸ R7: กลับรายการ (REFUND_BOUND · refundStuck) · สร้าง/ดึงข้อมูลใหม่ (RUN_LIMIT) ◂
]);
export const run2MsgCode = (reason: string | undefined) => (reason ? (Object.entries(RUN2_MSG).find(([, v]) => v === reason)?.[0] ?? "failed") : "failed");

type Act = (fd: FormData) => Promise<void>;
export type Run2Actions = { create: Act | null; rebuild: Act | null; approve: Act | null; pay: Act | null; reverse: Act | null; confirm: Act | null; sync: Act | null };
const STEPS = ["stepDraft", "stepReview", "stepApprove", "stepPay", "stepPost"] as const;
const stepOf = (status: string, journal: boolean) => (status === "DRAFT" ? 1 : status === "APPROVED" ? (journal ? 4 : 3) : status === "PAID" ? 4 : 0);

/** ส่วนรอบจ่ายรุ่น 2 (ร้านที่เปิดรุ่น 2 เท่านั้น) — ผู้ดูเงินเดือน: สร้าง/ตรวจ/อนุมัติ/จ่าย/กลับรายการ · ผู้จัดการ: นาทีของสาขาตัวเอง + ยืนยันสาขา */
// HR VIS-5a ▸ run screen to mockup 06 (layout only) ◂
//   header (title · sub-line · sync/rebuild · add/deduct link) · period chips · stepper (390: "2/5 · review") ·
//   KPI tiles (hero net) · one table (worked days · OT · status · totals row; columns hide by width, no scroller) · review <details> · action bar (sticky approve at 390) ·
//   accounting callout (wording, no amounts) · drawer ?emp= (rows of the viewer's preview only) — figures = stored values (pay-run-view.ts) ◂
export async function PayrollRunSection({ systemId, periodKey, runId, flash, flashOk, actions, emp = "" }: { systemId: string; periodKey: string; runId: string; flash: string; flashOk: boolean; actions: Run2Actions; emp?: string }) {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const payV = auth.active.role === "OWNER" || (auth.active.permissions as Record<string, unknown> | null)?.["hr.payroll.read"] === true;
  const mgrV = !payV && auth.active.role === "MANAGER";
  if (!payV && !mgrV) return null;
  const engine = await getPayrollEngine(ctx);
  if (engine.engineVersion !== 2) return null;
  const t = await getTranslations("hr.run2");
  const locale = await getLocale(); // HR VIS-5a ◂
  const act: Run2Actions = payV ? actions : { create: null, rebuild: null, approve: null, pay: null, reverse: null, sync: null, confirm: actions.confirm };
  // HR VIS-5a ▸ x4: list every run of the shop (engine-1 runs too — read only; preview handles them) · x3: a period whose only run is REVERSED shows that run read-only ·
  //   x1/x2: create only when the period has no live (non-REVERSED) run — visibility only, the server still refuses duplicates ◂
  const runs = await tenantDb(ctx).hrPayrollRun.findMany({ where: { systemId }, orderBy: [{ periodKey: "desc" }, { createdAt: "desc" }], select: { id: true, periodKey: true, status: true, engineVersion: true }, take: 24 });
  const pick = runs.find((r) => r.id === runId) ?? runs.find((r) => r.periodKey === periodKey && r.status !== "REVERSED") ?? runs.find((r) => r.periodKey === periodKey && r.status === "REVERSED") ?? null;
  const live = (await tenantDb(ctx).hrPayrollRun.count({ where: { systemId, periodKey, status: { not: "REVERSED" } } })) > 0; // HR VIS-5a ◂
  const v2run = !!pick && pick.engineVersion === 2; // HR VIS-5a ▸ v1 run: no v2-only controls ◂
  // HR VIS-5a ▸ I1: create/rebuild/approve/pay/reverse are refused for a branch-limited viewer (assertRunAllBranches) ⇒ not shown · F2: the sync action refuses a period
  //   with an APPROVED/PAID run (work-entries frozenRun · attendance-pay) ⇒ not shown — same conditions as the actions, display only ◂
  const allRun = isAllBranches(hrScopeOf({ role: auth.active.role, unitAccess: auth.active.unitAccess }));
  const frozen = (await tenantDb(ctx).hrPayrollRun.count({ where: { systemId, periodKey, status: { in: ["APPROVED", "PAID"] } } })) > 0;
  const pv = pick ? await previewPayrollRunV2(ctx, viewer, { runId: pick.id }) : null;
  const canMoney = !!pv && pv.ok && "review" in pv;
  const canMgr = !!pv && pv.ok && !("review" in pv);
  const run = pv && pv.ok ? (pv.run as Record<string, unknown>) : null;
  const status = String(run?.status ?? "");
  const step = run ? stepOf(status, false) : 0;
  const totals = (run?.totals ?? {}) as Record<string, number>;
  const hidden = (extra: Record<string, string> = {}) => (
    <>
      <input type="hidden" name="systemId" value={systemId} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
  // HR VIS-5a ▸ screen data — rows/figures of the viewer's own preview only (limited viewer = in-scope rows; ?emp= only from these rows) ◂
  const base = `/app/sys/${systemId}/hr/payroll`;
  const rows = pv && pv.ok && "review" in pv ? pv.rows : [];
  const fig = runFigures(rows);
  const days = run && canMoney ? await workedDaysOf(ctx, String(run.periodKey), rows.map((r) => r.employeeId)) : null;
  const sel = canMoney ? (rows.find((r) => r.employeeId === emp) ?? null) : null;
  const [bankOk, filingOk] = canMoney && run ? await Promise.all([canUseBankFiles(ctx, viewer), canUseFilings(ctx, viewer)]) : [false, false];
  const reviewN = pv && pv.ok && "review" in pv ? pv.review.length : 0;
  const people = pv && pv.ok ? pv.rows.length : 0;
  const runPeriod = String(run?.periodKey ?? pick?.periodKey ?? periodKey);
  const label = (k: string) => periodLabel(k, locale); // HR VIS-5a ▸ "ก.ย. 2569" / "Sep 2026" ◂
  const runQs = `${base}?view=run&period=${runPeriod}${run ? `&run=${encodeURIComponent(String(run.id))}` : ""}`;
  const draft = status === "DRAFT" && v2run; // HR VIS-5a ▸ F2: only a v2 draft is "in review" — locked runs (approved · paid · reversed · engine 1) show their state ◂
  const tiles = [
    ["net", totals.netSatang],
    ["gross", totals.grossSatang],
    ["add", totals.addSatang],
    ["deduct", -totals.deductSatang],
    ["ssoEe", -totals.ssoEmployeeSatang],
    ["ssoEr", totals.ssoEmployerSatang],
    ["wht", -totals.whtSatang],
  ] as const;
  const tileOf = Object.fromEntries(tiles.map(([k, v]) => [k, Number(v ?? 0)])) as Record<(typeof tiles)[number][0], number>;
  /** per-row money cells (the same expressions as before — one place for the table and the drawer) */
  const cellsOf = (r: (typeof rows)[number]) => ({ base: r.grossSatang + r.deductSatang - r.addSatang, deduct: -r.deductSatang, sso: -r.ssoEmployeeSatang, wht: -r.whtSatang });
  const md = "hidden md:table-cell";
  const xl = sel ? "hidden 2xl:table-cell" : "hidden xl:table-cell";
  const mdUntilXl = sel ? "hidden md:table-cell 2xl:hidden" : "hidden md:table-cell xl:hidden"; // HR VIS-5a ▸ r3: stored-additions variant where the OT column is hidden ◂
  const num = "whitespace-nowrap px-3 py-2.5 text-right tabular-nums"; // HR VIS-5a ▸ F7: money never wraps ◂
  const top = "max-md:-order-2"; // HR VIS-5a ▸ F6: at 390 the header · chips · banner · step line come first, then the action bar (in flow, nothing overlaps) ◂
  const amt = (v: number | null) => (v === null ? "—" : baht(v));
  const tone = (v: number) => (v < 0 ? "text-[color:var(--color-danger)]" : "");
  const chipOf = (txt: string, cls: string) => <span className={`${chip} whitespace-nowrap ${cls}`}>{txt}</span>;
  /** F1/F2: draft rows = ready / review (+ a short reason) · locked runs = the run's state, never "review" */
  const statusChip = (review: boolean) => (!draft ? chipOf(t(`st_${status}`), "text-[color:var(--color-muted)]") : review ? chipOf(t("rowReview"), "border-[color:var(--color-danger)] text-[color:var(--color-danger)]") : chipOf(t("rowReady"), "border-[color:var(--color-ink)] font-medium"));
  const reasonOf = (r: (typeof rows)[number]) => (r.review.length ? t(`rs_${r.review[0]!.code}`) + (r.review.length > 1 ? ` +${r.review.length - 1}` : "") : r.flags.includes("NEGATIVE_NET") ? t("rs_NEGATIVE_NET") : "");
  const tile = (k: string, v: number | null, note?: string, hero = false) => (
    <div key={k} className={hero ? "col-span-2 flex min-w-0 flex-col gap-1 rounded-2xl bg-[color:var(--color-ink)] p-4 text-[color:var(--color-surface)] lg:col-span-1" : "flex min-w-0 flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] p-4"}>
      <dt className={`break-words [overflow-wrap:anywhere] ${hero ? "text-sm opacity-80" : muted}`}>{t(`tile_${k}`)}</dt>
      <dd className={`whitespace-nowrap text-lg font-semibold tabular-nums sm:text-2xl ${hero || v === null ? "" : tone(v)}`}>{amt(v)}</dd>
      {note ? <dd className={hero ? "text-xs opacity-80" : "text-xs text-[color:var(--color-muted)]"}>{note}</dd> : null}
    </div>
  );
  const reviewGroups = pv && pv.ok && "review" in pv ? [...new Set(pv.review.map((x) => x.code))].map((code) => [code, pv.review.filter((x) => x.code === code)] as const) : [];
  const docLinks = canMoney && run && v2run && (status === "APPROVED" || status === "PAID")
    ? ([
        ["bank", bankOk, `${base}?view=docs&bank=${encodeURIComponent(String(run.id))}#hr-bank`, t("docBank")],
        ["pnd1", filingOk, `${base}?view=docs&fk=PND1&fp=${runPeriod}#hr-filing`, t("docPnd1")],
        ["sso110", filingOk, `${base}?view=docs&fk=SSO110&frun=${encodeURIComponent(String(run.id))}#hr-filing`, t("docSso")],
      ] as const).filter((x) => x[1])
    : [];
  // HR VIS-5a ▸ F5: one <table> for both readers — money columns for payroll viewers, minutes only for managers (no amounts in their DTO) ◂
  const tableOf = (head: ReactNode, body: ReactNode, foot: ReactNode) => (
    <table className="w-full text-sm">
      {head}
      {body}
      {foot}
    </table>
  );
  const frame = "overflow-hidden rounded-2xl border border-[color:var(--color-line)]";
  const headCls = "bg-[color:var(--color-stage)] text-xs text-[color:var(--color-muted)]";
  const mgrRows = (canMgr && pv && pv.ok ? pv.rows : []) as { employeeId: string; name: string; days: number; workMin: number; unpaidLeaveMin: number; holidayWorkMin: number }[];
  const createForm = (
    <form action={act.create ?? undefined} className="flex flex-wrap items-end gap-2">
      {hidden({ periodKey })}
      <label className="flex flex-col text-sm">
        {t("payDate")}
        <input type="date" name="payDate" required className="input min-h-[44px]" />
      </label>
      <button type="submit" className={btn} data-testid="hr-run2-create">
        {t("create", { period: label(periodKey) })}
      </button>
      <span className={`w-full ${muted}`}>{t("syncHint")}</span>
    </form>
  );
  const canCreate = !!act.create && allRun && !live;
  const bannerCls = status === "REVERSED"
    ? "border-[color:var(--color-danger)] text-[color:var(--color-danger)]"
    : run && !v2run
      ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]"
      : "border-[color:var(--color-line)] bg-[color:var(--color-stage)]";
  return (
    <section className="flex flex-col gap-4" id="hr-run2" data-testid="hr-run2" aria-label={t("title")}> {/* HR VIS-5a ◂ */}
      <div className={`flex flex-col gap-3 md:flex-row md:items-start md:justify-between ${top}`}>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs text-[color:var(--color-muted)]">
            {t("crumb")} › {t("title")}
          </p>
          <h2 className="text-2xl font-semibold">{t("heading", { period: label(runPeriod) })}</h2>
          {run && <p className={muted}>{run.payDate ? t("subline", { payDate: dayLabel(run.payDate as Date | string | null, locale), n: people }) : t("tileNotePeople", { n: people })}</p>}
          {/* HR PRIV-2 ▸ R1(c): ผู้ดูที่จำกัดสาขา — ยอดในไทล์มาจากแถวที่เห็นเท่านั้น (previewPayrollRunV2) · บอกจำนวนคนที่ไม่รวม ไม่มีชื่อ/ยอด ◂ */}
          {canMoney && run && Number(run.excludedHeadcount ?? 0) > 0 && <p className={muted} data-testid="hr-run2-excluded">{PAY_SCOPE_EXCLUDED_TEXT.replace("{n}", String(Number(run.excludedHeadcount)))}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {act.sync && !frozen && (
            <form action={act.sync}>
              {hidden({ periodKey })}
              <button type="submit" className={ghost} data-testid="hr-run2-sync" title={t("syncHint")}>
                {t("sync")}
              </button>
            </form>
          )}
          {canMoney && run && draft && allRun && act.rebuild && (
            <form action={act.rebuild}>
              {hidden({ runId: String(run.id), periodKey })}
              <button type="submit" className={ghost} data-testid="hr-run2-rebuild">
                {t("rebuild")}
              </button>
            </form>
          )}
          {canMoney && (
            <Link href={`${base}?view=adjust&period=${runPeriod}`} className={ghost}>
              {t("addDeduct")}
            </Link>
          )}
        </div>
      </div>
      {flash && (
        <p role={flashOk ? "status" : "alert"} className={`${flashOk ? muted : "text-sm font-medium text-[color:var(--color-danger)]"} ${top}`} data-testid="hr-run2-flash"> {/* HR VIS-5a ◂ */}
          {flash}
        </p>
      )}
      {runs.length > 0 && (
        <ul className={`flex flex-wrap gap-1.5 ${top}`} aria-label={t("runs")}> {/* HR VIS-5a ◂ */}
          {runs.filter((r, i) => i < 12 || r.id === pick?.id).map((r) => (
            <li key={r.id} data-testid={`hr-run2-row-${r.id}`}>
              <Link href={`?period=${r.periodKey}&run=${r.id}#hr-run2`} aria-current={r.id === pick?.id ? "page" : undefined} className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-xs ${r.id === pick?.id ? "border-[color:var(--color-ink)] font-semibold" : "border-[color:var(--color-line)]"}`}>
                {t("runRow", { period: label(r.periodKey) })}
                <span className="text-[color:var(--color-muted)]">· {t(`st_${r.status}`)}</span>
              </Link>
              {/* HR VIS-5a ▸ status inside the chip ◂ */}
            </li>
          ))}
        </ul>
      )}
      {/* HR VIS-5a ▸ F5: a run exists but this viewer's preview is refused (e.g. a manager of every branch) — say so; "no run yet" only when there is none ◂ */}
      {!run && pick && (
        <p data-testid="hr-run2-banner" role="note" className={`rounded-2xl border p-3 text-sm ${bannerCls} ${top}`}>
          {t("bannerNoDetail", { status: t(`st_${pick.status}`) })}
        </p>
      )}
      {!run && !pick && (
        <p className={`rounded-2xl border border-dashed border-[color:var(--color-line)] p-4 ${muted} ${top}`}> {/* HR VIS-5a ◂ */}
          {t("empty", { period: label(periodKey) })}
          {runs[0] ? (
            <>
              {" · "}
              <Link href={`?period=${runs[0].periodKey}&run=${runs[0].id}#hr-run2`} className="underline-offset-2 hover:underline">
                {t("latest", { period: label(runs[0].periodKey) })}
              </Link>
            </>
          ) : null}
        </p>
      )}
      {canCreate && !run && <div className={top}>{createForm}</div>}{/* HR VIS-5a ▸ no run yet: create near the top ◂ */}
      {run && (
        <>
          {/* HR VIS-5a ▸ state banner (§5): draft · approved · paid · REVERSED (danger, read-only) · engine-1 run (info, act in Run history) ◂ */}
          <div data-testid="hr-run2-banner" role={status === "REVERSED" || !v2run ? "note" : undefined} className={`flex flex-col gap-0.5 rounded-2xl border p-3 text-sm ${bannerCls} ${top}`}>
            {!v2run ? <p className="font-semibold">{t("bannerV1Title")}</p> : null}
            <p>
              {status === "REVERSED" ? t("banner_REVERSED") : !v2run ? t("bannerV1") : canMoney && status === "DRAFT" ? t("banner_DRAFT", { n: reviewN }) : canMoney && status === "PAID" ? t("banner_PAID", { date: dayLabel(run.payDate as Date | string | null, locale) }) : canMoney && status === "APPROVED" ? t("banner_APPROVED") : t(`st_${status}`)}
              {!v2run ? (
                <>
                  {" "}
                  <Link href={`${base}?view=history&period=${runPeriod}`} className="font-medium underline underline-offset-2">
                    {t("bannerV1Link")}
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          {status !== "REVERSED" && <p className={`text-sm font-semibold md:hidden ${top}`}>{t("stepNow", { i: step + 1, label: t(STEPS[step]!) })}</p>}
          {status !== "REVERSED" && (
            <ol className="hidden items-center gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-stage)] p-3 md:flex" data-testid="hr-run2-steps" aria-label={t("steps")}>
              {STEPS.map((s, i) => (
                <li key={s} aria-current={i === step ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-2">
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${i === step ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)] font-semibold text-[color:var(--color-accent-fg)]" : i < step ? "border-[color:var(--color-ink)]" : "border-[color:var(--color-line)] text-[color:var(--color-muted)]"}`}>{i < step ? "✓" : i + 1}</span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className={`truncate text-sm ${i === step ? "font-semibold text-[color:var(--color-accent)]" : i < step ? "" : "text-[color:var(--color-muted)]"}`}>{t(s)}</span>
                    {i === 1 && canMoney && draft ? <span className="truncate text-xs text-[color:var(--color-muted)]">{t("stepReviewSub", { n: reviewN })}</span> : null}
                  </span>
                  {i < STEPS.length - 1 ? <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-[color:var(--color-line)]" /> : null}
                </li>
              ))}
            </ol>
          )}
          {canMoney && (
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="hr-run2-tiles"> {/* HR VIS-5a ◂ */}
              {tile("net", tileOf.net, t("tileNotePeople", { n: people }), true)}
              {tile("gross", tileOf.gross, fig.payTypes.map(([p, n]) => `${t(`pt_${p}`)} ${n}`).join(" · "))}
              {tile("ot", fig.otSatang, fig.otSatang === null ? t("tileNoSplit", { amount: baht(tileOf.add) }) : t("tileNoteAdd", { amount: baht(tileOf.add) }))}
              {tile("commission", fig.commissionSatang, fig.commissionSatang === null ? t("tileNoSplitShort") : undefined)}
              {tile("deduct", tileOf.deduct)}
              {tile("ssoEe", tileOf.ssoEe)}
              {tile("ssoEr", tileOf.ssoEr, t("tileNoteSsoEr"))}
              {tile("wht", tileOf.wht)}
            </dl>
          )}
          {/* HR VIS-5a ▸ excluded note moved to the header ◂ */}
          {canMoney && pv && pv.ok && "review" in pv && (
            <>
              <div className={sel ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start" : "flex flex-col gap-4"}> {/* HR VIS-5a ◂ */}
                <div className={frame} data-testid="hr-run2-table">
                  {tableOf(
                    <thead className={headCls}>
                      <tr className="text-left">
                        <th className="px-3 py-2.5">{t("col_name")}</th>
                        <th className={`${md} ${num}`}>{t("col_gross")}</th>
                        <th className={`${xl} ${num}`}>{t("col_days")}</th>
                        <th className={`${xl} ${num}`}>{t("col_ot")}</th>
                        <th className={`${xl} ${num}`}>{t("col_add")}</th>
                        <th className={`${mdUntilXl} ${num}`}>{t("col_add")}</th>
                        <th className={`${md} ${num}`}>{t("col_deduct")}</th>
                        <th className={`${md} ${num}`}>{t("col_sso")}</th>
                        <th className={`${xl} ${num}`}>{t("col_wht")}</th>
                        <th className={num}>{t("col_net")}</th>
                        <th className={`${md} px-3 py-2.5`}>{t("col_status")}</th>
                      </tr>
                    </thead>,
                    <tbody>
                      {pv.rows.map((r) => {
                        const c = cellsOf(r);
                        const f = fig.rows.get(r.employeeId);
                        const on = sel?.employeeId === r.employeeId;
                        return (
                          <tr key={r.employeeId} className={`border-t border-[color:var(--color-line)] align-top ${on ? "bg-[color:var(--color-accent-soft)] shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
                            <td className="px-3 py-1">
                              <Link href={`${runQs}&emp=${encodeURIComponent(r.employeeId)}#hr-run2-drawer`} data-testid={`hr-run2-lines-${r.employeeId}`} aria-current={on ? "true" : undefined} className="flex min-h-[44px] flex-col justify-center underline-offset-2 hover:underline">
                                <span className="font-medium">{r.name}</span>
                                <span className="text-xs text-[color:var(--color-muted)]">{t(`pt_${r.payType}`)}</span>
                              </Link>
                              <span className="mb-1.5 flex md:hidden">{statusChip(!!f?.review)}</span>
                            </td>
                            <td className={`${md} ${num}`}>{baht(c.base)}</td>
                            <td className={`${xl} ${num}`}>{days ? t("days", { n: days.get(r.employeeId) ?? 0 }) : "—"}</td>
                            <td className={`${xl} ${num}`}>{f?.otSatang ? baht(f.otSatang) : "—"}</td>
                            <td className={`${xl} ${num}`}>
                              {baht(f?.addNoOtSatang ?? r.addSatang)}
                              {f?.addCodes.some((k) => k !== "OT" || f.otSatang === null) ? <span className="block text-xs text-[color:var(--color-muted)]">{f.addCodes.filter((k) => k !== "OT" || f.otSatang === null).map((k) => t(`ln_${k}`)).join(" · ")}</span> : null}
                            </td>
                            <td className={`${mdUntilXl} ${num}`}>
                              {baht(r.addSatang)}
                              {f?.otSatang ? <span className="block text-xs text-[color:var(--color-muted)]">{t("addInclOt")}</span> : null}
                              {f?.addCodes.length ? <span className="block text-xs text-[color:var(--color-muted)]">{f.addCodes.map((k) => t(`ln_${k}`)).join(" · ")}</span> : null}
                            </td>
                            <td className={`${md} ${num}`}>
                              {baht(c.deduct)}
                              {f?.outCodes.length ? <span className="block text-xs text-[color:var(--color-muted)]">{f.outCodes.map((k) => t(`ln_${k}`)).join(" · ")}</span> : null}
                            </td>
                            <td className={`${md} ${num}`}>{baht(c.sso)}</td>
                            <td className={`${xl} ${num}`}>{baht(c.wht)}</td>
                            <td className={`${num} font-semibold`}>{baht(r.netSatang)}</td>
                            <td className={`${md} px-3 py-2.5`}>
                              {statusChip(!!f?.review)}
                              {draft && f?.review ? <span className="block whitespace-nowrap pt-1 text-xs text-[color:var(--color-muted)]">{reasonOf(r)}</span> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>,
                    <tfoot>
                      <tr data-testid="hr-run2-totals" className="border-t-2 border-[color:var(--color-line)] bg-[color:var(--color-stage)] font-semibold">
                        <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-left">{t("totalsRow", { n: pv.rows.length })}</th>
                        <td className={`${md} ${num}`}>{amt(fig.baseSatang)}</td>
                        <td className={`${xl} ${num}`} />
                        <td className={`${xl} ${num}`}>{fig.otRowsSatang ? baht(fig.otRowsSatang) : "—"}</td>
                        <td className={`${xl} ${num}`}>{baht(fig.addNoOtSatang)}</td>
                        <td className={`${mdUntilXl} ${num}`}>
                          {baht(tileOf.add)}
                          {fig.otRowsSatang ? <span className="block text-xs font-normal text-[color:var(--color-muted)]">{t("addInclOt")}</span> : null}
                        </td>
                        <td className={`${md} ${num}`}>{baht(tileOf.deduct)}</td> {/* HR VIS-5a ◂ */}
                        <td className={`${md} ${num}`}>{baht(tileOf.ssoEe)}</td>
                        <td className={`${xl} ${num}`}>{baht(tileOf.wht)}</td>
                        <td className={num}>{baht(tileOf.net)}</td>
                        <td className={`${md} whitespace-nowrap px-3 py-2.5 text-xs font-normal`}>{draft ? t("totalsStatus", { ready: fig.ready, review: fig.review }) : t(`st_${status}`)}</td>
                      </tr>
                    </tfoot>,
                  )}
                </div>
                {sel && (() => {
                  const f = fig.rows.get(sel.employeeId); // HR VIS-5a ◂
                  const c = cellsOf(sel);
                  const line = (l: { code: string; day: string | null; minutes: number | null; amountSatang: number; requestedSatang?: number }, i: number) => (
                    <li key={i} className="flex justify-between gap-3 border-t border-[color:var(--color-line)] py-2 first:border-t-0">
                      <span className="min-w-0">
                        <span className="block font-medium">{t(`ln_${l.code}`)}</span>
                        <span className="block text-xs text-[color:var(--color-muted)]">
                          {l.day ? dayLabel(l.day, locale) : ""}
                          {l.minutes != null ? ` · ${l.minutes} ${t("min")}` : ""}
                          {l.requestedSatang != null ? ` · ${t("requested", { amount: baht(l.requestedSatang) })}` : ""}
                        </span>
                      </span>
                      <span className={`shrink-0 whitespace-nowrap font-semibold tabular-nums ${tone(l.amountSatang)}`}>{baht(l.amountSatang)}</span>
                    </li>
                  );
                  return (
                    <aside id="hr-run2-drawer" data-testid="hr-run2-drawer" aria-label={t("drawerTitle", { name: sel.name })} className="flex flex-col gap-4 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <h3 className="text-lg font-semibold">{t("drawerTitle", { name: sel.name })}</h3>
                          <p className="text-xs text-[color:var(--color-muted)]">
                            {t(`pt_${sel.payType}`)}
                            {days ? ` · ${t("days", { n: days.get(sel.employeeId) ?? 0 })}` : ""}
                          </p>
                        </div>
                        <Link href={`${runQs}#hr-run2-table`} className={ghost}>
                          {t("drawerClose")}
                        </Link>
                      </div>
                      <div className="flex flex-col">
                        <h4 className="text-xs font-semibold text-[color:var(--color-muted)]">{t("drawerIn")}</h4>
                        <ul className="flex flex-col text-sm">{(f?.income ?? []).map(line)}</ul>
                        <p className="flex justify-between border-t-2 border-[color:var(--color-ink)] pt-2 text-sm font-semibold">
                          <span>{t("drawerInTotal")}</span>
                          <span className="whitespace-nowrap tabular-nums">{baht(f?.inSatang ?? 0)}</span>
                        </p>
                      </div>
                      <div className="flex flex-col">
                        <h4 className="text-xs font-semibold text-[color:var(--color-muted)]">{t("drawerOut")}</h4>
                        <ul className="flex flex-col text-sm">
                          {(f?.out ?? []).map(line)}
                          <li className="flex justify-between gap-3 border-t border-[color:var(--color-line)] py-2">
                            <span className="font-medium">{t("tile_ssoEe")}</span>
                            <span className={`whitespace-nowrap font-semibold tabular-nums ${tone(c.sso)}`}>{baht(c.sso)}</span>
                          </li>
                          <li className="flex justify-between gap-3 border-t border-[color:var(--color-line)] py-2">
                            <span className="font-medium">{t("tile_wht")}</span>
                            <span className={`whitespace-nowrap font-semibold tabular-nums ${tone(c.wht)}`}>{baht(c.wht)}</span>
                          </li>
                        </ul>
                      </div>
                      <p className="flex items-center justify-between rounded-xl bg-[color:var(--color-stage)] p-3">
                        <span className="font-semibold">{t("col_net")}</span>
                        <span className="whitespace-nowrap text-2xl font-semibold tabular-nums">{baht(sel.netSatang)}</span>
                      </p>
                      {sel.flags.length > 0 && <p className="text-xs">{sel.flags.map((x) => t(`fl_${x}`)).join(" · ")}</p>}
                      {sel.review.length > 0 && <p className="text-xs">{sel.review.map((x) => t(`rv_${x.code}`)).join(" · ")}</p>}
                      <div className="grid grid-cols-2 gap-2">
                        <Link href={`/app/sys/${systemId}/hr/attendance?view=month&employee=${encodeURIComponent(sel.employeeId)}&month=${runPeriod}`} className={`${ghost} justify-center`}>
                          {t("drawerAtt")}
                        </Link>
                        <Link href={`/app/sys/${systemId}/payroll/${encodeURIComponent(String(run.id))}/slip/${encodeURIComponent(sel.employeeId)}`} className={`${ghost} justify-center`}>
                          {t("drawerSlip")}
                        </Link>
                        <Link href={`${base}?view=adjust&period=${runPeriod}`} className={`${ghost} col-span-2 justify-center`}>
                          {t("addDeduct")}
                        </Link>
                      </div>
                    </aside>
                  );
                })()}
              </div>
              <details data-testid="hr-run2-review" className="rounded-2xl border border-[color:var(--color-line)]"> {/* HR VIS-5a ◂ */}
                <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm font-semibold">{reviewN === 0 ? t("reviewNone") : t("review", { n: reviewN })}</summary>
                <div className="flex flex-col gap-3 px-4 pb-4">
                  <Warnings flags={[...new Set(pv.rows.flatMap((r) => r.flags))]} t={t} />
                  {reviewGroups.map(([code, xs]) => (
                    <div key={code} className="flex flex-col gap-0.5 text-sm">
                      <p className="font-medium">
                        {t(`rv_${code}`)} · {xs.length}
                      </p>
                      <p className={muted}>{xs.map((x) => `${x.name} (${x.day ? dayLabel(x.day, locale) : t("wholePeriod")})`).join(" · ")}</p>
                      {code === "YTD_OPENING" ? <a href={`${base}?view=ytd#hr-ytd-card`} data-testid="hr-run2-ytd-link" className="inline-flex min-h-[44px] items-center self-start underline-offset-2 hover:underline">{t("ytdLink")}</a> : null} {/* HR H3.4-YTD ▸ ไปการ์ดยอดยกมา ◂ */}
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
          {canMgr && pv && pv.ok && !("review" in pv) && (
            <div className={frame} data-testid="hr-run2-minutes"> {/* HR VIS-5a ◂ */}
              {tableOf(
                <thead className={headCls}>
                  <tr className="text-left">
                    <th className="px-3 py-2.5">{t("col_name")}</th>
                    <th className={num}>{t("mcol_days")}</th>
                    <th className={num}>{t("mcol_work")}</th>
                    <th className={`${md} ${num}`}>{t("mcol_unpaid")}</th>
                    <th className={`${md} ${num}`}>{t("mcol_holiday")}</th>
                  </tr>
                </thead>,
                <tbody>
                  {mgrRows.map((r) => (
                    <tr key={r.employeeId} className="border-t border-[color:var(--color-line)]">
                      <td className="px-3 py-2.5 font-medium">{r.name}</td>
                      <td className={num}>{r.days}</td>
                      <td className={num}>{t("minVal", { n: r.workMin })}</td>
                      <td className={`${md} ${num}`}>{t("minVal", { n: r.unpaidLeaveMin })}</td>
                      <td className={`${md} ${num}`}>{t("minVal", { n: r.holidayWorkMin })}</td>
                    </tr>
                  ))}
                </tbody>,
                null,
              )}
            </div>
          )}
          {v2run && <BranchConfirm systemId={systemId} runId={String(run.id)} status={status} steps={run.stepsJson} act={act.confirm} t={t} unitIds={[...new Set(((pv && pv.ok ? pv.rows : []) as { unitId: string | null }[]).map((r) => r.unitId).filter((x): x is string => !!x))]} />}
          {canMoney && v2run && (
            <div className="flex flex-wrap items-end gap-2 max-md:contents">
              <div data-testid="hr-run2-bar" className="flex flex-wrap items-end gap-2 max-md:-order-1">
                {status === "DRAFT" && allRun && act.approve && (
                  <form action={act.approve} className="max-md:w-full">
                    {hidden({ runId: String(run.id), periodKey, net: String(totals.netSatang ?? ""), items: String(pv && pv.ok ? pv.rows.length : "") })}
                    <button type="submit" className={`${btn} max-md:w-full`} data-testid="hr-run2-approve">
                      {t("approve")}
                    </button>
                  </form>
                )}
                {status === "APPROVED" && allRun && act.pay && (
                  <form action={act.pay} className="flex flex-wrap items-end gap-2">
                    {hidden({ runId: String(run.id), periodKey })}
                    <PayFields ctx={ctx} runId={String(run.id)} periodKey={label(periodKey)} />
                    <button type="submit" className={btn} data-testid="hr-run2-pay">
                      {t("pay")}
                    </button>
                  </form>
                )}
                {(status === "APPROVED" || status === "PAID") && allRun && act.reverse && (
                  <form action={act.reverse}>
                    {hidden({ runId: String(run.id), periodKey })}
                    <button type="submit" className={ghost} data-testid="hr-run2-reverse">
                      {t("reverse")}
                    </button>
                  </form>
                )}
              </div>
              {docLinks.map(([k, , href, label]) => (
                <Link key={k} href={href} className={ghost} data-testid={`hr-run2-doclink-${k}`}>
                  {label}
                </Link>
              ))}
            </div>
          )}{/* HR VIS-5a ◂ */}
          {canMoney && v2run && status !== "REVERSED" && (
            <p data-testid="hr-run2-jv" className="rounded-2xl border border-dashed border-[color:var(--color-line)] bg-[color:var(--color-stage)] p-4 text-sm">
              <span className="font-semibold">{t("jvTitle")}</span> {t("jv")}
            </p>
          )}
          {/* HR VIS-5a ▸ F3: after a reversal the period is free again — the create form is its own block below the reversed run ◂ */}
          {canCreate && (
            <div className="flex flex-col gap-2 rounded-2xl border border-[color:var(--color-line)] p-4">
              <h3 className="text-base font-semibold">{t("createAgainTitle", { period: label(periodKey) })}</h3>
              <p className={muted}>{t("createAgainNote")}</p>
              {createForm}
            </div>
          )}
        </>
      )}
    </section>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;
const WARN_OF: Record<string, keyof typeof RUN2_WARN> = {
  CAP_NEEDS_CONSENT: "capNeedsConsent",
  SSO_MIN_BASE: "ssoMin",
  SHOP_HOLIDAY: "shopHoliday",
  PARTIAL_MONTH: "divisor30",
  RECEIVABLE: "receivable",
  SSO_COMMISSION_U: "ssoCommission",
};
function Warnings({ flags, t }: { flags: string[]; t: T }) {
  const keys = [...new Set(flags.map((f) => WARN_OF[f]).filter((x): x is keyof typeof RUN2_WARN => !!x))];
  if (!keys.length) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-xl border border-[color:var(--color-line)] p-3 text-sm" data-testid="hr-run2-warn" aria-label={t("warnings")}>
      {keys.map((k) => (
        <li key={k}>{t(`warn${k[0]!.toUpperCase()}${k.slice(1)}`)}</li>
      ))}
    </ul>
  );
}

async function BranchConfirm({ systemId, runId, status, steps, act, t, unitIds }: { systemId: string; runId: string; status: string; steps: unknown; act: Act | null; t: T; unitIds: string[] }) {
  if (status !== "DRAFT" || !unitIds.length) return null;
  const auth = await requireTenant();
  // fix r1 F9: เฉพาะสาขาที่มีพนักงานในรอบ (ตามแถวที่ผู้ดูเห็น)
  const units = await tenantDb({ tenantId: auth.active.tenantId }).businessUnit.findMany({ where: { tenantId: auth.active.tenantId, id: { in: unitIds } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 50 });
  const done = (steps && typeof steps === "object" ? ((steps as Record<string, unknown>).branches as Record<string, unknown> | undefined) : undefined) ?? {};
  const open = units.filter((u) => !done[u.id]).length;
  return (
    <div className="flex flex-col gap-1">
      <p className={muted}>{open > 0 ? t("branchOpen", { n: open }) : t("branchAll")}</p>
      <div className="flex flex-wrap gap-2">
        {units.map((u) => (
          <form key={u.id} action={act ?? undefined}>
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="unitId" value={u.id} />
            <button type="submit" className={ghost} disabled={!act || !!done[u.id]} data-testid={`hr-run2-branch-${u.id}`}>
              {done[u.id] ? t("branchDone", { name: u.name }) : t("branchConfirm", { name: u.name })}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

// HR H3.7 ▸ ช่องของปุ่มจ่าย สำหรับรอบที่ลงบัญชีแล้ว (สมุดที่บันทึกไว้ในรอบ): บัญชีเงินที่จ่าย (ค่าเริ่มต้น = ที่เจ้าของตั้ง) + วันที่จ่าย (วันแรกของงวด … วันนี้) ·
//   รอบที่ไม่ได้ลงบัญชี = ไม่มีช่อง (จ่ายแบบเดิม) ◂
async function PayFields({ ctx, runId, periodKey }: { ctx: { tenantId: string; systemId: string }; runId: string; periodKey: string }) {
  const accounts = await payAccountsOfRun(ctx, runId);
  if (!accounts.length) return null;
  const t = await getTranslations("hr.payacct");
  const def = (await getPayrollAccounting(ctx)).payFinanceAccountId;
  return (
    <>
      <label className="flex flex-col text-sm">
        {t("payFrom")}
        <select name="financeAccountId" defaultValue={accounts.some((a) => a.id === def) ? (def ?? "") : ""} className="input min-h-[44px]" data-testid="hr-markpaid-account">
          <option value="">{t("choose")}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-sm">
        {t("paidOn", { period: periodKey })}
        <DateInput name="paidOn" testId="hr-markpaid-date" />
      </label>
    </>
  );
}
// ◂ HR H3.7

/** การ์ดรุ่นเครื่องคิดเงินเดือน (หน้าตั้งค่า) — เจ้าของร้านแก้ได้ · ผู้ตั้งค่าคนอื่นเห็นสรุป · แสดงช่วงที่กฎหักสาย/ขาดมีผล (H3.2 in-force) */
export async function PayrollEngineCard({ systemId, flash, flashOk, onSave }: { systemId: string; flash: string; flashOk: boolean; onSave: Act | null }) {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const engine = await getPayrollEngine(ctx);
  const t = await getTranslations("hr.run2");
  const owner = auth.active.role === "OWNER" && !!onSave;
  const sys = await tenantDb({ tenantId: auth.active.tenantId }).appSystem.findFirst({ where: { id: systemId, tenantId: auth.active.tenantId }, select: { settings: true } });
  const iv = attendanceInForceOf((sys?.settings as Record<string, unknown> | null)?.hrAttendancePayInForce);
  return (
    <section className={card} id="hr-run2-engine" data-testid="hr-run2-engine" aria-label={t("engineTitle")}>{/* HR VIS-5a ▸ heading id dropped: every hr-run2-* string in this file is an inventoried test id (N1) ◂ */}
      <h2 className="text-lg font-semibold">
        {t("engineTitle")}
      </h2>
      <p className={muted}>{engine.engineVersion === 2 ? t("engineV2") : t("engineV1")}</p>
      <p className={muted}>{t("caps", { cat: engine.catCapBp / 100, total: engine.totalCapBp / 100 })}</p>
      <p className={muted}>{iv.length ? t("inForce", { list: iv.map((x) => `${x.from} – ${x.to ?? t("open")}`).join(" · ") }) : t("inForceNone")}</p>
      {flash && (
        <p role={flashOk ? "status" : "alert"} className="text-sm">
          {flash}
        </p>
      )}
      {owner && (
        <form action={onSave!} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <label className="flex flex-col text-sm">
            {t("engineTitle")}
            <select name="engineVersion" defaultValue={String(engine.engineVersion)} className="input min-h-[44px]">
              <option value="1">{t("engineV1")}</option>
              <option value="2">{t("engineV2")}</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            {t("catCap")}
            <input name="catCapPct" inputMode="decimal" defaultValue={String(engine.catCapBp / 100)} className="input min-h-[44px] w-24" />
          </label>
          <label className="flex flex-col text-sm">
            {t("totalCap")}
            <input name="totalCapPct" inputMode="decimal" defaultValue={String(engine.totalCapBp / 100)} className="input min-h-[44px] w-24" />
          </label>
          <button type="submit" className={btn} data-testid="hr-run2-engine-save">
            {t("engineSave")}
          </button>
          <p className="w-full text-xs text-[color:var(--color-muted)]">{t("warnCapRaised")}</p>
        </form>
      )}
    </section>
  );
}
// ◂ HR H3.4
