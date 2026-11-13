import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { formatThaiDate, thaiDateKey } from "@/lib/ui/date";
import { hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { hrViewerOf } from "@/lib/modules/hr/privacy";
// HR H1.2 ▸ ตัวกันของหน้า (F16.3) = ขอบเขตสาขาจาก hr/scope — รายการ/ตัวเลือกสาขาตามขอบเขตของผู้ดู ◂
import { hrScopeOf, isAllBranches, unitsForScope } from "@/lib/modules/hr/scope";
import { canManageHrSettings, listHolidays, listLeavePolicies, listShifts, SETTINGS_TEXT } from "@/lib/modules/hr/settings";
import { TIME_RULE_TEXT } from "@/lib/modules/hr/time-rules";
import { HR_UNIT_NOT_FOUND_TEXT } from "@/lib/modules/hr/scope";
import {
  archiveLeavePolicyAction,
  archiveShiftAction,
  createLeavePolicyAction,
  createShiftAction,
  deleteHolidayAction,
  upsertHolidayAction,
  saveClockPolicyAction, // HR H2.4 ◂
  saveClockSiteAction, // HR H2.4 ◂
} from "@/lib/modules/hr/settings-actions";
import { applyHolidayPresetAction } from "@/lib/modules/hr/settings-actions"; // HR H2.8 ◂
import { LEAVE_TEXT } from "@/lib/modules/hr/leave-rules"; // HR H2.8 ▸ presetNone ◂
import { ATTENDANCE_SETTINGS_TEXT, canManageClockSettings, CLOCK_SETTINGS_TEXT, getAttendancePolicy, getClockPolicy, listClockSites } from "@/lib/modules/hr/clock-settings"; // HR H2.4 ▸ R10 + Q1 ◂ · HR H2.5 ▸ R12 ◂
import { saveAttendancePolicyAction } from "@/lib/modules/hr/attendance-actions"; // HR H2.5 ▸ R12 ◂
import { getOtPolicy, OT_TEXT } from "@/lib/modules/hr/ot"; // HR H2.9 ▸ R14 นโยบาย OT ◂
import { saveOtPolicyAction } from "@/lib/modules/hr/ot-actions"; // HR H2.9 ◂
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { ModuleTabs } from "@/components/module-tabs";
import { LifecycleMsg, LifecycleSettings } from "@/lib/modules/hr/lifecycle-ui"; // HR H4.4 ▸ ค่าตั้งวงจรพนักงาน (เตือน · บอร์ดงาน · แม่แบบรายการตรวจ) ◂
import { WorkSettingsCard, WE_MSG } from "@/lib/modules/hr/work-entries-ui"; // HR H3.1 ▸ ชั่วโมงทำงานปกติต่อวัน (เจ้าของร้าน) ◂
import { saveNormalMinutesAction } from "@/lib/modules/hr/work-entries-actions"; // HR H3.1 ◂
import { AttendancePayPolicyCard, ATT_MSG } from "@/lib/modules/hr/attendance-pay-ui"; // HR H3.2 ◂ กฎหักสาย/ขาด (เจ้าของร้าน)
import { saveAttendancePayPolicyAction } from "@/lib/modules/hr/attendance-pay-actions"; // HR H3.2 ◂
import { PayrollEngineCard, RUN2_MSG, run2MsgCode } from "@/lib/modules/hr/payroll-run-ui"; // HR H3.4 ▸ การ์ดรุ่นเครื่องคิดเงินเดือน (เจ้าของร้าน) ◂
import { setPayrollEngineAction } from "@/lib/modules/hr/payroll-actions"; // HR H3.4 ◂
import { setPayrollBookAction, setPayrollPayAccountAction, setPayrollPostingAction } from "@/lib/modules/hr/payroll-actions"; // HR H3.7 ▸ สมุดบัญชีเงินเดือน + บัญชีจ่าย (เจ้าของร้าน) ◂
import { PayrollAccountingCard, payAcctMsgCode } from "@/lib/modules/hr/payroll-accounting-ui"; // HR H3.7 ◂
import { LEAVE_PRESET_TEXT } from "@/lib/modules/hr/leave-presets"; // HR H2.12 ▸ F1 ◂
import { addLeavePresetAction } from "@/lib/modules/hr/leave-presets-actions"; // HR H2.12 ▸ F1 ◂
import { LeavePolicyWarningLines, LeavePresetSection } from "@/lib/modules/hr/leave-presets-ui"; // HR H2.12 ▸ F1 + F5 ◂
import { BankSettingsCard, BANK_MSG, bankMsgText } from "@/lib/modules/hr/bank-files/ui"; // HR H3.5 ▸ ไฟล์โอนเงินเดือน: บัญชีต้นทาง (เจ้าของร้าน) · ชุดคอลัมน์ ◂
import { deleteBankPresetAction, saveBankPresetAction, saveBankProfileAction } from "@/lib/modules/hr/bank-files/actions"; // HR H3.5 ◂

// HR H1.2 ▸ R9 หน้าตั้งค่าแบบย่อ (stub) — กะ · ประเภทการลา · วันหยุด · ไม่อ้างว่าตรงภาพ 08 (หน้าเต็ม = H2.2/H2.7/H2.8)
//   เปิดได้ = OWNER หรือ hr.employee.create (Q2) · อื่น ๆ = 404 · ผลการกด = รหัสสั้น ?msg= → ข้อความคงที่ (R13.3) ◂
const CATEGORIES = ["SICK", "PERSONAL", "VACATION", "OTHER"] as const;
const KINDS = ["PUBLIC", "SHOP"] as const;
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
// HR H1.2 R13 ▸ R13.3: ผลการกดส่งทาง URL เป็น "รหัสสั้น" เท่านั้น แล้วแปลงกลับจากรายการข้อความคงที่ (allowlist) —
//   ไม่แสดงข้อความอิสระจาก ?msg= · รหัสที่ไม่รู้จัก = ไม่แสดงอะไร · ข้อความที่ไม่อยู่ในรายการ = "บันทึกไม่สำเร็จ" ◂
const MSG_TEXTS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SETTINGS_TEXT).map(([k, v]) => [`s.${k}`, v])),
  ...Object.fromEntries(Object.entries(TIME_RULE_TEXT).map(([k, v]) => [`t.${k}`, v])),
  "u.notFound": HR_UNIT_NOT_FOUND_TEXT,
  "l.presetNone": LEAVE_TEXT.presetNone, // HR H2.8 ◂
  ...Object.fromEntries(Object.entries(CLOCK_SETTINGS_TEXT).map(([k, v]) => [`c.${k}`, v])), // HR H2.4 ◂
  ...Object.fromEntries(Object.entries(ATTENDANCE_SETTINGS_TEXT).map(([k, v]) => [`a.${k}`, v])), // HR H2.5 ◂
  ...WE_MSG, // HR H3.1 ◂
  ...ATT_MSG, // HR H3.2 ◂
  ...BANK_MSG, // HR H3.5 ◂
  ...Object.fromEntries((["sAfter", "sAhead", "sRound"] as const).map((k) => [`o.${k}`, OT_TEXT[k]])), // HR H2.9 ◂
  ...Object.fromEntries(Object.entries(LEAVE_PRESET_TEXT).map(([k, v]) => [`lp.${k}`, v])), // HR H2.12 ▸ F1 ◂
};
const MSG_CODE_OF = new Map(Object.entries(MSG_TEXTS).map(([k, v]) => [v, k]));
/** กลับหน้าเดิมพร้อมรหัสผลการกด (redirect โยนเพื่อจบ action) */
function back(path: string, year: number, r: { ok: true; id: string } | { ok: false; reason: string }): never {
  const code = r.ok ? "ok" : (MSG_CODE_OF.get(r.reason) ?? "s.failed");
  redirect(`${path}?year=${year}&msg=${encodeURIComponent(code)}`);
}

export default async function HrSettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string; msg?: string; life?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const run2Code = typeof (sp as Record<string, unknown>).run2 === "string" ? String((sp as Record<string, unknown>).run2) : ""; // HR H3.4 ▸ ผลการกดการ์ดรุ่นเครื่อง ◂
  const tRun2 = await getTranslations("hr.run2"); // HR H3.4 ◂
  const run2Ok = run2Code === "ok" || run2Code === "okw"; // HR H3.4 ◂
  const run2Flash = run2Code === "ok" ? tRun2("done") : run2Code === "okw" ? `${tRun2("done")} · ${RUN2_MSG["w.capRaised"]}` : run2Code ? (RUN2_MSG[run2Code] ?? tRun2("failed")) : ""; // HR H3.4 ◂
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const viewer = hrViewerOf(auth);
  if (!canManageHrSettings(viewer)) notFound();
  const scope = hrScopeOf(viewer);
  const t = await getTranslations("hr.settings");
  const tLaw = await getTranslations("hr.law"); // HR H3.3 ▸ ป้ายลิงก์ตารางกฎหมาย ◂
  const tOt = await getTranslations("hr.ot"); // HR H2.9 ◂
  const def = systemDef(sys.type);
  const ctx = { tenantId: auth.active.tenantId, systemId: id };
  const thisYear = Number(thaiDateKey(new Date()).slice(0, 4));
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : thisYear;
  const [shifts, policies, holidays, units] = await Promise.all([listShifts(ctx, { scope }), listLeavePolicies(ctx, { scope }), listHolidays(ctx, { year, scope }), unitsForScope(ctx.tenantId, scope)]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  // HR H2.4 ▸ ค่าตั้งการลงเวลา — เฉพาะ OWNER/คีย์ hr.employee.create ตรง ๆ (ผู้จัดการที่ไม่มีคีย์ไม่เห็นส่วนนี้) ◂
  const clockOk = canManageClockSettings(viewer);
  const [clockSites, clockPolicy] = clockOk ? await Promise.all([listClockSites(ctx, viewer), getClockPolicy(ctx)]) : [null, null];
  const attPolicy = clockOk ? await getAttendancePolicy(ctx) : null; // HR H2.5 ▸ R12 ◂
  const otPolicy = await getOtPolicy(ctx); // HR H2.9 ▸ R14 (แก้ได้เฉพาะผู้ดูแลทุกสาขา — service ตรวจซ้ำ) ◂
  const siteOf = new Map((clockSites?.ok ? clockSites.items : []).map((x) => [x.unitId ?? "all", x]));
  const all = isAllBranches(scope);
  const where = (u: string | null) => (u ? (unitName.get(u) ?? t("unit")) : t("shopWide"));
  const path = `/app/sys/${id}/hr/settings`;
  const code = typeof sp.msg === "string" ? sp.msg : "";
  const bankMsg = await bankMsgText(code); // HR H3.5 fix r1 ▸ F7: ผลของการ์ดไฟล์โอนตามภาษาผู้ดู ◂
  const msg = bankMsg ?? (code === "ok" ? t("saved") : code === "p.ok" ? t("holidays.presetDone") /* HR H2.8 ◂ */ : Object.prototype.hasOwnProperty.call(MSG_TEXTS, code) ? MSG_TEXTS[code]! : ""); // HR H1.2 R13 ▸ allowlist ◂ · HR H3.5 ◂

  // ผลของ action → กลับหน้าเดิมพร้อมรหัสผล (R13.3) · closure จับเฉพาะค่าพื้นฐาน (สตริง/ตัวเลข)
  const onCreateShift = async (fd: FormData) => {
    "use server";
    back(path, year, await createShiftAction(fd));
  };
  const onArchiveShift = async (fd: FormData) => {
    "use server";
    back(path, year, await archiveShiftAction(fd));
  };
  const onCreatePolicy = async (fd: FormData) => {
    "use server";
    back(path, year, await createLeavePolicyAction(fd));
  };
  // HR H2.12 ▸ F1 เพิ่มประเภทลาตามกฎหมาย 1 รายการ (ด่านเดียวกับเพิ่มประเภทการลา) ◂
  const onAddLeavePreset = async (fd: FormData) => {
    "use server";
    back(path, year, await addLeavePresetAction(fd));
  };
  const onArchivePolicy = async (fd: FormData) => {
    "use server";
    back(path, year, await archiveLeavePolicyAction(fd));
  };
  const onAddHoliday = async (fd: FormData) => {
    "use server";
    back(path, year, await upsertHolidayAction(fd));
  };
  const onDeleteHoliday = async (fd: FormData) => {
    "use server";
    back(path, year, await deleteHolidayAction(fd));
  };
  // HR H2.8 ▸ ใส่ชุดวันหยุดราชการ — ผลเป็นรหัสสั้น (p.ok · รหัสข้อความคงที่) ไม่ส่งตัวเลข/ข้อความอิสระทาง URL
  const onApplyPreset = async (fd: FormData) => {
    "use server";
    const r = await applyHolidayPresetAction(fd);
    redirect(`${path}?year=${year}&msg=${encodeURIComponent(r.ok ? "p.ok" : (MSG_CODE_OF.get(r.reason) ?? "s.failed"))}`);
  };
  // ◂ HR H2.8
  // HR H2.4 ▸ ◂
  const onSaveClockPolicy = async (fd: FormData) => {
    "use server";
    back(path, year, await saveClockPolicyAction(fd));
  };
  const onSaveClockSite = async (fd: FormData) => {
    "use server";
    back(path, year, await saveClockSiteAction(fd));
  };
  // HR H2.5 ▸ R12 ◂
  const onSaveAttendancePolicy = async (fd: FormData) => {
    "use server";
    back(path, year, await saveAttendancePolicyAction(fd));
  };
  // HR H3.1 ▸ ◂
  const onSaveNormalMinutes = async (fd: FormData) => {
    "use server";
    back(path, year, await saveNormalMinutesAction(fd));
  };
  // HR H3.2 ▸ ◂
  const onSaveAttPay = async (fd: FormData) => {
    "use server"; // HR H3.2 ◂
    back(path, year, await saveAttendancePayPolicyAction(fd)); // HR H3.2 ◂
  }; // HR H3.2 ◂
  // HR H3.4 ▸ รุ่นเครื่องคิดเงินเดือน — ผลการกด ?run2= (รหัสคงที่ · ok/okw = บันทึกแล้ว/บันทึกพร้อมคำเตือน ม.76) ◂
  const onSaveEngine = async (fd: FormData) => {
    "use server"; // HR H3.4 ◂
    const r = await setPayrollEngineAction(fd); // HR H3.4 ◂
    redirect(`${path}?year=${year}&run2=${r.ok ? (r.warnings?.length ? "okw" : "ok") : encodeURIComponent(run2MsgCode(r.reason))}#hr-run2-engine`); // HR H3.4 ◂
  }; // HR H3.4 ◂
  // HR H3.7 ▸ ลงบัญชีเงินเดือน — ผลการกด ?pacct= (รหัสคงที่) ◂
  const onSavePayBook = async (fd: FormData) => {
    "use server"; // HR H3.7 ◂
    redirect(`${path}?year=${year}&pacct=${payAcctMsgCode(await setPayrollBookAction(fd))}#hr-pay-accounting`); // HR H3.7 ◂
  }; // HR H3.7 ◂
  const onSavePosting = async (fd: FormData) => {
    "use server"; // HR H3.7 ▸ fix r1 F6 ◂
    redirect(`${path}?year=${year}&pacct=${payAcctMsgCode(await setPayrollPostingAction(fd))}#hr-pay-accounting`); // HR H3.7 ◂
  }; // HR H3.7 ◂
  const onSavePayAccount = async (fd: FormData) => {
    "use server"; // HR H3.7 ◂
    redirect(`${path}?year=${year}&pacct=${payAcctMsgCode(await setPayrollPayAccountAction(fd))}#hr-pay-accounting`); // HR H3.7 ◂
  }; // HR H3.7 ◂
  // HR H3.5 ▸ ไฟล์โอนเงินเดือน — บัญชีต้นทาง (เจ้าของร้าน) · ชุดคอลัมน์ (service ตรวจด่านซ้ำ) ◂
  const onSaveBankProfile = async (fd: FormData) => {
    "use server"; // HR H3.5 ◂
    back(path, year, await saveBankProfileAction(fd)); // HR H3.5 ◂
  }; // HR H3.5 ◂
  const onSaveBankPreset = async (fd: FormData) => {
    "use server"; // HR H3.5 ◂
    back(path, year, await saveBankPresetAction(fd)); // HR H3.5 ◂
  }; // HR H3.5 ◂
  const onDeleteBankPreset = async (fd: FormData) => {
    "use server"; // HR H3.5 ◂
    back(path, year, await deleteBankPresetAction(fd)); // HR H3.5 ◂
  }; // HR H3.5 ◂
  // HR H2.9 ▸ R14 ◂
  const onSaveOtPolicy = async (fd: FormData) => {
    "use server";
    back(path, year, await saveOtPolicyAction(fd));
  };

  const unitSelect = (testid: string) => (
    <select name="unitId" className="input min-h-[44px]" defaultValue={all ? "" : (units[0]?.id ?? "")} data-testid={testid}>
      {all && <option value="">{t("shopWide")}</option>}
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex max-w-2xl flex-col gap-5" data-testid="hr-settings-page">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} />
      {/* HR H3.3 ▸ ทางเข้าหน้าตารางกฎหมาย (อ่านอย่างเดียว · ภาพ 08 แท็บ "ตารางกฎหมาย") ◂ */}
      <Link href={`/app/sys/${id}/hr/settings/law`} className="card flex min-h-[44px] flex-col gap-1 p-3 hover:bg-[color:var(--color-surface-2)]" data-testid="hr-settings-law-link">
        <span className="text-sm font-medium">{tLaw("settingsLink")}</span>
        <span className="text-xs text-[color:var(--color-muted)]">{tLaw("settingsLinkDesc")}</span>
      </Link>
      <p role="note" className="text-xs text-[color:var(--color-muted)]" data-testid="hr-settings-stub-note">
        {t("stubNote")}
      </p>
      {msg && (
        <p role="alert" className="card p-3 text-sm" data-testid="hr-settings-message">
          {msg}
        </p>
      )}

      <Section title={t("shifts.title")} card>
        {shifts.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">{t("shifts.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="hr-settings-shift-list">
            {shifts.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2" data-testid={`hr-settings-shift-${s.id}`}>
                <span className="text-sm">
                  {s.name} · {hm(s.startMin)}–{hm(s.endMin)}
                  {s.crossesMidnight ? ` (${t("shifts.overnight")})` : ""} · {where(s.unitId)}
                </span>
                {(all || s.unitId) && (
                  <form action={onArchiveShift}>
                    <input type="hidden" name="systemId" value={id} />
                    <input type="hidden" name="id" value={s.id} />
                    <button type="submit" className={ghost} data-testid={`hr-settings-shift-archive-${s.id}`}>
                      {t("shifts.archive")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={onCreateShift} className="flex flex-wrap items-end gap-2" data-testid="hr-settings-shift-form">
          <input type="hidden" name="systemId" value={id} />
          <label className="flex flex-col gap-1 text-xs">
            {t("shifts.name")}
            <input name="name" required maxLength={60} className="input min-h-[44px]" data-testid="hr-settings-shift-name" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("shifts.start")}
            <input name="start" type="time" required className="input min-h-[44px]" data-testid="hr-settings-shift-start" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("shifts.end")}
            <input name="end" type="time" required className="input min-h-[44px]" data-testid="hr-settings-shift-end" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("shifts.break")}
            <input name="breakMin" type="number" min={0} max={720} defaultValue={0} className="input min-h-[44px] w-24" data-testid="hr-settings-shift-break" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("unit")}
            {unitSelect("hr-settings-shift-unit")}
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-xs">
            <input name="crossesMidnight" type="checkbox" data-testid="hr-settings-shift-overnight" />
            {t("shifts.crossesMidnight")}
          </label>
          <button type="submit" className={btn} data-testid="hr-settings-shift-add">
            {t("shifts.add")}
          </button>
        </form>
      </Section>

      <Section title={t("policies.title")} card>
        {policies.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">{t("policies.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="hr-settings-policy-list">
            {policies.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2" data-testid={`hr-settings-policy-${p.id}`}>
                <span className="text-sm">
                  {p.name} · {t(`categories.${p.category}`)} · {p.quotaDays === null ? t("policies.noQuota") : `${p.quotaDays.toString()}`} ·{" "}
                  {p.paid ? t("policies.paid") : t("policies.unpaid")} · {where(p.unitId)}
                  {/* HR H2.7 ▸ กติกาที่ตั้งไว้ ◂ */}
                  {p.minServiceDays > 0 ? ` · ${t("policies.minServiceDays")} ${p.minServiceDays}` : ""}
                  {Number(p.carryMaxDays) > 0 ? ` · ${t("policies.carryMaxDays")} ${p.carryMaxDays.toString()}${p.carryExpiresMonthDay ? ` (${p.carryExpiresMonthDay})` : ""}` : ""}
                  {p.attachmentAfterDays ? ` · ${t("policies.attachmentAfterDays")} ${p.attachmentAfterDays}` : ""}
                  {p.allowHalfDay ? "" : ` · ${t("policies.noHalfDay")}`}
                </span>
                {/* HR H2.12 ▸ F5 คำเตือน (ไม่บล็อก) ◂ */}
                <LeavePolicyWarningLines policies={policies} id={p.id} />
                {(all || p.unitId) && (
                  <form action={onArchivePolicy}>
                    <input type="hidden" name="systemId" value={id} />
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className={ghost} data-testid={`hr-settings-policy-archive-${p.id}`}>
                      {t("policies.archive")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={onCreatePolicy} className="flex flex-wrap items-end gap-2" data-testid="hr-settings-policy-form">
          <input type="hidden" name="systemId" value={id} />
          <label className="flex flex-col gap-1 text-xs">
            {t("policies.name")}
            <input name="name" required maxLength={60} className="input min-h-[44px]" data-testid="hr-settings-policy-name" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("policies.category")}
            <select name="category" className="input min-h-[44px]" defaultValue="PERSONAL" data-testid="hr-settings-policy-category">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`categories.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("policies.quotaDays")}
            <input name="quotaDays" type="number" min={0} max={365} step={0.5} className="input min-h-[44px] w-24" data-testid="hr-settings-policy-quota" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("unit")}
            {unitSelect("hr-settings-policy-unit")}
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("policies.paid")}
            <select name="paid" className="input min-h-[44px]" defaultValue="true" data-testid="hr-settings-policy-paid">
              <option value="true">{t("policies.paid")}</option>
              <option value="false">{t("policies.unpaid")}</option>
            </select>
          </label>
          {/* HR H2.7 ▸ กติกาของประเภทการลา (ไม่มีสวิตช์ลาเป็นชั่วโมง — มติผู้คุม Q1/Q6 · D-H27-hourly) */}
          <label className="flex flex-col gap-1 text-xs">
            {t("policies.minServiceDays")}
            <input name="minServiceDays" type="number" min={0} max={3650} defaultValue={0} className="input min-h-[44px] w-24" data-testid="hr-settings-policy-min-service" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("policies.carryMaxDays")}
            <input name="carryMaxDays" type="number" min={0} max={365} step={0.5} defaultValue={0} className="input min-h-[44px] w-24" data-testid="hr-settings-policy-carry-max" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("policies.carryExpires")}
            <input name="carryExpiresMonthDay" placeholder="03-31" pattern="\d{2}-\d{2}" maxLength={5} className="input min-h-[44px] w-24" data-testid="hr-settings-policy-carry-expires" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("policies.attachmentAfterDays")}
            <input name="attachmentAfterDays" type="number" min={1} max={365} className="input min-h-[44px] w-24" data-testid="hr-settings-policy-attach-after" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("policies.yearStartMonth")}
            <input name="yearStartMonth" type="number" min={1} max={12} defaultValue={1} className="input min-h-[44px] w-20" data-testid="hr-settings-policy-year-start" />
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-xs">
            <input name="allowHalfDay" type="checkbox" value="true" defaultChecked data-testid="hr-settings-policy-half-day" />
            <input type="hidden" name="allowHalfDay" value="false" />
            {t("policies.allowHalfDay")}
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-xs">
            <input name="firstYearProrata" type="checkbox" data-testid="hr-settings-policy-prorata" />
            {t("policies.firstYearProrata")}
          </label>
          {/* ◂ HR H2.7 */}
          <button type="submit" className={btn} data-testid="hr-settings-policy-add">
            {t("policies.add")}
          </button>
        </form>
        {/* HR H2.12 ▸ F1 ประเภทลาตามกฎหมาย (ประเภททั้งร้าน ⇒ เพิ่มได้เฉพาะผู้ดูแลทุกสาขา — เหมือนฟอร์มด้านบนเลือก "ทั้งร้าน") ◂ */}
        <LeavePresetSection systemId={id} policies={policies} onAdd={onAddLeavePreset} canAdd={all} />
      </Section>

      <Section title={`${t("holidays.title")} ${year + 543}`} card>
        <form method="get" className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            {t("holidays.year")}
            <input name="year" type="number" min={2000} max={2999} defaultValue={year} className="input min-h-[44px] w-28" data-testid="hr-settings-holiday-year" />
          </label>
          <button type="submit" className={ghost} data-testid="hr-settings-holiday-year-go">
            {t("holidays.year")}
          </button>
        </form>
        {/* HR H2.8 ▸ ชุดวันหยุดราชการ (ผู้ดูแลทุกสาขา · เฉพาะวันที่ตายตัว 15 วัน — Q14) + บรรทัดบอกว่าวันตามจันทรคติ/ชดเชยต้องเพิ่มเอง */}
        {all && (
          <form action={onApplyPreset} className="flex flex-wrap items-end gap-2" data-testid="hr-holiday-preset-form">
            <input type="hidden" name="systemId" value={id} />
            <input type="hidden" name="year" value={year} />
            <button type="submit" className={btn} data-testid="hr-holiday-preset">
              {t("holidays.presetApply", { year: year + 543 })}
            </button>
          </form>
        )}
        <p role="note" className="text-xs text-[color:var(--color-muted)]" data-testid="hr-holiday-preset-note">
          {t("holidays.presetNote")}
        </p>
        {/* ◂ HR H2.8 */}
        {holidays.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">{t("holidays.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="hr-settings-holiday-list">
            {holidays.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2" data-testid={`hr-settings-holiday-${h.id}`}>
                <span className="text-sm">
                  {formatThaiDate(h.date)} · {h.name} · {t(`kinds.${h.kind}`)}
                  {h.shopOpen ? ` · ${t("holidays.shopOpen")}` : ""} · {where(h.unitId)}
                </span>
                {(all || h.unitId) && (
                  <form action={onDeleteHoliday}>
                    <input type="hidden" name="systemId" value={id} />
                    <input type="hidden" name="id" value={h.id} />
                    <button type="submit" className={ghost} data-testid={`hr-settings-holiday-delete-${h.id}`}>
                      {t("holidays.delete")}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={onAddHoliday} className="flex flex-wrap items-end gap-2" data-testid="hr-settings-holiday-form">
          <input type="hidden" name="systemId" value={id} />
          <label className="flex flex-col gap-1 text-xs">
            {t("holidays.date")}
            <input name="date" type="date" required className="input min-h-[44px]" data-testid="hr-settings-holiday-date" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("holidays.name")}
            <input name="name" required maxLength={60} className="input min-h-[44px]" data-testid="hr-settings-holiday-name" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("holidays.kind")}
            <select name="kind" className="input min-h-[44px]" defaultValue="SHOP" data-testid="hr-settings-holiday-kind">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t("unit")}
            {unitSelect("hr-settings-holiday-unit")}
          </label>
          <button type="submit" className={btn} data-testid="hr-settings-holiday-add">
            {t("holidays.add")}
          </button>
        </form>
      </Section>

      {/* HR H2.4 ▸ R10 จุดลงเวลาด้วยมือถือต่อสาขา + มติ Q1 รอบลงเวลา (ค่าตั้งของร้าน) ◂ */}
      {clockOk && clockPolicy && (
        <Section title={t("clock.title")} card>
          <p className="text-xs text-[color:var(--color-muted)]">{t("clock.desc")}</p>
          {all && (
            <form action={onSaveClockPolicy} className="flex flex-wrap items-end gap-2" data-testid="hr-settings-clock-policy">
              <input type="hidden" name="systemId" value={id} />
              <label className="flex flex-col gap-1 text-xs">
                {t("clock.earlyInMin")}
                <input name="earlyInMin" type="number" min={0} max={240} step={1} defaultValue={clockPolicy.earlyInMin} className="input min-h-[44px] w-28" data-testid="hr-settings-clock-early" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                {t("clock.closeGraceMin")}
                <input name="closeGraceMin" type="number" min={30} max={720} step={1} defaultValue={clockPolicy.closeGraceMin} className="input min-h-[44px] w-28" data-testid="hr-settings-clock-grace" />
              </label>
              <button type="submit" className={btn} data-testid="hr-settings-clock-policy-save">
                {t("clock.savePolicy")}
              </button>
            </form>
          )}
          {/* HR H2.5 ▸ R12 การตัดสินผล/การเตือน (ทั้งร้าน — ผู้ดูแลทุกสาขาเท่านั้น · เวลาผ่อนผันสายมาจากแต่ละกะ Q10) ◂ */}
          {all && attPolicy && (
            <form action={onSaveAttendancePolicy} className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--color-line)" }} data-testid="hr-settings-attendance-policy">
              <input type="hidden" name="systemId" value={id} />
              <h3 className="text-sm font-medium">{t("attendance.title")}</h3>
              <p className="text-xs text-[color:var(--color-muted)]">{t("attendance.desc")}</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  {t("attendance.notInAlertMin")}
                  <input name="notInAlertMin" type="number" min={0} max={240} step={1} defaultValue={attPolicy.notInAlertMin} className="input min-h-[44px] w-28" />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  {t("attendance.absentAfterMin")}
                  <input name="absentAfterMin" type="number" min={30} max={720} step={1} defaultValue={attPolicy.absentAfterMin ?? ""} className="input min-h-[44px] w-28" />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  {t("attendance.earlyOutGraceMin")}
                  <input name="earlyOutGraceMin" type="number" min={0} max={60} step={1} defaultValue={attPolicy.earlyOutGraceMin} className="input min-h-[44px] w-28" />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  {t("attendance.otStepMin")}
                  <select name="otStepMin" defaultValue={String(attPolicy.otStepMin)} className="input min-h-[44px] w-28">
                    {[1, 5, 10, 15, 30].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {(["flagEarlyOut", "alertsOn", "alertEmployee"] as const).map((k) => (
                  <label key={k} className="flex min-h-[44px] items-center gap-2 text-xs">
                    <input name={k} type="checkbox" defaultChecked={attPolicy[k]} />
                    {t(`attendance.${k}`)}
                  </label>
                ))}
              </div>
              <button type="submit" className={`${btn} self-start`} data-testid="hr-settings-attendance-save">
                {t("attendance.save")}
              </button>
            </form>
          )}
          <h3 className="text-sm font-medium">{t("clock.sitesTitle")}</h3>
          <ul className="flex flex-col gap-3">
            {[...(all ? [{ id: "all", name: t("shopWide") }] : []), ...units].map((u) => {
              const key = u.id;
              const cur = siteOf.get(key);
              return (
                <li key={key} className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--color-line)" }} data-testid={`hr-clock-site-${key}`}>
                  <span className="text-sm font-medium">
                    {u.name} · {cur?.mobileEnabled ? t("clock.on") : t("clock.off")}
                    {cur?.noticeAcceptedAt ? ` · ${t("clock.noticeAccepted")}` : ""}
                  </span>
                  <form action={onSaveClockSite} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="systemId" value={id} />
                    <input type="hidden" name="unitId" value={key === "all" ? "" : key} />
                    <label className="flex min-h-[44px] items-center gap-2 text-xs">
                      <input name="mobileEnabled" type="checkbox" defaultChecked={cur?.mobileEnabled ?? false} data-testid={`hr-clock-site-${key}-enabled`} />
                      {t("clock.mobileEnabled")}
                    </label>
                    <label className="flex min-h-[44px] items-center gap-2 text-xs">
                      <input name="gpsRequired" type="checkbox" defaultChecked={cur?.gpsRequired ?? true} data-testid={`hr-clock-site-${key}-gps`} />
                      {t("clock.gpsRequired")}
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {t("clock.centerLat")}
                      <input name="centerLat" inputMode="decimal" defaultValue={cur?.centerLat ?? ""} className="input min-h-[44px] w-32" data-testid={`hr-clock-site-${key}-center-latitude`} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {t("clock.centerLng")}
                      <input name="centerLng" inputMode="decimal" defaultValue={cur?.centerLng ?? ""} className="input min-h-[44px] w-32" data-testid={`hr-clock-site-${key}-center-longitude`} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {t("clock.radiusM")}
                      <input name="radiusM" type="number" min={30} max={2000} defaultValue={cur?.radiusM ?? 150} className="input min-h-[44px] w-24" data-testid={`hr-clock-site-${key}-radius`} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {t("clock.minAccuracyM")}
                      <input name="minAccuracyM" type="number" min={10} max={500} defaultValue={cur?.minAccuracyM ?? 100} className="input min-h-[44px] w-24" data-testid={`hr-clock-site-${key}-accuracy`} />
                    </label>
                    {!cur?.noticeAcceptedAt && (
                      <label className="flex min-h-[44px] items-center gap-2 text-xs">
                        <input name="acceptPdpaNotice" type="checkbox" data-testid={`hr-clock-site-${key}-notice`} />
                        {t("clock.acceptPdpaNotice")}
                      </label>
                    )}
                    <button type="submit" className={btn} data-testid={`hr-clock-site-${key}-save`}>
                      {t("clock.saveSite")}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {/* HR H2.9 ▸ R14 นโยบายคำขอ OT (ทั้งร้าน — ผู้ดูแลทุกสาขาเท่านั้น) · อัตราตามตารางกฎหมาย (หน้า law) ◂ */}
      {all && (
        <Section title={tOt("policyTitle")} card>
          <form action={onSaveOtPolicy} className="flex flex-col gap-2" data-testid="hr-settings-ot-policy">
            <input type="hidden" name="systemId" value={id} />
            <p className="text-xs text-[color:var(--color-muted)]">{tOt("policyDesc")}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                {tOt("afterHours")}
                <input name="afterHours" type="number" min={0} max={72} step={1} defaultValue={otPolicy.afterHours} className="input min-h-[44px] w-28" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                {tOt("maxAheadDays")}
                <input name="maxAheadDays" type="number" min={1} max={90} step={1} defaultValue={otPolicy.maxAheadDays} className="input min-h-[44px] w-28" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                {tOt("otRoundMin")}
                <select name="otRoundMin" defaultValue={String(otPolicy.otRoundMin)} className="input min-h-[44px] w-28">
                  {[1, 15, 30].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className={`${btn} self-start`} data-testid="hr-settings-ot-policy-save">
              {tOt("policySave")}
            </button>
          </form>
        </Section>
      )}
      {/* HR H4.4 ▸ ค่าตั้งวงจรพนักงาน — ผู้ดูข้อมูลบันทึก (OWNER/คีย์ตรง) เท่านั้น · ผลการกด ?life= (allowlist) ◂ */}
      <LifecycleMsg code={typeof sp.life === "string" ? sp.life : undefined} />
      <LifecycleSettings systemId={id} />
      {/* HR H3.1 ▸ ชั่วโมงทำงานปกติต่อวัน — ทุกผู้ตั้งค่าเห็น · แก้ได้เฉพาะเจ้าของร้าน ◂ */}
      <WorkSettingsCard systemId={id} onSave={auth.active.role === "OWNER" ? onSaveNormalMinutes : null} />
      {/* HR H3.2 ▸ กฎหักสาย/ขาด — ทุกผู้ตั้งค่าเห็น (ข้อความ ม.76 เสมอ) · แก้ได้เฉพาะเจ้าของร้าน ◂ */}
      <AttendancePayPolicyCard systemId={id} onSave={auth.active.role === "OWNER" ? onSaveAttPay : null} />
      {/* HR H3.4 ▸ รุ่นเครื่องคิดเงินเดือน + เพดานหัก ม.76 + ช่วงที่กฎหักสาย/ขาดมีผล — แก้ได้เฉพาะเจ้าของร้าน ◂ */}
      <PayrollEngineCard systemId={id} flash={run2Flash} flashOk={run2Ok} onSave={auth.active.role === "OWNER" ? onSaveEngine : null} />
      {/* HR H3.7 ▸ ลงบัญชีเงินเดือน — สมุดบัญชี 1 เล่ม + บัญชีจ่ายตั้งต้น + หมายเหตุเงินเบิกล่วงหน้า · แก้ได้เฉพาะเจ้าของร้าน ◂ */}
      <PayrollAccountingCard systemId={id} code={typeof (sp as Record<string, unknown>).pacct === "string" ? String((sp as Record<string, unknown>).pacct) : ""} onSaveBook={auth.active.role === "OWNER" ? onSavePayBook : null} onSavePayAccount={auth.active.role === "OWNER" ? onSavePayAccount : null} onSavePosting={auth.active.role === "OWNER" ? onSavePosting : null} />
      {/* HR H3.5 ▸ ไฟล์โอนเงินเดือน — การ์ดแสดงเฉพาะผู้ผ่านด่านไฟล์โอน · บัญชีต้นทาง/เปิดรูปแบบธนาคาร = เจ้าของร้าน ◂ */}
      <BankSettingsCard systemId={id} onSaveProfile={auth.active.role === "OWNER" ? onSaveBankProfile : null} onSavePreset={onSaveBankPreset} onDeletePreset={onDeleteBankPreset} />
    </div>
  );
}
