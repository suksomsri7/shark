"use client";
// TRIPS T1.1 r3 ▸ ค่าของการ์ดค่าตั้งที่จอ trips จัดรูปเอง (ภาพ 17) — เฉพาะชนิดที่ทะเบียนค่าตั้งไม่มีชนิดช่องย่อยรองรับ
//   ชนิดมาจาก view model (vm.fieldViews) — ไฟล์นี้ไม่มีชื่อคีย์ค่าตั้ง · ป้ายจาก messages trips.settings.view.* (ไทย/อังกฤษ)
//   ป้ายชื่อช่องย่อยของข้อมูลผู้เดินทางมาจากทะเบียน (tableSpec · ไทยอย่างเดียว — หนี้เดิมของทะเบียน)
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { TripsSettingsVM } from "@/lib/modules/trips";
import type { SettingsField } from "@/components/settings/settings-shared";
import { formatBahtShort, ladderTiers, type LadderTier } from "./trips-shared";
import { useYmd } from "./ProductsScreenParts";

type View = TripsSettingsVM["fieldViews"][string];
type T = ReturnType<typeof useTranslations>;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function tierRange(t: T, x: LadderTier): string {
  if (x.to === null) return t("settings.view.daysOrMore", { n: x.from });
  if (x.from === 0) return t("settings.view.lessThanDays", { n: x.to + 1 });
  if (x.from === x.to) return t("settings.view.exactDays", { n: x.from });
  return t("settings.view.dayRange", { from: x.from, to: x.to });
}
const PAX_GROUPS = ["REQUIRED", "REQUIRED_CROSS_BORDER", "OPTIONAL"] as const;
function paxGroups(f: SettingsField, v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = { REQUIRED: [], REQUIRED_CROSS_BORDER: [], OPTIONAL: [], OFF: [] };
  if (!isRec(v)) return out;
  for (const [k, req] of Object.entries(v)) {
    const label = f.tableSpec?.fields?.[k]?.labelTh ?? k;
    if (typeof req === "string" && req in out) out[req].push(label);
  }
  return out;
}
const codeList = (t: T, prefix: string, v: unknown): string => (Array.isArray(v) ? v.map((c) => (typeof c === "string" ? t(`${prefix}.${c}`) : String(c))).join(" · ") : "—");

/** ข้อความสั้นบรรทัดเดียว (ค่าแม่แบบ · ค่ารายสินค้า) */
export function viewText(t: T, view: View, f: SettingsField, v: unknown): string {
  switch (view) {
    case "LADDER": {
      const tiers = ladderTiers(v);
      return tiers ? tiers.map((x) => `${x.pct}% ${tierRange(t, x)}`).join(" · ") : "—";
    }
    case "PAX_FIELDS": {
      const g = paxGroups(f, v);
      return PAX_GROUPS.filter((k) => g[k].length).map((k) => `${t(`settings.view.pax.${k}`)}: ${g[k].join(", ")}`).join(" · ") || "—";
    }
    case "PARK_FEE": {
      if (!isRec(v)) return "—";
      const groups = Array.isArray(v.groups) ? v.groups.length : 0;
      const shop = Array.isArray(v.shopRates) ? v.shopRates.length : 0;
      return [t("settings.view.park.groupsN", { n: groups }), shop ? t("settings.view.park.shopRatesN", { n: shop }) : null].filter(Boolean).join(" · ");
    }
    case "CANCEL_OPTIONS":
      if (!isRec(v)) return "—";
      return [codeList(t, "settings.view.cancelOption", v.options), num(v.autoRefundAfterDays) !== null ? t("settings.view.autoRefund", { n: num(v.autoRefundAfterDays) ?? 0 }) : null].filter(Boolean).join(" · ");
    case "DEDUCTIONS":
      if (!isRec(v)) return "—";
      return [Array.isArray(v.categories) && v.categories.length ? codeList(t, "settings.view.deduction", v.categories) : t("settings.view.noDeductions"), v.evidenceRequired === true ? t("settings.view.evidenceRequired") : t("settings.view.evidenceOptional")].join(" · ");
    default:
      return "—";
  }
}

/** ค่าหลักของการ์ด (ช่องขั้นบันได · ตารางค่าอุทยาน · กลุ่มข้อมูลผู้เดินทาง) */
export function ViewValue({ view, f, v, warn }: { view: View; f: SettingsField; v: unknown; warn: boolean }): ReactNode {
  const t = useTranslations("trips");
  const ymd = useYmd();
  if (view === "LADDER") {
    const tiers = ladderTiers(v);
    if (!tiers) return <span>—</span>;
    return (
      <ul data-view="ladder" className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
        {tiers.map((x) => (
          <li key={`${x.from}-${x.pct}`} className={`flex min-w-0 flex-col rounded-lg px-3 py-2 ${warn ? "border-2 border-dashed border-[color:var(--color-danger)]" : "border border-[color:var(--color-line)]"}`}>
            <span className="text-lg font-bold">{`${x.pct}%`}</span>
            <span className="text-sm text-[color:var(--color-ink-soft)]">{tierRange(t, x)}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (view === "PAX_FIELDS") {
    const g = paxGroups(f, v);
    return (
      <dl data-view="pax-fields" className="flex min-w-0 flex-col gap-1">
        {[...PAX_GROUPS, "OFF" as const].filter((k) => g[k].length).map((k) => (
          <div key={k} className="flex min-w-0 flex-wrap gap-x-2">
            <dt className="font-medium">{t(`settings.view.pax.${k}`)}</dt>
            <dd className={k === "OFF" ? "text-[color:var(--color-muted)]" : ""}>{g[k].join(" · ")}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (view === "PARK_FEE") {
    if (!isRec(v)) return <span>—</span>;
    const groups = Array.isArray(v.groups) ? v.groups.filter(isRec) : [];
    const shop = Array.isArray(v.shopRates) ? v.shopRates.filter(isRec) : [];
    const mooring = isRec(v.mooring) ? v.mooring : {};
    const b = (x: unknown) => (num(x) === null ? "—" : formatBahtShort(num(x) ?? 0));
    return (
      <div data-view="park-fee" className="flex min-w-0 flex-col gap-2">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-0 border-collapse text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)] text-[color:var(--color-muted)]">
                <th className="py-1 pr-2 text-left font-medium">{t("settings.view.park.row")}</th>
                <th className="whitespace-nowrap py-1 pr-2 text-right font-medium">{t("settings.view.park.thai")}</th>
                <th className="whitespace-nowrap py-1 text-right font-medium">{t("settings.view.park.foreign")}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((gr, i) => (
                <tr key={`g${i}`} className="border-b border-[color:var(--color-line)]">
                  <td className="py-1 pr-2">{typeof gr.nameTh === "string" ? gr.nameTh : "—"}</td>
                  <td className="whitespace-nowrap py-1 pr-2 text-right">{`${b(gr.thaiChildSatang)} / ${b(gr.thaiAdultSatang)}`}</td>
                  <td className="whitespace-nowrap py-1 text-right">{`${b(gr.foreignChildSatang)} / ${b(gr.foreignAdultSatang)}`}</td>
                </tr>
              ))}
              {shop.map((r, i) => (
                <tr key={`s${i}`} className="border-b border-[color:var(--color-line)] bg-[color:var(--color-surface-2)]">
                  <td className="py-1 pr-2">
                    <span className="font-medium">{typeof r.label === "string" ? r.label : "—"}</span> <span className="text-[color:var(--color-muted)]">{t("settings.view.park.shopRate")}</span>
                  </td>
                  <td colSpan={2} className="py-1 text-right">
                    {num(r.adultSatang) === num(r.childSatang)
                      ? t("settings.view.park.flat", { amount: b(r.adultSatang) })
                      : t("settings.view.park.adultChild", { adult: b(r.adultSatang), child: b(r.childSatang) })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-[color:var(--color-ink-soft)]">
          {[
            t("settings.view.park.dive", { amount: b(v.diveSatangPerPaxDay) }),
            t("settings.view.park.mooring", { a: b(mooring.upTo20Satang), b: b(mooring.from21Satang) }),
            typeof v.confirmedAt === "string" ? t("settings.view.park.confirmed", { date: ymd(v.confirmedAt, false) }) : t("settings.view.park.notConfirmed"),
          ].join(" · ")}
        </p>
      </div>
    );
  }
  return <span>{viewText(t, view, f, v)}</span>;
}
