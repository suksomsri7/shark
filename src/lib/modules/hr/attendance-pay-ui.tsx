// HR H3.2 ▸ หน้าจอกฎหักสาย/ขาด — การ์ดค่าตั้ง (หน้าตั้งค่า HR · เจ้าของแก้ · ข้อความกฎหมายแสดงเสมอ) ·
//   แผง "สรุปส่งเข้าเงินเดือน" บนปฏิทินรายคน (ภาพ 04B — แทน "฿50 × 3" ของภาพด้วยหักตามสัดส่วนเวลา) · รายการของฉัน (พนักงาน)
//   server component ล้วน (ไม่มี "use client") · เงินเฉพาะ OWNER/hr.payroll.read และตัวพนักงานเอง (Q9) · ข้อความจาก src/messages hr.attpay ·
//   ผลการกดอ่านจาก ?ap= / ?msg= ผ่านรายการคงที่ (allowlist) ◂
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "./privacy";
import { canReadWorkEntries, canBuildWorkEntries } from "./work-entries";
import { attendanceDeductionLines, attendanceDeductionPreview, canSyncAttendancePay, getAttendancePayPolicy, myAttendanceDeductions } from "./attendance-pay";
import { ATT_FREE_MAX, ATT_STEP_OPTIONS, ATT_TEXT, thaiPeriodLabel } from "./attendance-pay-rules";

const btn = "btn btn-primary min-h-[44px] text-sm";
const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const muted = "text-sm text-[color:var(--color-muted)]";
const chip = "inline-flex min-h-[28px] items-center rounded-full border border-[color:var(--color-line)] px-2.5 text-xs";
const check = "inline-flex min-h-[44px] items-center gap-2 text-sm";
/** สตางค์ → "1,234.56" */
const baht = (satang: number) => (satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** รหัสผลการกดบน URL → ข้อความคงที่ (allowlist — ไม่แสดงข้อความอิสระ) */
export const ATT_MSG: Record<string, string> = Object.fromEntries(Object.entries(ATT_TEXT).map(([k, v]) => [`ap.${k}`, v]));
export const attMsgCode = (r: { ok: true } | { ok: false; reason: string }) => (r.ok ? "ap.synced" : (Object.entries(ATT_MSG).find(([, v]) => v === r.reason)?.[0] ?? "ap.failed"));
const CODES = ["MISSING", "OUTDATED", "REVIEW", "NO_PROFILE", "PAY_TYPE", "NO_BASE", "BLOCKED", "BAD_INPUT", "OFF", "RUN_STALE"] as const;

/** การ์ดค่าตั้ง (ผู้ตั้งค่า HR เห็น · เจ้าของร้านแก้) — ไม่มีตัวเลือกค่าปรับ/ตัวคูณ/ปัดขึ้น · ข้อความกฎหมาย (ม.76) แสดงเสมอ */
export async function AttendancePayPolicyCard({ systemId, onSave }: { systemId: string; onSave: ((fd: FormData) => Promise<void>) | null }) {
  const auth = await requireTenant();
  const t = await getTranslations("hr.attpay");
  const p = await getAttendancePayPolicy({ tenantId: auth.active.tenantId, systemId });
  const owner = auth.active.role === "OWNER" && !!onSave;
  return (
    <section className={card} data-testid="hr-attpay-policy" id="hr-attpay-policy" aria-labelledby="hr-attpay-policy-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="hr-attpay-policy-title" className="text-lg font-semibold">
          {t("policyTitle")}
        </h2>
        <span className={chip}>{p.enabled ? t("stateOn") : t("stateOff")}</span>
      </div>
      <p className={muted}>{t("policyDesc")}</p>
      <p role="note" className="rounded-xl border border-[color:var(--color-line)] p-3 text-sm" data-testid="hr-attpay-warn">
        {t("warn")}
      </p>
      {owner ? (
        <form action={onSave!} className="flex flex-col gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <label className={check}>
            <input type="checkbox" name="enabled" defaultChecked={p.enabled} className="h-5 w-5" data-testid="hr-attpay-enabled" />
            {t("enabled")}
          </label>
          <div className="flex flex-wrap gap-x-4">
            <label className={check}>
              <input type="checkbox" name="late" defaultChecked={p.late} className="h-5 w-5" data-testid="hr-attpay-late" />
              {t("late")}
            </label>
            <label className={check}>
              <input type="checkbox" name="earlyOut" defaultChecked={p.earlyOut} className="h-5 w-5" data-testid="hr-attpay-early" />
              {t("earlyOut")}
            </label>
            <label className={check}>
              <input type="checkbox" name="absent" defaultChecked={p.absent} className="h-5 w-5" data-testid="hr-attpay-absent" />
              {t("absent")}
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              {t("free")}
              <input name="freeMin" type="number" min={0} max={ATT_FREE_MAX} step={1} defaultValue={p.freeMin} className="input min-h-[44px] w-28" data-testid="hr-attpay-free" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("step")}
              <select name="stepMin" defaultValue={String(p.stepMin)} className="input min-h-[44px] w-32" data-testid="hr-attpay-step">
                {ATT_STEP_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {t("stepOpt", { n })}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={btn} data-testid="hr-attpay-save">
              {t("save")}
            </button>
          </div>
          <p className={muted}>{t("freeHint")}</p>
        </form>
      ) : (
        <p className="text-sm">{t("summary", { late: p.late ? t("yes") : t("no"), early: p.earlyOut ? t("yes") : t("no"), absent: p.absent ? t("yes") : t("no"), free: p.freeMin, step: p.stepMin })}</p>
      )}
    </section>
  );
}

/** แผง "สรุปส่งเข้าเงินเดือน" ของพนักงานหนึ่งคน (ภาพ 04B) — ผู้อ่านชั่วโมงทำงาน · ปุ่มคำนวณ = OWNER/hr.payroll.read+hr.payadjust.request · เงิน = ผู้ดูเงินเดือน */
export async function AttendancePayPanel({ systemId, employeeId, periodKey, code, onSync }: { systemId: string; employeeId: string; periodKey: string; code: string; onSync: ((fd: FormData) => Promise<void>) | null }) {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  if (!canReadWorkEntries(viewer)) return null;
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const p = await attendanceDeductionPreview(ctx, viewer, { periodKey, employeeIds: [employeeId] }); // fix r1 (N4): คิดเฉพาะคนที่ดู
  if (!p.ok) return null;
  const t = await getTranslations("hr.attpay");
  const row = p.rows.find((r) => r.employeeId === employeeId);
  const money = canBuildWorkEntries(viewer);
  const sync = canSyncAttendancePay(viewer) && !!onSync && p.enabled;
  const flash = Object.prototype.hasOwnProperty.call(ATT_MSG, code) ? ATT_MSG[code]! : "";
  const lines = money && row ? await Promise.all(row.adjustmentIds.map((id) => attendanceDeductionLines(ctx, viewer, { adjustmentId: id }))) : [];
  return (
    <section className={card} data-testid="hr-attpay-panel" aria-labelledby="hr-attpay-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="hr-attpay-title" className="text-lg font-semibold">
          {t("panelTitle")}
        </h2>
        <span className={muted}>{thaiPeriodLabel(periodKey)}</span>
        {sync && (
          <form action={onSync!} className="ml-auto">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="periodKey" value={periodKey} />
            <button type="submit" className={btn} data-testid="hr-attpay-sync">
              {t("sync")}
            </button>
          </form>
        )}
      </div>
      <p className={muted}>{p.enabled ? t("panelDesc") : t("off")}</p>
      {flash && (
        <p role="status" className="text-sm">
          {flash}
        </p>
      )}
      {!row ? (
        <p className={muted}>{t("none")}</p>
      ) : (
        <div className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-2 text-sm" data-testid={`hr-attpay-row-${row.employeeId}`}>
          <div className="flex flex-wrap items-center gap-2">
            {row.code && (CODES as readonly string[]).includes(row.code) && <span className={`${chip} text-[color:var(--color-danger)]`}>{t(`code_${row.code}`)}</span>}
            <span className="tabular-nums">{t("lateLine", { n: row.lateMin })}</span>
            <span className="tabular-nums">{t("absentLine", { n: row.absentMin })}</span>
            <span className="tabular-nums">{t("daysLine", { n: row.days })}</span>
          </div>
          {money && row.lateSatang !== undefined && (
            <div className="flex flex-wrap items-center gap-3 tabular-nums">
              <span>{t("entitled", { late: baht(row.lateSatang ?? 0), absent: baht(row.absentSatang ?? 0) })}</span>
              <span>{t("pending", { n: baht(row.pendingSatang ?? 0) })}</span>
              <span>{t("approved", { n: baht(row.approvedSatang ?? 0) })}</span>
            </div>
          )}
          {row.adjustmentIds.some((id) => p.staleIds.includes(id)) && <span className={`${chip} self-start text-[color:var(--color-danger)]`}>{t("needSync")}</span>}
          {lines.map((l) =>
            l.ok ? (
              <details key={l.adjustmentId} className="rounded-xl border border-[color:var(--color-line)] p-2" data-testid={`hr-attpay-lines-${l.adjustmentId}`}>
                <summary className="min-h-[44px] cursor-pointer py-2">
                  {t(l.rule === "ABSENT_RULE" ? "ruleAbsent" : "ruleLate")} · {t("gen", { n: l.gen })} · ฿{baht(l.amountSatang)}
                </summary>
                <ul className="flex flex-col">
                  {l.lines.map((x) => (
                    <li key={x.workDayId + x.day} className="flex gap-3 tabular-nums">
                      <span className="w-24">{x.day}</span>
                      <span>{t("minutes", { n: x.minutes })}</span>
                      <span>฿{baht(x.amountSatang)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null,
          )}
          {money && row.adjustmentIds.length > 0 && (
            <Link href={`/app/sys/${systemId}/hr/payroll`} className="inline-flex min-h-[44px] items-center self-start underline-offset-2 hover:underline">
              {t("toPayroll")}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/** รายการหักสาย/ขาดของฉัน (พนักงานที่ผูกบัญชี) — ยอด + บรรทัดรายวันของตัวเอง (Q9) */
export async function AttendancePayMine({ systemId, periodKey }: { systemId: string; periodKey: string }) {
  const auth = await requireTenant();
  const r = await myAttendanceDeductions({ tenantId: auth.active.tenantId, systemId }, { userId: auth.user.id }, { periodKey });
  if (!r.ok || r.items.length === 0) return null;
  const t = await getTranslations("hr.attpay");
  return (
    <section className={card} data-testid="hr-attpay-mine" aria-labelledby="hr-attpay-mine-title">
      <h2 id="hr-attpay-mine-title" className="text-lg font-semibold">
        {t("mineTitle")}
      </h2>
      <ul className="flex flex-col">
        {r.items.map((i) => (
          <li key={i.adjustmentId} className="flex flex-col gap-1 border-t border-[color:var(--color-line)] py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 tabular-nums">
              <span className={chip}>{t(i.status === "APPROVED" ? "statusApproved" : "statusPending")}</span>
              <span>{i.kind === "ALLOWANCE" ? t("refundLabel") : t(i.rule === "ABSENT_RULE" ? "ruleAbsent" : "ruleLate")}</span>
              <span>{t("minutes", { n: i.minutes })}</span>
              <span>฿{baht(i.amountSatang)}</span>
              <span className={muted}>{t("payPeriod", { p: thaiPeriodLabel(i.periodKey) })}</span>
            </div>
            {i.lines.length > 0 && (
              <ul className={muted}>
                {i.lines.map((l) => (
                  <li key={l.day} className="tabular-nums">
                    {l.day} · {t("minutes", { n: l.minutes })} · ฿{baht(l.amountSatang)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
