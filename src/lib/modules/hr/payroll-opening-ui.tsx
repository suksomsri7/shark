// HR H3.4-YTD ▸ การ์ด "ยอดยกมาต้นปี (ก่อนใช้ระบบ)" บนหน้าเงินเดือน (brief §4) — server component ล้วน (ไม่มี "use client")
//   แสดงเฉพาะผู้ผ่านด่านแบบยื่น (listOpeningYtd ตัดสิน — อื่น ๆ ไม่แสดงอะไรเลย) · ข้อมูลที่ถึงเบราว์เซอร์มาจาก DTO ของ service เท่านั้น ·
//   ฟอร์มเดียว: บันทึกทีละคน · "ไม่มีรายได้ก่อนใช้ระบบ" (ศูนย์) · "บันทึกทั้งหมด" (ทั้งหมดหรือไม่มีเลย) · แถวที่ออก 50 ทวิ แล้วอ่านอย่างเดียว ·
//   ผลการกดอ่านจาก ?ymsg= ผ่านรายการคงที่ (allowlist) · ปีภาษีจาก ?yty= ◂
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { thaiDateKey } from "@/lib/ui/date";
import { hrViewerOf } from "./privacy";
import { listOpeningYtd } from "./payroll-opening";
import { saveOpeningYtdAction, saveOpeningYtdBulkAction, zeroOpeningYtdAction } from "./payroll-opening-actions";

const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const card = "flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
const box = "flex flex-col gap-2 rounded-xl border border-[color:var(--color-line)] p-3";
const muted = "text-sm text-[color:var(--color-muted)]";
const chip = "inline-flex min-h-[28px] items-center rounded-full border border-[color:var(--color-line)] px-2.5 text-xs";
const warnBox = "flex flex-col gap-1 rounded-xl border border-[color:var(--color-danger)] p-3 text-sm";
const input = "min-h-[44px] w-full rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm";
const label = "flex min-w-[8rem] flex-1 flex-col gap-1 text-sm";
/** สตางค์ → "1,234.56" (ค่าเริ่มของช่องกรอกบาท) */
const baht = (satang: number) => (satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** รหัสผลบน URL ที่รู้จัก (allowlist) */
const OK_CODES = ["saved", "savedWarn", "bulk", "bulkWarn"] as const;
const ERR_CODES = ["NO", "OWN", "FIELDS", "WHT_OVER", "AS_OF", "OVERLAP", "CERT_ISSUED", "REV_CHANGED", "YEAR", "BUSY", "TOO_MANY", "empty"] as const;

export async function OpeningYtdCard({ systemId, sp }: { systemId: string; sp: { yty?: string; ymsg?: string; yn?: string } }) {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const thisYear = Number(thaiDateKey().slice(0, 4));
  const year = /^\d{4}$/.test(sp.yty ?? "") && Math.abs(Number(sp.yty) - thisYear) <= 5 ? Number(sp.yty) : thisYear;
  const res = await listOpeningYtd(ctx, hrViewerOf(auth), { taxYear: year });
  if (!res.ok) return null;
  const t = await getTranslations("hr.ytd");
  const code = sp.ymsg ?? "";
  const okMsg = (OK_CODES as readonly string[]).includes(code) ? t(`ok_${code}`, { n: /^\d{1,3}$/.test(sp.yn ?? "") ? Number(sp.yn) : 0 }) : "";
  const errMsg = !okMsg && (ERR_CODES as readonly string[]).includes(code) ? t(`err_${code}`) : "";
  const editable = res.rows.filter((r) => !r.locked);
  return (
    <section id="hr-ytd-card" data-testid="hr-ytd-card" className={card}>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className={muted}>{t("desc")}</p>
        <p className={muted}>{t("scopeNote")}</p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className={label}>
          {t("year")}
          <select name="yty" defaultValue={String(year)} data-testid="hr-ytd-year" className={input}>
            {[thisYear, thisYear - 1].map((y) => (
              <option key={y} value={y}>
                {y + 543} ({y})
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={ghost}>
          {t("pickYear")}
        </button>
      </form>
      {okMsg ? (
        <p role="status" className={box}>
          {okMsg}
        </p>
      ) : null}
      {errMsg ? (
        <p role="alert" data-testid="hr-ytd-alert" className={warnBox}>
          {errMsg}
        </p>
      ) : null}
      {res.truncated ? (
        <p role="note" data-testid="hr-ytd-truncated" className={warnBox}>
          {t("truncated", { n: res.rows.length })}
        </p>
      ) : null}
      {res.rows.length === 0 ? (
        <p className={muted}>{t("none")}</p>
      ) : (
        <form className="flex flex-col gap-3">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="taxYear" value={year} />
          {res.rows.map((r) => (
            <div key={r.employeeId} data-testid={`hr-ytd-row-${r.employeeId}`} className={box}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {r.code ? `${r.code} · ` : ""}
                  {r.name}
                </span>
                <span className={chip}>{t(`state_${r.state}`)}</span>
                {r.opening ? <span className={muted}>{t("rev", { n: r.opening.rev })}</span> : null}
              </div>
              {r.locked ? (
                <p className={muted}>
                  {t("locked")}
                  {r.opening ? ` · ${t("summary", { asOf: r.opening.asOfDay, months: r.opening.months, income: baht(r.opening.incomeSatang), wht: baht(r.opening.whtSatang), sso: baht(r.opening.ssoSatang) })}` : ""}
                </p>
              ) : (
                <>
                  <input type="hidden" name="emp" value={r.employeeId} />
                  <input type="hidden" name={`orig_${r.employeeId}`} value={r.opening ? [r.opening.asOfDay, String(r.opening.months), baht(r.opening.incomeSatang), baht(r.opening.whtSatang), baht(r.opening.ssoSatang)].join("|") : "||||"} />
                  {r.startDay ? <input type="hidden" name={`start_${r.employeeId}`} value={r.startDay} /> : null}
                  {r.opening ? <input type="hidden" name={`rev_${r.employeeId}`} value={r.opening.rev} /> : null}
                  <div className="flex flex-wrap gap-2">
                    <label className={label}>
                      {t("asOf")}
                      <input type="date" name={`asof_${r.employeeId}`} defaultValue={r.opening?.asOfDay ?? ""} className={input} />
                    </label>
                    <label className={label}>
                      {t("months")}
                      <input type="number" min={0} max={12} step={1} name={`months_${r.employeeId}`} defaultValue={r.opening ? String(r.opening.months) : ""} className={input} />
                    </label>
                    <label className={label}>
                      {t("income")}
                      <input inputMode="decimal" name={`inc_${r.employeeId}`} defaultValue={r.opening ? baht(r.opening.incomeSatang) : ""} className={input} />
                    </label>
                    <label className={label}>
                      {t("wht")}
                      <input inputMode="decimal" name={`wht_${r.employeeId}`} defaultValue={r.opening ? baht(r.opening.whtSatang) : ""} className={input} />
                    </label>
                    <label className={label}>
                      {t("sso")}
                      <input inputMode="decimal" name={`sso_${r.employeeId}`} defaultValue={r.opening ? baht(r.opening.ssoSatang) : ""} className={input} />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" name="one" value={r.employeeId} formAction={saveOpeningYtdAction} data-testid={`hr-ytd-save-${r.employeeId}`} className={btn}>
                      {t("save")}
                    </button>
                    <button type="submit" name="zero" value={r.employeeId} formAction={zeroOpeningYtdAction} data-testid={`hr-ytd-zero-${r.employeeId}`} className={ghost}>
                      {t("zero")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {editable.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" formAction={saveOpeningYtdBulkAction} data-testid="hr-ytd-bulk-save" className={btn}>
                {t("bulkSave")}
              </button>
              <span className={muted}>{t("bulkNote")}</span>
            </div>
          ) : null}
        </form>
      )}
    </section>
  );
}
