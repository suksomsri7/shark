// QC — HR V2 · HOTFIX HF-SSO-2569 — social-security wage ceiling by WAGE PERIOD · brief ledger/hr-briefs/hr-brief-HF-SSO.md · note ledger/wo-notes/hr-HF-SSO-oracle.md
// ⚠️ Oracle under change control — ORACLE-EDIT only. Rev 2 = controller rulings Q0–Q4 (14 Nov 2026).
// 🔴 Every expected number is a LITERAL worked by hand from shark-thai-law domain-labour-payroll §ซ [V] / §ฌ [V] + test-rules T-HR-08 [V] / T-HR-10 [V] (rounding [V2]):
//    5 % / 5 % · floor 1,650 · ceiling by wage period: < 2026-01 15,000 · 2026-01…2028-12 17,500 · 2029-01…2031-12 20,000 · ≥ 2032-01 23,000 · round half-up to whole baht.
// CONTRACT (brief R1–R6, rulings Q0–Q4):
//   payroll-rules.ts BYTE-IDENTICAL (FREEZE F16.2) — ssoContribution / monthlyWhtSatang stay for frozen history/tests only; no caller under src/.
//   NEW pure file src/lib/modules/hr/payroll-rules-sso.ts:
//     ssoLawForPeriod(periodKey) → {rateBp, minBaseSatang, maxBaseSatang} · ssoContributionForPeriod(wageSatang, periodKey) → {baseSatang, employeeSatang, employerSatang}
//     ssoAllowanceCapSatang(taxYear) = Σ over the 12 months of that year of the max monthly contribution in force
//     monthlyWhtForTaxYear({monthlySalarySatang, ssoEmployeeYearSatang, deductions?}, taxYear) = monthlyWhtSatang with SSO allowance capped by ssoAllowanceCapSatang(taxYear)
//     missing / malformed period or year ⇒ throws.
//   payroll.ts (v1): build/recompute use the new functions (period = run.periodKey · tax year = Bangkok year of payDate) · run.stepsJson.ssoLaw = {periodKey, maxBaseSatang, rateBp}
//     (no marker = pre-fix run) · approve re-derives SSO of each stored row ⇒ differs ⇒ {ok:false, code "RECOMPUTE", note TEXT_RECOMPUTE} + refusal audit · APPROVED/PAID untouched
//   labor.ts (H4.2) + payroll-opening.ts (SSO_HIGH) read the ceiling from ssoLawForPeriod.
//   law.ts (v2): ssoLawDayOf(periodKey) = "YYYY-MM-01" · pickLawSet(rows, onDay, kinds?, {ssoDay?}) / loadLawSet(onDay, db?, {ssoDay?}) pick SSO on ssoDay, other kinds on onDay ·
//     payroll.ts v2 build passes ssoDay = ssoLawDayOf(run.periodKey).
//   scripts/hr-seed-law-draft.mts: SSO rows 1970-01-01 (v1:SSO, byte-identical) · 2026-01-01 (v1:SSO:2569) · 2029-01-01 (v1:SSO:2572) · 2032-01-01 (v1:SSO:2575), all DRAFT.
// Tenants qc-hr-hfsso-<stamp> (deleted at the end) · no law rows written (v2 checked on the seed rows in memory) · no ACCOUNT system · "pre-fix" rows simulated by toPreFix().
import { type Any, type Base, type Sev, rd, short, errText, stripComments, canon, sha, srcFiles, makeRegistry, qc4Env, makeFixtures, cleanupFx, tagOf } from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-hf-sso";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-hfsso-";
const H = "src/lib/modules/hr/";
const F = {
  rules: `${H}payroll-rules.ts`, sso: `${H}payroll-rules-sso.ts`, payroll: `${H}payroll.ts`, labor: `${H}labor.ts`, openRules: `${H}payroll-opening-rules.ts`, opening: `${H}payroll-opening.ts`, law: `${H}law.ts`,
};
const RULES_SHA_FROZEN = "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7"; // = qc-hr-lib PAYROLL_RULES_SHA = fitness-hr PAYROLL_RULES_SHA256 (Q0: unchanged)
const TEXT_RECOMPUTE = "ต้องคำนวณรอบนี้ใหม่ก่อนอนุมัติ (อัตราประกันสังคมของงวดนี้เปลี่ยน)"; // Q3 literal

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = `
S1.1|Q0|C|R|[static] no call of the frozen ssoContribution( / monthlyWhtSatang( under src/ outside payroll-rules.ts
S1.2|Q0|C|G|[static] payroll-rules.ts byte-identical (sha 75a66c0c…)
S1.3|R1|C|R|[static] payroll-rules-sso.ts exists · pure (no Date/now · no @/ or DB import) · exports the 4 functions
S1.4|R2|C|R|[static] payroll.ts (v1) calls ssoContributionForPeriod(…period…) and monthlyWhtForTaxYear(
S1.5|R2|M|R|[static] H4.2 labor.ts takes the SSO ceiling from ssoLawForPeriod (no SSO law-row pick)
S1.6|R2|M|R|[static] SSO_HIGH (payroll-opening.ts) takes the ceiling from ssoLawForPeriod (no SSO law-row read)
S1.7|R2|M|G|[static] ssoHigh has no 15,000/750 literal — ceiling is a parameter
S1.8|R5|M|G|[static] filings / reports / payslip / bank files call no SSO function (carry stored amounts)
S1.9|Q2|C|R|[static] v2: law.ts exports ssoLawDayOf · loadLawSet forwards ssoDay · payroll.ts v2 build passes ssoLawDayOf(…periodKey…)
P1.1|R1|C|R|[pure] ssoContributionForPeriod 2025-12 × 9 wages (ceiling 15,000)
P1.2|R1|C|R|[pure] 2026-01 × 9 wages (17,500)
P1.3|R1|C|R|[pure] 2028-12 × 9 wages (17,500)
P1.4|R1|C|R|[pure] 2029-01 × 9 wages (20,000)
P1.5|R1|C|R|[pure] 2031-12 × 9 wages (20,000)
P1.6|R1|C|R|[pure] 2032-01 × 9 wages (23,000)
P2.1|R1|C|R|[pure] ssoLawForPeriod: 10 periods literal
P2.2|R2|C|R|[pure] missing / malformed / non-string period ⇒ throws (ssoContributionForPeriod · ssoLawForPeriod)
P2.3|Q0|C|G|[pure] frozen ssoContribution unchanged (20,000 → 750 · cfg 3 % → 450 · 1,000 → 83)
P2.4|T-HR-08|C|R|[pure] T-HR-08 vectors (งวด 2569 20,000 → 875 · 17,500 → 875 · 10,010 → 501 · 10,009 → 500 · 1,000 → 83 · ม.ค. 2572 20,000 → 1,000)
P2.5|Q1|M|R|[pure] ssoAllowanceCapSatang: 2025 9,000 · 2026 10,500 · 2028 10,500 · 2029 12,000 · 2031 12,000 · 2032 13,800 · bad year throws
P2.6|Q1|M|R|[pure] monthlyWhtForTaxYear 50,000/month: 2025 (9,000) 1,716.67 · 2026 T-HR-10 (10,500) 1,704.17 · 2029 (12,000) 1,691.67 · 2032 (13,800) 1,676.67 · cap applies
P2.7|Q0|C|G|[pure] frozen monthlyWhtSatang unchanged (50,000 with 10,500 ⇒ 1,716.67 — 9,000 cap)
P3.1|Q4|C|R|[pure] hr-seed-law-draft LAW_V1_ROWS: 4 dated SSO rows literal · 1970 row = old v1:SSO json · 1970 TAX/DED/OT unchanged
P3.2|R4|C|G|[pure] hr-seed-law-draft verifyAgainstFrozen() ok
P3.3|R4|C|R|[pure] parity: ssoV2(seed row) = ssoContributionForPeriod(first and last period of that row) on 12 wages
V2.1|Q2|C|R|[pure] v2 pick: period 2028-12 paid 2029-01-05 ⇒ SSO row 17,500 (TAX/DED by pay day) · period 2029-01 ⇒ 20,000 · ssoLawDayOf literal + throws
V2.2|Q1|M|R|[pure] v2 projection: 50,000 Jan 2026 on the seed rows ⇒ projected SSO 10,500 · annual tax 20,450 · WHT 1,704.17 (no 9,000 cap)
D1.1|R2|C|R|[db] v1 run 2025-12: items literal (SSO 750 · WHT 1,716.67) + totals + marker 1,500,000
D1.2|R2|C|R|[db] v1 run 2026-03: 875 · WHT 1,704.17 · totals · marker 1,750,000
D1.3|Q2|C|R|[db] v1 run 2028-12 paid 2029-01-05: SSO 875 (period decides) · marker 1,750,000
D1.4|R2|C|R|[db] v1 run 2029-01: 1,000 · WHT 1,691.67 · marker 2,000,000
D1.5|Q2|C|R|[db] v1 run 2031-12 paid 2032-01-05: SSO 1,000 · marker 2,000,000
D1.6|R2|C|R|[db] v1 run 2032-01: 1,150 / 1,000 · WHT 1,676.67 · marker 2,300,000
D2.1|R3|C|G|[db] APPROVED run made before the fix (2026-01, 750): recompute refused · rows 750 · payslip 750 · no marker · no adjustment written
D2.2|Q3|C|R|[db] DRAFT made before the fix (2026-02, 750): approve ⇒ RECOMPUTE + literal text, with and without the viewer's exact expect · DRAFT · no JV
D2.3|Q3|M|R|[db] the refusal is audited (hr.payroll.approve.refused on that run)
D2.4|R3|C|R|[db] recomputeDraftRun ⇒ 875/875 · totals literal · marker 1,750,000
D2.5|R3|C|R|[db] approve after recompute ⇒ ok · APPROVED · rows 875
D2.6|R3|M|G|[db] DRAFT made before the fix whose numbers are still right (2025-11, 750) approves
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
/** 12 × max monthly contribution (all 12 months of a calendar year share one band — bands start on 1 January) */
const CAP_WANT: [number, number][] = [[2025, 900_000], [2026, 1_050_000], [2028, 1_050_000], [2029, 1_200_000], [2031, 1_200_000], [2032, 1_380_000]];
/** 50,000/month, no spouse/children: annual 600,000 − 100,000 − 60,000 − SSO ⇒ tax ⇒ ÷12 (Math.round, satang) */
const WHT_WANT: [number, number, number][] = [
  [2025, 900_000, 171_667], // 431,000 ⇒ 7,500 + 13,100 = 20,600 ⇒ 1,716.67
  [2026, 1_050_000, 170_417], // T-HR-10: 429,500 ⇒ 7,500 + 12,950 = 20,450 ⇒ 1,704.17
  [2029, 1_200_000, 169_167], // 428,000 ⇒ 7,500 + 12,800 = 20,300 ⇒ 1,691.67
  [2032, 1_380_000, 167_667], // 426,200 ⇒ 7,500 + 12,620 = 20,120 ⇒ 1,676.67
  [2026, 1_380_000, 170_417], // passed 13,800 in 2026 ⇒ capped at 10,500
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
    if (/function\s*$/.test(src.slice(Math.max(0, m.index - 9), m.index))) continue;
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
const fnBodyOf = (s: string, head: RegExp): string => {
  const m = head.exec(s);
  if (!m) return "";
  const i = s.indexOf("{", m.index + m[0].length - 1);
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") d++;
    if (s[j] === "}" && --d === 0) return s.slice(m.index, j + 1);
  }
  return "";
};
function runStatic(): void {
  const files = srcFiles("src");
  const code = new Map(files.map((f) => [f, stripComments(rd(f))]));
  {
    const hits: string[] = [];
    for (const [f, s] of code) {
      if (f === F.rules) continue;
      for (const n of ["ssoContribution", "monthlyWhtSatang"]) if (callsOf(s, n).length) hits.push(`${f.replace(H, "")}:${n}×${callsOf(s, n).length}`);
    }
    chk("S1.1", hits.length === 0, "none", hits.join(" ") || "none");
  }
  {
    const s = sha(rd(F.rules));
    chk("S1.2", s === RULES_SHA_FROZEN, RULES_SHA_FROZEN.slice(0, 12), s.slice(0, 12));
  }
  {
    const raw = rd(F.sso);
    const s = stripComments(raw);
    const imports = [...s.matchAll(/^\s*import\s+[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
    const r = {
      exists: raw.length > 0,
      pure: !/\bnew Date\b|Date\.now\s*\(/.test(s) && !/\b(prisma|tenantDb|fetch)\b/.test(s),
      imports: imports.every((p) => p === "./payroll-rules"),
      fns: ["ssoLawForPeriod", "ssoContributionForPeriod", "ssoAllowanceCapSatang", "monthlyWhtForTaxYear"].every((n) => new RegExp(`export\\s+(function|const)\\s+${n}\\b`).test(s)),
    };
    ck("S1.3", r, "new pure file with 4 exports", `imports ${imports.join(",") || "-"}`);
  }
  {
    const s = code.get(F.payroll) ?? "";
    const c = callsOf(s, "ssoContributionForPeriod");
    const w = callsOf(s, "monthlyWhtForTaxYear");
    const r = { sso: c.length > 0 && c.every((a) => a.length === 2 && /period/i.test(a[1] ?? "")), wht: w.length > 0 && w.every((a) => a.length === 2) };
    ck("S1.4", r, "live v1 path on the new functions", `sso ${c.map((a) => short(a[1] ?? "∅", 20)).join(",") || "∅"} · wht ${w.length}`);
  }
  {
    const s = code.get(F.labor) ?? "";
    const r = { uses: /\bssoLawForPeriod\s*\(/.test(s), noRow: !/pickLawRow\([^)]*["']SSO["']/.test(s) };
    ck("S1.5", r, "ssoLawForPeriod · no SSO row pick");
  }
  {
    const s = code.get(F.opening) ?? "";
    const r = { uses: /\bssoLawForPeriod\s*\(/.test(s), noRow: !/\.SSO\??\.json/.test(s) };
    ck("S1.6", r, "ssoLawForPeriod · no SSO row read");
  }
  {
    const body = fnBodyOf(code.get(F.openRules) ?? "", /export function ssoHigh\b[^{]*/);
    const r = { found: !!body, noLiteral: !/\b(15_?000|1_?500_?000|75_?000|750)\b/.test(body) };
    ck("S1.7", r, "ssoHigh ceiling is a parameter");
  }
  {
    const watch = files.filter((f) => f.startsWith(`${H}filings/`) || f.startsWith(`${H}bank-files/`) || f === `${H}reports.ts` || f === `${H}payslip.ts`);
    const hits = watch.filter((f) => /\b(ssoContribution|ssoContributionForPeriod|ssoLawForPeriod|ssoV2)\s*\(/.test(code.get(f) ?? ""));
    chk("S1.8", watch.length > 0 && hits.length === 0, `${watch.length} files carry stored amounts`, hits.join(",") || `none of ${watch.length}`);
  }
  {
    const law = code.get(F.law) ?? "";
    const pay = code.get(F.payroll) ?? "";
    const load = fnBodyOf(law, /export async function loadLawSet\b[^{]*/);
    const r = {
      dayFn: /export\s+(function|const)\s+ssoLawDayOf\b/.test(law),
      forwards: /ssoDay/.test(load) && /pickLawSet\([^)]*(opts|ssoDay)/.test(load),
      v2Build: callsOf(pay, "ssoLawDayOf").some((a) => /periodKey/.test(a[0] ?? "")),
    };
    ck("S1.9", r, "SSO law day = wage period in v2");
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
const seedActive = (SEED: Any): Any[] => ((SEED?.LAW_V1_ROWS ?? []) as Any[]).map((r) => ({ id: `${r.kind}@${r.effectiveFrom}`, kind: r.kind, effectiveFrom: r.effectiveFrom, status: "ACTIVE", json: r.json }));
async function runPure(R: Any, S: Any, V2: Any, LAW: Any, SEED: Any): Promise<void> {
  const fn = (n: string) => (S && typeof S[n] === "function" ? S[n] : null);
  const sso = (w: number, p: unknown) => (fn("ssoContributionForPeriod") ? S.ssoContributionForPeriod(w, p) : "∅ ssoContributionForPeriod");
  for (const [p, rows] of Object.entries(WANT)) {
    const off: string[] = [];
    WAGES.forEach((w, i) => {
      const [b, c] = rows[i]!;
      const got = tryv(() => sso(B(w), p)) as Any;
      if (!(got && got.baseSatang === B(b) && got.employeeSatang === B(c) && got.employerSatang === B(c))) off.push(`${w}→${short(JSON.stringify(got), 60)}≠${b}/${c}`);
    });
    chk(PURE_ID[p]!, off.length === 0, `${WAGES.length} wages literal`, off.slice(0, 3).join(" ; ") || "ok");
  }
  {
    const off: string[] = [];
    for (const [p, max] of LAW_WANT) {
      const got = fn("ssoLawForPeriod") ? (tryv(() => S.ssoLawForPeriod(p)) as Any) : "∅ ssoLawForPeriod";
      if (!(got && got.rateBp === 500 && got.minBaseSatang === 165_000 && got.maxBaseSatang === max)) off.push(`${p}:${short(JSON.stringify(got), 50)}`);
    }
    chk("P2.1", off.length === 0, "10 periods literal", off.slice(0, 3).join(" ; ") || "ok");
  }
  {
    const badP: unknown[] = [undefined, null, "", "2026-13", "2026-00", "2026-1", "26-01", "2026-01-15", 202601, new Date("2026-01-15T00:00:00Z")];
    const r: Record<string, boolean> = { fns: !!fn("ssoContributionForPeriod") && !!fn("ssoLawForPeriod"), noArg: !!fn("ssoContributionForPeriod") && throws(() => S.ssoContributionForPeriod(B(20_000))) };
    badP.forEach((p, i) => {
      r[`c${i}`] = !!fn("ssoContributionForPeriod") && throws(() => S.ssoContributionForPeriod(B(20_000), p));
      r[`l${i}`] = !!fn("ssoLawForPeriod") && throws(() => S.ssoLawForPeriod(p));
    });
    ck("P2.2", r, "throws on every missing/malformed period");
  }
  {
    const a = tryv(() => R.ssoContribution(B(20_000))) as Any;
    const b = tryv(() => R.ssoContribution(B(20_000), { rateBp: 300 })) as Any;
    const c = tryv(() => R.ssoContribution(B(1_000))) as Any;
    const r = { a: a?.baseSatang === 1_500_000 && a?.employeeSatang === 75_000, b: b?.employeeSatang === 45_000, c: c?.employeeSatang === 8_300 };
    ck("P2.3", r, "750 · 450 · 83");
  }
  {
    const v: [number, string, number][] = [[20_000, "2026-06", 875], [17_500, "2026-06", 875], [10_010, "2026-06", 501], [10_009, "2026-06", 500], [1_000, "2026-06", 83], [20_000, "2029-01", 1_000]];
    const off = v.filter(([w, p, c]) => (tryv(() => sso(B(w), p)) as Any)?.employeeSatang !== B(c)).map(([w, p, c]) => `${w}@${p}≠${c}`);
    chk("P2.4", off.length === 0, "6 T-HR-08 vectors", off.join(" ") || "ok");
  }
  {
    const off = CAP_WANT.filter(([y, c]) => !fn("ssoAllowanceCapSatang") || tryv(() => S.ssoAllowanceCapSatang(y)) !== c).map(([y, c]) => `${y}:${short(String(fn("ssoAllowanceCapSatang") ? tryv(() => S.ssoAllowanceCapSatang(y)) : "∅"), 30)}≠${c}`);
    const thr = !!fn("ssoAllowanceCapSatang") && [undefined, "2026", 2026.5, NaN].every((y) => throws(() => S.ssoAllowanceCapSatang(y)));
    chk("P2.5", off.length === 0 && thr, "6 years literal · bad year throws", `${off.join(" ") || "ok"} · throws=${thr}`);
  }
  {
    const off = WHT_WANT.filter(([y, s, w]) => !fn("monthlyWhtForTaxYear") || tryv(() => S.monthlyWhtForTaxYear({ monthlySalarySatang: B(50_000), ssoEmployeeYearSatang: s }, y)) !== w).map(([y, s, w]) => `${y}/${s}:${short(String(fn("monthlyWhtForTaxYear") ? tryv(() => S.monthlyWhtForTaxYear({ monthlySalarySatang: B(50_000), ssoEmployeeYearSatang: s }, y)) : "∅"), 30)}≠${w}`);
    chk("P2.6", off.length === 0, "5 vectors literal", off.join(" ") || "ok");
  }
  {
    const got = tryv(() => R.monthlyWhtSatang({ monthlySalarySatang: B(50_000), ssoEmployeeYearSatang: B(10_500) }));
    chk("P2.7", got === 171_667, "171667", String(got));
  }
  {
    const rows = (SEED?.LAW_V1_ROWS ?? []) as Any[];
    const ssoRows = rows.filter((r) => r.kind === "SSO").map((r) => ({ effectiveFrom: String(r.effectiveFrom), json: r.json })).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
    const old1970 = rows.filter((r) => r.kind !== "SSO" && r.effectiveFrom === "1970-01-01").map((r) => ({ kind: r.kind, effectiveFrom: r.effectiveFrom, json: r.json }));
    const keys = rows.map((r) => `${r.kind}@${r.effectiveFrom}`);
    const r = {
      four: ssoRows.length === 4,
      dated: canon(ssoRows.map((x) => ({ effectiveFrom: x.effectiveFrom, maxBaseSatang: x.json?.maxBaseSatang }))) === canon(SSO_SEED_WANT),
      sameShape: ssoRows.every((x) => canon({ ...x.json, maxBaseSatang: 0 }) === canon({ ...OLD_SSO_JSON, maxBaseSatang: 0 })),
      oldRow: canon(ssoRows[0]?.json) === canon(OLD_SSO_JSON),
      others1970: canon(old1970) === canon(OLD_OTHER_ROWS),
      distinct: new Set(keys).size === keys.length,
    };
    ck("P3.1", r, "4 dated SSO rows · 1970 rows byte-equal", short(JSON.stringify(ssoRows.map((x) => [x.effectiveFrom, x.json?.maxBaseSatang])), 120));
  }
  {
    const v = (await Promise.resolve(tryv(() => SEED.verifyAgainstFrozen())).catch((e: unknown) => `throw ${errText(e)}`)) as Any;
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
      for (const p of [first, last]) for (const w of grid) if (canon(tryv(() => V2.ssoV2(w, row.json))) !== canon(tryv(() => sso(w, p)))) off.push(`${row.effectiveFrom}/${p}/${w}`);
    });
    chk("P3.3", rows.length === 4 && off.length === 0, "4 rows × 2 periods × 12 wages equal", `${rows.length} rows · off ${off.length} ${off.slice(0, 3).join(" ")}`);
  }
  {
    const rows = seedActive(SEED);
    const dayOf = (p: string) => (LAW && typeof LAW.ssoLawDayOf === "function" ? tryv(() => LAW.ssoLawDayOf(p)) : "∅");
    const pick = (onDay: string, period: string) => tryv(() => LAW.pickLawSet(rows, onDay, undefined, { ssoDay: dayOf(period) })) as Any;
    const a = pick("2029-01-05", "2028-12");
    const b = pick("2029-01-31", "2029-01");
    const r = {
      day: dayOf("2028-12") === "2028-12-01" && dayOf("2029-01") === "2029-01-01",
      dayThrows: typeof LAW?.ssoLawDayOf === "function" && ["", "2028-13", "2028-1", undefined].every((p) => throws(() => LAW.ssoLawDayOf(p))),
      dec: a?.ok === true && a.set?.SSO?.json?.maxBaseSatang === 1_750_000 && a.set?.TAX_BRACKET?.effectiveFrom === "1970-01-01",
      jan: b?.ok === true && b.set?.SSO?.json?.maxBaseSatang === 2_000_000,
    };
    ck("V2.1", r, "SSO by wage period in v2", `dec ${a?.set?.SSO?.json?.maxBaseSatang ?? short(JSON.stringify(a), 40)} · jan ${b?.set?.SSO?.json?.maxBaseSatang ?? "∅"}`);
  }
  {
    const rows = seedActive(SEED);
    const ssoDay = LAW && typeof LAW.ssoLawDayOf === "function" ? tryv(() => LAW.ssoLawDayOf("2026-01")) : "2026-01-01";
    const set = tryv(() => LAW.pickLawSet(rows, "2026-01-31", undefined, { ssoDay })) as Any;
    const it = set?.ok ? (tryv(() => V2.computeItemV2({ baseSatang: B(50_000), adjustments: [], ssoEligible: true, deductions: { spouse: false, children: 0 }, monthIndex: 1, prior: { incomeSatang: 0, whtSatang: 0, ssoSatang: 0 } }, set.set)) as Any) : null;
    const r = { sso: it?.ssoEmployeeSatang === 87_500, proj: it?.ytdJson?.projectedSsoSatang === 1_050_000, net: it?.ytdJson?.projectedNetSatang === 42_950_000, tax: it?.ytdJson?.annualTaxSatang === 2_045_000, wht: it?.whtSatang === 170_417 };
    ck("V2.2", r, "875 · 1,050,000 · 42,950,000 · 2,045,000 · 170,417", short(JSON.stringify({ s: it?.ssoEmployeeSatang, y: it?.ytdJson, w: it?.whtSatang }), 200));
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
  { code: "E6", base: B(50_000), sso: true },
];
/** per period: [ssoBase, sso, wht|null] satang for E1..E6 · wht null = not pinned (period/pay-date straddle — projection rule not given by the reference) · E1–E5 WHT 0 (net income < 150,000/yr) */
const RUN_WANT: Record<string, { id: string; pay: string; max: number; rows: [number, number, number | null][] }> = {
  "2025-12": { id: "D1.1", pay: "2025-12-31", max: 1_500_000, rows: [[1_500_000, 75_000, 0], [1_001_000, 50_100, 0], [165_000, 8_300, 0], [1_500_000, 75_000, 0], [0, 0, 0], [1_500_000, 75_000, 171_667]] },
  "2026-03": { id: "D1.2", pay: "2026-03-31", max: 1_750_000, rows: [[1_750_000, 87_500, 0], [1_001_000, 50_100, 0], [165_000, 8_300, 0], [1_750_000, 87_500, 0], [0, 0, 0], [1_750_000, 87_500, 170_417]] },
  "2028-12": { id: "D1.3", pay: "2029-01-05", max: 1_750_000, rows: [[1_750_000, 87_500, 0], [1_001_000, 50_100, 0], [165_000, 8_300, 0], [1_750_000, 87_500, 0], [0, 0, 0], [1_750_000, 87_500, null]] },
  "2029-01": { id: "D1.4", pay: "2029-01-31", max: 2_000_000, rows: [[2_000_000, 100_000, 0], [1_001_000, 50_100, 0], [165_000, 8_300, 0], [2_000_000, 100_000, 0], [0, 0, 0], [2_000_000, 100_000, 169_167]] },
  "2031-12": { id: "D1.5", pay: "2032-01-05", max: 2_000_000, rows: [[2_000_000, 100_000, 0], [1_001_000, 50_100, 0], [165_000, 8_300, 0], [2_000_000, 100_000, 0], [0, 0, 0], [2_000_000, 100_000, null]] },
  "2032-01": { id: "D1.6", pay: "2032-01-31", max: 2_300_000, rows: [[2_000_000, 100_000, 0], [1_001_000, 50_100, 0], [165_000, 8_300, 0], [2_300_000, 115_000, 0], [0, 0, 0], [2_300_000, 115_000, 167_667]] },
};
const GROSS_TOTAL = EMPS.reduce((s, e) => s + e.base, 0); // 12,401,000
const BASE_SNAPSHOT_KEYS = ["baseSalarySatang", "addSatang", "deductSatang", "adjustments", "ssoEligible", "ssoEmployeeYearSatang", "deductions", "computedAt", "flags"];
const ACTOR = { userId: null, isOwner: true };
const payDay = (d: string) => new Date(`${d}T05:00:00Z`);
const markerOk = (run: Any, period: string, max: number) => {
  const m = (run?.stepsJson as Any)?.ssoLaw;
  return !!m && m.periodKey === period && m.maxBaseSatang === max && m.rateBp === 500;
};

/** rewrite a run's stored rows to what the BASE code wrote: SSO clamp(1,650…15,000) · base snapshot keys · no ytd/law ids/inputDigest/stepsJson (no marker) — WHT kept (wages here have WHT 0) */
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

  // ── D1: one shop · 6 employees · 6 periods ──
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
        const [b, c, wht] = w.rows[i]!;
        const whtOk = wht === null ? true : it?.whtSatang === wht;
        const netOk = it ? it.netSatang === EMPS[i]!.base - c - it.whtSatang : false;
        if (!it || it.ssoBaseSatang !== b || it.ssoEmployeeSatang !== c || it.ssoEmployerSatang !== c || !whtOk || !netOk) off.push(`${EMPS[i]!.code}:${it ? `${it.ssoBaseSatang}/${it.ssoEmployeeSatang}/${it.ssoEmployerSatang}/${it.whtSatang}/${it.netSatang}` : "∅"}`);
      });
      const ssoT = w.rows.reduce((a, [, c]) => a + c, 0);
      const whtT = w.rows.every(([, , x]) => x !== null) ? w.rows.reduce((a, [, , x]) => a + (x ?? 0), 0) : null;
      const tot = !!run && run.totalGrossSatang === GROSS_TOTAL && run.totalSsoEmployeeSatang === ssoT && run.totalSsoEmployerSatang === ssoT && (whtT === null || run.totalWhtSatang === whtT) && run.totalNetSatang === GROSS_TOTAL - ssoT - run.totalWhtSatang;
      const r = { made: !err && items.length === 6, items: off.length === 0, totals: tot, marker: markerOk(run, period, w.max) };
      ck(w.id, r, `6 items literal · SSO total ${ssoT}${whtT === null ? "" : ` · WHT ${whtT} · net ${GROSS_TOTAL - ssoT - whtT}`} · marker ${w.max}`, `${err} ${off.join(" ")} · totals ${run ? `${run.totalSsoEmployeeSatang}/${run.totalWhtSatang}/${run.totalNetSatang}` : "∅"} · marker ${short(JSON.stringify((run?.stepsJson as Any)?.ssoLaw ?? null), 60)}`);
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
    const runOf = async (runId: string) => (runId ? ((await P.hrPayrollRun.findUnique({ where: { id: runId } })) as Any) : null);
    const money = (it: Any) => (it ? `${it.ssoBaseSatang}/${it.ssoEmployeeSatang}/${it.ssoEmployerSatang}/${it.netSatang}` : "∅");

    if (jan.id) await P.hrPayrollRun.update({ where: { id: jan.id }, data: { status: "APPROVED", approvedAt: new Date("2026-01-30T08:00:00Z") } });
    {
      const rc = jan.id ? await pay.recomputeDraftRun(ctx, jan.id, ACTOR).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : { ok: true };
      const it = await itemOf(jan.id);
      const slip = jan.id ? await pay.payslipData(ctx, jan.id, emp).catch(() => null) : null;
      const adj = await P.hrPayAdjustment.count({ where: { tenantId: TD, systemId: ctx.systemId } });
      const run = await runOf(jan.id);
      const r = { made: !!jan.id, refused: rc?.ok === false, rows: money(it) === "1500000/75000/75000/1925000", status: run?.status === "APPROVED", noMarker: !(run?.stepsJson as Any)?.ssoLaw, slip: /"ssoEmployeeSatang":75000\b/.test(JSON.stringify(slip ?? {})), noAdj: adj === 0 };
      ck("D2.1", r, "APPROVED keeps 750", `${jan.err} ${money(it)} adj=${adj}`);
    }
    let codes = "";
    {
      const a1 = feb.id ? await pay.approveRun(ctx, feb.id, undefined, ACTOR).catch((e: unknown) => ({ ok: false, note: errText(e), code: "THROW" })) : { ok: true };
      const run1 = await runOf(feb.id);
      const exp = feb.id ? await expectOf(feb.id, digestMod) : null;
      const a2 = feb.id && run1?.status === "DRAFT" ? await pay.approveRun(ctx, feb.id, exp, ACTOR).catch((e: unknown) => ({ ok: false, note: errText(e), code: "THROW" })) : { ok: true };
      const run2 = await runOf(feb.id);
      codes = `${a1?.code ?? "-"}/${a2?.code ?? "-"}`;
      const r = {
        made: !!feb.id,
        noExpect: a1?.ok === false && a1?.code === "RECOMPUTE" && a1?.note === TEXT_RECOMPUTE,
        withExpect: a2?.ok === false && a2?.code === "RECOMPUTE" && a2?.note === TEXT_RECOMPUTE,
        draft: run2?.status === "DRAFT" && !run2?.journalEntryId,
        rowsUntouched: money(await itemOf(feb.id)) === "1500000/75000/75000/1925000",
      };
      ck("D2.2", r, `RECOMPUTE ×2 "${TEXT_RECOMPUTE}" · DRAFT · no JV`, `${feb.err} codes ${codes} · ${short(a1?.note, 60)}`);
      const aud = feb.id ? await P.auditLog.count({ where: { tenantId: TD, action: "hr.payroll.approve.refused", targetId: feb.id } }) : 0;
      chk("D2.3", aud >= 1, "≥1 refusal audit", `${aud} (codes ${codes})`);
    }
    {
      const rc = feb.id ? await pay.recomputeDraftRun(ctx, feb.id, ACTOR).catch((e: unknown) => ({ ok: false, reason: errText(e) })) : { ok: false };
      const it = await itemOf(feb.id);
      const run = await runOf(feb.id);
      const r = { ok: rc?.ok === true, rows: money(it) === "1750000/87500/87500/1912500", totals: run?.totalSsoEmployeeSatang === 87_500 && run?.totalSsoEmployerSatang === 87_500 && run?.totalNetSatang === 1_912_500 && run?.status === "DRAFT", marker: markerOk(run, "2026-02", 1_750_000) };
      ck("D2.4", r, "875/875 · net 1,912,500 · marker", `${short(rc?.reason ?? rc?.note, 60)} ${money(it)}`);
      const exp = feb.id ? await expectOf(feb.id, digestMod) : null;
      const ap = feb.id ? await pay.approveRun(ctx, feb.id, exp, ACTOR).catch((e: unknown) => ({ ok: false, note: errText(e) })) : { ok: false };
      const run2 = await runOf(feb.id);
      const r2 = { ok: ap?.ok === true, status: run2?.status === "APPROVED", rows: money(await itemOf(feb.id)) === "1750000/87500/87500/1912500" };
      ck("D2.5", r2, "approve ok · 875", `${ap?.code ?? ""} ${short(ap?.note, 60)}`);
    }
    {
      const ap = nov.id ? await pay.approveRun(ctx, nov.id, undefined, ACTOR).catch((e: unknown) => ({ ok: false, note: errText(e) })) : { ok: false, note: nov.err };
      const run = await runOf(nov.id);
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
  const S = (await import("@/lib/modules/hr/payroll-rules-sso" as string).catch(() => null)) as Any;
  const V2 = (await import("@/lib/modules/hr/payroll-rules-v2" as string)) as Any;
  const LAW = (await import("@/lib/modules/hr/law" as string)) as Any;
  const SEED = (await import("./hr-seed-law-draft.mts" as string).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
  runStatic();
  await runPure(R, S, V2, LAW, SEED);
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
