// HR VIS-5a ▸ payroll area views (?view=) + read-only figures of the run screen (mockup 06) — pure/read-only: no writes, no new pricing ◂
//   payViewOf: which sub-view of /hr/payroll a URL opens (explicit ?view= wins; otherwise inferred from the params the frozen actions/links emit)

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
