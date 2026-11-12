// HR H3.3 ▸ หน้าตารางกฎหมาย (ภาพ 08 ส่วน "ตารางกฎหมาย") — server component ล้วน · อ่านอย่างเดียว ไม่มีฟอร์ม/ปุ่มบันทึก
//   ต่างจากภาพโดยตั้งใจ (Q8): ไม่มี "เพิ่มช่วงมีผลใหม่"/"ร้านยืนยัน" (เขียนได้เฉพาะหลังบ้าน) · ไม่มีคอลัมน์ "ในร้านตอนนี้" (มาจากเงินเดือนรายคน)
import { getTranslations } from "next-intl/server";
import { formatBaht } from "@/lib/ui/money";
import { formatThaiDate } from "@/lib/ui/date";
import { annualTaxV2, parseDeductionJson, parseSsoJson, parseTaxJson, ssoV2 } from "./payroll-rules-v2";
import type { LawView, LawViewRow } from "./law";

type T = Awaited<ReturnType<typeof getTranslations>>;
const muted = "text-[color:var(--color-muted)]";
const pct = (bp: number) => `${(bp / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`;
const bahtNum = (satang: number) => (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const safe = <R,>(f: () => R): R | null => {
  try {
    return f();
  } catch {
    return null;
  }
};

function statusText(t: T, r: LawViewRow, onDay: string): string {
  if (r.status === "DRAFT") return t("status.draft");
  if (r.status === "RETIRED") return t("status.retired");
  if (r.inForce) return t("status.inForce");
  return r.effectiveFrom > onDay ? t("status.activeLater") : t("status.activeOld");
}

function RawValues({ t, values }: { t: T; values: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" aria-label={t("raw")}>
      {Object.entries(values).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className={muted}>{k}</dt>
          <dd className="text-right tabular-nums">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SsoValues({ t, values }: { t: T; values: Record<string, unknown> }) {
  const j = safe(() => parseSsoJson(values));
  if (!j) return <RawValues t={t} values={values} />;
  const max = safe(() => ssoV2(j.maxBaseSatang, j))?.employeeSatang ?? null;
  const rows: [string, string][] = [
    [t("sso.employee"), pct(j.rateBp)],
    [t("sso.employer"), pct(j.rateBp)],
    [t("sso.minBase"), formatBaht(j.minBaseSatang)],
    [t("sso.maxBase"), formatBaht(j.maxBaseSatang)],
    [t("sso.maxPerMonth"), max === null ? "—" : formatBaht(max)],
  ];
  return (
    <div className="flex flex-col gap-1">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className={muted}>{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className={`text-xs ${muted}`}>{t("sso.rounding")}</p>
    </div>
  );
}

function TaxValues({ t, values }: { t: T; values: Record<string, unknown> }) {
  const j = safe(() => parseTaxJson(values));
  if (!j) return <RawValues t={t} values={values} />;
  let prev = 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={`text-left text-xs ${muted}`}>
            <th className="py-1 pr-2 font-normal">{t("tax.range")}</th>
            <th className="py-1 pr-2 text-right font-normal">{t("tax.rate")}</th>
            <th className="py-1 text-right font-normal">{t("tax.cumulative")}</th>
          </tr>
        </thead>
        <tbody>
          {j.bands.map((b) => {
            const from = prev === 0 ? 0 : prev + 100;
            const label = b.upToSatang === null ? t("tax.andUp", { from: bahtNum(from) }) : `${bahtNum(from)} – ${bahtNum(b.upToSatang)}`;
            const cum = b.upToSatang === null ? null : safe(() => annualTaxV2(b.upToSatang as number, j));
            prev = b.upToSatang ?? prev;
            return (
              <tr key={label} className="border-t border-[color:var(--color-line)]">
                <td className="py-1 pr-2 tabular-nums">{label}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{b.rateBp === 0 ? t("tax.exempt") : pct(b.rateBp)}</td>
                <td className="py-1 text-right tabular-nums">{cum === null ? "—" : bahtNum(cum)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeductionValues({ t, values }: { t: T; values: Record<string, unknown> }) {
  const j = safe(() => parseDeductionJson(values));
  if (!j) return <RawValues t={t} values={values} />;
  const rows: [string, string][] = [
    [t("ded.expense"), t("ded.expenseDetail", { pct: String(j.expenseRateBp / 100), cap: formatBaht(j.expenseCapSatang) })],
    [t("ded.personal"), formatBaht(j.personalSatang)],
    [t("ded.spouse"), formatBaht(j.spouseSatang)],
    [t("ded.child"), formatBaht(j.childSatang)],
    [t("ded.sso"), formatBaht(j.ssoAllowanceCapSatang)],
  ];
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className={muted}>{k}</dt>
          <dd className="text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function OtValues({ t, values }: { t: T; values: Record<string, unknown> }) {
  const mult = values.workdayMultiplierBp;
  const days = values.daysPerMonth;
  const hours = values.hoursPerDay;
  if (typeof mult !== "number" || typeof days !== "number" || typeof hours !== "number") return <RawValues t={t} values={values} />;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex justify-between gap-4">
        <span className={muted}>{t("ot.workday")}</span>
        <b className="tabular-nums">×{(mult / 10_000).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</b>
      </div>
      <p className={`text-xs ${muted}`}>{t("ot.basis", { days, hours })}</p>
      <p className={`text-xs ${muted}`}>{t("ot.notRead")}</p>
    </div>
  );
}

function RowValues({ t, kind, values }: { t: T; kind: string; values: Record<string, unknown> }) {
  if (kind === "SSO") return <SsoValues t={t} values={values} />;
  if (kind === "TAX_BRACKET") return <TaxValues t={t} values={values} />;
  if (kind === "DEDUCTION") return <DeductionValues t={t} values={values} />;
  if (kind === "OT") return <OtValues t={t} values={values} />;
  return <RawValues t={t} values={values} />;
}

/** ตารางกฎหมายทั้งหมด จัดกลุ่มตามชนิด — ทุกแถวทุกสถานะ (แถวร่าง = "รอนักบัญชียืนยัน") */
export async function LawTableView({ view }: { view: LawView }) {
  const t = await getTranslations("hr.law");
  return (
    <div className="flex flex-col gap-4" data-testid="hr-law-table">
      {view.groups.map((g) => (
        <section key={g.kind} className="card flex flex-col gap-3 p-4" data-testid={`hr-law-row-${g.kind}`}>
          <h2 className="text-base font-medium">{t(`kinds.${g.kind}`)}</h2>
          {g.rows.length === 0 ? (
            <p className={`text-sm ${muted}`}>{g.kind === "MIN_WAGE" ? t("minWageEmpty") : t("empty")}</p>
          ) : (
            g.rows.map((r) => (
              <div key={r.key} className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3 first-of-type:border-t-0 first-of-type:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className={muted}>{t("effectiveFrom")} </span>
                    <b>{r.effectiveFrom === "1970-01-01" ? t("defaultSet") : formatThaiDate(`${r.effectiveFrom}T00:00:00+07:00`)}</b>
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-xs ${r.inForce ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]" : muted}`}>{statusText(t, r, view.onDay)}</span>
                </div>
                <RowValues t={t} kind={g.kind} values={r.values} />
                {r.approvedByName && r.approvedAt && (
                  <p className={`text-xs ${muted}`}>{t("approvedBy", { name: r.approvedByName, date: formatThaiDate(r.approvedAt) })}</p>
                )}
              </div>
            ))
          )}
        </section>
      ))}
    </div>
  );
}
// ◂ HR H3.3
