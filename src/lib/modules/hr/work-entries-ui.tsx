// HR H3.1 ▸ หน้าจอชั่วโมงทำงาน — แผงบนหน้าเงินเดือน (ภาพ 06: สถานะ · ดึงชั่วโมงทำงาน · แถวต่อคน · ต้องตรวจ) ·
//   สรุป + รายวันบนปฏิทินรายคน (ภาพ 04B: ลิงก์ไปที่มา — ลงเวลา/ใบลา) · การ์ดค่าตั้งชั่วโมงทำงานปกติต่อวัน (เจ้าของร้าน)
//   server component ล้วน (ไม่มี "use client") · นาทีเท่านั้น ไม่มีเงิน · ข้อความจาก src/messages hr.we · ผลการกดอ่านจาก ?we= ผ่านรายการคงที่ ◂
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "./privacy";
import { canBuildWorkEntries, canReadWorkEntries, getNormalMinutesPerDay, myWorkEntryDays, workEntryDays, workEntryPreview, WE_TEXT, type WorkEntryDays } from "./work-entries";

const btn = "btn btn-primary min-h-[44px] text-sm";
const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const muted = "text-sm text-[color:var(--color-muted)]";
const chip = "inline-flex min-h-[28px] items-center rounded-full border border-[color:var(--color-line)] px-2.5 text-xs";
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
/** รหัสผลการกดบน URL (?we=) → ข้อความคงที่ (allowlist — ไม่แสดงข้อความอิสระ) */
export const WE_MSG: Record<string, string> = Object.fromEntries(Object.entries(WE_TEXT).map(([k, v]) => [`we.${k}`, v]));
export const weMsgCode = (reason: string) => Object.entries(WE_MSG).find(([, v]) => v === reason)?.[0] ?? "we.failed";

/** แผงชั่วโมงทำงานของงวด (ภาพ 06) — ผู้อ่าน: OWNER · hr.payroll.read · MANAGER/hr.employee.create (สาขาของตัวเอง) · ปุ่มดึง = ผู้ดึงเท่านั้น */
export async function WorkEntriesPanel({ systemId, periodKey, flash, onBuild, after = "", onFinalize = null }: { systemId: string; periodKey: string; flash: string; onBuild: ((fd: FormData) => Promise<void>) | null; after?: string; onFinalize?: ((fd: FormData) => Promise<void>) | null }) {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  if (!canReadWorkEntries(viewer)) return null;
  const t = await getTranslations("hr.we");
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const p = await workEntryPreview(ctx, viewer, { periodKey });
  if (!p.ok) return null;
  const builder = canBuildWorkEntries(viewer) && !!onBuild;
  return (
    <section className={card} data-testid="hr-we-panel" aria-labelledby="hr-we-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="hr-we-title" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <span className={chip} data-testid="hr-we-state" data-state={p.state}>
          {t(`state.${p.state}`)}
        </span>
        <span className={muted}>{t("period", { period: periodKey })}</span>
        {builder && p.state !== "FROZEN" && (
          <form action={onBuild!} className="ml-auto">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="periodKey" value={periodKey} />
            {after && <input type="hidden" name="after" value={after} />}
            <button type="submit" className={btn} data-testid="hr-we-build">
              {after ? t("buildMore") : t("build")}
            </button>
          </form>
        )}
      </div>
      <p className={muted}>{t("desc")}</p>
      {canBuildWorkEntries(viewer) && onFinalize && p.state !== "FROZEN" && p.state !== "CURRENT" && (
        <form action={onFinalize} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="periodKey" value={periodKey} />
          <span className={muted}>{t("finalizeHint")}</span>
          <button type="submit" className="btn btn-ghost min-h-[44px] text-sm" data-testid="hr-we-finalize">
            {t("finalize")}
          </button>
        </form>
      )}
      {flash && (
        <p role="status" className="text-sm">
          {flash}
        </p>
      )}
      {p.rows.length === 0 ? (
        <p className={muted}>{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[color:var(--color-muted)]">
                <th className="py-2 pr-3 font-medium">{t("col.name")}</th>
                <th className="py-2 pr-3 font-medium">{t("col.worked")}</th>
                <th className="py-2 pr-3 font-medium">{t("col.work")}</th>
                <th className="py-2 pr-3 font-medium">{t("col.ot")}</th>
                <th className="py-2 pr-3 font-medium">{t("col.leave")}</th>
                <th className="py-2 pr-3 font-medium">{t("col.absent")}</th>
                <th className="py-2 pr-3 font-medium">{t("col.late")}</th>
                <th className="py-2 font-medium">{t("col.state")}</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.employeeId} className="border-t border-[color:var(--color-line)]" data-testid={`hr-we-row-${r.employeeId}`}>
                  <td className="py-2 pr-3">
                    <Link href={`/app/sys/${systemId}/hr/attendance?view=month&employee=${r.employeeId}&month=${periodKey}`} className="inline-flex min-h-[44px] items-center underline-offset-2 hover:underline">
                      {r.name}
                    </Link>
                    {r.position && <small className="block text-[color:var(--color-muted)]">{r.position}</small>}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{t("days", { n: r.summary.worked })}</td>
                  <td className="py-2 pr-3 tabular-nums">{hm(r.summary.workMin + r.summary.holidayWorkMin)}</td>
                  <td className="py-2 pr-3 tabular-nums">{hm(r.summary.otWorkdayMin + r.summary.otHolidayMin)}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.summary.leaveDays}</td>
                  <td className="py-2 pr-3 tabular-nums">{hm(r.summary.absentMin)}</td>
                  <td className="py-2 pr-3 tabular-nums">{t("late", { n: r.summary.lateCount, min: r.summary.lateMin })}</td>
                  <td className="py-2">
                    <span className={chip} data-state={r.state}>
                      {t(`state.${r.state}`)}
                    </span>
                    {r.reviewCount > 0 && (
                      <span className={`${chip} ml-1 text-[color:var(--color-danger)]`} data-testid="hr-we-review">
                        {t("reviewCount", { n: r.reviewCount })}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={muted}>{t("otNote")}</p>
    </section>
  );
}

/** สรุป + รายวันของพนักงานหนึ่งคน (ภาพ 04B) — snapshot ของงวด · ลิงก์ไปที่มา (ผลลงเวลารายวัน · ใบลา) */
export async function WorkEntriesMonth({ systemId, employeeId, month, self }: { systemId: string; employeeId: string; month: string; self: boolean }) {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const r: WorkEntryDays | { ok: false; reason: string } = self ? await myWorkEntryDays(ctx, { userId: auth.user.id }, { periodKey: month }) : await workEntryDays(ctx, hrViewerOf(auth), { employeeId, periodKey: month });
  if (!r.ok || r.days.length === 0) return null;
  const t = await getTranslations("hr.we");
  const sum = (k: "workMin" | "holidayWorkMin" | "otWorkdayMin" | "otHolidayMin" | "paidLeaveMin" | "unpaidLeaveMin" | "absentMin" | "lateMin") => r.days.reduce((a, d) => a + d[k], 0);
  const base = `/app/sys/${systemId}/hr`;
  return (
    <section className={card} aria-labelledby="hr-we-month-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="hr-we-month-title" className="text-lg font-semibold">
          {t("monthTitle")}
        </h2>
        <span className={chip} data-state={r.state}>
          {t(`state.${r.state}`)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-testid="hr-we-summary">
        <div>
          <dt className="text-[color:var(--color-muted)]">{t("col.work")}</dt>
          <dd className="tabular-nums">{hm(sum("workMin") + sum("holidayWorkMin"))}</dd>
        </div>
        <div>
          <dt className="text-[color:var(--color-muted)]">{t("col.ot")}</dt>
          <dd className="tabular-nums">{hm(sum("otWorkdayMin") + sum("otHolidayMin"))}</dd>
        </div>
        <div>
          <dt className="text-[color:var(--color-muted)]">{t("col.leave")}</dt>
          <dd className="tabular-nums">{hm(sum("paidLeaveMin") + sum("unpaidLeaveMin"))}</dd>
        </div>
        <div>
          <dt className="text-[color:var(--color-muted)]">{t("col.absent")}</dt>
          <dd className="tabular-nums">{hm(sum("absentMin"))}</dd>
        </div>
      </dl>
      <ul className="flex flex-col">
        {r.days
          .filter((d) => d.dayStatus !== "UNSCHEDULED" || d.review.length > 0)
          .map((d) => (
            <li key={d.day} className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-line)] py-2 text-sm" data-testid={`hr-we-day-${d.day}`}>
              <span className="w-24 tabular-nums">{d.day}</span>
              <span className={chip}>{t(`status.${d.dayStatus}`)}</span>
              {d.workMin + d.holidayWorkMin > 0 && <span className="tabular-nums">{t("workShort", { hm: hm(d.workMin + d.holidayWorkMin) })}</span>}
              {d.otWorkdayMin + d.otHolidayMin > 0 && <span className="tabular-nums">{t("otShort", { hm: hm(d.otWorkdayMin + d.otHolidayMin) })}</span>}
              {d.leaveLabel && <span>{d.leaveLabel}</span>}
              {d.review.map((c) => (
                <span key={c} className={`${chip} text-[color:var(--color-danger)]`}>
                  {t(`review.${c}`)}
                </span>
              ))}
              {!self && d.sources.attendanceDayIds.length > 0 && (
                <Link href={`${base}/attendance?view=day&day=${d.day}`} className="ml-auto inline-flex min-h-[44px] items-center underline-offset-2 hover:underline">
                  {t("srcAttendance")}
                </Link>
              )}
              {!self && d.sources.leaveIds.length > 0 && (
                <Link href={`${base}/leave`} className="inline-flex min-h-[44px] items-center underline-offset-2 hover:underline">
                  {t("srcLeave")}
                </Link>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}

/** การ์ดค่าตั้ง: ชั่วโมงทำงานปกติต่อวัน (นาที) — แก้ได้เฉพาะเจ้าของร้าน (ผู้ตั้งค่าอื่นเห็นอ่านอย่างเดียว) */
export async function WorkSettingsCard({ systemId, onSave }: { systemId: string; onSave: ((fd: FormData) => Promise<void>) | null }) {
  const auth = await requireTenant();
  const t = await getTranslations("hr.we");
  const value = await getNormalMinutesPerDay({ tenantId: auth.active.tenantId, systemId });
  const owner = auth.active.role === "OWNER" && !!onSave;
  return (
    <section className={card} data-testid="hr-we-normal" aria-labelledby="hr-we-normal-title">
      <h2 id="hr-we-normal-title" className="text-lg font-semibold">
        {t("normalTitle")}
      </h2>
      <p className={muted}>{t("normalDesc")}</p>
      {owner ? (
        <form action={onSave!} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <label className="flex flex-col gap-1 text-sm">
            {t("normalLabel")}
            <input name="normalMinutesPerDay" type="number" min={60} max={720} step={1} defaultValue={value} className="input min-h-[44px] w-32" data-testid="hr-we-normal-input" />
          </label>
          <button type="submit" className={btn} data-testid="hr-we-normal-save">
            {t("save")}
          </button>
        </form>
      ) : (
        <p className="text-sm tabular-nums">{t("normalValue", { n: value, hm: hm(value) })}</p>
      )}
    </section>
  );
}
