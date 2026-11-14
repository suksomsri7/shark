// QC — HR V2 · H4.2 oracle helper (pure vectors S2.x) — imported by scripts/qc-hr-h4.2.mts only · goldens hand-derived (ledger/wo-notes/hr-H4.2-oracle.md §2)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  type Any, ROOT, rd, errText, canon, jsonOf, isThai, stripComments, srcFiles, importsOf, baseRef, commitInBase, pathInBase, changedVsBase, diffHunks,
  testidsOf, inventoryParity, msgParity, tokensOnly,
} from "./qc-hr-lib.mjs";

type Chk = (id: string, ok: unknown, expected: unknown, actual: unknown) => boolean;
type Ck = (id: string, r: Record<string, unknown>, exp: string, extra?: string) => boolean;

export const H = "src/lib/modules/hr/";
const PO = "src/lib/modules/pos/";
const APP = "src/app/app/sys/[id]/hr/";
export const F = {
  rules: `${H}labor-rules.ts`, svc: `${H}labor.ts`, act: `${H}labor-actions.ts`, ui: `${H}labor-ui.tsx`,
  posRep: `${PO}reports.ts`, posIdx: `${PO}index.ts`, fit: "scripts/fitness.mts", ov: `${H}overview-ui.tsx`, ros: `${H}roster-ui.tsx`,
  rosPage: `${APP}roster/page.tsx`, setPage: `${APP}settings/page.tsx`, th: "src/messages/th/common.json", en: "src/messages/en/common.json",
  inv: "scripts/hr-ui-inventory.json", vis: "scripts/visual-hr.mts",
};
const MARK = /HR H4\.2/;
export function baseOf(): { BASE: string; IN_BASE: boolean } {
const BASE0 = baseRef("QC_H42_BASE");
const LOCAL_MB = (() => {
  try {
    return execFileSync("git", ["merge-base", "HEAD", "session/hr"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const BASE = !process.env.QC_H42_BASE && LOCAL_MB && (!BASE0 || (LOCAL_MB !== BASE0 && commitInBase(BASE0, LOCAL_MB))) ? LOCAL_MB : BASE0;
const IN_BASE = pathInBase(F.rules, BASE);
return { BASE, IN_BASE };
}
const code = (p: string) => stripComments(rd(p));
const fnBody = (src: string, name: string) => {
  const i = src.search(new RegExp(`(async\\s+)?function\\s+${name}\\s*\\(`));
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 1);
  return src.slice(i, j < 0 ? undefined : j);
};
const git = (a: string[]) => {
  try {
    return execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "∅git";
  }
};

// ═════════════════════════ static ═════════════════════════
export function runStatic(chk: Chk, ck: Ck, BASE: string, IN_BASE: boolean): void {
  console.log(`── [static] base ${BASE.slice(0, 9)}${IN_BASE ? " (H4.2 in base)" : ""} ──`);
  ck("S1.1", Object.fromEntries([F.rules, F.svc, F.act, F.ui].map((p) => [p.replace(H, ""), existsSync(join(ROOT, p))])), "4 files");
  // S1.2
  {
    const rep = code(F.posRep);
    const idx = code(F.posIdx);
    const posDiff = git(["diff", "--name-only", BASE, "--", "src/lib/modules/pos"]).split("\n").filter(Boolean);
    const hunks = [F.posRep, F.posIdx].flatMap((f) => diffHunks(BASE, f) ?? [{ added: [], removed: ["∅git"] }]);
    const r = {
      fn: /export\s+async\s+function\s+salesByHour\s*\(/.test(rep),
      facade: /export\s+const\s+salesFacts\s*=\s*\{[^}]*\bsalesByHour\b/.test(idx),
      onlyTwo: IN_BASE || posDiff.every((f) => f === F.posRep || f === F.posIdx),
      marked: IN_BASE || (hunks.length > 0 && hunks.every((h) => h.added.some((l) => MARK.test(l)))),
      noRemoved: IN_BASE || (diffHunks(BASE, F.posRep) ?? [{ removed: ["x"] }]).every((h) => h.removed.length === 0),
    };
    ck("S1.2", r, "seam + R1 only pos diff", `posDiff=${posDiff.join(",") || "∅"}`);
  }
  // S1.3
  {
    const fit = rd(F.fit);
    const allowed = fit.slice(fit.indexOf("const ALLOWED_EDGES"), fit.indexOf("]);", fit.indexOf("const ALLOWED_EDGES")));
    const importers = srcFiles(H.replace(/\/$/, "")).filter((f) => /@\/lib\/modules\/pos\b/.test(code(f)));
    const svc = code(F.svc);
    const posMention = srcFiles(H.replace(/\/$/, "")).filter((f) => /\bposSale\b|"PosSale"|\bPosSale\b/.test(code(f)));
    const r = {
      edge: /"hr→pos"/.test(allowed),
      onlyLabor: importers.length === 1 && importers[0] === F.svc,
      lazy: /await\s+import\(\s*["']@\/lib\/modules\/pos["']\s*\)/.test(svc) && !/from\s+["']@\/lib\/modules\/pos/.test(svc) && !/@\/lib\/modules\/pos\//.test(svc),
      noPosSale: posMention.length === 0,
    };
    ck("S1.3", r, "hr→pos lazy from labor.ts only", `importers=${importers.map((f) => f.replace(H, "")).join(",") || "∅"} posSale=${posMention.map((f) => f.replace(H, "")).join(",") || "0"}`);
  }
  // S1.4
  {
    const src = code(F.rules);
    const imps = importsOf(rd(F.rules));
    const r = {
      exists: src.length > 0,
      imports: imps.every((i) => i.type || /^\.\/[a-z-]*rules(-v2)?$/.test(i.spec)),
      noIo: !/\bprisma\b|tenantDb|Date\.now|new Date\(\s*\)|Math\.random|process\.|fetch\(|"use server"|readFileSync|\bawait\b/.test(src),
    };
    ck("S1.4", r, "pure", `imports=${imps.map((i) => i.spec).join(",") || "∅"}`);
  }
  // S1.5
  {
    const svc = code(F.svc);
    const set = fnBody(svc, "setLaborSettings");
    const labor = [F.svc, F.act, F.ui, F.rules].map(code).join("\n");
    const r = {
      lock: /\blockHrSettings\s*\(/.test(set),
      write: /\bwriteHrSettingsKeys\s*\([^)]*hrLabor/.test(set),
      gate: /\bcanManageHrSettings\s*\(/.test(set),
      audit: /["']hr\.labor\.settings["']/.test(svc),
      noOwnWrite: !/appSystem\s*\.\s*(update|updateMany|upsert)\s*\(|UPDATE\s+"AppSystem"/i.test(labor),
      // ORACLE-EDIT (H4.2 · oracle author + controller ruling) (e): intent = no raw prisma client; tenantDb (house rule C.8) is allowed only as a static named import { tenantDb } from core/db · dynamic import of core/db rejected ◂
      // ORACLE-EDIT (H4.2 review · controller ruling) R5: judged per import statement — every value import from core/db must be exactly `import { tenantDb } from "@/lib/core/db"` (no alias, no other name) · no @prisma/client value import · no dynamic core/db ◂
      noPrisma: [...rd(F.svc).matchAll(/^\s*import\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/gm)].every((m) => !!m[1] || (m[3] !== "@prisma/client" && (!/\/core\/db$/.test(m[3]!) || (m[3] === "@/lib/core/db" && /^\{\s*tenantDb\s*\}$/.test(m[2]!.trim()))))) && !/\bprisma\s*\./.test(svc) && !/import\(\s*["'][^"']*core\/db["']\s*\)/.test(svc),
      dbGate: /\bmembership\s*\.\s*findFirst\s*\(/.test(svc),
    };
    ck("S1.5", r, "settings via HR-SET-1 helper · DB gate");
  }
  // S1.6
  {
    const posOthers = git(["diff", "--name-only", BASE, "--", "src/lib/modules/pos"]).split("\n").filter((f) => f && f !== F.posRep && f !== F.posIdx);
    const hrFrozen = srcFiles(H.replace(/\/$/, "")).filter((f) => /\/(payroll[^/]*|law\.ts|work-entries[^/]*|roster\.ts|roster-rules\.ts|roster-board[^/]*|reports[^/]*|privacy[^/]*|scope\.ts|settings-lock\.ts|inbox[^/]*)$/.test(f));
    // ORACLE-EDIT (H4.2 · oracle author + controller ruling) (d): exactly one allowed oracle hunk set — scripts/qc-hr-h2.2.mts, every hunk carrying "ORACLE-EDIT (H4.2 · controller ruling)" ◂
    const h22ok = (diffHunks(BASE, "scripts/qc-hr-h2.2.mts") ?? [{ added: [], removed: ["∅git"] }]).every((h) => h.added.some((l) => /ORACLE-EDIT \(H4\.2 · controller ruling\)/.test(l)));
    const oracles = git(["diff", "--name-only", BASE, "--", "scripts"]).split("\n").filter((f) => /^scripts\/qc-.*\.mts$/.test(f) && !/^scripts\/qc-hr-h4\.2/.test(f) && !(f === "scripts/qc-hr-h2.2.mts" && h22ok));
    // ORACLE-EDIT (H3.4-YTD · merge of session/hr with H4.2 in base · pre-authorised): once H4.2 is in the base (IN_BASE) the freeze list judges later tickets' diffs — n/a, like S1.4's IN_BASE guard ◂
    const r = {
      pos: IN_BASE || posOthers.length === 0, // ORACLE-EDIT (H3.4-YTD) ◂
      hr: IN_BASE || changedVsBase(BASE, hrFrozen) === "unchanged", // ORACLE-EDIT (H3.4-YTD) ◂
      shared: IN_BASE || changedVsBase(BASE, ["src/lib/modules/account", "src/lib/modules/approval", "src/lib/core", "prisma", "scripts/qc-hr-lib.mts", "package.json"]) === "unchanged", // ORACLE-EDIT (H3.4-YTD) ◂
      oracles: IN_BASE || oracles.length === 0, // ORACLE-EDIT (H3.4-YTD) ◂
    };
    ck("S1.6", r, "frozen", `pos=${posOthers.join(",") || "0"} hr=${changedVsBase(BASE, hrFrozen)} oracles=${oracles.join(",") || "0"}`);
  }
  // S1.7
  {
    const files = [F.posRep, F.posIdx, F.fit, F.ov, F.ros, F.rosPage, F.setPage, F.vis];
    const need = [F.posRep, F.posIdx, F.fit, F.ov, F.ros];
    const bad: string[] = [];
    for (const f of files) {
      const hs = diffHunks(BASE, f);
      if (!hs) {
        bad.push(`${f}:git`);
        continue;
      }
      if (!IN_BASE && need.includes(f) && hs.length === 0) bad.push(`${f.split("/").pop()}:noHunk`);
      hs.forEach((h, i) => {
        if (!h.added.some((l) => (IN_BASE ? /HR H\d+\.\d+|HR-SET-\d+|POS P\d|HR H4\.2/ : MARK).test(l))) bad.push(`${f.split("/").pop()}#${i}:unmarked`);
      });
    }
    chk("S1.7", bad.length === 0, "marked hunks", bad.join(" ") || "ok");
  }
  // S1.8
  {
    const srcs = [F.ui, F.ov, F.ros, F.rosPage, F.setPage].map(rd).join("\n");
    const ids = new Set([...testidsOf(srcs, "hr-labor-"), ...testidsOf(srcs, "hr-roster-")]);
    const want = ["hr-labor-card", "hr-labor-pct", "hr-labor-cost", "hr-labor-forecast", "hr-labor-sofar", "hr-labor-hours", "hr-labor-shift-*", "hr-labor-month", "hr-labor-note", "hr-roster-demand-*", "hr-roster-labor-foot", "hr-roster-demand-panel", "hr-labor-settings", "hr-labor-save"];
    const th = jsonOf(F.th)?.hr?.labor ?? {};
    const en = jsonOf(F.en)?.hr?.labor ?? {};
    const mp = msgParity(th, en, ["estimateNote", "smallGroup"]);
    const invIds = new Set(want.filter((t) => ids.has(t)));
    const inv = [inventoryParity("/app/sys/[id]", new Set([...invIds].filter((t) => t.startsWith("hr-labor-") && t !== "hr-labor-settings" && t !== "hr-labor-save")), "H4.2", "qc-hr-h4.2"), inventoryParity("/hr/roster", new Set([...invIds].filter((t) => t.startsWith("hr-roster-"))), "H4.2", "qc-hr-h4.2")];
    const h42Rows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((x) => x.wo === "H4.2" && /(\/app\/sys\/\[id\]|\/hr\/roster|\/hr\/settings)$/.test(String(x.page ?? ""))); // ORACLE-EDIT (H4.2 · oracle author + controller ruling) (c) ◂
    const tk = tokensOnly(code(F.ui));
    const act = code(F.act);
    const r = {
      testids: want.every((t) => ids.has(t)),
      inventory: inv.every((x) => x.codeNoRow.length === 0) && h42Rows.length > 0 && h42Rows.every((x) => x.oracle === "qc-hr-h4.2"), // ORACLE-EDIT (H4.2 · oracle author + controller ruling) (c): wo/oracle judged on the H4.2 rows only ◂
      msg: Object.values(mp).every(Boolean),
      posLabel: JSON.stringify(th).includes("ยอดขายสุทธิตามรายงาน POS"),
      visual: /"4\.2":\s*\[/.test(rd(F.vis)),
      tokens: rd(F.ui).length > 0 && Object.values(tk).every(Boolean),
      msgAllow: /setLaborSettings\s*\(/.test(act) && !/msg=\$\{[^}]*(reason|message)/.test(act),
    };
    ck("S1.8", r, "ui contract", `missing=${want.filter((t) => !ids.has(t)).join(",") || "0"}`);
  }
}

// ═════════════════════════ pure ═════════════════════════
export const FX34 = jsonOf("scripts/fixtures/hr-h3.4-vectors.json") as Any;
export const LAW = FX34?.law ?? {};
export async function runPure(R: Any, E: Any, chk: Chk, ck: Ck): Promise<void> {
  const has = (n: string) => typeof R?.[n] === "function";
  const t = (f: () => unknown) => {
    try {
      return f();
    } catch (e) {
      return `throw ${errText(e)}`;
    }
  };
  const miss = (ns: string[]) => ns.filter((n) => !has(n)).join(",");
  const MS = (base: number, day: string, s?: string | null, e?: string | null) => R.monthlyShare({ baseSatang: base, day, startDate: s ?? null, endDate: e ?? null });
  const monthDays = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    const n = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
  };
  const sumMonth = (base: number, ym: string, s?: string, e?: string) => monthDays(ym).reduce((a, d) => a + Number(MS(base, d, s, e)), 0);
  // S2.1
  if (!has("monthlyShare")) chk("S2.1", false, "monthlyShare", "missing");
  else {
    const r = t(() => ({
      d28: sumMonth(1_550_003, "2027-02") === 1_550_003, d29: sumMonth(1_000_000, "2028-02") === 1_000_000, d30: sumMonth(999_999, "2027-04") === 999_999, d31: sumMonth(1_000_000, "2027-01") === 1_000_000,
      v31: MS(1_000_000, "2027-01-01") === 32_259 && MS(1_000_000, "2027-01-02") === 32_259 && MS(1_000_000, "2027-01-03") === 32_258 && MS(1_000_000, "2027-01-31") === 32_258,
      leap: MS(1_000_000, "2028-02-22") === 34_483 && MS(1_000_000, "2028-02-23") === 34_482 && MS(1_000_000, "2028-02-29") === 34_482,
      ex: MS(1_550_000, "2027-01-16") === 50_000 && MS(3_100_000, "2027-01-16") === 100_000,
    }));
    ck("S2.1", typeof r === "object" ? (r as Any) : { ok: false }, "÷ calendar days, Σ = base", typeof r === "string" ? r : "");
  }
  // S2.2
  if (!has("monthlyShare")) chk("S2.2", false, "Q4b", "missing");
  else {
    const r = t(() => ({
      joinSum: sumMonth(1_550_000, "2027-03", "2027-03-11") === 1_085_000,
      joinDays: MS(1_550_000, "2027-03-10", "2027-03-11") === 0 && MS(1_550_000, "2027-03-11", "2027-03-11") === 51_667 && MS(1_550_000, "2027-03-24", "2027-03-11") === 51_667 && MS(1_550_000, "2027-03-25", "2027-03-11") === 51_666 && MS(1_550_000, "2027-03-31", "2027-03-11") === 51_666,
      leaveSum: sumMonth(1_000_000, "2027-03", undefined, "2027-03-20") === 666_667,
      leaveDays: MS(1_000_000, "2027-03-07", null, "2027-03-20") === 33_334 && MS(1_000_000, "2027-03-08", null, "2027-03-20") === 33_333 && MS(1_000_000, "2027-03-20", null, "2027-03-20") === 33_333 && MS(1_000_000, "2027-03-21", null, "2027-03-20") === 0,
      capSum: sumMonth(1_550_000, "2027-01", "2027-01-02") === 1_550_000 && MS(1_550_000, "2027-01-01", "2027-01-02") === 0 && MS(1_550_000, "2027-01-21", "2027-01-02") === 51_667 && MS(1_550_000, "2027-01-22", "2027-01-02") === 51_666,
      fullStart: sumMonth(1_550_000, "2027-02", "2027-02-01") === 1_550_000 && MS(1_550_000, "2027-02-01", "2027-02-01") === 55_358,
    }));
    ck("S2.2", typeof r === "object" ? (r as Any) : { ok: false }, "engine proration spread evenly", typeof r === "string" ? r : "");
  }
  const DW = (payType: string, o: Any) => R.dayWage({ payType, baseSatang: 0, dailySatang: null, hourlySatang: null, day: "2027-01-16", normalMin: 480, startDate: null, endDate: null, ...o });
  if (!has("dayWage")) chk("S2.3", false, "dayWage", "missing");
  else {
    const r = t(() => ({
      d420: DW("DAILY", { dailySatang: 40_000, paidMin: 420 }) === 35_000, d600: DW("DAILY", { dailySatang: 40_000, paidMin: 600 }) === 40_000, d0: DW("DAILY", { dailySatang: 40_000, paidMin: 0 }) === 0,
      h480: DW("HOURLY", { hourlySatang: 6_000, paidMin: 480 }) === 48_000, h95: DW("HOURLY", { hourlySatang: 6_000, paidMin: 95 }) === 9_500, h360: DW("HOURLY", { hourlySatang: 6_003, paidMin: 480 }) === 48_024,
      m: DW("MONTHLY", { baseSatang: 1_550_000, paidMin: 420 }) === 50_000 && DW("MONTHLY", { baseSatang: 3_100_000, paidMin: 0 }) === 100_000,
    }));
    ck("S2.3", typeof r === "object" ? (r as Any) : { ok: false }, "day wage vectors", typeof r === "string" ? r : "");
  }
  const HP = (payType: string, rate: number, m: number, kind: string, bp: number | null = 10_000) => R.holidayPremium({ payType, rateSatang: rate, paidMin: m, normalMin: 480, kind, holidayWorkPaidBp: bp });
  if (!has("holidayPremium") || !has("dayWage")) chk("S2.4", false, "holidayPremium", `missing ${miss(["holidayPremium", "dayWage"])}`);
  else {
    const r = t(() => ({
      pubDaily: HP("DAILY", 40_000, 480, "PUBLIC") === 40_000 && DW("DAILY", { dailySatang: 40_000, paidMin: 480 }) + HP("DAILY", 40_000, 480, "PUBLIC") === 80_000,
      shopDaily: HP("DAILY", 40_000, 480, "SHOP") === 0, shopHourly: HP("HOURLY", 6_000, 480, "SHOP") === 0,
      pubMonthly: HP("MONTHLY", 3_000_000, 480, "PUBLIC") === 100_000, shopMonthly: HP("MONTHLY", 3_000_000, 300, "SHOP") === 62_500,
      pubHourly: HP("HOURLY", 6_000, 480, "PUBLIC") === 48_000, noLaw: HP("DAILY", 40_000, 480, "PUBLIC", null) === 0,
    }));
    ck("S2.4", typeof r === "object" ? (r as Any) : { ok: false }, "premium vectors", typeof r === "string" ? r : "");
  }
  // S2.5 engine parity
  if (!has("holidayPremium") || !has("dayWage") || typeof E?.computeRunItemV2 !== "function") chk("S2.5", false, "engine parity", `missing ${miss(["holidayPremium", "dayWage"])}${typeof E?.computeRunItemV2 !== "function" ? " engine" : ""}`);
  else {
    const lawSet = { SSO: { id: "fx-sso", json: LAW.SSO }, TAX_BRACKET: { id: "fx-tax", json: LAW.TAX_BRACKET }, DEDUCTION: { id: "fx-ded", json: LAW.DEDUCTION } };
    const eng = (pt: string, rate: number, day: Any, codeW: string) => {
      const o = E.computeRunItemV2({ ...(FX34?._meta?.defaults ?? {}), payType: pt, baseSalarySatang: pt === "MONTHLY" ? rate : 0, dailyRateSatang: pt === "DAILY" ? rate : null, hourlyRateSatang: pt === "HOURLY" ? rate : null, periodKey: "2027-01", monthIndex: 1, normalDayMin: 480, days: [{ workDayId: "w1", day: "2027-01-16", ...day }], adjustments: [] }, lawSet);
      return (o?.lines ?? []).filter((l: Any) => l.code === codeW).reduce((a: number, l: Any) => a + l.amountSatang, 0);
    };
    const V: [string, string, number, Any, string, () => number][] = [
      ["dw420", "DAILY", 40_000, { dayClass: "WORKDAY", workMin: 420 }, "DAY_WAGE", () => DW("DAILY", { dailySatang: 40_000, paidMin: 420 })],
      ["dw480", "DAILY", 40_000, { dayClass: "WORKDAY", workMin: 480 }, "DAY_WAGE", () => DW("DAILY", { dailySatang: 40_000, paidMin: 480 })],
      ["hw480", "HOURLY", 6_000, { dayClass: "WORKDAY", workMin: 480 }, "HOUR_WAGE", () => DW("HOURLY", { hourlySatang: 6_000, paidMin: 480 })],
      ["hw95", "HOURLY", 6_003, { dayClass: "WORKDAY", workMin: 95 }, "HOUR_WAGE", () => DW("HOURLY", { hourlySatang: 6_003, paidMin: 95 })],
      ["hwD", "DAILY", 40_000, { dayClass: "HOLIDAY", holidayKind: "PUBLIC", holidayWorkMin: 480 }, "HOLIDAY_WORK", () => HP("DAILY", 40_000, 480, "PUBLIC")],
      ["hwM", "MONTHLY", 3_000_000, { dayClass: "HOLIDAY", holidayKind: "PUBLIC", holidayWorkMin: 480 }, "HOLIDAY_WORK", () => HP("MONTHLY", 3_000_000, 480, "PUBLIC")],
      ["hwMS", "MONTHLY", 3_000_000, { dayClass: "HOLIDAY", holidayKind: "SHOP", holidayWorkMin: 300 }, "HOLIDAY_WORK", () => HP("MONTHLY", 3_000_000, 300, "SHOP")],
    ];
    const out = V.map(([n, pt, rate, day, c, f]) => {
      const a = t(() => eng(pt, rate, day, c));
      const b = t(f);
      return [n, typeof a === "number" && a > 0 && a === b, `${n}:${a}/${b}`] as const;
    });
    chk("S2.5", out.every((x) => x[1]), "7 vectors = engine", out.filter((x) => !x[1]).map((x) => x[2]).join(" ") || "ok");
  }
  const SS = (w: number, D = 31) => R.ssoEstimate({ wageSatang: w, daysInMonth: D, rateBp: 500, maxBaseSatang: 1_750_000 });
  if (!has("ssoEstimate")) chk("S2.6", false, "ssoEstimate", "missing");
  else {
    const r = t(() => ({ a: SS(50_000) === 2_500, d: SS(100_000) === 2_823, b: SS(40_000) === 2_000, c: SS(48_000) === 2_400, feb: SS(55_358, 28) === 2_768 && SS(110_715, 28) === 3_125, leap: SS(106_896, 29) === 3_017 && SS(53_448, 29) === 2_672, zero: SS(0) === 0 }));
    ck("S2.6", typeof r === "object" ? (r as Any) : { ok: false }, "SSO pro-rata", typeof r === "string" ? r : "");
  }
  if (!has("largestRemainder")) chk("S2.7", false, "largestRemainder", "missing");
  else {
    const LR = (n: number, w: number[]) => canon(R.largestRemainder(n, w));
    const r = t(() => ({
      a: LR(52_500, Array(8).fill(60)) === canon([6563, 6563, 6563, 6563, 6562, 6562, 6562, 6562]),
      b: LR(42_000, Array(9).fill(60)) === canon([4667, 4667, 4667, 4667, 4667, 4667, 4666, 4666, 4666]),
      tie: LR(10, [1, 1, 1]) === canon([4, 3, 3]), units: LR(100_001, [240, 240]) === canon([50_001, 50_000]), frac: LR(7, [3, 1]) === canon([5, 2]), big: LR(1, [1, 3]) === canon([0, 1]),
      month: LR(2_087_500, [6_000, 3_000]) === canon([1_391_667, 695_833]),
    }));
    ck("S2.7", typeof r === "object" ? (r as Any) : { ok: false }, "largest remainder", typeof r === "string" ? r : "");
  }
  if (!has("hourSlots")) chk("S2.8", false, "hourSlots", "missing");
  else {
    const HS = (s: number, e: number, x: boolean, c: number) => canon((R.hourSlots({ day: "2027-01-31", startMin: s, endMin: e, crossesMidnight: x, cutoffMin: c }) as Any[]).map((o) => [o.date, o.hour, o.minutes]));
    const d = "2027-01-31";
    const r = t(() => ({
      day: HS(420, 900, false, 0) === canon([7, 8, 9, 10, 11, 12, 13, 14].map((h) => [d, h, 60])),
      half: HS(450, 555, false, 0) === canon([[d, 7, 30], [d, 8, 60], [d, 9, 15]]),
      c0: HS(1200, 120, true, 0) === canon([[d, 20, 60], [d, 21, 60], [d, 22, 60], [d, 23, 60], ["2027-02-01", 0, 60], ["2027-02-01", 1, 60]]),
      c240: HS(1200, 120, true, 240) === canon([20, 21, 22, 23, 24, 25].map((h) => [d, h, 60])),
    }));
    ck("S2.8", typeof r === "object" ? (r as Any) : { ok: false }, "hour keys = reportHourly keys", typeof r === "string" ? r : "");
  }
  if (!has("forecastHour")) chk("S2.9", false, "forecastHour", "missing");
  else {
    const vals: Record<string, number> = { "2027-01-16": 9_999_999, "2027-01-09": 380_000, "2027-01-02": 420_000, "2026-12-26": 410_000, "2026-12-19": 390_000, "2026-12-12": 7_777_777 };
    const FH = (day: string, today: string, m: Record<string, number>) => R.forecastHour({ day, today, valueOf: (x: string) => m[x] ?? 0 });
    const r = t(() => ({
      skip: FH("2027-01-23", "2027-01-16", vals) === 400_000, past: FH("2027-01-16", "2027-01-17", vals) === 400_000, incl: FH("2027-01-23", "2027-01-17", vals) === Math.floor((9_999_999 + 380_000 + 420_000 + 410_000 + 2) / 4),
      halfDown: FH("2027-01-23", "2027-01-17", { "2027-01-16": 1 }) === 0, halfUp: FH("2027-01-23", "2027-01-17", { "2027-01-16": 1, "2027-01-09": 1 }) === 1, none: FH("2027-01-23", "2027-01-17", {}) === 0,
    }));
    ck("S2.9", typeof r === "object" ? (r as Any) : { ok: false }, "4 latest same weekdays < today", typeof r === "string" ? r : "");
  }
  if (!has("pctTenths") || !has("needed") || !has("scheduledAt")) chk("S2.10", false, "pct/needed/scheduled", `missing ${miss(["pctTenths", "needed", "scheduledAt"])}`);
  else {
    const N = (f: number, s: number | null, m: number) => R.needed({ forecastSatang: f, splhSatang: s, minStaff: m });
    const slots = [
      ...[7, 8, 9, 10, 11, 12, 13, 14].map((h) => ({ employeeId: "A", hour: h, minutes: 60 })), ...[11, 12, 13, 14, 15, 16, 17, 18, 19].map((h) => ({ employeeId: "B", hour: h, minutes: 60 })),
      { employeeId: "X", hour: 12, minutes: 29 }, { employeeId: "Y", hour: 13, minutes: 30 }, { employeeId: "Z", hour: 13, minutes: 15 }, { employeeId: "Z", hour: 13, minutes: 15 },
    ];
    const r = t(() => ({
      pct: R.pctTenths(247_723, 1_000_000) === 248 && R.pctTenths(1, 2_000) === 1 && R.pctTenths(0, 100) === 0 && R.pctTenths(5, 0) === null && R.pctTenths(1_391_667, 1_870_000) === 744,
      needed: N(400_000, 150_000, 1) === 3 && N(450_000, 150_000, 1) === 3 && N(450_001, 150_000, 1) === 4 && N(100_000, 150_000, 2) === 2 && N(0, 150_000, 2) === 0 && N(-5, 150_000, 2) === 0 && N(100_000, null, 1) === null,
      sched: R.scheduledAt(slots, 12) === 2 && R.scheduledAt(slots, 13) === 4 && R.scheduledAt(slots, 8) === 1 && R.scheduledAt(slots, 23) === 0,
    }));
    ck("S2.10", typeof r === "object" ? (r as Any) : { ok: false }, "D12 D13", typeof r === "string" ? r : "");
  }
  {
    const T = R?.LABOR_TEXT ?? {};
    const TE = R?.LABOR_TEXT_EN ?? {};
    const r = {
      defaults: canon(R?.LABOR_DEFAULTS) === canon({ targetTenths: 280, splhSatang: null, minStaff: 1 }),
      keys: Object.keys(T).length > 0 && canon(Object.keys(T).sort()) === canon(Object.keys(TE).sort()),
      th: Object.values(T).every((v) => typeof v === "string" && v.trim() !== "") && Object.values(T).some((v) => isThai(String(v))),
      pick: has("laborTextFor") && R.laborTextFor("en") === TE && R.laborTextFor("th") === T && R.laborTextFor(null) === T,
    };
    ck("S2.11", r, "defaults + texts");
  }
}

