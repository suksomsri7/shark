// HR H3.9 ▸ หน้าจอรายงาน HR + การ์ดทะเบียนลูกจ้างบนหน้าพนักงาน — server component ล้วน (ไม่มี "use client")
//   รับ DTO จาก reports.ts เท่านั้น (ค่าเซลล์เดียวกับไฟล์ · เลขประจำตัวแบบ •••4 ตัวท้าย) · เงินแสดงเป็น ฿ มีตัวคั่นจากข้อความของ DTO ·
//   ตัวเลือกรายงาน = เฉพาะที่ผู้ดูเปิดได้ (reportAccessOf) · ปุ่มไฟล์ = ลิงก์ไป route ส่งออก (ด่านซ้ำใน service) ·
//   ตั้งค่าเลขประจำตัวเต็มในไฟล์ทะเบียน = เจ้าของร้านเท่านั้น (คำเตือน + ติ๊กรับทราบ · มติ Q2) · ปุ่ม/ช่อง ≥ 44 px · token สีเท่านั้น ◂
import { getLocale, getTranslations } from "next-intl/server";
import { REPORT_CATALOG, reportTextFor, type ReportId } from "./reports-rules";
import { getReportSettings, loadRegisterFields, type ReportDto, type ReportViewer } from "./reports";
import { canManageHrSettings } from "./settings";
import { saveRegisterFieldsAction, saveReportSettingsAction } from "./reports-actions";

const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const muted = "text-sm text-[color:var(--color-muted)]";
const input = "min-h-[44px] rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm";
const label = "flex flex-col gap-1 text-sm";
const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost inline-flex min-h-[44px] items-center text-sm";
const chip = "inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-[color:var(--color-line)] px-3 text-sm";
const chipOn = "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]";
const check = "inline-flex min-h-[44px] items-center gap-2 text-sm";

/** "-1234.50" → "-฿1,234.50" (จัดรูปที่หน้าจอเท่านั้น — ค่าในไฟล์ไม่มีตัวคั่น) */
function bahtShown(s: string): string {
  const m = /^(-?)(\d+)\.(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[1]}฿${m[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${m[3]}`;
}

export type ReportPageProps = {
  systemId: string;
  viewer: ReportViewer;
  allowed: ReportId[];
  report: ReportId;
  period: string;
  unitId: string | null;
  units: { id: string; name: string }[];
  dto: ReportDto | { ok: false; code: string; reason: string };
  flash?: string;
};

/** หน้า /hr/reports — ตัวเลือก · ช่วงเวลา · สาขา · ตาราง · รวม · ปุ่มไฟล์ · หมายเหตุ · คำเตือน (+ ตั้งค่าเลขเต็มของเจ้าของ) */
export async function HrReportsSection(p: ReportPageProps) {
  const t = await getTranslations("hr.report");
  const locale = await getLocale();
  const tx = reportTextFor(locale);
  const base = `/app/sys/${p.systemId}/hr/reports`;
  const def = REPORT_CATALOG[p.report];
  const q = (o: Record<string, string | null>) =>
    Object.entries(o)
      .filter(([, v]) => !!v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
  const exportHref = (fmt: "csv" | "xlsx") => `${base}/export?${q({ report: p.report, period: p.period, format: fmt, unit: p.unitId })}`;
  const dto = p.dto.ok ? p.dto : null;
  const cls = new Map(def.columns.map((c) => [c.key, c.cls] as const));
  const shown = (key: string, v: string) => (cls.get(key) === "$" ? bahtShown(v) : v);
  return (
    <div className="flex flex-col gap-4">
      {p.flash && (
        <p role="status" className="rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm">
          {p.flash}
        </p>
      )}
      <nav data-testid="hr-report-picker" aria-label={t("picker")} className="flex gap-2 overflow-x-auto pb-1">
        {p.allowed.map((r) => (
          <a key={r} href={`${base}?${q({ report: r, unit: p.unitId })}`} data-testid={`hr-report-pick-${r}`} className={`${chip} ${r === p.report ? chipOn : ""}`} aria-current={r === p.report ? "page" : undefined}>
            {tx[`title.${r}` as keyof typeof tx]}
          </a>
        ))}
      </nav>

      <form method="get" action={base} className={`${card} sm:flex-row sm:flex-wrap sm:items-end`}>
        <input type="hidden" name="report" value={p.report} />
        <label className={label}>
          <span className={muted}>{t("period")}</span>
          {def.period === "month" ? (
            <input type="month" name="period" defaultValue={p.period} data-testid="hr-report-period" className={input} required />
          ) : def.period === "year" ? (
            <input type="number" name="period" min={2000} max={2600} defaultValue={p.period} data-testid="hr-report-period" className={input} required />
          ) : (
            <input type="date" name="period" defaultValue={p.period} data-testid="hr-report-period" className={input} required />
          )}
        </label>
        <label className={label}>
          <span className={muted}>{t("unit")}</span>
          <select name="unit" defaultValue={p.unitId ?? ""} data-testid="hr-report-unit" className={input}>
            <option value="">{t("allUnits")}</option>
            {p.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" data-testid="hr-report-show" className={btn}>
          {t("show")}
        </button>
      </form>

      <section className={card} aria-labelledby="hrrep-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="hrrep-title" className="text-base font-semibold">
            {tx[`title.${p.report}` as keyof typeof tx]} · {p.period}
          </h2>
          {dto && (
            <div className="flex flex-wrap gap-2">
              <a href={exportHref("csv")} data-testid="hr-report-export-csv" className={ghost} rel="nofollow">
                {t("exportCsv")}
              </a>
              <a href={exportHref("xlsx")} data-testid="hr-report-export-xlsx" className={ghost} rel="nofollow">
                {t("exportXlsx")}
              </a>
            </div>
          )}
        </div>
        {!dto && (
          <p role="alert" className="text-sm text-[color:var(--color-danger)]">
            {p.dto.ok ? "" : p.dto.reason}
          </p>
        )}
        {dto && dto.rows.length === 0 && (
          <p data-testid="hr-report-empty" className={muted}>
            {t("empty")}
          </p>
        )}
        {dto && dto.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table data-testid="hr-report-table" className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr>
                  {dto.columns.map((c, i) => (
                    <th key={c.key} scope="col" className={`border-b border-[color:var(--color-line)] px-2 py-2 text-left font-medium ${i === 1 ? "sticky left-0 bg-[color:var(--color-surface)]" : ""}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dto.rows.map((r, ri) => (
                  <tr key={`${r.employeeId}-${ri}`} data-testid={`hr-report-row-${r.employeeId}`} className="border-b border-[color:var(--color-line)]">
                    {dto.columns.map((c, i) => (
                      <td key={c.key} className={`px-2 py-2 ${i === 1 ? "sticky left-0 bg-[color:var(--color-surface)]" : ""} ${i > 2 ? "tabular-nums" : ""}`}>
                        {shown(c.key, r.values[c.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {dto.totals && (
                <tfoot>
                  <tr data-testid="hr-report-totals" className="font-semibold">
                    {dto.columns.map((c, i) => (
                      <td key={c.key} className={`px-2 py-2 tabular-nums ${i === 1 ? "sticky left-0 bg-[color:var(--color-surface)]" : ""}`}>
                        {i === 0 ? tx.total : shown(c.key, dto.totals?.[c.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {dto && dto.warnings.length > 0 && (
          <div data-testid="hr-report-warnings" role="note" className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("warnings")}</span>
            <ul className="flex flex-wrap gap-2">
              {dto.warnings.map((w) => {
                const col = def.columns.find((c) => c.key === w.field);
                return (
                  <li key={w.field} className="inline-flex min-h-[28px] items-center rounded-full border border-[color:var(--color-danger)] px-2.5 text-xs text-[color:var(--color-danger)]">
                    {(locale === "en" && !def.thaiOnly ? col?.en : col?.th) ?? w.field} · {w.count}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {dto && dto.notes.length > 0 && (
          <ul data-testid="hr-report-notes" className={`flex list-disc flex-col gap-1 pl-5 ${muted}`}>
            {dto.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** ตั้งค่าเลขประจำตัวเต็มในไฟล์ทะเบียน — แสดงเฉพาะเจ้าของร้าน (ค่าปริยายปิด · เปิดต้องติ๊กรับทราบ) */
export async function HrReportFullIdCard({ systemId, tenantId, viewer }: { systemId: string; tenantId: string; viewer: ReportViewer }) {
  if (viewer.role !== "OWNER") return null;
  const s = await getReportSettings({ tenantId, systemId }, viewer, { locale: await getLocale() });
  if (!s.ok) return null;
  const t = await getTranslations("hr.report");
  const tx = reportTextFor(await getLocale());
  return (
    <form action={saveReportSettingsAction} className={card} id="hrrep-fullid">
      <input type="hidden" name="systemId" value={systemId} />
      <h2 className="text-base font-semibold">{t("fullIdTitle")}</h2>
      <p data-testid="hr-report-fullid-warning" role="note" className="text-sm text-[color:var(--color-danger)]">
        {s.warning}
      </p>
      <label className={check}>
        <input type="checkbox" name="registerFullId" value="1" defaultChecked={s.registerFullId} data-testid="hr-report-fullid-toggle" className="h-5 w-5" />
        {tx.fullIdLabel}
      </label>
      <label className={check}>
        <input type="checkbox" name="acknowledge" value="1" data-testid="hr-report-fullid-ack" className="h-5 w-5" />
        {t("fullIdAck")}
      </label>
      <div>
        <button type="submit" data-testid="hr-report-fullid-save" className={btn}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}

/** การ์ดทะเบียนลูกจ้างบนหน้าพนักงาน (ม.113 (3) สัญชาติ · (8) ประโยชน์ตอบแทนอย่างอื่น — ช่องหลังเฉพาะผู้ดูเงินเดือน) */
export async function HrRegisterCard({ systemId, tenantId, employeeId, viewer, flash }: { systemId: string; tenantId: string; employeeId: string; viewer: ReportViewer; flash?: string | null }) {
  const r = await loadRegisterFields({ tenantId, systemId }, viewer, { employeeId }, { locale: await getLocale() });
  if (!r.ok) return null;
  const t = await getTranslations("hr.report");
  const canEdit = canManageHrSettings({ role: viewer.role as "OWNER", unitAccess: viewer.unitAccess, permissions: (viewer.permissions ?? {}) as Record<string, unknown> });
  const hasBenefits = "otherBenefits" in r;
  return (
    <section data-testid="hr-register-card" id="hr-register" className={card}>
      <h2 className="text-base font-semibold">{t("registerCard")}</h2>
      <p className={muted}>{t("registerHint")}</p>
      {flash && (
        <p role="status" className="text-sm">
          {flash}
        </p>
      )}
      <form action={saveRegisterFieldsAction} className="flex flex-col gap-3">
        <input type="hidden" name="systemId" value={systemId} />
        <input type="hidden" name="employeeId" value={employeeId} />
        <label className={label}>
          <span className={muted}>{t("nationality")}</span>
          <input name="nationality" maxLength={60} defaultValue={r.nationality ?? ""} disabled={!canEdit} data-testid="hr-register-nationality" className={input} />
        </label>
        {hasBenefits && (
          <label className={label}>
            <span className={muted}>{t("benefits")}</span>
            <textarea name="otherBenefits" maxLength={500} rows={3} defaultValue={r.otherBenefits ?? ""} disabled={!canEdit} data-testid="hr-register-benefits" className={`${input} py-2`} />
          </label>
        )}
        {canEdit && (
          <div>
            <button type="submit" data-testid="hr-register-save" className={btn}>
              {t("save")}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
// ◂ HR H3.9
