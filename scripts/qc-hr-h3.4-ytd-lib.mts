// qc-hr-h3.4-ytd-lib.mts — helpers of the H3.4-YTD oracle (opening year-to-date) · statics · pure · lock holder
// ⚠️ Oracle under change control — ORACLE-EDIT only (same owner as scripts/qc-hr-h3.4-ytd.mts).
// 🔴 Every amount below is hand arithmetic of brief §6 "worked example" (30,000 ฿/month, single, H3.4 QC law rows) — re-derived by
//    `oracleWht` (written from the law, imports nothing under test). The DB never produces an expected number.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  type Any, ROOT, rd, short, errText, isThai, stripComments, canon, sha, srt, importsOf, jsonOf, testidsOf, tokensOnly, flat, diffHunks, sleep,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA,
} from "./qc-hr-lib.mjs";

type Ck = (id: string, r: Record<string, unknown>, exp: string, extra?: string) => void;
export const H = "src/lib/modules/hr/";
export const F = {
  pure: `${H}payroll-opening-rules.ts`, svc: `${H}payroll-opening.ts`, read: `${H}payroll-opening-read.ts`, // ORACLE-EDIT (H3.4-YTD fix round · controller ruling 5): + read module ◂
  acts: `${H}payroll-opening-actions.ts`, ui: `${H}payroll-opening-ui.tsx`,
  mig: "prisma/migrations/20270110000001_hr_opening_ytd/migration.sql", schema: "prisma/schema/payroll.prisma", hrSchema: "prisma/schema/hr.prisma",
  payroll: `${H}payroll.ts`, filings: `${H}filings/service.ts`, reports: `${H}reports.ts`, runUi: `${H}payroll-run-ui.tsx`, page: "src/app/app/sys/[id]/hr/payroll/page.tsx",
  scope: "src/lib/core/scope.ts", env: "scripts/hr-qc-env.mts", index: `${H}index.ts`, th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json",
};
/** new files of the ticket (whole file is the ticket's) */
export const NEW_FILES = [F.pure, F.svc, F.acts, F.ui, F.mig, F.read]; // ORACLE-EDIT (H3.4-YTD fix round · controller ruling 5): + read module ◂
/** brief §5 frozen (+ seed · fixtures · package.json) — compared byte for byte with the base */
export const FROZEN = [
  `${H}payroll-rules-v2.ts`, `${H}payroll-run-rules.ts`, `${H}payroll-journal-rules.ts`, `${H}bank-files`, "src/lib/modules/account", `${H}law.ts`, "src/lib/modules/platform/hr-law.ts",
  `${H}privacy.ts`, `${H}privacy-shared.ts`, `${H}self.ts`, "src/lib/modules/approval", "src/lib/outbox-consumers.ts", "scripts/seed-hr-qc.mts", "scripts/fixtures", "package.json",
  ...["build", "rd", "sso", "figures", "cert", "texts", "actions", "ui", "cert-pdf", "download-route"].map((n) => `${H}filings/${n}.ts${n === "ui" || n === "cert-pdf" ? "x" : ""}`),
];
/** other oracles: frozen, except ORACLE-EDIT hunks naming H3.4-YTD in the files the brief/rulings authorise (h3.7 part B · h0.1 S4.2 re-take · h3.8 S3.7 Q12) */
const ORACLE_EDIT_OK = /^scripts\/(qc-hr-h3\.7\.mts|qc-hr-h0\.1\.mts|qc-hr-h3\.8[\w.-]*\.mts)$/;
const MARK = /HR H3\.4-YTD/;

// ═════════════ worked example (brief §6) — literals ═════════════
export const M = 3_000_000; // 30,000 ฿ / month
export const SSO1 = 87_500; // 875 ฿ (QC row from 2031-01-01)
export const OPEN = { asOfDay: "2031-08-31", months: 8, incomeSatang: 24_000_000, whtSatang: 136_664, ssoSatang: 700_000 } as const;
export const LIT = { annual: 205_000, v1Monthly: 17_083, a1: 0, a2: 17_084, oct: 22_779, nov: 22_779, dec: 22_778, a5: 51_250 } as const;
const BANDS: [number | null, number][] = [[15_000_000, 0], [30_000_000, 500], [50_000_000, 1000], [75_000_000, 1500], [100_000_000, 2000], [200_000_000, 2500], [500_000_000, 3000], [null, 3500]];
const half = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d)); // half up, n ≥ 0
/** annual tax of a single person, no children (law: expense 50 % cap 100,000 ฿ · personal 60,000 ฿ · SSO allowance cap 9,000 ฿ · bands) */
export function oracleTax(income: number, ssoYear: number): number {
  const net = Math.max(0, income - Math.min(half(income * 5000, 10_000), 10_000_000) - 6_000_000 - Math.min(ssoYear, 900_000));
  let num = 0;
  let prev = 0;
  for (const [top, bp] of BANDS) {
    if (net <= prev) break;
    const t = top === null ? net : Math.min(net, top);
    num += (t - prev) * bp;
    if (top === null) break;
    prev = top;
  }
  return half(num, 10_000);
}
/** brief F1: WHT = (annual tax − prior WHT) ÷ (k+1), k = 12 − m, ≥ 0 */
export function oracleWht(m: number, prior: { inc: number; wht: number; sso: number }, cur = M, sso = SSO1): number {
  const k = 12 - m;
  const due = oracleTax(prior.inc + cur + cur * k, prior.sso + sso + sso * k) - prior.wht;
  return due <= 0 ? 0 : half(due, k + 1);
}
export const bkkDayOf = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);

// ═════════════ statics ═════════════
const git = (a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }).trim();
export function runStatics(E: { BASE: string; IN_BASE: boolean; ck: Ck; fitness: { ok: boolean; note: string } | null }): void {
  const { BASE, IN_BASE, ck } = E;
  const s = (p: string) => stripComments(rd(p));
  // S1.1 migration
  {
    const sql = rd(F.mig).replace(/--.*$/gm, "");
    const one = sql.replace(/\s+/g, " ");
    const r = {
      exists: sql.length > 0, table: /CREATE TABLE "HrPayrollOpeningYtd"/.test(one),
      cols: ["id", "tenantId", "systemId", "employeeId", "taxYear", "asOfDay", "months", "incomeSatang", "whtSatang", "ssoSatang", "rev", "createdById", "createdAt", "supersededAt", "supersededById"].every((c) => one.includes(`"${c}"`)),
      date: /"asOfDay" DATE/i.test(one), whtLeIncome: /"whtSatang"\s*<=\s*"incomeSatang"/.test(one), months: /"months"\s*(>=\s*0[^;]*"months"\s*<=\s*12|BETWEEN 0 AND 12)/i.test(one),
      year: /"taxYear"\s*(>=\s*2000[^;]*"taxYear"\s*<=\s*2400|BETWEEN 2000 AND 2400)/i.test(one), yearOfAsOf: /(EXTRACT\s*\(\s*YEAR FROM "asOfDay"\s*\)|date_part\s*\(\s*'year'\s*,\s*"asOfDay"\s*\))[^;]*=\s*"taxYear"|"taxYear"\s*=\s*[^;]*(EXTRACT\s*\(\s*YEAR FROM "asOfDay"|date_part\s*\(\s*'year'\s*,\s*"asOfDay")/i.test(one),
      nonNeg: ["incomeSatang", "whtSatang", "ssoSatang"].every((c) => new RegExp(`"${c}"\\s*>=\\s*0`).test(one)), rev: /"rev"\s*>=\s*1/.test(one),
      uniqRev: /UNIQUE[^;]*\("systemId",\s*"employeeId",\s*"taxYear",\s*"rev"\)/i.test(one), partial: /CREATE UNIQUE INDEX[^;]*\("systemId",\s*"employeeId",\s*"taxYear"\)[^;]*WHERE\s*\(?"supersededAt" IS NULL/i.test(one),
      fk: /FOREIGN KEY \("employeeId"\) REFERENCES "HrEmployee"\s*\("id"\) ON DELETE RESTRICT/i.test(one),
      additive: !/\bDROP\b|\bRENAME\b|ALTER TYPE/i.test(one) && [...one.matchAll(/ALTER TABLE "(\w+)"/g)].every((m) => m[1] === "HrPayrollOpeningYtd"),
    };
    ck("S1.1", r, "migration 20270110000001_hr_opening_ytd: table · CHECKs · uniques · RESTRICT FK · additive", short(one, 60));
  }
  // S1.2 schema + registrations
  {
    const sch = rd(F.schema);
    const model = sch.match(/model HrPayrollOpeningYtd \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const r = {
      model: /asOfDay\s+DateTime\s+@db\.Date/.test(model) && /\brev\s+Int\b/.test(model) && /supersededAt\s+DateTime\?/.test(model) && /onDelete:\s*Restrict/.test(model),
      backRel: /HrPayrollOpeningYtd\[\]/.test(rd(F.hrSchema)), scope: /HrPayrollOpeningYtd|hrPayrollOpeningYtd/.test(rd(F.scope)), env: /HrPayrollOpeningYtd|hrPayrollOpeningYtd/.test(rd(F.env)),
    };
    ck("S1.2", r, "model · hr.prisma back-relation · core/scope sys() · hr-qc-env delete order", "");
  }
  // S1.3 pure file
  {
    const src = s(F.pure);
    const imp = importsOf(src);
    const r = {
      exists: src.length > 0, typeOnly: imp.every((i) => i.type), pure: !/Date\.now|new Date\(\s*\)|Math\.random|process\.env|prisma|tenantDb|@\/lib\/core|\bawait\b/.test(src),
      exports: ["OPENING_TEXT", "parseOpening", "withOpening", "openingMissing", "openingFilingItem"].every((n) => new RegExp(`export\\s+(const|function)\\s+${n}\\b`).test(src)),
    };
    ck("S1.3", r, "payroll-opening-rules.ts pure · type-only imports · 5 exports", `imports=${imp.map((i) => i.spec).join(",") || "∅"}`);
  }
  // S1.4 marked hunks + changed files within the brief
  {
    if (IN_BASE) ck("S1.4", { na: true }, "n/a — H3.4-YTD in base", "");
    else {
      let changed: string[] = [];
      try {
        changed = git(["diff", "--name-only", BASE, "--", "src", "prisma", "scripts/hr-qc-env.mts", "scripts/hr-ui-inventory.json"]).split("\n").filter(Boolean);
      } catch {
        changed = ["git?"];
      }
      const bad: string[] = [];
      for (const f of changed) {
        if (NEW_FILES.includes(f)) continue;
        const hs = diffHunks(BASE, f) ?? [];
        const additive = /src\/messages\/(th|en)\/common\.json$|hr-ui-inventory\.json$/.test(f);
        if (additive ? hs.some((h) => h.removed.length > 0 && !h.added.length) : !hs.every((h) => h.added.some((l) => MARK.test(l)))) bad.push(f);
      }
      const touched = (f: string) => changed.includes(f);
      const r = { unmarked: bad.length === 0, payroll: touched(F.payroll), filings: touched(F.filings), reports: touched(F.reports), newFiles: NEW_FILES.every((f) => existsSync(join(ROOT, f))) };
      ck("S1.4", r, `every hunk outside new files marked "HR H3.4-YTD" · payroll/filings/reports touched`, bad.join(",") || `${changed.length} files`);
    }
  }
  // S1.5 frozen vs base (GREEN control)
  {
    if (IN_BASE) ck("S1.5", { na: true }, "n/a — H3.4-YTD in base", "");
    else {
      let out = "";
      try {
        out = git(["diff", "--name-only", BASE, "--", ...FROZEN]);
      } catch (e) {
        out = `git ${errText(e).slice(0, 40)}`;
      }
      let qc: string[] = [];
      try {
        qc = git(["diff", "--name-only", BASE, "--", "scripts"]).split("\n").filter((f) => /^scripts\/qc-[\w.-]+\.mts$/.test(f) && !/^scripts\/qc-hr-h3\.4-ytd/.test(f));
      } catch {
        qc = ["git?"];
      }
      const qcBad = qc.filter((f) => !ORACLE_EDIT_OK.test(f) || !(diffHunks(BASE, f) ?? []).every((h) => h.added.some((l) => /ORACLE-EDIT[^\n]*H3\.4-YTD/.test(l))));
      const rulesSha = sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA;
      ck("S1.5", { frozen: out === "", oracles: qcBad.length === 0, rulesSha }, "frozen files identical · other oracles only ORACLE-EDIT H3.4-YTD hunks · payroll-rules sha", `${out.replace(/\n/g, ",")} ${qcBad.join(",")}`.trim() || "unchanged");
    }
  }
  // S1.6 locks + tx client
  {
    const svc = s(F.svc);
    const body = [...svc.matchAll(/\$transaction\(\s*async\s*\(([^)]*)\)\s*=>\s*\{([\s\S]*?)\n\s{0,4}\}\s*,/g)].map((m) => m[2]).join("\n");
    // ORACLE-EDIT (H3.4-YTD fix round · controller ruling 5): the hr:ytd key lives once in payroll-opening-read.ts (seed 0) — svc locks hr50 (seed 36) then calls lockYtdInTx; payroll.ts + filings call lockYtdInTx ◂
    const rdm = s(F.read);
    const i50 = svc.search(/hr50:/);
    const iY = svc.search(/lockYtdInTx\(tx/);
    const r = {
      svc: svc.length > 0, hr50: i50 >= 0 && /hr50:[^\n]*\b36\b/.test(svc), ytd: iY >= 0 && /hr:ytd:[^\n]*\b0\)\)/.test(rdm), order: i50 >= 0 && iY > i50,
      payroll: /lockYtdInTx\(/.test(s(F.payroll)), filings: /lockYtdInTx\(/.test(s(F.filings)), txOnly: body.length > 0 && !/tenantDb\(|\bprisma\./.test(body),
      oneKey: [F.svc, F.payroll, F.filings, `${H}reports.ts`, `${H}payslip.ts`].every((f) => !/hr:ytd:/.test(s(f))), // ORACLE-EDIT (H3.4-YTD fix round · controller ruling 5) ◂
    };
    ck("S1.6", r, "save/clear: hr50 (seed 36) → hr:ytd · payroll.ts + filings issue take hr:ytd · tx client only inside $transaction", "");
  }
  // S1.7 privacy / no JV / no outbox / no AI
  {
    const all = [F.svc, F.acts, F.pure].map(s).join("\n");
    const ai = ["src/lib/ai/tools.ts", "src/lib/ai/proposals.ts", "src/lib/ai/plans.ts", "src/lib/outbox-consumers.ts"].map(s).join("\n");
    const r = {
      exists: s(F.svc).length > 0 && s(F.acts).length > 0, useServer: /^\s*["']use server["']/.test(rd(F.acts)), noPii: !/nationalId|bankAccount|bankName|ssoNumber|houseReg/.test(all),
      noJv: !importsOf(all).some((i) => /modules\/account/.test(i.spec ?? "")), noOutbox: !/outboxEvent|emitOutbox|enqueueOutbox/.test(all), noAi: !/OpeningYtd|payroll-opening|hr\.ytd/.test(ai),
    };
    ck("S1.7", r, "no ID/bank · no account import · no outbox · not in AI/outbox consumers · actions use server", "");
  }
  // S1.8 UI
  {
    const ui = rd(F.ui);
    const ids = testidsOf(ui, "hr-ytd");
    const th = (jsonOf(F.th)?.hr?.ytd ?? {}) as Any;
    const en = (jsonOf(F.en)?.hr?.ytd ?? {}) as Any;
    const inv = rd(F.inv);
    const tok = tokensOnly(stripComments(ui));
    const r = {
      testids: ["hr-ytd-card", "hr-ytd-year", "hr-ytd-bulk-save", "hr-ytd-alert"].every((t) => ids.has(t)) && ["hr-ytd-row-", "hr-ytd-zero-", "hr-ytd-save-"].every((p) => ui.includes(p)),
      alert: /role=["']alert["']/.test(ui), runUi: /YTD_OPENING/.test(rd(F.runUi)) && /#hr-ytd-card/.test(rd(F.runUi)), page: /payroll-opening-ui/.test(rd(F.page)),
      msgs: Object.keys(flat(th)).length > 0 && srt(Object.keys(flat(th))) === srt(Object.keys(flat(en))), thText: Object.values(flat(th)).some((v) => isThai(String(v))),
      inventory: /"wo":\s*"H3\.4-YTD"/.test(inv) && inv.includes("hr-ytd-card"), tokens: Object.values(tok).every(Boolean), touch: /min-h-11|min-h-\[44px\]|h-11\b/.test(ui),
    };
    ck("S1.8", r, "testids · role=alert · YTD_OPENING → #hr-ytd-card · page card · hr.ytd th=en · inventory wo H3.4-YTD · tokens · 44 px", `ids=${[...ids].join(",") || "∅"}`);
  }
  if (E.fitness) ck("S1.9", { fitness: E.fitness.ok }, "fitness + fitness-hr without env exit 0", E.fitness.note);
}

// ═════════════ pure ═════════════
export function runPure(E: { ck: Ck; R: Any; V2: Any; LAW: Any }): void {
  const { ck, R, V2, LAW } = E;
  const fn = (n: string) => (R && !R.__err && typeof R[n] === "function" ? R[n] : null);
  const miss = (n: string) => (fn(n) ? "" : `∅ ${n}`);
  const call = (f: () => unknown): Any => {
    try {
      return f();
    } catch (e) {
      return { __throw: errText(e) };
    }
  };
  // S2.0 control: oracle arithmetic = brief literals · base law engine (whtYtdV2) agrees when the opening is fed as prior
  {
    const annual = oracleTax(12 * M, 12 * SSO1);
    const v1 = half(annual, 12);
    const p = { inc: OPEN.incomeSatang, wht: OPEN.whtSatang, sso: OPEN.ssoSatang };
    const oct = oracleWht(10, { inc: p.inc + M, wht: p.wht, sso: p.sso + SSO1 }, M, 100_000);
    const nov = oracleWht(11, { inc: p.inc + 2 * M, wht: p.wht + oct, sso: p.sso + SSO1 + 100_000 }, M, 100_000);
    const dec = oracleWht(12, { inc: p.inc + 3 * M, wht: p.wht + oct + nov, sso: p.sso + SSO1 + 200_000 }, M, 100_000);
    const law = (m: number, pr: { inc: number; wht: number; sso: number }, sso = SSO1) =>
      call(() => V2.whtYtdV2({ monthIndex: m, currentIncomeSatang: M, regularMonthlySatang: M, priorIncomeSatang: pr.inc, priorWhtSatang: pr.wht, currentSsoSatang: sso, regularSsoSatang: sso, priorSsoSatang: pr.sso }, LAW.TAX_BRACKET, LAW.DEDUCTION)?.whtSatang);
    const r = {
      annual: annual === LIT.annual, v1: v1 === LIT.v1Monthly && 8 * v1 === OPEN.whtSatang && 8 * SSO1 === OPEN.ssoSatang && 8 * M === OPEN.incomeSatang,
      a1: oracleWht(9, { inc: 0, wht: 0, sso: 0 }) === LIT.a1, a2: oracleWht(9, p) === LIT.a2, a5: oracleWht(9, { ...p, wht: 0 }) === LIT.a5, a9: oracleWht(9, { ...p, sso: 1_000_000 }) === LIT.a2,
      a4: oct === LIT.oct && nov === LIT.nov && dec === LIT.dec && OPEN.whtSatang + 0 + oct + nov + dec === LIT.annual,
      lawEngine: law(9, { inc: 0, wht: 0, sso: 0 }) === 0 && law(9, p) === LIT.a2 && law(9, { ...p, wht: 0 }) === LIT.a5 && law(10, { inc: p.inc + M, wht: p.wht, sso: p.sso + SSO1 }, 100_000) === LIT.oct,
    };
    ck("S2.0", r, "205,000 · 17,083 · 136,664 · A1 0 · A2 17,084 · A4 22,779/22,779/22,778 Σ 205,000 · A5 51,250", `oct=${oct} nov=${nov} dec=${dec}`);
  }
  const opening = { id: "op1", rev: 1, employeeId: "e1", taxYear: 2031, ...OPEN };
  const zero = { incomeSatang: 0, whtSatang: 0, ssoSatang: 0 };
  const W = (o: Any, onDay = "2031-09-25") => call(() => fn("withOpening")!({ ...zero }, o, { onDay }));
  const wht9 = (pr: Any) => call(() => V2.whtYtdV2({ monthIndex: 9, currentIncomeSatang: M, regularMonthlySatang: M, priorIncomeSatang: pr?.incomeSatang, priorWhtSatang: pr?.whtSatang, currentSsoSatang: SSO1, regularSsoSatang: SSO1, priorSsoSatang: pr?.ssoSatang }, LAW.TAX_BRACKET, LAW.DEDUCTION)?.whtSatang);
  // S2.1 A1 · A2 · A5 · A9 through withOpening
  {
    if (miss("withOpening")) ck("S2.1", { withOpening: false }, "A1 0 · A2 17,084 · A5 51,250 · A9 17,084", miss("withOpening"));
    else {
      const r = { a1: wht9(W(null)) === LIT.a1, a2: wht9(W(opening)) === LIT.a2, a5: wht9(W({ ...opening, whtSatang: 0 })) === LIT.a5, a9: wht9(W({ ...opening, ssoSatang: 1_000_000 })) === LIT.a2 };
      ck("S2.1", r, "A1 0 · A2 17,084 · A5 51,250 · A9 (SSO 1,000,000) 17,084", short({ a2: W(opening) }, 120));
    }
  }
  // S2.2 withOpening rules (same year · asOf < onDay · BKK boundary · not mutated)
  {
    if (miss("withOpening")) ck("S2.2", { withOpening: false }, "rules", miss("withOpening"));
    else {
      const prior = { incomeSatang: 1, whtSatang: 2, ssoSatang: 3 };
      const keep = canon(prior);
      const w = (o: Any, onDay: string) => call(() => fn("withOpening")!(prior, o, { onDay }));
      const eq = (x: Any, a: number, b: number, c: number) => x?.incomeSatang === a && x?.whtSatang === b && x?.ssoSatang === c;
      const r = {
        adds: eq(w(opening, "2031-09-25"), 24_000_001, 136_666, 700_003), nullSame: eq(w(null, "2031-09-25"), 1, 2, 3), otherYear: eq(w(opening, "2032-01-01"), 1, 2, 3),
        notBefore: eq(w(opening, "2031-08-31"), 1, 2, 3), bkkIn: eq(w(opening, bkkDayOf("2031-12-31T16:59:59Z")), 24_000_001, 136_666, 700_003), bkkOut: eq(w(opening, bkkDayOf("2031-12-31T17:00:00Z")), 1, 2, 3),
        pureFn: canon(prior) === keep && canon(w(opening, "2031-09-25")) === canon(w(opening, "2031-09-25")),
      };
      ck("S2.2", r, "adds only same year ∧ asOf < onDay · BKK 16:59:59Z in / 17:00Z out · input untouched", short(w(opening, "2031-09-25"), 120));
    }
  }
  // S2.3 parseOpening
  {
    if (miss("parseOpening")) ck("S2.3", { parseOpening: false }, "vectors", miss("parseOpening"));
    else {
      const base = { asOfDay: "2031-08-31", months: 8, incomeSatang: 24_000_000, whtSatang: 136_664, ssoSatang: 700_000 };
      const p = (patch: Record<string, unknown>) => call(() => fn("parseOpening")!({ ...base, ...patch }, { taxYear: 2031, todayBkk: "2031-10-01" }));
      const code = (patch: Record<string, unknown>) => String(p(patch)?.code ?? (p(patch)?.ok === true ? "OK" : "?"));
      const V: [Record<string, unknown>, string][] = [
        [{}, "OK"], [{ incomeSatang: -1 }, "FIELDS"], [{ incomeSatang: 1.5 }, "FIELDS"], [{ incomeSatang: "24000000" }, "FIELDS"], [{ incomeSatang: 2 ** 31 }, "FIELDS"], [{ ssoSatang: -5 }, "FIELDS"],
        [{ whtSatang: 24_000_001 }, "WHT_OVER"], [{ months: 9 }, "FIELDS"], [{ months: 13 }, "FIELDS"], [{ months: 1.5 }, "FIELDS"], [{ asOfDay: "2032-01-01" }, "AS_OF"], [{ asOfDay: "2030-12-31" }, "AS_OF"],
        [{ asOfDay: "2031-10-02", months: 9 }, "AS_OF"], [{ asOfDay: "2031-10-01", months: 10 }, "OK"], [{ months: 0, incomeSatang: 0, whtSatang: 0, ssoSatang: 0 }, "OK"],
      ];
      const bad = V.filter(([v, c]) => code(v) !== c).map(([v, c]) => `${short(v, 40)}→${code(v)}≠${c}`);
      const texts = Object.values((R.OPENING_TEXT ?? {}) as Record<string, unknown>);
      const refusal = p({ incomeSatang: -1 });
      ck("S2.3", { vectors: bad.length === 0, text: texts.includes(refusal?.reason) && isThai(String(refusal?.reason)) }, `${V.length} vectors · reason = OPENING_TEXT (Thai)`, bad.join(" ").slice(0, 300) || "ok");
    }
  }
  // S2.4 openingMissing (Q15)
  {
    if (miss("openingMissing")) ck("S2.4", { openingMissing: false }, "Q15 vectors", miss("openingMissing"));
    else {
      const b = { payDay: "2031-09-25", periodKey: "2031-09", startDay: "2030-01-01" as string | null, hasOpening: false, hasEarlierRun: false };
      const V: [Record<string, unknown>, boolean][] = [
        [{}, true], [{ startDay: "2031-09-01" }, false], [{ startDay: "2031-09-02" }, false], [{ startDay: "2031-08-31" }, true], [{ startDay: null }, true],
        [{ periodKey: "2031-01", payDay: "2031-01-25", startDay: "2020-01-01" }, false], [{ periodKey: "2031-01", payDay: "2031-01-25", startDay: null }, false], [{ hasOpening: true }, false], [{ hasEarlierRun: true }, false],
      ];
      const bad = V.filter(([v, want]) => call(() => fn("openingMissing")!({ ...b, ...v })) !== want).map(([v]) => short(v, 50));
      ck("S2.4", { vectors: bad.length === 0 }, `${V.length} vectors (never in January · unknown start warns · start on/after P-01 no)`, bad.join(" | ") || "ok");
    }
  }
  // S2.5 openingFilingItem
  {
    if (miss("openingFilingItem")) ck("S2.5", { openingFilingItem: false }, "FilingItem", miss("openingFilingItem"));
    else {
      const want = { employeeId: "e1", runId: "opening:op1", engineVersion: 2, runStatus: "APPROVED", payDate: "2031-08-31", incomeSatang: 24_000_000, taxSatang: 136_664, ssoWageActualSatang: 0, ssoWageClampedSatang: 0, ssoEmployeeSatang: 700_000, ssoEmployerSatang: 0 };
      const got = call(() => fn("openingFilingItem")!({ ...opening }));
      ck("S2.5", { exact: canon(got) === canon(want) }, canon(want), short(got, 200));
    }
  }
}

// ═════════════ lock holder (pg_blocking_pids — no sleep-based luck) ═════════════
/** holds pg_advisory_xact_lock(hashtextextended(key, seed)) in its own tx · starts `calls` · waits until ≥ `want` backends are blocked by the
 *  holder (pg_blocking_pids) or 20 s · releases · returns results + the max number seen blocked */
export async function underLock<R>(P: Any, key: string, seed: number, want: number, calls: (() => Promise<R>)[], first: number[] = []): Promise<{ res: R[]; blocked: number; holderErr: string }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: (pid: number) => void = () => {};
  const heldP = new Promise<number>((r) => (held = r));
  let holderErr = "";
  const holder = P.$transaction(async (tx: Any) => {
    const pid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid() AS p`)) as Any[])[0]?.p ?? -1);
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, $2::int))::text AS x`, key, seed);
    held(pid);
    await gate;
  }, { maxWait: 20_000, timeout: 120_000 }).catch((e: unknown) => {
    holderErr = errText(e);
    held(-1);
  });
  const pid = await heldP;
  const running = calls.map((c) => c().catch((e: unknown) => ({ ok: false, code: "THROW", reason: errText(e) }) as unknown as R));
  let blocked = 0;
  for (let i = 0; i < 130 && blocked < want && pid > 0; i++) {
    await sleep(150);
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, pid).catch(() => null)) as Any[] | null;
    blocked = Math.max(blocked, Number(r?.[0]?.n ?? 0));
  }
  // `first` = calls that must finish while the lock is still held (they do not need it) — fixes the order deterministically
  if (first.length) await Promise.race([Promise.all(first.map((i) => running[i])), sleep(60_000)]);
  release();
  await holder;
  const res = await Promise.race([Promise.all(running), sleep(60_000).then(() => null)]);
  return { res: res ?? calls.map(() => ({ ok: false, code: "TIMEOUT" }) as unknown as R), blocked, holderErr };
}
/** deep search: some object in v satisfies pred */
export function deepSome(v: unknown, pred: (o: Record<string, unknown>) => boolean): boolean {
  if (Array.isArray(v)) return v.some((x) => deepSome(x, pred));
  if (v && typeof v === "object") return pred(v as Record<string, unknown>) || Object.values(v as Record<string, unknown>).some((x) => deepSome(x, pred));
  return false;
}
