import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { thaiDateKey } from "@/lib/ui/date";
import { hrTabs } from "@/lib/modules/hr/ui";
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
} from "@/lib/modules/hr/settings-actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { ModuleTabs } from "@/components/module-tabs";

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
};
const MSG_CODE_OF = new Map(Object.entries(MSG_TEXTS).map(([k, v]) => [v, k]));
/** กลับหน้าเดิมพร้อมรหัสผลการกด (redirect โยนเพื่อจบ action) */
function back(path: string, year: number, r: { ok: true; id: string } | { ok: false; reason: string }): never {
  const code = r.ok ? "ok" : (MSG_CODE_OF.get(r.reason) ?? "s.failed");
  redirect(`${path}?year=${year}&msg=${encodeURIComponent(code)}`);
}

export default async function HrSettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string; msg?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const viewer = hrViewerOf(auth);
  if (!canManageHrSettings(viewer)) notFound();
  const scope = hrScopeOf(viewer);
  const t = await getTranslations("hr.settings");
  const def = systemDef(sys.type);
  const ctx = { tenantId: auth.active.tenantId, systemId: id };
  const thisYear = Number(thaiDateKey(new Date()).slice(0, 4));
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : thisYear;
  const [shifts, policies, holidays, units] = await Promise.all([listShifts(ctx, { scope }), listLeavePolicies(ctx, { scope }), listHolidays(ctx, { year, scope }), unitsForScope(ctx.tenantId, scope)]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const all = isAllBranches(scope);
  const where = (u: string | null) => (u ? (unitName.get(u) ?? t("unit")) : t("shopWide"));
  const path = `/app/sys/${id}/hr/settings`;
  const code = typeof sp.msg === "string" ? sp.msg : "";
  const msg = code === "ok" ? t("saved") : Object.prototype.hasOwnProperty.call(MSG_TEXTS, code) ? MSG_TEXTS[code]! : ""; // HR H1.2 R13 ▸ allowlist ◂

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
      <ModuleTabs items={hrTabs(id)} />
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
                </span>
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
          <button type="submit" className={btn} data-testid="hr-settings-policy-add">
            {t("policies.add")}
          </button>
        </form>
      </Section>

      <Section title={`${t("holidays.title")} ${year}`} card>
        <form method="get" className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            {t("holidays.year")}
            <input name="year" type="number" min={2000} max={2999} defaultValue={year} className="input min-h-[44px] w-28" data-testid="hr-settings-holiday-year" />
          </label>
          <button type="submit" className={ghost} data-testid="hr-settings-holiday-year-go">
            {t("holidays.year")}
          </button>
        </form>
        {holidays.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">{t("holidays.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="hr-settings-holiday-list">
            {holidays.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2" data-testid={`hr-settings-holiday-${h.id}`}>
                <span className="text-sm">
                  {h.date.toISOString().slice(0, 10)} · {h.name} · {t(`kinds.${h.kind}`)}
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
    </div>
  );
}
