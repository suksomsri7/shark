// HR VIS-5a ▸ payroll area views (?view=) + read-only figures of the run screen (mockup 06) — pure/read-only: no writes, no new pricing ◂
//   payViewOf: which sub-view of /hr/payroll a URL opens (explicit ?view= wins; otherwise inferred from the params the frozen actions/links emit)
import { tenantDb } from "@/lib/core/db";

export const PAY_VIEWS = ["run", "hours", "adjust", "profiles", "docs", "ytd", "history"] as const;
export type PayView = (typeof PAY_VIEWS)[number];

/** params written by bank-files · filings · payslip (salary cert) actions/links → docs */
const DOCS_KEYS = ["bank", "bfmt", "beff", "benc", "bmode", "bera", "bbranch", "bmsg", "bfile", "fk", "fp", "frun", "fmsg", "fflds", "fdoc", "fbi", "fbs", "ffile", "ty", "fperson", "fstop", "sc"];
/** params written by payroll-opening (opening YTD) → ytd */
const YTD_KEYS = ["yty", "ymsg", "yn"];
/** params written by stock-charge → adjust */
const ADJUST_KEYS = ["stock", "stockq", "stockinv"];
/** params written by the page's work-entry redirects → hours */
const HOURS_KEYS = ["we"];

type Sp = Record<string, string | string[] | undefined>;
const has = (sp: Sp, keys: string[]) => keys.some((k) => sp[k] !== undefined);

/** ?view= of the payroll page — explicit valid view wins · else inferred from params · default run */
export function payViewOf(sp: Sp): PayView {
  const v = typeof sp.view === "string" ? sp.view : "";
  if ((PAY_VIEWS as readonly string[]).includes(v)) return v as PayView;
  if (has(sp, DOCS_KEYS)) return "docs";
  if (has(sp, YTD_KEYS)) return "ytd";
  if (has(sp, ADJUST_KEYS)) return "adjust";
  if (has(sp, HOURS_KEYS)) return "hours";
  return "run";
}

// ═══════════════ run screen figures (Q1 · Q2 · rulings 15 Nov) ═══════════════
//   Every figure is a sum of STORED values (snapshot line amounts / HrWorkDay rows) — no pricing, no rounding, no new money rule.
//   Q1: OT / commission are shown only when a row's stored addition lines add up to its stored addSatang (else null → "—").
export type RunLine = { code: string; ref?: string; day: string | null; minutes: number | null; amountSatang: number; requestedSatang?: number };
type FigRow = { employeeId: string; payType: string; lines: unknown[]; flags: string[]; review: unknown[]; grossSatang: number; addSatang: number; deductSatang: number };
/** stored line codes that make up addSatang (payroll-run-rules: taxable adds + REFUND) */
const ADD_CODES = new Set(["OT", "COMMISSION", "BONUS", "ALLOWANCE", "REFUND"]);
/** stored line codes that make up deductSatang (unworked + advance + claims) */
const OUT_CODES = new Set(["LATE_RULE", "ABSENT_RULE", "ADVANCE", "DEDUCTION"]);
const linesOf = (r: FigRow): RunLine[] => (Array.isArray(r.lines) ? (r.lines as RunLine[]).filter((l) => l && typeof l.code === "string" && typeof l.amountSatang === "number") : []);
const sum = (ls: RunLine[]) => ls.reduce((a, l) => a + l.amountSatang, 0);

export type RunRowFig = {
  /** Σ stored OT lines · null when the row's addition lines do not reconcile with its stored addSatang */
  otSatang: number | null;
  commissionSatang: number | null;
  /** r3: additions excluding OT = stored addSatang − Σ stored OT lines (stored addSatang when the row does not reconcile — OT then shows "—") */
  addNoOtSatang: number;
  /** distinct codes of the row's addition / deduction lines (labels only, no amounts) */
  addCodes: string[];
  outCodes: string[];
  /** drawer: lines grouped (earnings vs deductions) + Σ of each group's stored amounts */
  income: RunLine[];
  out: RunLine[];
  inSatang: number;
  outSatang: number;
  /** status of the row: review items or a negative-net flag ⇒ needs review */
  review: boolean;
};
export type RunFigures = { rows: Map<string, RunRowFig>; otRowsSatang: number; addNoOtSatang: number; otSatang: number | null; commissionSatang: number | null; baseSatang: number | null; ready: number; review: number; payTypes: [string, number][] };

/** figures of the visible rows (the caller passes previewPayrollRunV2 rows — already scoped to the viewer) */
export function runFigures(rows: FigRow[]): RunFigures {
  const out = new Map<string, RunRowFig>();
  let reconciled = true;
  let baseOk = true;
  let base = 0;
  for (const r of rows) {
    const ls = linesOf(r);
    const adds = ls.filter((l) => ADD_CODES.has(l.code));
    const outs = ls.filter((l) => OUT_CODES.has(l.code) || l.amountSatang < 0);
    const wage = ls.filter((l) => !ADD_CODES.has(l.code) && !OUT_CODES.has(l.code));
    const ok = sum(adds) === r.addSatang;
    if (!ok) reconciled = false;
    if (sum(wage) === r.grossSatang + r.deductSatang - r.addSatang) base += sum(wage);
    else baseOk = false;
    const income = ls.filter((l) => !outs.includes(l));
    out.set(r.employeeId, {
      otSatang: ok ? sum(adds.filter((l) => l.code === "OT")) : null,
      commissionSatang: ok ? sum(adds.filter((l) => l.code === "COMMISSION")) : null,
      addNoOtSatang: ok ? r.addSatang - sum(adds.filter((l) => l.code === "OT")) : r.addSatang,
      addCodes: [...new Set(adds.map((l) => l.code))],
      outCodes: [...new Set(outs.map((l) => l.code))],
      income,
      out: outs,
      inSatang: sum(income),
      outSatang: sum(outs),
      review: (Array.isArray(r.review) && r.review.length > 0) || r.flags.includes("NEGATIVE_NET"),
    });
  }
  const all = [...out.values()];
  const types = new Map<string, number>();
  for (const r of rows) types.set(r.payType, (types.get(r.payType) ?? 0) + 1);
  return {
    rows: out,
    otRowsSatang: all.reduce((a, f) => a + (f.otSatang ?? 0), 0),
    addNoOtSatang: all.reduce((a, f) => a + f.addNoOtSatang, 0),
    otSatang: reconciled ? all.reduce((a, f) => a + (f.otSatang ?? 0), 0) : null,
    commissionSatang: reconciled ? all.reduce((a, f) => a + (f.commissionSatang ?? 0), 0) : null,
    baseSatang: baseOk ? base : null,
    ready: all.filter((f) => !f.review).length,
    review: all.filter((f) => f.review).length,
    payTypes: [...types.entries()],
  };
}

/** Q2: worked days per employee = HrWorkDay rows of the run's period with workMin > 0 (ids = the visible rows only) · null when the period has no work-day rows */
export async function workedDaysOf(ctx: { tenantId: string; systemId: string }, periodKey: string, employeeIds: string[]): Promise<Map<string, number> | null> {
  if (!employeeIds.length || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) return null;
  const days = await tenantDb(ctx).hrWorkDay.findMany({ where: { systemId: ctx.systemId, periodKey, employeeId: { in: employeeIds.slice(0, 500) } }, select: { employeeId: true, workMin: true } });
  if (!days.length) return null;
  const m = new Map<string, number>();
  for (const d of days) if (d.workMin > 0) m.set(d.employeeId, (m.get(d.employeeId) ?? 0) + 1);
  return m;
}
