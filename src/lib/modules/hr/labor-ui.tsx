// HR H4.2 ▸ ส่วนจอ (server) ของค่าแรงต่อยอดขาย — การ์ดบนภาพรวมทีม (ภาพ 01) + การ์ดค่าตั้งบนหน้าตั้งค่า
//   รับ DTO จาก labor.ts เท่านั้น (ไม่อ่านฐานข้อมูลเอง) · ผู้ที่ไม่ใช่ผู้ดูเงิน = ไม่มีการ์ด (P5) · ช่องที่ซ่อน (P2) = "—" ไม่มีค่าใบ้ ·
//   ป้ายยอดขาย = "ยอดขายสุทธิตามรายงาน POS" (มติ Q2) · ปุ่ม/ช่องกรอกสูง ≥ 44 px · token เท่านั้น · ส่วนของหน้า 03 อยู่ใน roster-ui (client) ◂
import { getLocale, getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { thaiDateKey } from "@/lib/ui/date";
import { hrViewerOf } from "./privacy";
import { getLaborSettings, laborDay, laborMonth, type LaborDayDto, type LaborMonthDto } from "./labor";
import { LABOR_BOUNDS } from "./labor-rules";

const muted = "text-[color:var(--color-muted)]";
const card = "card flex flex-col gap-4 p-4 sm:p-5";
/** ฿ จำนวนเต็มบาท มีตัวคั่น (ไม่ใช้ Intl — ผลเหมือนกันทุกเครื่อง) */
export const laborBaht = (s: number) => `${s < 0 ? "−" : ""}฿${String(Math.round(Math.abs(s) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
/** ‰ (ทศนิยม 1 ตำแหน่งของ %) → "24.8%" */
export const laborPct = (t: number) => `${Math.floor(t / 10)}.${t % 10}%`;
const dash = "—";
const bkkHm = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(11, 16);

/** การ์ด "ค่าแรงต่อยอดขาย วันนี้" + สรุปเดือน (ภาพ 01) — วางใน HrTeamOverviewSection ผ่าน slot `labor` */
export async function HrLaborCard({ systemId }: { systemId: string }) {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  const locale = await getLocale();
  const now = new Date();
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const today = thaiDateKey(now);
  const day = await laborDay(ctx, viewer, { day: today }, { now, locale });
  if (!day.ok || !day.money) return null;
  const month = await laborMonth(ctx, viewer, { periodKey: today.slice(0, 7) }, { now, locale });
  const t = await getTranslations("hr.labor");
  return <LaborCardView day={day} month={month.ok ? month : null} t={(k, v) => t(k, v)} locale={locale} nowHm={bkkHm(now)} today={today} />;
}

type T = (key: string, values?: Record<string, string | number>) => string;
function LaborCardView({ day, month, t, locale, nowHm, today }: { day: LaborDayDto; month: LaborMonthDto | null; t: T; locale: string; nowHm: string; today: string }) {
  const m = day.money!;
  const nowHour = Number(nowHm.slice(0, 2));
  const hours = m.hours.filter((h) => (h.costSatang ?? 0) !== 0 || (h.salesSatang ?? 0) !== 0 || (h.forecastSatang ?? 0) !== 0);
  const top = Math.max(1, ...hours.map((h) => Math.max(h.costSatang ?? 0, h.salesSatang ?? 0, h.forecastSatang ?? 0)));
  const hgt = (v: number | null) => `${Math.max(0, Math.round(((v ?? 0) / top) * 100))}%`;
  const over = m.pctTenths !== null && m.pctTenths > m.targetTenths;
  const meterMax = Math.max(400, m.targetTenths + 100);
  const notes = [t("estimateNote"), ...(m.partial ? [t("smallGroup", { n: m.excludedHeadcount })] : []), ...(day.sales === "NO_POS" ? [t("noPos")] : []), ...(day.sales === "NO_PERMISSION" ? [t("noPermission")] : [])];
  // R4 (review): ตัวเลขที่ถูกตัดเพดานแถว = เตือน ไม่แสดงเหมือนครบ
  const truncated = day.flags.truncated || !!month?.truncated;
  // R3 (review): เดือนนี้ยังไม่มีวันที่จบ (วันที่ 1) ⇒ ไม่มี %
  const noDay = !!month && month.basis === "ESTIMATE" && month.periodKey === today.slice(0, 7) && month.throughDay === null;
  const monthName = (pk: string) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "th-TH", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${pk}-01T00:00:00Z`));
  return (
    <section data-testid="hr-labor-card" aria-labelledby="labor-card-title" className={card}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="labor-card-title" className="text-base font-semibold">
          {t("title")}
        </h2>
        <span className="flex-1" />
        <div className={`flex flex-wrap gap-3 text-xs ${muted}`} aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-3.5 rounded-sm bg-[color:var(--color-ink)]" />
            {t("legendCost")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-3.5 rounded-sm bg-[color:var(--color-line)]" />
            {t("legendSales")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-3.5 rounded-sm bg-[color:var(--color-accent)]" />
            {t("legendNow")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-3.5 rounded-sm border-[1.5px] border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface)]" />
            {t("legendForecast")}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-3 lg:w-[250px] lg:flex-none">
          <div data-testid="hr-labor-pct" className="flex items-end gap-3">
            <span className={`text-4xl font-semibold tabular-nums ${over ? "text-[color:var(--color-danger)]" : ""}`}>{m.pctTenths === null ? dash : laborPct(m.pctTenths)}</span>
            <span className={`pb-1 text-sm ${muted}`}>{t("target", { pct: laborPct(m.targetTenths) })}</span>
          </div>
          <div className="relative h-2 rounded-full bg-[color:var(--color-surface-2)]" aria-hidden="true">
            <i className={`absolute inset-y-0 left-0 block rounded-full ${over ? "bg-[color:var(--color-danger)]" : "bg-[color:var(--color-ink)]"}`} style={{ width: `${Math.min(100, Math.round(((m.pctTenths ?? 0) / meterMax) * 100))}%` }} />
            <em className="absolute -top-1 block h-4 w-0.5 bg-[color:var(--color-accent)]" style={{ left: `${Math.round((m.targetTenths / meterMax) * 100)}%` }} />
          </div>
          <dl className="flex flex-col gap-1.5 text-sm">
            <div data-testid="hr-labor-cost" className="flex items-baseline justify-between gap-3">
              <dt className={muted}>{t("costToday")}</dt>
              <dd className="font-semibold tabular-nums">{m.costSatang === null ? dash : laborBaht(m.costSatang)}</dd>
            </div>
            <div data-testid="hr-labor-forecast" className="flex items-baseline justify-between gap-3">
              <dt className={muted}>{t("salesForecast")}</dt>
              <dd className="font-semibold tabular-nums">{m.salesSatang === null ? dash : laborBaht(m.salesSatang)}</dd>
            </div>
            {m.soFarSatang !== null && (
              <div data-testid="hr-labor-sofar" className="flex items-baseline justify-between gap-3">
                <dt className={muted}>{t("soFar", { time: nowHm })}</dt>
                <dd className="font-semibold tabular-nums">{laborBaht(m.soFarSatang)}</dd>
              </div>
            )}
          </dl>
          <p className={`text-xs ${muted}`}>{t("salesBasis")}</p>
        </div>
        <figure data-testid="hr-labor-hours" aria-label={t("hoursLabel")} className="min-w-0 flex-1">
          <div className="overflow-x-auto pb-1">
            <div className="flex h-[170px] min-w-[320px] items-end gap-1.5 border-b border-[color:var(--color-line)]">
              {hours.map((h) => {
                const past = h.hour < nowHour;
                const cur = h.hour === nowHour;
                const sales = past || cur ? h.salesSatang : h.forecastSatang;
                return (
                  <div key={h.hour} className="flex h-full min-w-[14px] flex-1 items-end gap-0.5" title={`${h.label}:00`}>
                    <i
                      className={`block flex-1 rounded-t-sm ${cur ? "bg-[color:var(--color-accent)]" : past ? "bg-[color:var(--color-line)]" : "border-[1.5px] border-b-0 border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface)]"}`}
                      style={{ height: hgt(sales) }}
                    />
                    <i className="block flex-1 rounded-t-sm bg-[color:var(--color-ink)]" style={{ height: hgt(h.costSatang) }} />
                  </div>
                );
              })}
            </div>
            <div className="flex min-w-[320px] gap-1.5 pt-1.5">
              {hours.map((h) => (
                <span key={h.hour} className={`min-w-[14px] flex-1 text-center text-[11px] tabular-nums ${h.hour === nowHour ? "font-bold text-[color:var(--color-accent)]" : muted}`}>
                  {h.label}
                </span>
              ))}
            </div>
          </div>
          <table className="sr-only">
            <caption>{t("hoursLabel")}</caption>
            <tbody>
              {hours.map((h) => (
                <tr key={h.hour}>
                  <th scope="row">{h.label}</th>
                  <td>{h.costSatang === null ? dash : laborBaht(h.costSatang)}</td>
                  <td>{h.salesSatang === null ? dash : laborBaht(h.salesSatang)}</td>
                  <td>{h.forecastSatang === null ? dash : laborBaht(h.forecastSatang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      </div>
      {m.shifts.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {m.shifts.map((s, i) => (
            <div key={s.shiftId} data-testid={`hr-labor-shift-${i}`} className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{s.label}</span>
              <b className={`tabular-nums ${s.pctTenths !== null && s.pctTenths > m.targetTenths ? "text-[color:var(--color-danger)]" : ""}`}>{s.pctTenths === null ? dash : laborPct(s.pctTenths)}</b>
            </div>
          ))}
        </div>
      )}
      {month && (
        <div data-testid="hr-labor-month" className="flex flex-col gap-1 rounded-xl bg-[color:var(--color-surface-2)] px-4 py-3">
          <span className={`text-xs ${muted}`}>
            {month.basis === "ACTUAL" ? t("monthActual", { month: monthName(month.periodKey) }) : month.throughDay ? t("monthToDate", { month: monthName(month.periodKey), day: month.throughDay }) : t("monthEstimate", { month: monthName(month.periodKey) })}
          </span>
          <span className="text-2xl font-semibold tabular-nums">{noDay || month.costSatang === null ? dash : laborBaht(month.costSatang)}</span>
          <span className={`text-xs ${muted}`}>
            {noDay ? t("noCompleteDay") : t("monthPct", {
              pct: month.pctTenths === null ? dash : laborPct(month.pctTenths),
              prev: monthName(month.prev.periodKey),
              prevPct: month.prev.pctTenths === null ? dash : laborPct(month.prev.pctTenths),
            })}
          </span>
        </div>
      )}
      {truncated && (
        <p role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
          {t("truncated")}
        </p>
      )}
      <div data-testid="hr-labor-note" role="note" className={`flex flex-col gap-1 text-xs ${muted}`}>
        {notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </div>
    </section>
  );
}

/** การ์ดค่าตั้งค่าแรงต่อยอดขาย (หน้าตั้งค่า) — ผู้ตั้งค่า HR ทุกสาขาแก้ได้ · ผู้อ่านอื่นเห็นค่าอย่างเดียว · ผลการกด = ?msg= (allowlist ของหน้า) */
export async function LaborSettingsCard({ systemId, onSave }: { systemId: string; onSave: ((fd: FormData) => Promise<void>) | null }) {
  const auth = await requireTenant();
  const locale = await getLocale();
  const r = await getLaborSettings({ tenantId: auth.active.tenantId, systemId }, hrViewerOf(auth), { locale });
  if (!r.ok) return null;
  const t = await getTranslations("hr.labor");
  const s = r.settings;
  const edit = r.canEdit && !!onSave;
  const [tLo, tHi] = LABOR_BOUNDS.targetTenths;
  const [sLo, sHi] = LABOR_BOUNDS.splhSatang;
  const [mLo, mHi] = LABOR_BOUNDS.minStaff;
  return (
    <section data-testid="hr-labor-settings" aria-labelledby="labor-settings-title" className={card}>
      <h2 id="labor-settings-title" className="text-lg font-semibold">
        {t("settingsTitle")}
      </h2>
      <p className={`text-sm ${muted}`}>{t("settingsDesc")}</p>
      {edit ? (
        <form action={onSave!} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="systemId" value={systemId} />
          <label className="flex flex-col gap-1 text-sm">
            {t("targetLabel")}
            <input name="targetPct" type="number" inputMode="decimal" min={tLo / 10} max={tHi / 10} step={0.1} defaultValue={(s.targetTenths / 10).toFixed(1)} className="input min-h-[44px] w-32" required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("splhLabel")}
            <input name="splhBaht" type="number" inputMode="numeric" min={sLo / 100} max={sHi / 100} step={1} defaultValue={s.splhSatang === null ? "" : String(s.splhSatang / 100)} className="input min-h-[44px] w-40" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("minStaffLabel")}
            <input name="minStaff" type="number" inputMode="numeric" min={mLo} max={mHi} step={1} defaultValue={s.minStaff} className="input min-h-[44px] w-28" required />
          </label>
          <button type="submit" data-testid="hr-labor-save" className="btn btn-primary min-h-[44px] text-sm">
            {t("save")}
          </button>
        </form>
      ) : (
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className={muted}>{t("targetLabel")}</dt>
            <dd className="font-semibold tabular-nums">{laborPct(s.targetTenths)}</dd>
          </div>
          <div>
            <dt className={muted}>{t("splhLabel")}</dt>
            <dd className="font-semibold tabular-nums">{s.splhSatang === null ? dash : laborBaht(s.splhSatang)}</dd>
          </div>
          <div>
            <dt className={muted}>{t("minStaffLabel")}</dt>
            <dd className="font-semibold tabular-nums">{s.minStaff}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
// ◂ HR H4.2
