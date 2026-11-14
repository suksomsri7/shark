// HR H3.4 ▸ รอบจ่ายเงินเดือนรุ่น 2 — ส่วนรอบจ่ายของหน้าเงินเดือน (ภาพ 06: ขั้น ร่าง · ตรวจ · อนุมัติ · จ่าย · ลงบัญชี · ไทล์ยอด · ตาราง + ที่มาต่อคน ·
//   รายการต้องตรวจ (รวมลูกหนี้พนักงาน) · ยืนยันชั่วโมงของสาขา · ปุ่มดึงชั่วโมงทำงาน → คำนวณรายการหักสาย/ขาด) + การ์ดรุ่นเครื่องบนหน้าตั้งค่า (เจ้าของร้าน)
//   server component ล้วน · เงินเห็นเฉพาะผู้ดูเงินเดือน (previewPayrollRunV2 ตัดสิน) · ผู้จัดการเห็นนาทีเท่านั้น · ผลการกดมาจาก ?r2= ผ่านรายการคงที่ (RUN2_MSG) ◂
import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
export async function PayrollRunSection({ systemId, periodKey, runId, flash, flashOk, actions }: { systemId: string; periodKey: string; runId: string; flash: string; flashOk: boolean; actions: Run2Actions }) {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const payV = auth.active.role === "OWNER" || (auth.active.permissions as Record<string, unknown> | null)?.["hr.payroll.read"] === true;
  const mgrV = !payV && auth.active.role === "MANAGER";
  if (!payV && !mgrV) return null;
  const engine = await getPayrollEngine(ctx);
  if (engine.engineVersion !== 2) return null;
  const t = await getTranslations("hr.run2");
  const act: Run2Actions = payV ? actions : { create: null, rebuild: null, approve: null, pay: null, reverse: null, sync: null, confirm: actions.confirm };
  const runs = await tenantDb(ctx).hrPayrollRun.findMany({ where: { systemId, engineVersion: 2 }, orderBy: [{ periodKey: "desc" }, { createdAt: "desc" }], select: { id: true, periodKey: true, status: true }, take: 24 });
  const pick = runs.find((r) => r.id === runId) ?? runs.find((r) => r.periodKey === periodKey && r.status !== "REVERSED") ?? null;
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
  return (
    <section className={card} data-testid="hr-run2" aria-labelledby="hr-run2-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="hr-run2-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <span className={muted}>{t("period", { period: periodKey })}</span>
      </div>
      {flash && (
        <p role={flashOk ? "status" : "alert"} className={flashOk ? muted : "text-sm font-medium text-[color:var(--color-danger)]"} data-testid="hr-run2-flash">
          {flash}
        </p>
      )}
      {runs.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={t("runs")}>
          {runs.map((r) => (
            <li key={r.id} data-testid={`hr-run2-row-${r.id}`} className="flex min-w-0 items-center gap-2">
              <Link href={`?period=${r.periodKey}&run=${r.id}#hr-run2`} className="min-h-[44px] truncate py-2 underline-offset-2 hover:underline">
                {t("runRow", { period: r.periodKey })}
              </Link>
              <span className={chip}>{t(`st_${r.status}`)}</span>
            </li>
          ))}
        </ul>
      )}
      {act.create && (
        <form action={act.create} className="flex flex-wrap items-end gap-2">
          {hidden({ periodKey })}
          <label className="flex flex-col text-sm">
            {t("payDate")}
            <input type="date" name="payDate" required className="input min-h-[44px]" />
          </label>
          <button type="submit" className={btn} data-testid="hr-run2-create">
            {t("create", { period: periodKey })}
          </button>
        </form>
      )}
      {act.sync && (
        <form action={act.sync} className="flex flex-wrap items-center gap-2">
          {hidden({ periodKey })}
          <span className={muted}>{t("syncHint")}</span>
          <button type="submit" className={ghost} data-testid="hr-run2-sync">
            {t("sync")}
          </button>
        </form>
      )}
      {run && (
        <>
          <ol className="grid grid-cols-5 gap-1 text-xs" data-testid="hr-run2-steps" aria-label={t("steps")}>
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? "step" : undefined} className={`flex flex-col items-center gap-1 rounded-xl border p-2 ${i === step ? "border-[color:var(--color-ink)] font-semibold" : "border-[color:var(--color-line)]"} ${i < step ? "" : "text-[color:var(--color-muted)]"}`}>
                <span className={chip}>{i < step ? "✓" : i + 1}</span>
                {t(s)}
              </li>
            ))}
          </ol>
          {canMoney && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="hr-run2-tiles">
              {(
                [
                  ["net", totals.netSatang],
                  ["gross", totals.grossSatang],
                  ["add", totals.addSatang],
                  ["deduct", -totals.deductSatang],
                  ["ssoEe", -totals.ssoEmployeeSatang],
                  ["ssoEr", totals.ssoEmployerSatang],
                  ["wht", -totals.whtSatang],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-[color:var(--color-line)] p-3">
                  <dt className={muted}>{t(`tile_${k}`)}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{baht(Number(v ?? 0))}</dd>
                </div>
              ))}
            </dl>
          )}
          {/* HR PRIV-2 ▸ R1(c): ผู้ดูที่จำกัดสาขา — ยอดในไทล์มาจากแถวที่เห็นเท่านั้น (previewPayrollRunV2) · บอกจำนวนคนที่ไม่รวม ไม่มีชื่อ/ยอด ◂ */}
          {canMoney && Number(run.excludedHeadcount ?? 0) > 0 && <p className={muted}>{PAY_SCOPE_EXCLUDED_TEXT.replace("{n}", String(Number(run.excludedHeadcount)))}</p>}
          {canMoney && pv && pv.ok && "review" in pv && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm" data-testid="hr-run2-table">
                  <thead>
                    <tr className="text-left text-[color:var(--color-muted)]">
                      <th className="py-2">{t("col_name")}</th>
                      <th className="text-right">{t("col_gross")}</th>
                      <th className="text-right">{t("col_add")}</th>
                      <th className="text-right">{t("col_deduct")}</th>
                      <th className="text-right">{t("col_sso")}</th>
                      <th className="text-right">{t("col_wht")}</th>
                      <th className="text-right">{t("col_net")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pv.rows.map((r) => (
                      <tr key={r.employeeId} className="border-t border-[color:var(--color-line)] align-top">
                        <td className="max-w-[12rem] py-2">
                          <details data-testid={`hr-run2-lines-${r.employeeId}`}>
                            <summary className="min-h-[44px] cursor-pointer truncate">{r.name}</summary>
                            <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                              {(r.lines as { code: string; day: string | null; minutes: number | null; amountSatang: number; requestedSatang?: number }[]).map((l, i) => (
                                <li key={i} className="flex justify-between gap-2">
                                  <span>
                                    {t(`ln_${l.code}`)}
                                    {l.day ? ` ${l.day}` : ""}
                                    {l.minutes != null ? ` · ${l.minutes} ${t("min")}` : ""}
                                    {l.requestedSatang != null ? ` · ${t("requested", { amount: baht(l.requestedSatang) })}` : ""}
                                  </span>
                                  <span className="tabular-nums">{baht(l.amountSatang)}</span>
                                </li>
                              ))}
                            </ul>
                            {r.flags.length > 0 && <p className="mt-1 text-xs">{r.flags.map((f) => t(`fl_${f}`)).join(" · ")}</p>}
                          </details>
                        </td>
                        <td className="text-right tabular-nums">{baht(r.grossSatang + r.deductSatang - r.addSatang)}</td>
                        <td className="text-right tabular-nums">{baht(r.addSatang)}</td>
                        <td className="text-right tabular-nums">{baht(-r.deductSatang)}</td>
                        <td className="text-right tabular-nums">{baht(-r.ssoEmployeeSatang)}</td>
                        <td className="text-right tabular-nums">{baht(-r.whtSatang)}</td>
                        <td className="text-right font-semibold tabular-nums">{baht(r.netSatang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Warnings flags={[...new Set(pv.rows.flatMap((r) => r.flags))]} t={t} />
              <div data-testid="hr-run2-review" className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">{t("review", { n: pv.review.length })}</h3>
                {pv.review.length === 0 ? (
                  <p className={muted}>{t("reviewNone")}</p>
                ) : (
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {pv.review.map((x, i) => (
                      <li key={i}>
                        {x.name} · {x.day ?? t("wholePeriod")} · {t(`rv_${x.code}`)}
                        {x.code === "YTD_OPENING" ? <> · <a href="#hr-ytd-card" data-testid="hr-run2-ytd-link" className="inline-flex min-h-[44px] items-center underline-offset-2 hover:underline">{t("ytdLink")}</a></> : null} {/* HR H3.4-YTD ▸ ไปการ์ดยอดยกมา ◂ */}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
          {canMgr && pv && pv.ok && !("review" in pv) && (
            <ul className="flex flex-col gap-1 text-sm" data-testid="hr-run2-minutes">
              {(pv.rows as { employeeId: string; name: string; days: number; workMin: number; unpaidLeaveMin: number; holidayWorkMin: number }[]).map((r) => (
                <li key={r.employeeId}>{t("mgrRow", { name: r.name, days: r.days, work: r.workMin, unpaid: r.unpaidLeaveMin, holiday: r.holidayWorkMin })}</li>
              ))}
            </ul>
          )}
          <BranchConfirm systemId={systemId} runId={String(run.id)} status={status} steps={run.stepsJson} act={act.confirm} t={t} unitIds={[...new Set(((pv && pv.ok ? pv.rows : []) as { unitId: string | null }[]).map((r) => r.unitId).filter((x): x is string => !!x))]} />
          {canMoney && (
            <div className="flex flex-wrap gap-2">
              {status === "DRAFT" && act.rebuild && (
                <form action={act.rebuild}>
                  {hidden({ runId: String(run.id), periodKey })}
                  <button type="submit" className={ghost} data-testid="hr-run2-rebuild">
                    {t("rebuild")}
                  </button>
                </form>
              )}
              {status === "DRAFT" && act.approve && (
                <form action={act.approve}>
                  {hidden({ runId: String(run.id), periodKey, net: String(totals.netSatang ?? ""), items: String(pv && pv.ok ? pv.rows.length : "") })}
                  <button type="submit" className={btn} data-testid="hr-run2-approve">
                    {t("approve")}
                  </button>
                </form>
              )}
              {status === "APPROVED" && act.pay && (
                <form action={act.pay} className="flex flex-wrap items-end gap-2">
                  {hidden({ runId: String(run.id), periodKey })}
                  <PayFields ctx={ctx} runId={String(run.id)} periodKey={periodKey} />
                  <button type="submit" className={btn} data-testid="hr-run2-pay">
                    {t("pay")}
                  </button>
                </form>
              )}
              {(status === "APPROVED" || status === "PAID") && act.reverse && (
                <form action={act.reverse}>
                  {hidden({ runId: String(run.id), periodKey })}
                  <button type="submit" className={ghost} data-testid="hr-run2-reverse">
                    {t("reverse")}
                  </button>
                </form>
              )}
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
    <section className={card} id="hr-run2-engine" data-testid="hr-run2-engine" aria-labelledby="hr-run2-engine-title">
      <h2 id="hr-run2-engine-title" className="text-lg font-semibold">
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
