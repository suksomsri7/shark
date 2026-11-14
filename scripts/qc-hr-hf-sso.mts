// QC — HR V2 · HOTFIX HF-SSO-2569 — social-security wage ceiling by WAGE PERIOD (engine v1) · brief ledger/hr-briefs/hr-brief-HF-SSO.md · note ledger/wo-notes/hr-HF-SSO-oracle.md
// ⚠️ Oracle under change control — ORACLE-EDIT only.
// 🔴 Every expected number is a LITERAL worked by hand from shark-thai-law domain-labour-payroll §ซ [V] + test-rules T-HR-08 [V] (rounding [V2]):
//    5 % / 5 % · base floor 1,650 · ceiling by wage period (YYYY-MM): < 2026-01 15,000 · 2026-01…2028-12 17,500 · 2029-01…2031-12 20,000 · ≥ 2032-01 23,000 ·
//    contribution = round-half-up to whole baht (today's rounding — already matches T-HR-08: 10,010 → 501 · 10,009 → 500 · 1,000 → 83).
// CONTRACT (brief R1–R5):
//   payroll-rules.ts: ssoLawForPeriod(periodKey) → {rateBp, minBaseSatang, maxBaseSatang} · ssoContribution(monthlySalarySatang, periodKey, cfg?) —
//     period REQUIRED (missing / malformed / non-string ⇒ throws) · cfg overrides keep working as 3rd parameter · no `?? 15000` default · no Date/now
//   payroll.ts: computeItem gets the run's periodKey (createPayrollRun · recomputeDraftRun) · v1 approve refuses a DRAFT whose stored SSO ≠ the period table
//     (ok:false · Thai note · DRAFT · `hr.payroll.approve.refused` audit) · recompute fixes it · APPROVED/PAID rows never rewritten
//   scripts/hr-seed-law-draft.mts: LAW_V1_ROWS SSO = 4 dated DRAFT rows (1970-01-01 15,000 = the existing v1:SSO json · 2026-01-01 17,500 · 2029-01-01 20,000 · 2032-01-01 23,000)
//     · verifyAgainstFrozen() still ok · ssoV2(row) = v1 ssoContribution(period of that row)
// Tenants qc-hr-hfsso-<stamp> (deleted at the end) · no law rows written · no ACCOUNT system (approve = no JV) · "pre-fix" rows are simulated by rewriting the
//   stored items/run back to the base shape (750 · base snapshot keys · no ytd/law ids/inputDigest) — see toPreFix().
import { type Any, type Base, type Sev, rd, short, errText, stripComments, canon, srcFiles, makeRegistry, qc4Env, makeFixtures, cleanupFx, tagOf } from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-hf-sso";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-hfsso-";
const H = "src/lib/modules/hr/";
const F = {
  rules: `${H}payroll-rules.ts`, payroll: `${H}payroll.ts`, labor: `${H}labor.ts`, openRules: `${H}payroll-opening-rules.ts`, opening: `${H}payroll-opening.ts`,
  seed: "scripts/hr-seed-law-draft.mts",
};

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|R2|C|R|[static] every ssoContribution( call in src passes a 2nd argument = the run's period (no single-argument call)
S1.2|R1|C|R|[static] payroll-rules.ts: no "?? 15000/1500000" ceiling default · 17,500 and 23,000 rows present · no Date/now (pure)
S1.3|R2|C|G|[static] callers of ssoContribution in src ⊆ {payroll.ts} (no new silent caller)
S1.4|R2|M|G|[static] H4.2 ssoEstimate callers pass maxBaseSatang from a law row (no numeric literal)
S1.5|R2|M|G|[static] SSO_HIGH (ssoHigh) has no 15,000/750 literal — ceiling comes from the law row
S1.6|R5|M|G|[static] filings / reports / payslip / bank files never call ssoContribution / ssoLawForPeriod (carry stored amounts)
P1.1|R1|C|G|[pure] period 2025-12 × 9 wages: base/employee/employer (ceiling 15,000)
P1.2|R1|C|R|[pure] period 2026-01 × 9 wages (ceiling 17,500)
P1.3|R1|C|R|[pure] period 2028-12 × 9 wages (ceiling 17,500)
P1.4|R1|C|R|[pure] period 2029-01 × 9 wages (ceiling 20,000)
P1.5|R1|C|R|[pure] period 2031-12 × 9 wages (ceiling 20,000)
P1.6|R1|C|R|[pure] period 2032-01 × 9 wages (ceiling 23,000)
P2.1|R1|C|R|[pure] ssoLawForPeriod: 10 periods ⇒ {rateBp 500, minBaseSatang 165000, maxBaseSatang literal}
P2.2|R2|C|R|[pure] missing / malformed / non-string period ⇒ throws (ssoContribution and ssoLawForPeriod)
P2.3|R1|M|R|[pure] cfg overrides still work as 3rd parameter (rate 3 % · maxBase override)
P2.4|T-HR-08|C|R|[pure] T-HR-08 literal vectors (งวด 2569 20,000 → 875 · 17,500 → 875 · 10,010 → 501 · 10,009 → 500 · 1,000 → 83 · งวด ม.ค. 2572 20,000 → 1,000)
P2.5|Q1|M|R|[pure] (Q1-dependent — controller ruling) T-HR-10: WHT 50,000/month with SSO 10,500/yr ⇒ 20,450/yr ⇒ 1,704.17/month (SSO allowance = amount paid)
P3.1|R4|C|R|[pure] hr-seed-law-draft LAW_V1_ROWS: SSO = 4 dated rows literal · 1970 row = old v1:SSO json · other kinds unchanged
P3.2|R4|C|G|[pure] hr-seed-law-draft verifyAgainstFrozen() ok (seed rows ≡ engine v1)
P3.3|R4|C|R|[pure] parity: ssoV2(seed row) = v1 ssoContribution(first and last period of that row) on 12 wages
D1.1|R2|C|G|[db] v1 run 2025-12: 5 items literal (750 · 501 · 83 · 750 · 0) + totals
D1.2|R2|C|R|[db] v1 run 2026-03: 875/875 for 20,000 · totals literal
D1.3|R2|C|R|[db] v1 run 2028-12 paid 2029-01-05: still 17,500 (period decides, not pay date)
D1.4|R2|C|R|[db] v1 run 2029-01: 1,000 for 20,000 and 23,000
D1.5|R2|C|R|[db] v1 run 2031-12 paid 2032-01-05: still 20,000
D1.6|R2|C|R|[db] v1 run 2032-01: 1,150 for 23,000 · 1,000 for 20,000
D2.1|R3|C|G|[db] APPROVED run made before the fix (2026-01, 750): recompute refused · rows still 750 · payslip 750 · no adjustment written
D2.2|R3|C|R|[db] DRAFT made before the fix (2026-02, 750): approve refused without and with the viewer's exact expect · stays DRAFT · no JV
D2.3|R3|M|R|[db] the refusal is audited (hr.payroll.approve.refused on that run)
D2.4|R3|C|R|[db] recomputeDraftRun ⇒ 875/875 · totals literal
D2.5|R3|C|R|[db] approve after recompute ⇒ ok · APPROVED · rows 875
D2.6|R3|m|G|[db] DRAFT made before the fix whose numbers are still right (2025-11, 750) approves
Z1|house|C|G|no residue (tenants/users of this suite)
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`HF-SSO-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, finish } = makeRegistry(SUITE, "HF-SSO-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}

const B = (baht: number) => Math.round(baht * 100);
const okAll = (r: Record<string, unknown>) => Object.values(r).every(Boolean);
const bad = (r: Record<string, unknown>) => Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "-";
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, okAll(r), exp, `${bad(r)}${extra ? ` · ${extra}` : ""}`);

// ═════════════════════════ literal tables ═════════════════════════
const WAGES = [1_000, 1_650, 10_009, 10_010, 15_000, 17_500, 20_000, 23_000, 50_000] as const;
/** per period: [base baht, contribution baht] for each wage in WAGES order */
const WANT: Record<string, [number, number][]> = {
  "2025-12": [[1_650, 83], [1_650, 83], [10_009, 500], [10_010, 501], [15_000, 750], [15_000, 750], [15_000, 750], [15_000, 750], [15_000, 750]],
  "2026-01": [[1_650, 83], [1_650, 83], [10_009, 500], [10_010, 501], [15_000, 750], [17_500, 875], [17_500, 875], [17_500, 875], [17_500, 875]],
  "2028-12": [[1_650, 83], [1_650, 83], [10_009, 500], [10_010, 501], [15_000, 750], [17_500, 875], [17_500, 875], [17_500, 875], [17_500, 875]],
  "2029-01": [[1_650, 83], [1_650, 83], [10_009, 500], [10_010, 501], [15_000, 750], [17_500, 875], [20_000, 1_000], [20_000, 1_000], [20_000, 1_000]],
  "2031-12": [[1_650, 83], [1_650, 83], [10_009, 500], [10_010, 501], [15_000, 750], [17_500, 875], [20_000, 1_000], [20_000, 1_000], [20_000, 1_000]],
  "2032-01": [[1_650, 83], [1_650, 83], [10_009, 500], [10_010, 501], [15_000, 750], [17_500, 875], [20_000, 1_000], [23_000, 1_150], [23_000, 1_150]],
};
const PURE_ID: Record<string, string> = { "2025-12": "P1.1", "2026-01": "P1.2", "2028-12": "P1.3", "2029-01": "P1.4", "2031-12": "P1.5", "2032-01": "P1.6" };
const LAW_WANT: [string, number][] = [
  ["1999-01", 1_500_000], ["2025-12", 1_500_000], ["2026-01", 1_750_000], ["2027-06", 1_750_000], ["2028-12", 1_750_000],
  ["2029-01", 2_000_000], ["2031-12", 2_000_000], ["2032-01", 2_300_000], ["2040-07", 2_300_000], ["2099-12", 2_300_000],
];
const SSO_SEED_WANT = [
  { effectiveFrom: "1970-01-01", maxBaseSatang: 1_500_000 },
  { effectiveFrom: "2026-01-01", maxBaseSatang: 1_750_000 },
  { effectiveFrom: "2029-01-01", maxBaseSatang: 2_000_000 },
  { effectiveFrom: "2032-01-01", maxBaseSatang: 2_300_000 },
];
const OLD_SSO_JSON = { rateBp: 500, minBaseSatang: 165000, maxBaseSatang: 1500000, rounding: "BAHT_HALF_UP", employerEqualsEmployee: true };
const OLD_OTHER_ROWS = [
  { kind: "TAX_BRACKET", effectiveFrom: "1970-01-01", json: { bands: [{ upToSatang: 15000000, rateBp: 0 }, { upToSatang: 30000000, rateBp: 500 }, { upToSatang: 50000000, rateBp: 1000 }, { upToSatang: 75000000, rateBp: 1500 }, { upToSatang: 100000000, rateBp: 2000 }, { upToSatang: 200000000, rateBp: 2500 }, { upToSatang: 500000000, rateBp: 3000 }, { upToSatang: null, rateBp: 3500 }], rounding: "SATANG_HALF_UP_ONCE" } },
  { kind: "DEDUCTION", effectiveFrom: "1970-01-01", json: { expenseRateBp: 5000, expenseCapSatang: 10000000, personalSatang: 6000000, spouseSatang: 6000000, childSatang: 3000000, ssoAllowanceCapSatang: 900000 } },
  { kind: "OT", effectiveFrom: "1970-01-01", json: { workdayMultiplierBp: 15000, daysPerMonth: 30, hoursPerDay: 8 } },
];

// ═════════════════════════ statics ═════════════════════════
/** top-level argument texts of every call `name(` in src (definition `function name(` excluded) */
function callsOf(src: string, name: string): string[][] {
  const out: string[][] = [];
  const re = new RegExp(`(?<![\\w.])${name}\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 9), m.index);
    if (/function\s*$/.test(before)) continue;
    let i = m.index + m[0].length;
    let depth = 1;
    let cur = "";
    const args: string[] = [];
    for (; i < src.length && depth > 0; i++) {
      const c = src[i]!;
      if ("([{".includes(c)) depth++;
      if (")]}".includes(c)) depth--;
      if (depth === 0) break;
      if (c === "," && depth === 1) {
        args.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    if (cur.trim()) args.push(cur.trim());
    out.push(args);
  }
  return out;
}
function runStatic(): void {
  const files = srcFiles("src");
  const code = new Map(files.map((f) => [f, stripComments(rd(f))]));
  {
    const calls: string[] = [];
    let badN = 0;
    for (const [f, s] of code) for (const a of callsOf(s, "ssoContribution")) {
      const good = a.length >= 2 && /period/i.test(a[1] ?? "") && !/^(undefined|null|""|''|new Date)/.test(a[1] ?? "");
      if (!good) badN++;
      calls.push(`${f.replace(H, "")}(${a.length} args${a[1] ? `: ${short(a[1], 30)}` : ""})`);
    }
    chk("S1.1", calls.length > 0 && badN === 0, "≥1 call · every call passes the period", `${calls.length} call(s) · bad ${badN} · ${calls.join(" ")}`);
    const callers = [...new Set([...code].filter(([, s]) => callsOf(s, "ssoContribution").length > 0).map(([f]) => f))];
    chk("S1.3", callers.every((f) => f === F.payroll), F.payroll, callers.join(",") || "none");
  }
  {
    const s = code.get(F.rules) ?? "";
    const r = {
      noDefault: !/\?\?\s*\(?\s*(15_?000|1_?500_?000)\b/.test(s),
      row17500: /\b(17_?500|1_?750_?000)\b/.test(s),
      row23000: /\b(23_?000|2_?300_?000)\b/.test(s),
      pure: !/\bnew Date\b|Date\.now\s*\(/.test(s),
      lawFn: /export\s+(function|const)\s+ssoLawForPeriod\b/.test(s),
    };
    ck("S1.2", r, "dated table · no silent 15,000 default · pure");
  }
  {
    const offenders: string[] = [];
    let n = 0;
    for (const [f, s] of code) for (const a of callsOf(s, "ssoEstimate")) {
      n++;
      const obj = a.join(",");
      const m = /maxBaseSatang\s*:\s*([^,}]+)/.exec(obj);
      if (!m || /^\s*[\d_]+/.test(m[1]!) || /\*\s*(BAHT|100)\b/.test(m[1]!)) offenders.push(`${f.replace(H, "")}:${short(m?.[1] ?? "∅", 30)}`);
    }
    chk("S1.4", n > 0 && offenders.length === 0, "≥1 call · maxBaseSatang from a law row", `${n} call(s) · ${offenders.join(" ") || "ok"}`);
  }
  {
    const s = code.get(F.openRules) ?? "";
    const i = s.indexOf("export function ssoHigh");
    const body = i >= 0 ? s.slice(i, s.indexOf("\n}", i) + 2) : "";
    const r = { found: !!body, noLiteral: !/\b(15_?000|1_?500_?000|75_?000|750)\b/.test(body), usesLaw: /law\.maxBaseSatang/.test(body) };
    ck("S1.5", r, "ssoHigh reads the law row");
  }
  {
    const watch = files.filter((f) => f.startsWith(`${H}filings/`) || f.startsWith(`${H}bank-files/`) || f === `${H}reports.ts` || f === `${H}payslip.ts`);
    const hits = watch.filter((f) => /\b(ssoContribution|ssoLawForPeriod)\b/.test(code.get(f) ?? ""));
    chk("S1.6", watch.length > 0 && hits.length === 0, `${watch.length} files carry stored amounts`, hits.join(",") || `none of ${watch.length}`);
  }
}

// ═════════════════════════ pure ═════════════════════════
const throws = (f: () => unknown): boolean => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};
const tryv = (f: () => unknown): unknown => {
  try {
    return f();
  } catch (e) {
    return `throw ${errText(e).slice(0, 40)}`;
  }
};
async function runPure(R: Any, V2: Any, SEED: Any): Promise<void> {
  const sso = (w: number, p: unknown, cfg?: unknown) => (cfg === undefined ? R.ssoContribution(w, p) : R.ssoContribution(w, p, cfg));
  for (const [p, rows] of Object.entries(WANT)) {
    const off: string[] = [];
    WAGES.forEach((w, i) => {
      const [b, c] = rows[i]!;
      const got = tryv(() => sso(B(w), p)) as Any;
      if (!(got && got.baseSatang === B(b) && got.employeeSatang === B(c) && got.employerSatang === B(c))) off.push(`${w}→${short(JSON.stringify(got), 70)}≠${b}/${c}`);
    });
    chk(PURE_ID[p]!, off.length === 0, `${WAGES.length} wages literal`, off.join(" ; ") || "ok");
  }
  {
    const off: string[] = [];
    for (const [p, max] of LAW_WANT) {
      const got = typeof R.ssoLawForPeriod === "function" ? (tryv(() => R.ssoLawForPeriod(p)) as Any) : "∅ ssoLawForPeriod";
      if (!(got && got.rateBp === 500 && got.minBaseSatang === 165_000 && got.maxBaseSatang === max)) off.push(`${p}:${short(JSON.stringify(got), 60)}`);
    }
    chk("P2.1", off.length === 0, "10 periods literal", off.join(" ; ") || "ok");
  }
  {
    const badP: unknown[] = [undefined, null, "", "2026-13", "2026-00", "2026-1", "26-01", "2026-01-15", 202601, new Date("2026-01-15T00:00:00Z")];
    const r: Record<string, boolean> = {
      noArg: throws(() => R.ssoContribution(B(20_000))),
      lawFn: typeof R.ssoLawForPeriod === "function",
    };
    badP.forEach((p, i) => {
      r[`c${i}`] = throws(() => R.ssoContribution(B(20_000), p));
      r[`l${i}`] = typeof R.ssoLawForPeriod === "function" && throws(() => R.ssoLawForPeriod(p));
    });
    ck("P2.2", r, "throws on every missing/malformed period");
  }
  {
    const a = tryv(() => sso(B(20_000), "2026-01", { rateBp: 300 })) as Any;
    const b = tryv(() => sso(B(20_000), "2026-01", { maxBaseSatang: 1_500_000 })) as Any;
    const r = { rate: a?.baseSatang === 1_750_000 && a?.employeeSatang === 52_500, max: b?.baseSatang === 1_500_000 && b?.employeeSatang === 75_000 };
    ck("P2.3", r, "rate 3 % ⇒ 525 · max override 15,000 ⇒ 750", `${short(JSON.stringify(a), 60)} ${short(JSON.stringify(b), 60)}`);
  }
  {
    const v: [number, string, number][] = [[20_000, "2026-06", 875], [17_500, "2026-06", 875], [10_010, "2026-06", 501], [10_009, "2026-06", 500], [1_000, "2026-06", 83], [20_000, "2029-01", 1_000]];
    const off = v.filter(([w, p, c]) => (tryv(() => sso(B(w), p)) as Any)?.employeeSatang !== B(c)).map(([w, p, c]) => `${w}@${p}≠${c}`);
    chk("P2.4", off.length === 0, "6 T-HR-08 vectors", off.join(" ") || "ok");
  }
  {
    const got = tryv(() => R.monthlyWhtSatang({ monthlySalarySatang: B(50_000), ssoEmployeeYearSatang: B(10_500) }));
    chk("P2.5", got === 170_417, "170417 (20,450 ÷ 12)", String(got));
  }
  {
    const rows = (SEED?.LAW_V1_ROWS ?? []) as Any[];
    const ssoRows = rows.filter((r) => r.kind === "SSO").map((r) => ({ effectiveFrom: String(r.effectiveFrom), json: r.json })).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
    const others = rows.filter((r) => r.kind !== "SSO").map((r) => ({ kind: r.kind, effectiveFrom: r.effectiveFrom, json: r.json }));
    const keys = rows.map((r) => `${r.kind}@${r.effectiveFrom}`);
    const r = {
      four: ssoRows.length === 4,
      dated: canon(ssoRows.map((x) => ({ effectiveFrom: x.effectiveFrom, maxBaseSatang: x.json?.maxBaseSatang }))) === canon(SSO_SEED_WANT),
      sameShape: ssoRows.every((x) => canon({ ...x.json, maxBaseSatang: 0 }) === canon({ ...OLD_SSO_JSON, maxBaseSatang: 0 })),
      oldRow: canon(ssoRows[0]?.json) === canon(OLD_SSO_JSON),
      others: canon(others) === canon(OLD_OTHER_ROWS),
      distinct: new Set(keys).size === keys.length,
    };
    ck("P3.1", r, "4 dated SSO rows · old row byte-equal · others unchanged", short(JSON.stringify(ssoRows.map((x) => [x.effectiveFrom, x.json?.maxBaseSatang])), 120));
  }
  {
    const v = (await Promise.resolve(tryv(() => SEED.verifyAgainstFrozen())).then((p) => p).catch((e: unknown) => `throw ${errText(e)}`)) as Any;
    chk("P3.2", v?.ok === true, "ok", short(JSON.stringify(v), 160));
  }
  {
    const rows = ((SEED?.LAW_V1_ROWS ?? []) as Any[]).filter((r) => r.kind === "SSO").sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
    const grid = [0, 1, B(1_000), B(1_650), B(10_009), B(10_010), B(15_000), B(17_500), B(20_000), B(23_000), B(50_000), 9_999_999];
    const off: string[] = [];
    rows.forEach((row, i) => {
      const first = i === 0 ? "1999-01" : String(row.effectiveFrom).slice(0, 7);
      const nxt = rows[i + 1];
      const last = nxt ? (() => { const [y, m] = String(nxt.effectiveFrom).slice(0, 7).split("-").map(Number) as [number, number]; return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })() : "2099-12";
      for (const p of [first, last]) for (const w of grid) {
        const a = canon(tryv(() => V2.ssoV2(w, row.json)));
        const b = canon(tryv(() => R.ssoContribution(w, p)));
        if (a !== b) off.push(`${row.effectiveFrom}/${p}/${w}`);
      }
    });
    chk("P3.3", rows.length === 4 && off.length === 0, "4 rows × 2 periods × 12 wages equal", `${rows.length} rows · off ${off.length} ${off.slice(0, 4).join(" ")}`);
  }
}

// ═════════════════════════ db ═════════════════════════
const STAMP = `${Date.now()}`;
const tag = tagOf(STAMP);
const SLUG = `${SLUG_PREFIX}${tag}`;
let P: Any = null;
let fx: Any = null;
type Emp = { code: string; base: number; sso: boolean };
const EMPS: Emp[] = [
  { code: "E1", base: B(20_000), sso: true },
  { code: "E2", base: B(10_010), sso: true },
  { code: "E3", base: B(1_000), sso: true },
  { code: "E4", base: B(23_000), sso: true },
  { code: "E5", base: B(20_000), sso: false },
];
/** per period: [ssoBase, sso] in satang for E1..E5 (all WHT = 0 for these wages: net income < 150,000 ฿/yr) */
const RUN_WANT: Record<string, { id: string; pay: string; rows: [number, number][] }> = {
  "2025-12": { id: "D1.1", pay: "2025-12-31", rows: [[1_500_000, 75_000], [1_001_000, 50_100], [165_000, 8_300], [1_500_000, 75_000], [0, 0]] },
  "2026-03": { id: "D1.2", pay: "2026-03-31", rows: [[1_750_000, 87_500], [1_001_000, 50_100], [165_000, 8_300], [1_750_000, 87_500], [0, 0]] },
  "2028-12": { id: "D1.3", pay: "2029-01-05", rows: [[1_750_000, 87_500], [1_001_000, 50_100], [165_000, 8_300], [1_750_000, 87_500], [0, 0]] },
  "2029-01": { id: "D1.4", pay: "2029-01-31", rows: [[2_000_000, 100_000], [1_001_000, 50_100], [165_000, 8_300], [2_000_000, 100_000], [0, 0]] },
  "2031-12": { id: "D1.5", pay: "2032-01-05", rows: [[2_000_000, 100_000], [1_001_000, 50_100], [165_000, 8_300], [2_000_000, 100_000], [0, 0]] },
  "2032-01": { id: "D1.6", pay: "2032-01-31", rows: [[2_000_000, 100_000], [1_001_000, 50_100], [165_000, 8_300], [2_300_000, 115_000], [0, 0]] },
};
const GROSS_TOTAL = EMPS.reduce((s, e) => s + e.base, 0); // 7,401,000
const BASE_SNAPSHOT_KEYS = ["baseSalarySatang", "addSatang", "deductSatang", "adjustments", "ssoEligible", "ssoEmployeeYearSatang", "deductions", "computedAt", "flags"];
const ACTOR = { userId: null, isOwner: true };
const payDay = (d: string) => new Date(`${d}T05:00:00Z`);

/** rewrite a run's stored rows to what the BASE code (15,000 ceiling) wrote: SSO from clamp(1,650…15,000) · base snapshot keys · no ytd/law ids/inputDigest */
async function toPreFix(runId: string): Promise<void> {
  const items = (await P.hrPayrollItem.findMany({ where: { runId } })) as Any[];
  for (const it of items) {
    const snap = (it.snapshotJson ?? {}) as Any;
    const eligible = snap.ssoEligible !== false && it.ssoEmployeeSatang > 0;
    const base = eligible ? Math.min(Math.max(Number(snap.baseSalarySatang ?? it.grossSatang), 165_000), 1_500_000) : 0;
    const s = eligible ? Math.round((base * 500) / 10000 / 100) * 100 : 0;
    const keep = Object.fromEntries(Object.entries(snap).filter(([k]) => BASE_SNAPSHOT_KEYS.includes(k)));
    keep.ssoEmployeeYearSatang = s * 12;
    await P.$executeRawUnsafe(
      `UPDATE "HrPayrollItem" SET "ssoBaseSatang" = $2, "ssoEmployeeSatang" = $3, "ssoEmployerSatang" = $3, "netSatang" = "grossSatang" - $3 - "whtSatang", "snapshotJson" = $4::jsonb, "ytdJson" = NULL, "lawRowIds" = '{}' WHERE id = $1`,
      it.id, base, s, JSON.stringify(keep),
    );
  }
  await P.$executeRawUnsafe(
    `UPDATE "HrPayrollRun" r SET "totalSsoEmployeeSatang" = x.se, "totalSsoEmployerSatang" = x.sr, "totalNetSatang" = x.n, "inputDigest" = NULL, "stepsJson" = NULL
       FROM (SELECT sum("ssoEmployeeSatang")::int se, sum("ssoEmployerSatang")::int sr, sum("netSatang")::int n FROM "HrPayrollItem" WHERE "runId" = $1) x WHERE r.id = $1`,
    runId,
  );
}
async function expectOf(runId: string, digestMod: Any): Promise<Any> {
  const items = (await P.hrPayrollItem.findMany({ where: { runId }, select: digestMod.PAYROLL_DIGEST_SELECT })) as Any[];
  return { totalNetSatang: items.reduce((s, i) => s + i.netSatang, 0), itemCount: items.length, totalGrossSatang: items.reduce((s, i) => s + i.grossSatang, 0), itemsDigest: digestMod.payrollItemsDigest(items) };
}

async function runDb(): Promise<void> {
  const sys = (await import("@/lib/modules/system/service" as string)) as Any;
  const pay = (await import("@/lib/modules/hr/payroll" as string)) as Any;
  const digestMod = (await import("@/lib/modules/hr/payroll-digest" as string)) as Any;
  const TD = await fx.newTenant("", `QC HF-SSO ${tag}`);

  // ── D1: one shop · 5 employees · 6 periods ──
  {
    const s = await sys.createSystem(TD, "HR", "ทีมเพดานประกันสังคม");
    const ctx = { tenantId: TD, systemId: s.id as string };
    const ids: string[] = [];
    for (const e of EMPS) {
      const id = await fx.mkEmp(TD, ctx.systemId, `QC-HFSSO ${e.code} ${tag}`, { code: e.code, startDate: "2025-01-01" });
      await pay.setSalaryProfile(ctx, { employeeId: id, baseSalarySatang: e.base, ssoEligible: e.sso });
      ids.push(id);
    }
    for (const [period, w] of Object.entries(RUN_WANT)) {
      let err = "";
      let runId = "";
      try {
        runId = (await pay.createPayrollRun(ctx, { periodKey: period, payDate: payDay(w.pay) }))?.id ?? "";
      } catch (e) {
        err = errText(e);
      }
      const items = runId ? ((await P.hrPayrollItem.findMany({ where: { runId } })) as Any[]) : [];
      const run = runId ? await P.hrPayrollRun.findUnique({ where: { id: runId } }) : null;
      const off: string[] = [];
      ids.forEach((id, i) => {
        const it = items.find((x) => x.employeeId === id);
        const [b, c] = w.rows[i]!;
        const net = EMPS[i]!.base - c;
        if (!it || it.ssoBaseSatang !== b || it.ssoEmployeeSatang !== c || it.ssoEmployerSatang !== c || it.whtSatang !== 0 || it.netSatang !== net) off.push(`${EMPS[i]!.code}:${it ? `${it.ssoBaseSatang}/${it.ssoEmployeeSatang}/${it.ssoEmployerSatang}/${it.whtSatang}/${it.netSatang}` : "∅"}`);
      });
      const ssoT = w.rows.reduce((a, [, c]) => a + c, 0);
      const tot = run && run.totalGrossSatang === GROSS_TOTAL && run.totalSsoEmployeeSatang === ssoT && run.totalSsoEmployerSatang === ssoT && run.totalWhtSatang === 0 && run.totalNetSatang === GROSS_TOTAL - ssoT;
      chk(w.id, !err && items.length === 5 && off.length === 0 && tot, `5 items literal · sso total ${ssoT} · net ${GROSS_TOTAL - ssoT}`, err || `${off.join(" ") || "items ok"} · totals ${run ? `${run.totalSsoEmployeeSatang}/${run.totalNetSatang}` : "∅"}`);
    }
  }

  // ── D2: pre-fix rows (no retroactive change · approve needs recompute) ──
  {
    const s = await sys.createSystem(TD, "HR", "ทีมรอบก่อนแก้");
    const ctx = { tenantId: TD, systemId: s.id as string };
    const emp = await fx.mkEmp(TD, ctx.systemId, `QC-HFSSO R ${tag}`, { code: "R1", startDate: "2025-01-01" });
    await pay.setSalaryProfile(ctx, { employeeId: emp, baseSalarySatang: B(20_000), ssoEligible: true });
    const mk = async (period: string, day: string) => {
      try {
        const id = (await pay.createPayrollRun(ctx, { periodKey: period, payDate: payDay(day) }))?.id ?? "";
        if (id) await toPreFix(id);
        return { id, err: "" };
      } catch (e) {
        return { id: "", err: errText(e) };
      }
    };
    const nov = await mk("2025-11", "2025-11-28");
    const jan = await mk("2026-01", "2026-01-30");
    const feb = await mk("2026-02", "2026-02-27");
    const itemOf = async (runId: string) => (runId ? ((await P.hrPayrollItem.findFirst({ where: { runId, employeeId: emp } })) as Any) : null);
    const statusOf = async (runId: string) => (runId ? ((await P.hrPayrollRun.findUnique({ where: { id: runId } })) as Any) : null);
    const money = (it: Any) => (it ? `${it.ssoBaseSatang}/${it.ssoEmployeeSatang}/${it.ssoEmployerSatang}/${it.netSatang}` : "∅");

    // D2.1 — APPROVED before the fix
    if (jan.id) await P.hrPayrollRun.update({ where: { id: jan.id }, data: { status: "APPROVED", approvedAt: new Date("2026-01-30T08:00:00Z") } });
    {
      const rc = jan.id ? await pay.recomputeDraftRun(ctx, jan.id, ACTOR).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : { ok: true };
      const it = await itemOf(jan.id);
      const slip = jan.id ? await pay.payslipData(ctx, jan.id, emp).catch(() => null) : null;
      const slipTxt = JSON.stringify(slip ?? {});
      const adj = await P.hrPayAdjustment.count({ where: { tenantId: TD, systemId: ctx.systemId } });
      const run = await statusOf(jan.id);
      const r = { made: !!jan.id, refused: rc?.ok === false, rows: money(it) === "1500000/75000/75000/1925000", status: run?.status === "APPROVED", slip: /"ssoEmployeeSatang":75000\b/.test(slipTxt), noAdj: adj === 0 };
      ck("D2.1", r, "APPROVED keeps 750", `${jan.err} ${money(it)} adj=${adj}`);
    }
    // D2.2 / D2.3 — DRAFT before the fix: approve refused
    let codes = "";
    {
      const a1 = feb.id ? await pay.approveRun(ctx, feb.id, undefined, ACTOR).catch((e: unknown) => ({ ok: false, note: errText(e), code: "THROW" })) : { ok: true };
      const run1 = await statusOf(feb.id);
      const exp = feb.id ? await expectOf(feb.id, digestMod) : null;
      const a2 = feb.id && run1?.status === "DRAFT" ? await pay.approveRun(ctx, feb.id, exp, ACTOR).catch((e: unknown) => ({ ok: false, note: errText(e), code: "THROW" })) : { ok: true };
      const run2 = await statusOf(feb.id);
      codes = `${a1?.code ?? "-"}/${a2?.code ?? "-"}`;
      const r = {
        made: !!feb.id,
        noExpect: a1?.ok === false && a1?.code !== "THROW" && /[฀-๿]/.test(String(a1?.note ?? "")),
        withExpect: a2?.ok === false && a2?.code !== "THROW",
        draft: run2?.status === "DRAFT" && !run2?.journalEntryId,
        rowsUntouched: money(await itemOf(feb.id)) === "1500000/75000/75000/1925000",
      };
      ck("D2.2", r, "refused ×2 · DRAFT · no JV", `${feb.err} codes ${codes} · ${short(a1?.note, 60)}`);
      const aud = feb.id ? await P.auditLog.count({ where: { tenantId: TD, action: "hr.payroll.approve.refused", targetId: feb.id } }) : 0;
      chk("D2.3", aud >= 1, "≥1 refusal audit", `${aud} (codes ${codes})`);
    }
    // D2.4 / D2.5 — recompute then approve
    {
      const rc = feb.id ? await pay.recomputeDraftRun(ctx, feb.id, ACTOR).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : { ok: false };
      const it = await itemOf(feb.id);
      const run = await statusOf(feb.id);
      const r = { ok: rc?.ok === true, rows: money(it) === "1750000/87500/87500/1912500", totals: run?.totalSsoEmployeeSatang === 87_500 && run?.totalSsoEmployerSatang === 87_500 && run?.totalNetSatang === 1_912_500 && run?.status === "DRAFT" };
      ck("D2.4", r, "875/875 · net 1,912,500", `${short(rc?.reason ?? rc?.note, 60)} ${money(it)}`);
      const exp = feb.id ? await expectOf(feb.id, digestMod) : null;
      const ap = feb.id ? await pay.approveRun(ctx, feb.id, exp, ACTOR).catch((e: unknown) => ({ ok: false, note: errText(e) })) : { ok: false };
      const run2 = await statusOf(feb.id);
      const r2 = { ok: ap?.ok === true, status: run2?.status === "APPROVED", rows: money(await itemOf(feb.id)) === "1750000/87500/87500/1912500" };
      ck("D2.5", r2, "approve ok · 875", `${ap?.code ?? ""} ${short(ap?.note, 60)}`);
    }
    // D2.6 — pre-fix DRAFT whose numbers are right (period < 2026-01)
    {
      const ap = nov.id ? await pay.approveRun(ctx, nov.id, undefined, ACTOR).catch((e: unknown) => ({ ok: false, note: errText(e) })) : { ok: false, note: nov.err };
      const run = await statusOf(nov.id);
      const r = { ok: ap?.ok === true, status: run?.status === "APPROVED", rows: money(await itemOf(nov.id)) === "1500000/75000/75000/1925000" };
      ck("D2.6", r, "approves · 750", `${ap?.code ?? ""} ${short(ap?.note, 60)}`);
    }
  }
}

// ═════════════════════════ run ═════════════════════════
let crashed = "";
try {
  const env = await qc4Env(SUITE);
  P = env.P;
  fx = makeFixtures(P, env.coreHash, SLUG);
  const R = (await import("@/lib/modules/hr/payroll-rules" as string)) as Any;
  const V2 = (await import("@/lib/modules/hr/payroll-rules-v2" as string)) as Any;
  const SEED = (await import("./hr-seed-law-draft.mts" as string).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
  runStatic();
  await runPure(R, V2, SEED);
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  const left: string[] = [];
  if (P && fx) {
    const ids = (fx.tenants as string[]).filter((x) => /^[a-z0-9]+$/i.test(x));
    if (ids.length) {
      const inList = ids.map((x) => `'${x}'`).join(",");
      const tables = ((await P.$queryRawUnsafe(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'tenantId'`).catch(() => [])) as Any[]).map((r) => String(r.table_name));
      for (let pass = 0; pass < 4; pass++) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => null);
      await cleanupFx(P, fx, SLUG);
      for (const t of tables) {
        const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" IN (${inList})`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? 0);
        if (n !== 0) left.push(`${t}=${n}`);
      }
    } else await cleanupFx(P, fx, SLUG);
    const tn = await P.tenant.count({ where: { slug: { startsWith: SLUG_PREFIX } } }).catch(() => -1);
    const users = await P.user.count({ where: { email: { startsWith: `${SLUG}-` } } }).catch(() => -1);
    if (tn !== 0) left.push(`tenant(${SLUG_PREFIX}*)=${tn}`);
    if (users !== 0) left.push(`user=${users}`);
    console.log(`RESIDUE ${left.length ? left.join(",") : "none"} (tenants=${fx.tenants.length})`);
    await P.$disconnect?.().catch?.(() => {});
  } else left.push("no db");
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: [] }));
