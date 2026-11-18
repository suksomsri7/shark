// HR H3.3 ▸ หน้าตารางกฎหมาย (ภาพ 08 ส่วน "ตารางกฎหมาย") — server component ล้วน · อ่านอย่างเดียว ไม่มีฟอร์ม/ปุ่มบันทึก
//   ต่างจากภาพโดยตั้งใจ (Q8): ไม่มี "เพิ่มช่วงมีผลใหม่"/"ร้านยืนยัน" (เขียนได้เฉพาะหลังบ้าน) · ไม่มีคอลัมน์ "ในร้านตอนนี้" (มาจากเงินเดือนรายคน)
import { getTranslations } from "next-intl/server";
import { formatBaht } from "@/lib/ui/money";
import { formatThaiDate } from "@/lib/ui/date";
import { annualTaxV2, parseDeductionJson, parseSsoJson, parseTaxJson, ssoV2 } from "./payroll-rules-v2";
import type { LawView, LawViewRow } from "./law";
import type { ReactNode } from "react"; // HR VIS-5d ◂

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

// HR VIS-5d ▸ SSO = one table row per effective date (mockup 08 .lt table) · 390 = one label–value block per row (no 7-column table on a phone) ◂
function ssoCells(values: Record<string, unknown>): string[] | null {
  const j = safe(() => parseSsoJson(values));
  if (!j) return null; // HR VIS-5d ◂
  const max = safe(() => ssoV2(j.maxBaseSatang, j))?.employeeSatang ?? null;
  return [pct(j.rateBp), pct(j.rateBp), formatBaht(j.minBaseSatang), formatBaht(j.maxBaseSatang), max === null ? "—" : formatBaht(max)];
} // HR VIS-5d ◂

// HR VIS-5d ▸ card shell of mockup .lt (header · body · grey footer) + effective-date chip ◂
const lt = "min-w-0 overflow-hidden rounded-[18px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)]";
const lh = "flex flex-wrap items-center gap-2.5 border-b border-[color:var(--color-line)] px-5 py-4";
const lf = `flex flex-wrap items-center gap-2.5 border-t border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-5 py-3 text-[13px] ${muted}`;
const th = `whitespace-nowrap border-b border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3.5 py-2.5 text-left text-xs font-bold ${muted}`;
const td = "whitespace-nowrap border-b border-[color:var(--color-line)] px-3.5 py-3 tabular-nums";
const dayText = (t: T, day: string) => (day === "1970-01-01" ? t("defaultSet") : formatThaiDate(`${day}T00:00:00+07:00`));
const lead = (rows: LawViewRow[]) => rows.find((r) => r.inForce) ?? rows[rows.length - 1] ?? null;
const ordered = (rows: LawViewRow[]) => { const l = lead(rows); return l ? [l, ...rows.filter((r) => r !== l)] : rows; };
function Chip({ text }: { text: string }) {
  return <span className={`rounded-lg border border-[color:var(--color-line)] px-2.5 py-1 text-xs ${muted}`}>{text}</span>;
}
function StatusChip({ t, r, onDay }: { t: T; r: LawViewRow; onDay: string }) {
  return <span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs ${r.inForce ? "border-[color:var(--color-ink)] font-bold" : `border-[color:var(--color-line)] ${muted}`}`}>{statusText(t, r, onDay)}</span>;
}
function Approved({ t, r }: { t: T; r: LawViewRow | null }) {
  return r?.approvedByName && r.approvedAt ? <span>{t("approvedBy", { name: r.approvedByName, date: formatThaiDate(r.approvedAt) })}</span> : null;
}
// ◂ HR VIS-5d

function TaxValues({ t, values }: { t: T; values: Record<string, unknown> }) {
  const j = safe(() => parseTaxJson(values));
  if (!j) return <div className="px-5 py-3"><RawValues t={t} values={values} /></div>; // HR VIS-5d ◂
  let prev = 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>{t("tax.range")}</th>{/* HR VIS-5d ◂ */}
            <th className={`${th} text-right`}>{t("tax.rate")}</th>{/* HR VIS-5d ◂ */}
            <th className={`${th} text-right`}>{t("tax.cumulative")}</th>{/* HR VIS-5d ◂ */}
          </tr>
        </thead>
        <tbody>
          {j.bands.map((b) => {
            const from = prev === 0 ? 0 : prev + 100;
            const label = b.upToSatang === null ? t("tax.andUp", { from: bahtNum(from) }) : `${bahtNum(from)} – ${bahtNum(b.upToSatang)}`;
            const cum = b.upToSatang === null ? null : safe(() => annualTaxV2(b.upToSatang as number, j));
            prev = b.upToSatang ?? prev;
            return (
              <tr key={label}>
                <td className={td}>{label}</td>{/* HR VIS-5d ◂ */}
                <td className={`${td} text-right`}>{b.rateBp === 0 ? t("tax.exempt") : pct(b.rateBp)}</td>{/* HR VIS-5d ◂ */}
                <td className={`${td} text-right`}>{cum === null ? "—" : bahtNum(cum)}</td>{/* HR VIS-5d ◂ */}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// HR VIS-5d ▸ key–value list of mockup .kvl ◂
function Kv({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="flex flex-col px-5 py-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2.5 border-t border-[color:var(--color-line)] py-2.5 text-sm first:border-t-0">
          <dt className="flex-1">{k}</dt>
          <dd className="whitespace-nowrap text-right font-bold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
} // HR VIS-5d ◂

function DeductionValues({ t, values }: { t: T; values: Record<string, unknown> }) {
  const j = safe(() => parseDeductionJson(values));
  if (!j) return <div className="px-5 py-3"><RawValues t={t} values={values} /></div>; // HR VIS-5d ◂
  const rows: [string, string][] = [
    [t("ded.expense"), t("ded.expenseDetail", { pct: String(j.expenseRateBp / 100), cap: formatBaht(j.expenseCapSatang) })],
    [t("ded.personal"), formatBaht(j.personalSatang)],
    [t("ded.spouse"), formatBaht(j.spouseSatang)],
    [t("ded.child"), formatBaht(j.childSatang)],
    [t("ded.sso"), formatBaht(j.ssoAllowanceCapSatang)],
  ];
  return <Kv rows={rows} />; // HR VIS-5d ◂
}

function OtValues({ t, values }: { t: T; values: Record<string, unknown> }) {
  const mult = values.workdayMultiplierBp;
  const days = values.daysPerMonth;
  const hours = values.hoursPerDay;
  if (typeof mult !== "number" || typeof days !== "number" || typeof hours !== "number") return <div className="px-5 py-3"><RawValues t={t} values={values} /></div>; // HR VIS-5d ◂
  return (
    <div className="flex flex-col">
      <Kv rows={[[t("ot.workday"), `×${(mult / 10_000).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`]]} />{/* HR VIS-5d ◂ */}
      <p className={`px-5 text-xs ${muted}`}>{t("ot.basis", { days, hours })}</p>
      <p className={`px-5 pb-3 pt-1 text-xs ${muted}`}>{t("ot.notRead")}</p>{/* HR VIS-5d ◂ */}
    </div>
  );
}

function RowValues({ t, kind, values }: { t: T; kind: string; values: Record<string, unknown> }) {
  // HR VIS-5d ▸ SSO rows render in the SSO table of LawTableView (no per-row block) ◂
  if (kind === "TAX_BRACKET") return <TaxValues t={t} values={values} />;
  if (kind === "DEDUCTION") return <DeductionValues t={t} values={values} />;
  if (kind === "OT") return <OtValues t={t} values={values} />;
  return <div className="px-5 py-3"><RawValues t={t} values={values} /></div>; // HR VIS-5d ◂
}

// HR VIS-5d ▸ one card per kind (mockup 08): SSO table · tax bands · deductions + OT/minimum wage side by side ·
//   a kind with several rows (draft · later · replaced) lists every row under the in-force one with its date + status (all rows all statuses, as before) ◂
type G = LawView["groups"][number];
function KindRows({ t, g, onDay, first }: { t: T; g: G; onDay: string; first?: boolean }) {
  if (g.rows.length === 0) return <p className={`px-5 py-4 text-sm ${muted}`}>{g.kind === "MIN_WAGE" ? t("minWageEmpty") : t("empty")}</p>;
  return (
    <>
      {ordered(g.rows).map((r, i) => (
        <div key={r.key} className={i > 0 || !first ? "border-t border-[color:var(--color-line)]" : ""}>
          {(i > 0 || !first) && (
            <div className="flex flex-wrap items-center gap-2 px-5 pt-3 text-xs">
              <span className={muted}>{t("effectiveFrom")}</span>
              <b>{dayText(t, r.effectiveFrom)}</b>
              <StatusChip t={t} r={r} onDay={onDay} />
              <span className={muted}><Approved t={t} r={r} /></span>
            </div>
          )}
          <RowValues t={t} kind={g.kind} values={r.values} />
        </div>
      ))}
    </>
  );
}
function KindCard({ t, tv, g, onDay, title, foot, children }: { t: T; tv: T; g: G; onDay: string; title: string; foot?: ReactNode; children?: ReactNode }) {
  const l = lead(g.rows);
  return (
    <section className={lt} data-testid={`hr-law-row-${g.kind}`}>
      <div className={lh}>
        <h2 className="text-base font-bold">{title}</h2>
        {l && <Chip text={tv("law.effective", { day: dayText(t, l.effectiveFrom) })} />}
        {l && !l.inForce && <StatusChip t={t} r={l} onDay={onDay} />}
      </div>
      <KindRows t={t} g={g} onDay={onDay} first />
      {children}
      {foot && <div className={lf}>{foot}</div>}
    </section>
  );
}

/** ตารางกฎหมายทั้งหมด จัดกลุ่มตามชนิด — ทุกแถวทุกสถานะ (แถวร่าง = "รอนักบัญชียืนยัน") */
export async function LawTableView({ view }: { view: LawView }) {
  const t = await getTranslations("hr.law");
  const tv = await getTranslations("hr.setview"); // HR VIS-5d ◂
  const by = new Map(view.groups.map((g) => [g.kind as string, g])); // HR VIS-5d ◂
  const sso = by.get("SSO"), tax = by.get("TAX_BRACKET"), ded = by.get("DEDUCTION"), ot = by.get("OT"), mw = by.get("MIN_WAGE"); // HR VIS-5d ◂
  const rest = view.groups.filter((g) => !["SSO", "TAX_BRACKET", "DEDUCTION", "OT", "MIN_WAGE"].includes(g.kind)); // HR VIS-5d ◂
  const ssoCols = [t("effectiveFrom"), t("sso.employee"), t("sso.employer"), t("sso.minBase"), t("sso.maxBase"), t("sso.maxPerMonth"), tv("law.status")]; // HR VIS-5d ◂
  return (
    <div className="flex flex-col gap-5" data-testid="hr-law-table">{/* HR VIS-5d ◂ */}
      {sso && (
        <section className={lt} data-testid="hr-law-row-SSO">{/* HR VIS-5d ▸ SSO card: table of effective dates ◂ */}
          <div className={lh}>
            <h2 className="text-base font-bold">{t("kinds.SSO")}</h2>
          </div>
          {sso.rows.length === 0 ? (
            <p className={`px-5 py-4 text-sm ${muted}`}>{t("empty")}</p>
          ) : (
            <>{/* HR VIS-5d ◂ */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {ssoCols.map((c, i) => (
                        <th key={c} className={`${th} ${i > 0 && i < 6 ? "text-right" : ""}`}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sso.rows.map((r) => {
                      const c = ssoCells(r.values);
                      return (
                        <tr key={r.key} className={r.inForce ? "" : muted}>
                          <td className={`${td} font-bold`}>{dayText(t, r.effectiveFrom)}</td>
                          {c ? c.map((v, i) => (
                            <td key={i} className={`${td} text-right`}>
                              {v}
                            </td>
                          )) : (
                            <td colSpan={5} className={td}>
                              <RawValues t={t} values={r.values} />
                            </td>
                          )}
                          <td className={td}>
                            <StatusChip t={t} r={r} onDay={view.onDay} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col sm:hidden">{/* HR VIS-5d ◂ */}
                {sso.rows.map((r) => {
                  const c = ssoCells(r.values);
                  return (
                    <li key={r.key} className="flex flex-col gap-1 border-t border-[color:var(--color-line)] px-5 py-3 text-sm first:border-t-0">
                      <div className="flex items-center justify-between gap-2">
                        <b>{dayText(t, r.effectiveFrom)}</b>
                        <StatusChip t={t} r={r} onDay={view.onDay} />
                      </div>
                      {c ? (
                        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                          {c.map((v, i) => (
                            <div key={i} className="contents">
                              <dt className={muted}>{ssoCols[i + 1]}</dt>
                              <dd className="text-right tabular-nums">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <RawValues t={t} values={r.values} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className={lf}>{/* HR VIS-5d ◂ */}
            <Approved t={t} r={lead(sso.rows)} />
            <span>{t("sso.rounding")}</span>
          </div>
        </section>
      )}{/* HR VIS-5d ◂ */}
      {tax && <KindCard t={t} tv={tv} g={tax} onDay={view.onDay} title={t("kinds.TAX_BRACKET")} foot={<span>{t("whtMethod")}</span>} />}{/* HR VIS-5d ◂ */}
      {(ded || ot || mw) && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{/* HR VIS-5d ▸ two cards side by side (.g28) ◂ */}
          {ded && <KindCard t={t} tv={tv} g={ded} onDay={view.onDay} title={t("kinds.DEDUCTION")} foot={<Approved t={t} r={lead(ded.rows)} />} />}
          {ot && (
            <KindCard t={t} tv={tv} g={ot} onDay={view.onDay} title={tv("law.otTitle")}>
              {mw && (
                <div className="border-t border-[color:var(--color-line)]" data-testid="hr-law-row-MIN_WAGE">
                  <p className="px-5 pt-3 text-sm font-semibold">{t("kinds.MIN_WAGE")}</p>
                  <KindRows t={t} g={mw} onDay={view.onDay} first />
                </div>
              )}
            </KindCard>
          )}
          {!ot && mw && <KindCard t={t} tv={tv} g={mw} onDay={view.onDay} title={t("kinds.MIN_WAGE")} />}
        </div>
      )}{/* HR VIS-5d ◂ */}
      {rest.map((g) => (
        <KindCard key={g.kind} t={t} tv={tv} g={g} onDay={view.onDay} title={t(`kinds.${g.kind}`)} />
      ))}{/* HR VIS-5d ◂ */}
    </div>
  );
}
// ◂ HR H3.3
