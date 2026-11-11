// QC — HR V2 · H3.3 — law-table engine: pure SSO / WHT v2 (`hr/payroll-rules-v2.ts`) reading `HrLawTable` rows by effective date
//      (`hr/law.ts` = the only reader) · platform-only law writes (`src/lib/platform/hr-law.ts`) + tenantDb write guard (H1.3 review F1) ·
//      read-only law view for shops (mockup 08) · frozen v1 untouched (engineVersion 1)
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Brief: ledger/hr-briefs/hr-brief-H3.3.md (DRAFT · Q1–Q14 defaults in force) · base session/hr 1d17382f8 · vectors scripts/fixtures/hr-h3.3-vectors.json
// 🔴 Expected values are LITERALS in the fixture, computed by an independent exact-fraction reference outside the repo — never by the code
//    under test. Every vector cites its HrLawTable row (sourceKey@effectiveFrom, seeded by H1.3). want:null = NEEDS ACCOUNTANT ⇒ check
//    registered, passes as "SKIP · NEEDS ACCOUNTANT" with the question; a supplied value turns it RED until the controller makes it a vector.
// CONTRACT (ORACLE-EDIT if it must differ) — money = integer satang; refusals = thrown Error with `.code`:
//   payroll-rules-v2.ts (pure · only `import type`): ENGINE_VERSION_V2 = 2 ·
//     ssoV2(wageSatang, ssoJson) → {baseSatang, employeeSatang, employerSatang} · annualTaxV2(netSatang, taxJson) → int ·
//     whtAnnualisedV2({monthlyIncomeSatang, ssoEmployeeYearSatang, deductions{spouse,children}}, taxJson, dedJson) → int (v1 method) ·
//     whtYtdV2({monthIndex 1..12, currentIncomeSatang, regularMonthlySatang, priorIncomeSatang, priorWhtSatang, currentSsoSatang,
//       regularSsoSatang, priorSsoSatang, deductions}, taxJson, dedJson) → {whtSatang, projectedIncomeSatang, projectedNetSatang, annualTaxSatang} ·
//     classifyIncomeV2(baseSatang, [{kind, amountSatang}]) → {whtIncomeSatang, ssoWageSatang, addSatang, deductSatang, grossSatang} ·
//     computeItemV2({baseSatang, adjustments, ssoEligible, deductions, monthIndex, prior{incomeSatang,whtSatang,ssoSatang}}, lawSet{SSO,TAX_BRACKET,DEDUCTION})
//       → classify fields + {ssoBaseSatang, ssoEmployeeSatang, ssoEmployerSatang, whtSatang, netSatang, blocked: "NET_NEGATIVE"|null, lawRowIds (sorted)} ·
//     totalsV2(items) → {grossSatang, ssoEmployeeSatang, ssoEmployerSatang, whtSatang, netSatang, blockedCount} ·
//     ytdPriorV2(rows[{runId, payDay, status, whtIncomeSatang, whtSatang, ssoEmployeeSatang}], {onDay, runId}) → {incomeSatang, whtSatang, ssoSatang}
//     codes: LAW_SHAPE (bad row json) · BAD_SATANG (negative / non-integer money) · BAD_MONTH · BAD_KIND
//   law.ts: pickLawRow(rows, kind, onDay) → {ok:true,row} | {ok:false, code LAW_MISSING|LAW_AMBIGUOUS|LAW_BAD_DAY} (ACTIVE only · max effectiveFrom ≤ day) ·
//     pickLawSet(rows, onDay, kinds?=[SSO,TAX_BRACKET,DEDUCTION]) → {ok:true, set, ids} | {ok:false, code, kinds} · lawDayOf(payDate) → Bangkok "YYYY-MM-DD" ·
//     loadLawSet(onDay, db?) (db = prisma or a tx) · loadLawView(onDay, db?) → {onDay, pendingSignOff, groups[{kind, rows[{effectiveFrom, status, inForce, values,
//     approvedByName, approvedAt}]}]} · LAW_MSG {code → Thai}
//   platform/hr-law.ts: createLawDraft(pu, {kind, effectiveFrom, json, note?, supersedesId?}) · activateLawRow(pu, id, {approvedByName}) ·
//     retireLawRow(pu, id) → {ok:true, id} | {ok:false, code} (or thrown) · pu re-read from PlatformUser, SUPER_ADMIN only · audit PlatformAuditLog hr.law.*
//   core/db.ts (marked hunk): tenantDb(ctx).hrLawTable write operations throw; reads pass.
// "untouched vs base" = n/a once the base contains payroll-rules-v2.ts (H3.3 merged) · payroll-rules sha unconditional.
// SKIP while payroll-rules-v2.ts is absent (exit 0) · QC_FORCE=1 runs · --list. Fixtures: HrLawTable sourceKey `qc-h33-<tag>-*` (dates ≥ 2190),
//   PlatformUser `qc-h33-<tag>-*@qc.invalid`, made-up tenant id for tenantDb — all removed in finally (Z1).
// Run (lane DB): bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.3.mts
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { type Any, type Def, ROOT, rd, short, errText, stripComments, sha, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, makeRegistry, qc4Env, fitnessNoEnv, importsOf, flat, jsonOf, loadOpt, modState, tagOf } from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h3.3";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const F = {
  v2: "src/lib/modules/hr/payroll-rules-v2.ts",
  law: "src/lib/modules/hr/law.ts",
  plat: "src/lib/platform/hr-law.ts",
  db: "src/lib/core/db.ts",
  payroll: "src/lib/modules/hr/payroll.ts",
  page: "src/app/app/sys/[id]/hr/settings/law/page.tsx",
  ui: "src/lib/modules/hr/law-ui.tsx",
  fit: "scripts/fitness-hr.mts",
  vec: "scripts/fixtures/hr-h3.3-vectors.json",
  seed: "scripts/hr-seed-law-draft.mts",
};
const FROZEN_LAW_DIGEST = "0ed9de8c2c4df9b4b05ce320889318cc4c755527448f56628235960ae38d9470"; // = qc-hr-h1.3 S2.5
const C = "CRITICAL", M = "MAJOR";
const D = (id: string, g: string, s: "CRITICAL" | "MAJOR" | "MINOR", b: "RED" | "GREEN", t: string): Def => [`H3.3-${id}`, g, s, b, t] as const;
const V: Any = jsonOf(F.vec) ?? {};
const NA: Any[] = V.needsAccountant ?? [];
const CHECKS: Def[] = [
  D("S1.1", "C.4", C, "GREEN", "[static] payroll-rules.ts sha frozen (unconditional) · payroll.ts + payroll-rules.ts unchanged vs base (n/a once H3.3 in base)"),
  D("S1.2", "R3", C, "RED", "[static] payroll-rules-v2.ts pure: only `import type` · no prisma/db · no Date.now/new Date(/Math.random/process./fetch/async/await"),
  D("S1.3", "R3", C, "RED", "[static] law.ts = only reader: HrLawTable named under src/** only in scope.ts · db.ts · hr/law.ts · platform/hr-law.ts · law.ts has no write op/SQL · deterministic orderBy"),
  D("S1.4", "R4", C, "RED", "[static] law writes only in platform/hr-law.ts: not imported from src/app/app/** · src/lib/modules/** · src/lib/ai/** · exports ⊆ create/activate/retire/list · F16.9 kept"),
  D("S1.5", "R8", M, "RED", "[static] law view page read-only: loadLawView · no use server/<form/formAction/action=/onSubmit/@/lib/platform · testids hr-law-table/hr-law-row- + inventory · hr.law th=en keys · 'รอนักบัญชียืนยัน' · tab link"),
  D("S1.6", "R1", C, "GREEN", "[run] seed LAW_V1_DIGEST = frozen 0ed9de8c… and fixture law json = LAW_V1_ROWS json (every vector cites seeded values)"),
  D("S2.1", "V-SSO", C, "RED", "[pure] ssoV2: 17 literal vectors (v1:SSO@1970-01-01) incl. half-baht edges"),
  D("S2.2", "R2", C, "RED", "[pure] ssoV2 = frozen v1 ssoContribution over ≥2,700 wages (1..3,000,000 + edges)"),
  D("S2.3", "R5", M, "RED", "[pure] ssoV2 refusals: unknown rounding / employer≠employee / float json ⇒ LAW_SHAPE · wage −1 / 1.5 ⇒ BAD_SATANG"),
  D("S3.1", "V-TAX", C, "RED", "[pure] annualTaxV2: 18 literal vectors (v1:TAX_BRACKET@1970-01-01) incl. band edges + half-satang"),
  D("S3.2", "R2", C, "RED", "[pure] annualTaxV2 = frozen v1 annualTaxSatang over the seed's grid"),
  D("S3.3", "R5", M, "RED", "[pure] annualTaxV2 refusals: bands not ascending / last band not open / float rate ⇒ LAW_SHAPE"),
  D("S4.1", "V-WHA", C, "RED", "[pure] whtAnnualisedV2: 24 literal vectors (TAX_BRACKET + DEDUCTION rows)"),
  D("S4.2", "R2", C, "RED", "[pure] whtAnnualisedV2 = frozen v1 monthlyWhtSatang over 960 inputs"),
  D("S5.1", "V-YTD", C, "RED", "[pure] whtYtdV2: 8 literal vectors (all 4 output fields)"),
  D("S5.2", "V-YR", C, "RED", "[pure] 6 year scenarios chained month by month through computeItemV2: wht + SSO per month = literals"),
  D("S5.3", "R5", C, "RED", "[pure] Σ12 months wht = December annualTaxSatang (true-up) for every full-year scenario"),
  D("S5.4", "R2", C, "RED", "[pure] YTD month 1 (prior 0, current = regular) = frozen v1 monthlyWhtSatang over 160 inputs"),
  D("S5.5", "R5", M, "RED", "[pure] whtYtdV2 refusals: monthIndex 0/13/1.5 ⇒ BAD_MONTH · negative prior ⇒ BAD_SATANG · over-withheld grid never negative"),
  D("S6.1", "V-EFF", C, "RED", "[pure] pickLawRow 13 cases: day before/of/after · DRAFT/RETIRED ignored · gap · bad day · same-date tie ⇒ LAW_AMBIGUOUS"),
  D("S6.2", "R6", M, "RED", "[pure] pickLawRow independent of input order (120 permutations) · Date effectiveFrom = string"),
  D("S6.3", "R6", C, "RED", "[pure] pickLawSet: a missing kind refuses with the kind list (never falls back to constants) · full set ⇒ sorted ids"),
  D("S6.4", "Q1", M, "RED", "[pure] lawDayOf(payDate) = Bangkok calendar day (16:59:59.999Z / 17:00Z boundaries)"),
  D("S7.1", "Q5", C, "RED", "[pure] classifyIncomeV2: 5 literal vectors (40(1) income · SSO wage · gross clamp)"),
  D("S7.2", "R5", M, "RED", "[pure] classifyIncomeV2 refusals: unknown kind ⇒ BAD_KIND · negative/non-integer ⇒ BAD_SATANG"),
  D("S7.3", "V-ITM", C, "RED", "[pure] computeItemV2: 6 literal vectors (every field · lawRowIds · blocked)"),
  D("S7.4", "C.3", C, "RED", "[pure] identities on every item: net = gross − ssoEmployee − wht · blocked ⇔ net < 0 · totalsV2 = Σ items"),
  D("S7.5", "Q6", M, "RED", "[pure] ytdPriorV2: 4 cases (APPROVED/PAID only · same tax year · ≤ pay day · current run excluded)"),
  D("S7.6", "R3", M, "RED", "[pure] runtime purity: deep-frozen inputs untouched · Date.now/Math.random trapped · repeat call identical · ENGINE_VERSION_V2 = 2"),
  D("S8.1", "R1", M, "GREEN", "[db] the 4 v1 law rows are on this DB with the frozen digest (status reported)"),
  D("S8.2", "R6", C, "RED", "[db] loadLawSet(onDay, tx) reads ACTIVE rows by effectiveFrom (rolled-back fixtures 2190): before/of/after · DRAFT-only ⇒ refused"),
  D("S8.3", "R4", C, "RED", "[db] tenantDb(ctx).hrLawTable: create/createMany/update/updateMany/upsert/delete/deleteMany all throw · count/findMany work"),
  D("S8.4", "R4", C, "RED", "[db] platform writes: forged/SUPPORT actor refused · SUPER_ADMIN draft→activate (approver, audit) · slot taken · no approver · float json · retire"),
  D("S8.5", "R8", M, "RED", "[db] loadLawView: v1 rows shown DRAFT/not in force · pendingSignOff · no approvedById/sourceKey/supersedesId keys"),
  ...NA.map((n: Any, i: number) => D(`NA.${i + 1}`, "HQ23", M, "GREEN", `[accountant] ${n.id} ${String(n.q).slice(0, 90)}`)),
  D("X12.1", "X12", M, "GREEN", "[run] fitness + fitness-hr without env ⇒ exit 0"),
  D("Z1", "-", C, "GREEN", "residue: HrLawTable qc-h33-* · PlatformUser qc-h33-* · their PlatformAuditLog = 0"),
];
const REG = makeRegistry(SUITE, "H3.3-", CHECKS);
const chk = REG.chk;
if (ARGV.includes("--list")) {
  REG.printList();
  process.exit(0);
}

// ═════════════════════════ helpers ═════════════════════════
const st = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Any)[k]])) : x));
/** code of a refusal: thrown `.code` (or an UPPER_CODE in the message) · {ok:false, code} · else "NO_REFUSAL" */
async function codeOf(f: () => unknown): Promise<string> {
  try {
    const r = (await f()) as Any;
    if (r && typeof r === "object" && r.ok === false) return String(r.code ?? "REFUSED");
    return "NO_REFUSAL";
  } catch (e) {
    const c = (e as Any)?.code;
    if (typeof c === "string" && c) return c;
    const m = /\b([A-Z][A-Z_]{4,})\b/.exec(String((e as Any)?.message ?? ""));
    return m ? m[1] : `THROWN:${errText(e).slice(0, 40)}`;
  }
}
const syncCode = (f: () => unknown): string => {
  try {
    f();
    return "NO_REFUSAL";
  } catch (e) {
    return String((e as Any)?.code ?? "THROWN");
  }
};
function walk(dir: string, out: string[] = []): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const n of readdirSync(abs)) {
    const p = `${dir}/${n}`;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(n)) out.push(p);
  }
  return out;
}
const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === "object") {
    for (const v of Object.values(o as Any)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
};
const L = V.law ?? {};
const mism = (tag: string, list: string[]) => (list.length ? `${list.length} off · first ${list[0]}` : `${tag} ok`);

// ═════════════════════════ statics ═════════════════════════
const BASE_REF = baseRef("QC_H33_BASE");
const H33_IN_BASE = pathInBase(F.v2, BASE_REF);
function runStatic(): void {
  {
    const rsha = sha(rd(PAYROLL_RULES_FILE));
    const diff = H33_IN_BASE ? "unchanged" : changedVsBase(BASE_REF, [PAYROLL_RULES_FILE, F.payroll]);
    chk("S1.1", rsha === PAYROLL_RULES_SHA && diff === "unchanged", `${PAYROLL_RULES_SHA.slice(0, 16)} · unchanged`, `${rsha.slice(0, 16)} · ${H33_IN_BASE ? "n/a · H3.3 in base" : diff} (base ${BASE_REF.slice(0, 9) || "?"})`);
  }
  {
    const raw = rd(F.v2);
    const src = stripComments(raw);
    const imps = importsOf(raw);
    const r = {
      exists: !!raw,
      typeOnly: imps.every((i) => i.type) && !/^\s*import\s+(?!type\b)[^;]*from/m.test(src.replace(/import\s+type[^;]*;/g, "")) && !/\brequire\(|\bimport\(/.test(src),
      noDb: !/\bprisma\b|@\/lib\/core\/db|tenantDb/.test(src),
      noClock: !/Date\.now|new Date\(|Math\.random|performance\.now/.test(src),
      noIo: !/process\.|fetch\(|\basync\b|\bawait\b|"use server"|readFileSync/.test(src),
    };
    chk("S1.2", Object.values(r).every(Boolean), "pure", Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "pure");
  }
  {
    const allowed = new Set(["src/lib/core/scope.ts", F.db, F.law, F.plat]);
    const hits = walk("src").filter((p) => /hrLawTable|"HrLawTable"|HrLawTable\b/.test(stripComments(rd(p)))).filter((p) => !allowed.has(p) && !/\.d\.ts$/.test(p));
    const law = stripComments(rd(F.law));
    const r = {
      exists: !!law,
      reads: /hrLawTable\.(findMany|findFirst)\s*\(/.test(law),
      noWrite: !/hrLawTable\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(law) && !/\b(INSERT|UPDATE|DELETE)\b[^;`]*HrLawTable/i.test(law) && !/\$executeRaw/.test(law),
      ordered: /orderBy[\s\S]{0,160}effectiveFrom[\s\S]{0,160}\bid\b/.test(law),
      onlyReader: hits.length === 0,
      noPayroll: !importsOf(rd(F.law)).some((i) => /payroll(\.ts)?$|payroll"$/.test(i.spec ?? "") && !/payroll-rules-v2/.test(i.spec ?? "")),
    };
    chk("S1.3", Object.values(r).every(Boolean), "law.ts sole reader, read-only", `${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "ok"}${hits.length ? ` · other files: ${hits.slice(0, 3).join(",")}` : ""}`);
  }
  {
    const plat = stripComments(rd(F.plat));
    const importers = [...walk("src/app/app"), ...walk("src/lib/modules"), ...walk("src/lib/ai")].filter((p) => importsOf(rd(p)).some((i) => /platform\/hr-law/.test(i.spec ?? "")));
    const exported = [...plat.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map((m) => m[1]);
    const okNames = new Set(["createLawDraft", "activateLawRow", "retireLawRow", "listLawRows"]);
    const fit = rd(F.fit);
    const r = {
      exists: !!plat,
      has3: ["createLawDraft", "activateLawRow", "retireLawRow"].every((n) => exported.includes(n)),
      onlyNames: exported.every((n) => okNames.has(n)),
      noTenantImporters: importers.length === 0,
      reRead: /platformUser\.(findUnique|findFirst)/.test(plat) && /SUPER_ADMIN/.test(plat),
      audit: /platformAuditLog\.create/.test(plat) && /hr\.law\./.test(plat),
      f169: /F16\.9/.test(fit) && /hrLawTable|HrLawTable/.test(fit),
    };
    chk("S1.4", Object.values(r).every(Boolean), "platform-only writes", `${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "ok"} · exports ${exported.join("/") || "∅"}${importers.length ? ` · importers ${importers.slice(0, 2).join(",")}` : ""}`);
  }
  {
    const page = rd(F.page);
    const ui = rd(F.ui);
    const both = stripComments(page + "\n" + ui);
    const th = jsonOf("src/messages/th/common.json") /* ORACLE-EDIT (controller 12 Nov): real path */ ?? {};
    const en = jsonOf("src/messages/en/common.json") /* ORACLE-EDIT (controller 12 Nov): real path */ ?? {};
    const tl = flat(th?.hr?.law ?? {});
    const el = flat(en?.hr?.law ?? {});
    const tabSrc = [...walk("src/app/app/sys/[id]/hr"), ...walk("src/lib/modules/hr")].filter((p) => p !== F.page).some((p) => /hr\/settings\/law/.test(rd(p)));
    const r = {
      page: !!page,
      loader: /loadLawView/.test(page),
      readOnly: !/["']use server["']|<form\b|formAction|\baction=|onSubmit|@\/lib\/platform/.test(both),
      testids: /hr-law-table/.test(both) && /hr-law-row-/.test(both),
      inventory: /hr-law-table/.test(rd("scripts/hr-ui-inventory.json")),
      msgs: Object.keys(tl).length > 0 && Object.keys(tl).sort().join() === Object.keys(el).sort().join(),
      pending: Object.values(tl).some((v) => String(v).includes("รอนักบัญชียืนยัน")),
      tab: tabSrc,
    };
    chk("S1.5", Object.values(r).every(Boolean), "read-only law page", Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "ok");
  }
}

// ═════════════════════════ pure ═════════════════════════
async function runPure(R1: Any, v2: Any, law: Any, seed: Any): Promise<void> {
  {
    const rows = seed?.LAW_V1_ROWS ?? [];
    const j = (k: string) => rows.find((r: Any) => r.kind === k)?.json;
    const same = ["SSO", "TAX_BRACKET", "DEDUCTION"].every((k) => st(j(k)) === st(L[k]));
    const dg = seed?.LAW_V1_DIGEST ?? "∅";
    chk("S1.6", dg === FROZEN_LAW_DIGEST && same && V._meta?.lawDigest === FROZEN_LAW_DIGEST, `${FROZEN_LAW_DIGEST.slice(0, 12)} · fixture = seed`, `${String(dg).slice(0, 12)} · fixture ${same ? "=" : "≠"} seed`);
  }
  const has = (m: Any, n: string) => m && typeof m[n] === "function";
  const need = (id: string, m: Any, names: string[], label: string) => {
    const miss = names.filter((n) => !has(m, n));
    if (miss.length) chk(id, false, `${label} exports`, `missing ${miss.join(",")} (${m === null ? "module absent" : m?.__err ? "import error" : "loaded"})`);
    return miss.length === 0;
  };
  const tryv = (f: () => unknown) => {
    try {
      return f();
    } catch (e) {
      return { __thrown: (e as Any)?.code ?? errText(e).slice(0, 50) };
    }
  };
  // ── SSO ──
  if (need("S2.1", v2, ["ssoV2"], "v2")) {
    const off = (V.sso ?? []).filter((v: Any) => st(tryv(() => v2.ssoV2(v.wageSatang, L.SSO))) !== st(v.want)).map((v: Any) => `${v.id}:${short(tryv(() => v2.ssoV2(v.wageSatang, L.SSO)), 60)}`);
    chk("S2.1", off.length === 0 && (V.sso ?? []).length === 17, "17/17", mism("17", off));
    const grid = new Set<number>([1, 164_999, 165_000, 165_001, 166_999, 167_000, 1_499_999, 1_500_000, 1_500_001, 9_999_999]);
    for (let s = 1; s <= 3_000_000; s += 1_111) grid.add(s);
    const g2 = [...grid].filter((w) => st(tryv(() => v2.ssoV2(w, L.SSO))) !== st(R1.ssoContribution(w))).map(String);
    chk("S2.2", g2.length === 0 && grid.size >= 2_700, `${grid.size} = v1`, mism(`${grid.size}`, g2));
    const r = {
      rounding: syncCode(() => v2.ssoV2(1_000_000, { ...L.SSO, rounding: "?" })) === "LAW_SHAPE",
      employer: syncCode(() => v2.ssoV2(1_000_000, { ...L.SSO, employerEqualsEmployee: false })) === "LAW_SHAPE",
      float: syncCode(() => v2.ssoV2(1_000_000, { ...L.SSO, rateBp: 500.5 })) === "LAW_SHAPE",
      neg: syncCode(() => v2.ssoV2(-1, L.SSO)) === "BAD_SATANG",
      frac: syncCode(() => v2.ssoV2(1.5, L.SSO)) === "BAD_SATANG",
    };
    chk("S2.3", Object.values(r).every(Boolean), "refused with codes", Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "ok");
  } else (["S2.2", "S2.3"] as const).forEach((id) => chk(id, false, "ssoV2", "ssoV2 missing"));
  // ── tax ──
  if (need("S3.1", v2, ["annualTaxV2"], "v2")) {
    const off = (V.tax ?? []).filter((v: Any) => tryv(() => v2.annualTaxV2(v.netSatang, L.TAX_BRACKET)) !== v.want).map((v: Any) => v.id);
    chk("S3.1", off.length === 0 && (V.tax ?? []).length === 18, "18/18", mism("18", off));
    const grid = new Set<number>([-1, 0, 1, 99_999_999_999]);
    for (const e of [15_000_000, 30_000_000, 50_000_000, 75_000_000, 100_000_000, 200_000_000, 500_000_000]) for (const d of [-1, 0, 1]) grid.add(e + d);
    for (let t = 0; t <= 700_000_000; t += 1_300_007) grid.add(t);
    const g2 = [...grid].filter((n) => tryv(() => v2.annualTaxV2(n, L.TAX_BRACKET)) !== R1.annualTaxSatang(n)).map(String);
    chk("S3.2", g2.length === 0, `${grid.size} = v1`, mism(`${grid.size}`, g2));
    const b = L.TAX_BRACKET?.bands ?? [];
    const r = {
      order: syncCode(() => v2.annualTaxV2(1e8, { ...L.TAX_BRACKET, bands: [b[1], b[0], ...b.slice(2)] })) === "LAW_SHAPE",
      open: syncCode(() => v2.annualTaxV2(1e8, { ...L.TAX_BRACKET, bands: b.slice(0, -1) })) === "LAW_SHAPE",
      float: syncCode(() => v2.annualTaxV2(1e8, { ...L.TAX_BRACKET, bands: b.map((x: Any, i: number) => (i === 2 ? { ...x, rateBp: 1000.5 } : x)) })) === "LAW_SHAPE",
      rounding: syncCode(() => v2.annualTaxV2(1e8, { ...L.TAX_BRACKET, rounding: "PER_BAND" })) === "LAW_SHAPE",
    };
    chk("S3.3", Object.values(r).every(Boolean), "refused LAW_SHAPE", Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "ok");
  } else (["S3.2", "S3.3"] as const).forEach((id) => chk(id, false, "annualTaxV2", "annualTaxV2 missing"));
  // ── WHT annualised (v1 method on law rows) ──
  if (need("S4.1", v2, ["whtAnnualisedV2"], "v2")) {
    const call = (s: number, y: number, d: Any) => tryv(() => v2.whtAnnualisedV2({ monthlyIncomeSatang: s, ssoEmployeeYearSatang: y, deductions: d }, L.TAX_BRACKET, L.DEDUCTION));
    const off = (V.whtAnnualised ?? []).filter((v: Any) => call(v.monthlyIncomeSatang, v.ssoEmployeeYearSatang, v.deductions) !== v.want).map((v: Any) => v.id);
    chk("S4.1", off.length === 0 && (V.whtAnnualised ?? []).length === 24, "24/24", mism("24", off));
    const sal = [0, 1, 999_999, 1_000_000, 1_250_000, 1_666_667, 2_083_333, 2_500_000, 3_000_000, 4_166_667, 5_000_001, 8_333_333, 12_500_000, 16_666_667, 25_000_000, 41_666_667];
    const g2: string[] = [];
    let n = 0;
    for (const s of sal) for (const sp of [false, true]) for (let c = 0; c <= 4; c++) for (const y of [0, 450_000, 899_999, 900_000, 900_001, 1_200_000]) {
      n++;
      const d = { spouse: sp, children: c };
      if (call(s, y, d) !== R1.monthlyWhtSatang({ monthlySalarySatang: s, ssoEmployeeYearSatang: y, deductions: d })) g2.push(`${s}/${y}/${sp}/${c}`);
    }
    chk("S4.2", g2.length === 0 && n === 960, "960 = v1", mism(`${n}`, g2));
  } else chk("S4.2", false, "whtAnnualisedV2", "missing");
  // ── WHT YTD ──
  if (need("S5.1", v2, ["whtYtdV2"], "v2")) {
    const y = (i: Any) => tryv(() => v2.whtYtdV2(i, L.TAX_BRACKET, L.DEDUCTION));
    const pick4 = (o: Any) => (o && typeof o === "object" && !o.__thrown ? { whtSatang: o.whtSatang, projectedIncomeSatang: o.projectedIncomeSatang, projectedNetSatang: o.projectedNetSatang, annualTaxSatang: o.annualTaxSatang } : o);
    const off = (V.whtYtd ?? []).filter((v: Any) => st(pick4(y(v.input))) !== st(v.want)).map((v: Any) => `${v.id}:${short(pick4(y(v.input)), 70)}`);
    chk("S5.1", off.length === 0 && (V.whtYtd ?? []).length === 8, "8/8", mism("8", off));
    const g2: string[] = [];
    for (const s of [1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000, 4_166_667, 5_000_000, 8_333_333, 12_500_000, 41_666_667, 16_666_667, 25_000_000, 1_666_667, 2_083_333, 5_000_001, 999_999])
      for (const sp of [false, true]) for (const c of [0, 1, 2, 3, 4]) {
        const sso = R1.ssoContribution(s).employeeSatang;
        const d = { spouse: sp, children: c };
        const got = (y({ monthIndex: 1, currentIncomeSatang: s, regularMonthlySatang: s, priorIncomeSatang: 0, priorWhtSatang: 0, currentSsoSatang: sso, regularSsoSatang: sso, priorSsoSatang: 0, deductions: d }) as Any)?.whtSatang;
        if (got !== R1.monthlyWhtSatang({ monthlySalarySatang: s, ssoEmployeeYearSatang: sso * 12, deductions: d })) g2.push(`${s}/${sp}/${c}:${got}`);
      }
    chk("S5.4", g2.length === 0, "160 = v1 (month 1)", mism("160", g2));
    const neg: string[] = [];
    for (let m = 1; m <= 12; m++) for (const pw of [0, 1, 205_000, 10_000_000]) {
      const o = y({ monthIndex: m, currentIncomeSatang: 3_000_000, regularMonthlySatang: 3_000_000, priorIncomeSatang: (m - 1) * 3_000_000, priorWhtSatang: pw, currentSsoSatang: 75_000, regularSsoSatang: 75_000, priorSsoSatang: (m - 1) * 75_000, deductions: {} }) as Any;
      if (!(Number.isSafeInteger(o?.whtSatang) && o.whtSatang >= 0)) neg.push(`${m}/${pw}:${short(o, 40)}`);
    }
    const base = { monthIndex: 1, currentIncomeSatang: 1, regularMonthlySatang: 1, priorIncomeSatang: 0, priorWhtSatang: 0, currentSsoSatang: 0, regularSsoSatang: 0, priorSsoSatang: 0, deductions: {} };
    const r = {
      m0: syncCode(() => v2.whtYtdV2({ ...base, monthIndex: 0 }, L.TAX_BRACKET, L.DEDUCTION)) === "BAD_MONTH",
      m13: syncCode(() => v2.whtYtdV2({ ...base, monthIndex: 13 }, L.TAX_BRACKET, L.DEDUCTION)) === "BAD_MONTH",
      mfrac: syncCode(() => v2.whtYtdV2({ ...base, monthIndex: 1.5 }, L.TAX_BRACKET, L.DEDUCTION)) === "BAD_MONTH",
      negPrior: syncCode(() => v2.whtYtdV2({ ...base, priorWhtSatang: -1 }, L.TAX_BRACKET, L.DEDUCTION)) === "BAD_SATANG",
      neverNeg: neg.length === 0,
    };
    chk("S5.5", Object.values(r).every(Boolean), "refusals + ≥0", `${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "ok"}${neg.length ? ` · ${neg[0]}` : ""}`);
  } else (["S5.4", "S5.5"] as const).forEach((id) => chk(id, false, "whtYtdV2", "missing"));
  // ── classify + item + totals + year scenarios ──
  const itemsOut: Any[] = [];
  if (need("S7.1", v2, ["classifyIncomeV2"], "v2")) {
    const off = (V.classify ?? []).filter((v: Any) => st(tryv(() => v2.classifyIncomeV2(v.baseSatang, v.adjustments))) !== st(v.want)).map((v: Any) => `${v.id}:${short(tryv(() => v2.classifyIncomeV2(v.baseSatang, v.adjustments)), 60)}`);
    chk("S7.1", off.length === 0 && (V.classify ?? []).length === 5, "5/5", mism("5", off));
    const off2 = (V.classifyRefused ?? []).filter((v: Any) => syncCode(() => v2.classifyIncomeV2(v.baseSatang, v.adjustments)) !== v.code).map((v: Any) => v.id);
    chk("S7.2", off2.length === 0 && (V.classifyRefused ?? []).length === 4, "4 refused", mism("4", off2));
  } else chk("S7.2", false, "classifyIncomeV2", "missing");
  if (need("S7.3", v2, ["computeItemV2"], "v2")) {
    const off: string[] = [];
    for (const v of V.items ?? []) {
      const o = tryv(() => v2.computeItemV2(v.input, V.lawSet)) as Any;
      itemsOut.push(o);
      const pickW = o && typeof o === "object" && !o.__thrown ? Object.fromEntries(Object.keys(v.want).map((k) => [k, o[k] ?? null])) : o;
      if (st(pickW) !== st(v.want)) off.push(`${v.id}:${short(pickW, 80)}`);
    }
    chk("S7.3", off.length === 0 && itemsOut.length === 6, "6/6", mism("6", off));
    // year scenarios
    const yOff: string[] = [];
    const sOff: string[] = [];
    for (const yr of V.years ?? []) {
      let prior = { incomeSatang: 0, whtSatang: 0, ssoSatang: 0 };
      let sum = 0;
      let last: Any = null;
      yr.months.forEach((mo: Any, i: number) => {
        const o = tryv(() => v2.computeItemV2({ baseSatang: mo.baseSatang, adjustments: mo.adjustments, ssoEligible: yr.ssoEligible, deductions: { spouse: yr.spouse, children: yr.children }, monthIndex: mo.m, prior }, V.lawSet)) as Any;
        itemsOut.push(o);
        const w = yr.want[i];
        if (o?.whtSatang !== w.whtSatang || o?.ssoEmployeeSatang !== w.ssoEmployeeSatang || o?.whtIncomeSatang !== w.whtIncomeSatang) yOff.push(`${yr.id}/m${mo.m}:${o?.whtSatang ?? short(o, 30)}≠${w.whtSatang}`);
        prior = { incomeSatang: prior.incomeSatang + (o?.whtIncomeSatang ?? 0), whtSatang: prior.whtSatang + (o?.whtSatang ?? 0), ssoSatang: prior.ssoSatang + (o?.ssoEmployeeSatang ?? 0) };
        sum += o?.whtSatang ?? 0;
        last = w;
      });
      if (yr.months.length === 12) {
        const dec = yr.want[11].annualTaxSatang;
        if (sum !== dec || last.annualTaxSatang !== dec) sOff.push(`${yr.id}:Σ${sum}≠${dec}`);
      }
    }
    const nm = (V.years ?? []).reduce((a: number, y: Any) => a + y.months.length, 0);
    chk("S5.2", yOff.length === 0 && nm === 66, `${nm} months = literals`, mism(`${nm}`, yOff));
    chk("S5.3", sOff.length === 0 && (V.years ?? []).length === 6, "Σ = annual tax", mism("5 full years", sOff));
  } else (["S5.2", "S5.3"] as const).forEach((id) => chk(id, false, "computeItemV2", "missing"));
  {
    const valid = itemsOut.filter((o) => o && typeof o === "object" && !o.__thrown);
    const bad = valid.filter((o) => o.netSatang !== o.grossSatang - o.ssoEmployeeSatang - o.whtSatang || (o.netSatang < 0) !== (o.blocked === "NET_NEGATIVE") || ![o.grossSatang, o.ssoEmployeeSatang, o.whtSatang, o.netSatang].every(Number.isSafeInteger));
    let tot = "∅";
    let totOk = false;
    if (has(v2, "totalsV2") && valid.length) {
      const t = tryv(() => v2.totalsV2(valid)) as Any;
      const sum = (k: string) => valid.reduce((a, o) => a + o[k], 0);
      const want = { grossSatang: sum("grossSatang"), ssoEmployeeSatang: sum("ssoEmployeeSatang"), ssoEmployerSatang: sum("ssoEmployerSatang"), whtSatang: sum("whtSatang"), netSatang: sum("netSatang"), blockedCount: valid.filter((o) => o.blocked).length };
      totOk = st(Object.fromEntries(Object.keys(want).map((k) => [k, t?.[k]]))) === st(want);
      tot = short(t, 80);
    }
    chk("S7.4", valid.length >= 72 && bad.length === 0 && totOk, "≥72 items · identities · totals", `${valid.length} items · ${bad.length} broken · totals ${totOk ? "ok" : tot}`);
  }
  if (has(v2, "ytdPriorV2")) {
    const off = (V.ytdPrior?.cases ?? []).filter((c: Any) => st(tryv(() => v2.ytdPriorV2(V.ytdPrior.rows, { onDay: c.onDay, runId: c.runId }))) !== st(c.want)).map((c: Any) => c.id);
    chk("S7.5", off.length === 0, "4/4", mism("4", off));
  } else chk("S7.5", false, "ytdPriorV2", "missing (v2 module " + modState(v2, F.v2) + ")");
  {
    let ok = false;
    let note = "v2 missing";
    if (has(v2, "computeItemV2") && has(v2, "whtYtdV2")) {
      const inp = deepFreeze(JSON.parse(JSON.stringify(V.items[1].input)));
      const ls = deepFreeze(JSON.parse(JSON.stringify(V.lawSet)));
      const before = st(inp) + st(ls);
      const dn = Date.now;
      const mr = Math.random;
      let a: Any, b: Any;
      try {
        Date.now = () => {
          throw new Error("Date.now called");
        };
        Math.random = () => {
          throw new Error("Math.random called");
        };
        a = tryv(() => v2.computeItemV2(inp, ls));
        b = tryv(() => v2.computeItemV2(inp, ls));
      } finally {
        Date.now = dn;
        Math.random = mr;
      }
      ok = !a?.__thrown && st(a) === st(b) && st(inp) + st(ls) === before && v2.ENGINE_VERSION_V2 === 2;
      note = `${a?.__thrown ? `thrown ${a.__thrown}` : "ok"} · same ${st(a) === st(b)} · ENGINE_VERSION_V2=${v2.ENGINE_VERSION_V2}`;
    }
    chk("S7.6", ok, "pure at runtime", note);
  }
  // ── effective dating ──
  if (need("S6.1", law, ["pickLawRow", "pickLawSet", "lawDayOf"], "law")) {
    const P = V.pick;
    const withJson = (rows: Any[]) => rows.map((r) => ({ ...r, json: L[r.kind] ?? L.SSO }));
    const res = (o: Any) => (o?.ok ? { id: o.row?.id } : o?.__thrown ? o : { code: o?.code });
    const run = (rows: Any[], c: Any) => res(tryv(() => law.pickLawRow(rows, c.kind, c.onDay)));
    const base = withJson(P.rows);
    const tie = withJson([...P.rows, P.tie.extra]);
    const off = [...P.cases.map((c: Any) => [c, run(base, c)]), ...P.tie.cases.map((c: Any) => [c, run(tie, c)])].filter(([c, g]: Any) => st(g) !== st(c.want)).map(([c, g]: Any) => `${c.id}:${short(g, 40)}`);
    chk("S6.1", off.length === 0, "13/13", mism("13", off));
    const perms = (a: Any[]): Any[][] => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
    const pOff: string[] = [];
    for (const p of perms(base)) for (const c of P.cases) if (st(run(p, c)) !== st(c.want)) pOff.push(c.id);
    for (const c of P.tie.cases) if (st(run([...tie].reverse(), c)) !== st(c.want)) pOff.push(`rev:${c.id}`);
    const asDate = base.map((r: Any) => ({ ...r, effectiveFrom: new Date(`${r.effectiveFrom}T00:00:00Z`) }));
    for (const c of P.cases) if (st(run(asDate, c)) !== st(c.want)) pOff.push(`date:${c.id}`);
    chk("S6.2", pOff.length === 0, "order-independent", mism("120×11", pOff));
    const set1 = res(tryv(() => law.pickLawSet(base, "2026-07-01")));
    const s1 = tryv(() => law.pickLawSet(base, "2026-07-01")) as Any;
    const full = withJson([...P.rows, { id: "T0", kind: "TAX_BRACKET", effectiveFrom: "2020-01-01", status: "ACTIVE" }, { id: "D0", kind: "DEDUCTION", effectiveFrom: "2020-01-01", status: "ACTIVE" }]);
    const s2 = tryv(() => law.pickLawSet(full, "2026-07-01")) as Any;
    const r = {
      missing: s1?.ok === false && s1.code === "LAW_MISSING" && st([...(s1.kinds ?? [])].sort()) === st(["DEDUCTION", "TAX_BRACKET"]) && !s1.set,
      full: s2?.ok === true && st(s2.ids) === st(["B", "D0", "T0"]) && s2.set?.SSO?.id === "B",
    };
    chk("S6.3", Object.values(r).every(Boolean), "refuse + ids", `${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "ok"} · ${short(set1, 40)} · ${short(s2, 60)}`);
    const pd = (V.payDay ?? []).filter((v: Any) => tryv(() => law.lawDayOf(new Date(v.payDate))) !== v.want).map((v: Any) => v.id);
    chk("S6.4", pd.length === 0 && (V.payDay ?? []).length === 4, "4/4", mism("4", pd));
  } else (["S6.2", "S6.3", "S6.4"] as const).forEach((id) => chk(id, false, "law.ts", `law.ts ${modState(law, F.law)}`));
  // ── NEEDS ACCOUNTANT (registered · skipped with the question until a value is supplied) ──
  NA.forEach((n: Any, i: number) => chk(`NA.${i + 1}`, n.want === null, "NEEDS ACCOUNTANT (skip)", n.want === null ? `⏭ SKIP · NEEDS ACCOUNTANT: ${String(n.q).slice(0, 120)}` : "value supplied — controller must turn it into a vector (ORACLE-EDIT)"));
}

// ═════════════════════════ DB ═════════════════════════
const TAG = `qc-h33-${tagOf(String(Date.now()))}`;
const PU_IDS: string[] = [];
async function runDb(P: Any, law: Any, plat: Any, seed: Any): Promise<void> {
  {
    const rows = (await P.$queryRawUnsafe(`SELECT kind::text AS kind, "effectiveFrom", json, status::text AS status FROM "HrLawTable" WHERE "sourceKey" = ANY($1::text[]) ORDER BY "sourceKey"`, ["v1:SSO", "v1:TAX_BRACKET", "v1:DEDUCTION", "v1:OT"])) as Any[];
    const order = ["SSO", "TAX_BRACKET", "DEDUCTION", "OT"];
    const sorted = order.map((k) => rows.find((r) => r.kind === k)).filter(Boolean);
    const dg = sorted.length === 4 && seed?.lawDigest ? seed.lawDigest(sorted) : "∅";
    const act = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE status = 'ACTIVE'`)) as Any[])[0]?.n ?? -1);
    console.log(`  ℹ️  law rows on this DB: ${rows.map((r) => `${r.kind}=${r.status}`).join(" ")} · ACTIVE rows in table: ${act} (v2 refuses LAW_MISSING until the platform activates signed-off rows — Q3)`);
    chk("S8.1", dg === FROZEN_LAW_DIGEST, `4 rows · ${FROZEN_LAW_DIGEST.slice(0, 12)}`, `${rows.length} rows · ${String(dg).slice(0, 12)} · status ${rows.map((r) => `${r.kind}=${r.status}`).join(" ")}`);
  }
  // S8.5 first (before any fixture row exists)
  if (law && typeof law.loadLawView === "function") {
    const v = (await law.loadLawView("2026-11-30").catch((e: unknown) => ({ __thrown: errText(e) }))) as Any;
    const groups: Any[] = v?.groups ?? [];
    const kinds = groups.map((g) => g.kind);
    const v1 = groups.flatMap((g) => (g.rows ?? []).filter((r: Any) => String(r.effectiveFrom).startsWith("1970-01-01")));
    const keys = JSON.stringify(v);
    const r = {
      kinds: ["SSO", "TAX_BRACKET", "DEDUCTION", "OT"].every((k) => kinds.includes(k)),
      v1Draft: v1.length >= 4 && v1.every((x: Any) => x.status !== "ACTIVE" ? x.inForce === false : true),
      pending: v?.pendingSignOff === (v1.every((x: Any) => x.status !== "ACTIVE")),
      noKeys: !/"(approvedById|sourceKey|supersedesId)"/.test(keys),
      ints: v1.every((x: Any) => Object.values(flat(x.values ?? {})).every((n) => n === null || typeof n !== "number" || Number.isSafeInteger(n))),
    };
    chk("S8.5", Object.values(r).every(Boolean), "read-only DTO", `${Object.entries(r).filter(([, x]) => !x).map(([k]) => k).join(",") || "ok"} · ${short(v, 80)}`);
  } else chk("S8.5", false, "loadLawView", `law.ts ${modState(law, F.law)}`);
  // S8.2 — fixture ACTIVE rows inside a rolled-back tx
  if (law && typeof law.loadLawSet === "function") {
    const out: Record<string, string> = {};
    const ROLL = "__H33_ROLLBACK__";
    const ins = async (tx: Any, key: string, kind: string, day: string, status: string) =>
      tx.$executeRawUnsafe(
        `INSERT INTO "HrLawTable" (id, kind, "effectiveFrom", json, status, "sourceKey", note, "approvedByName", "approvedAt") VALUES ($1, $2::"HrLawKind", $3::date, $4::jsonb, $5::"HrLawStatus", $1, 'qc fixture', $6, $7)`,
        `${TAG}-${key}`, kind, day, JSON.stringify(L[kind] ?? L.SSO), status, status === "ACTIVE" ? "QC FIXTURE — not a sign-off" : null, status === "ACTIVE" ? new Date("2026-01-01T00:00:00Z") : null,
      );
    const ids = (o: Any) => (o?.ok ? [...(o.ids ?? [])].sort().join("|") : `✗${o?.code ?? short(o, 30)}`);
    let before = "";
    try {
      before = ids(await law.loadLawSet("2189-12-31").catch((e: unknown) => ({ code: errText(e) })));
      await P.$transaction(async (tx: Any) => {
        await ins(tx, "s1", "SSO", "2190-01-01", "ACTIVE");
        await ins(tx, "t1", "TAX_BRACKET", "2190-01-01", "ACTIVE");
        await ins(tx, "d1", "DEDUCTION", "2190-01-01", "ACTIVE");
        await ins(tx, "s2", "SSO", "2190-07-01", "ACTIVE");
        await ins(tx, "s3", "SSO", "2190-09-01", "DRAFT");
        out.dayBefore = ids(await law.loadLawSet("2189-12-31", tx));
        out.dayOf = ids(await law.loadLawSet("2190-01-01", tx));
        out.before2 = ids(await law.loadLawSet("2190-06-30", tx));
        out.of2 = ids(await law.loadLawSet("2190-07-01", tx));
        out.draft = ids(await law.loadLawSet("2190-09-15", tx));
        throw new Error(ROLL);
      }, { timeout: 60_000, maxWait: 20_000 });
    } catch (e) {
      if (!String((e as Error)?.message).includes(ROLL)) out.err = errText(e);
    }
    const T = (k: string) => `${TAG}-${k}`;
    const want = { dayBefore: before, dayOf: [T("d1"), T("s1"), T("t1")].sort().join("|"), before2: [T("d1"), T("s1"), T("t1")].sort().join("|"), of2: [T("d1"), T("s2"), T("t1")].sort().join("|"), draft: [T("d1"), T("s2"), T("t1")].sort().join("|") };
    const ok = !out.err && Object.entries(want).every(([k, w]) => out[k] === w) && (before.startsWith("✗LAW_MISSING") || before.includes("|"));
    chk("S8.2", ok, `by effectiveFrom · outside fixture ${before || "?"}`, out.err ?? Object.entries(want).map(([k, w]) => `${k}${out[k] === w ? "✓" : `✗(${short(out[k], 40)})`}`).join(" "));
  } else chk("S8.2", false, "loadLawSet", `law.ts ${modState(law, F.law)}`);
  // S8.3 — tenantDb write guard
  {
    const { tenantDb } = (await import("@/lib/core/db")) as Any;
    const t = tenantDb({ tenantId: `${TAG}-tenant` }).hrLawTable;
    const data = (k: string) => ({ kind: "MIN_WAGE", effectiveFrom: new Date("2191-01-01T00:00:00Z"), json: { qc: 1 }, status: "DRAFT", sourceKey: `${TAG}-tn-${k}` });
    const res: Record<string, string> = {};
    res.create = await codeOf(() => t.create({ data: data("1") }));
    res.createMany = await codeOf(() => t.createMany({ data: [data("2")] }));
    res.update = await codeOf(() => t.update({ where: { sourceKey: `${TAG}-tn-1` }, data: { status: "ACTIVE", approvedById: "tenant-user", approvedAt: new Date() } }));
    res.updateMany = await codeOf(() => t.updateMany({ where: { sourceKey: { startsWith: TAG } }, data: { note: "x" } }));
    res.upsert = await codeOf(() => t.upsert({ where: { sourceKey: `${TAG}-tn-3` }, create: data("3"), update: { note: "x" } }));
    res.delete = await codeOf(() => t.delete({ where: { sourceKey: `${TAG}-tn-1` } }));
    res.deleteMany = await codeOf(() => t.deleteMany({ where: { sourceKey: { startsWith: TAG } } }));
    const thrown = (c: string) => c !== "NO_REFUSAL";
    let reads = "";
    try {
      const n = await t.count({ where: { sourceKey: { startsWith: "v1:" } } });
      const f = await t.findMany({ where: { sourceKey: "v1:SSO" }, select: { id: true } });
      reads = n >= 4 && f.length === 1 ? "ok" : `count ${n} find ${f.length}`;
    } catch (e) {
      reads = errText(e);
    }
    const left = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE $1`, `${TAG}-tn-%`)) as Any[])[0]?.n ?? -1);
    chk("S8.3", Object.values(res).every(thrown) && reads === "ok" && left === 0, "7 writes refused · reads ok · 0 rows", `${Object.entries(res).map(([k, v]) => `${k}=${thrown(v) ? "✓" : "WROTE"}`).join(" ")} · reads ${reads} · rows ${left}`);
  }
  // S8.4 — platform writes
  if (plat && ["createLawDraft", "activateLawRow", "retireLawRow"].every((n) => typeof plat[n] === "function")) {
    const sa = await P.platformUser.create({ data: { email: `${TAG}-sa@qc.invalid`, name: "QC H3.3 SA", role: "SUPER_ADMIN" } });
    const sup = await P.platformUser.create({ data: { email: `${TAG}-sup@qc.invalid`, name: "QC H3.3 SUP", role: "SUPPORT" } });
    PU_IDS.push(sa.id, sup.id);
    const forged = { ...sa, id: `${TAG}-tenant-user` };
    const rowOf = async (id: string) => ((await P.$queryRawUnsafe(`SELECT status::text AS status, json, "approvedById", "approvedByName", "approvedAt" FROM "HrLawTable" WHERE id = $1`, id)) as Any[])[0] ?? null;
    const idOf = (o: Any) => (o?.ok ? o.id : null);
    const r: Record<string, boolean> = {};
    const notes: string[] = [];
    const c1 = await plat.createLawDraft(sa, { kind: "SSO", effectiveFrom: "2192-01-01", json: L.SSO, note: `${TAG} fixture` }).catch((e: unknown) => ({ ok: false, code: errText(e) }));
    const id1 = idOf(c1);
    if (id1) await P.$executeRawUnsafe(`UPDATE "HrLawTable" SET "sourceKey" = $2 WHERE id = $1`, id1, `${TAG}-p1`); // ป้ายสำหรับกวาดทิ้ง
    const r1 = id1 ? await rowOf(id1) : null;
    r.draft = !!id1 && r1?.status === "DRAFT" && st(r1.json) === st(L.SSO);
    r.forged = (await codeOf(() => plat.activateLawRow(forged, id1 ?? "x", { approvedByName: "QC" }))) !== "NO_REFUSAL" && (id1 ? (await rowOf(id1))?.status === "DRAFT" : false);
    r.support = (await codeOf(() => plat.activateLawRow(sup, id1 ?? "x", { approvedByName: "QC" }))) !== "NO_REFUSAL" && (id1 ? (await rowOf(id1))?.status === "DRAFT" : false);
    r.noApprover = (await codeOf(() => plat.activateLawRow(sa, id1 ?? "x", { approvedByName: "" }))) !== "NO_REFUSAL" && (id1 ? (await rowOf(id1))?.status === "DRAFT" : false);
    const a1 = await plat.activateLawRow(sa, id1 ?? "x", { approvedByName: "QC FIXTURE — not a sign-off" }).catch((e: unknown) => ({ ok: false, code: errText(e) }));
    const ra = id1 ? await rowOf(id1) : null;
    r.activate = a1?.ok === true && ra?.status === "ACTIVE" && ra.approvedById === sa.id && ra.approvedByName === "QC FIXTURE — not a sign-off" && !!ra.approvedAt && st(ra.json) === st(L.SSO);
    const audit = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "PlatformAuditLog" WHERE "platformUserId" = $1 AND action LIKE 'hr.law.%' AND "targetId" = $2`, sa.id, id1 ?? "x")) as Any[])[0]?.n ?? 0);
    r.audit = audit >= 1;
    const c2 = await plat.createLawDraft(sa, { kind: "SSO", effectiveFrom: "2192-01-01", json: L.SSO, note: `${TAG} fixture 2` }).catch((e: unknown) => ({ ok: false, code: errText(e) }));
    const id2 = idOf(c2);
    if (id2) await P.$executeRawUnsafe(`UPDATE "HrLawTable" SET "sourceKey" = $2 WHERE id = $1`, id2, `${TAG}-p2`);
    r.slotTaken = !!id2 && (await codeOf(() => plat.activateLawRow(sa, id2, { approvedByName: "QC" }))) !== "NO_REFUSAL" && (await rowOf(id2))?.status === "DRAFT";
    const before = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable"`)) as Any[])[0]?.n ?? 0);
    r.float = (await codeOf(() => plat.createLawDraft(sa, { kind: "SSO", effectiveFrom: "2193-01-01", json: { ...L.SSO, rateBp: 500.5 } }))) !== "NO_REFUSAL" && Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "HrLawTable"`)) as Any[])[0]?.n ?? 0) === before;
    const rt = await plat.retireLawRow(sa, id1 ?? "x").catch((e: unknown) => ({ ok: false, code: errText(e) }));
    r.retire = rt?.ok === true && (await rowOf(id1 ?? "x"))?.status === "RETIRED";
    if (law && typeof law.loadLawSet === "function") {
      const s = await law.loadLawSet("2192-06-30").catch(() => null);
      r.retiredIgnored = !(s?.ids ?? []).includes(id1);
    }
    notes.push(`c1 ${short(c1, 40)} · a1 ${short(a1, 40)}`);
    chk("S8.4", Object.values(r).every(Boolean), "platform-only lifecycle", `${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "ok"} · ${notes.join(" ")}`);
  } else chk("S8.4", false, "platform/hr-law.ts", `${F.plat} ${modState(plat, F.plat)}`);
}

async function cleanup(P: Any): Promise<void> {
  await P.$executeRawUnsafe(`DELETE FROM "HrLawTable" WHERE "sourceKey" LIKE $1 OR note LIKE $2`, `${TAG}%`, `${TAG}%`);
  const pus = ((await P.$queryRawUnsafe(`SELECT id FROM "PlatformUser" WHERE email LIKE $1`, `qc-h33-%@qc.invalid`)) as Any[]).map((r) => r.id);
  const all = [...new Set([...PU_IDS, ...pus])];
  if (all.length) {
    await P.$executeRawUnsafe(`DELETE FROM "PlatformAuditLog" WHERE "platformUserId" = ANY($1::text[])`, all);
    await P.$executeRawUnsafe(`DELETE FROM "PlatformSession" WHERE "platformUserId" = ANY($1::text[])`, all).catch(() => {});
    await P.$executeRawUnsafe(`DELETE FROM "PlatformUser" WHERE id = ANY($1::text[])`, all);
  }
}
async function residue(P: Any): Promise<string[]> {
  const n = async (sql: string, ...a: unknown[]) => Number(((await P.$queryRawUnsafe(sql, ...a)) as Any[])[0]?.n ?? -1);
  const out: string[] = [];
  const law = await n(`SELECT count(*)::int AS n FROM "HrLawTable" WHERE "sourceKey" LIKE 'qc-h33-%' OR note LIKE 'qc-h33-%'`);
  const pu = await n(`SELECT count(*)::int AS n FROM "PlatformUser" WHERE email LIKE 'qc-h33-%'`);
  const au = PU_IDS.length ? await n(`SELECT count(*)::int AS n FROM "PlatformAuditLog" WHERE "platformUserId" = ANY($1::text[])`, PU_IDS) : 0;
  if (law) out.push(`HrLawTable ${law}`);
  if (pu) out.push(`PlatformUser ${pu}`);
  if (au) out.push(`PlatformAuditLog ${au}`);
  return out;
}

// ═════════════════════════ SKIP guard + run ═════════════════════════
const skipReasons = existsSync(join(ROOT, F.v2)) ? [] : [`H3.3 not built: ${F.v2} absent`];
if (skipReasons.length && !FORCE) REG.skipExit(skipReasons);
const { P } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);
const R1 = (await import("@/lib/modules/hr/payroll-rules")) as Any;
const v2 = await loadOpt(F.v2, "@/lib/modules/hr/payroll-rules-v2");
const law = await loadOpt(F.law, "@/lib/modules/hr/law");
const plat = await loadOpt(F.plat, "@/lib/platform/hr-law");
const seed = (await import("./hr-seed-law-draft.mjs" as string).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const ok = (m: Any) => (m && !m.__err ? m : null);
let crashed = "";
try {
  runStatic();
  await runPure(R1, ok(v2), ok(law), ok(seed));
  await runDb(P, ok(law), ok(plat), ok(seed));
  const fit = await fitnessNoEnv();
  chk("X12.1", fit.ok, "exit 0 ×2", fit.note);
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup(P);
  } catch (e) {
    console.log(`💥 cleanup: ${errText(e)}`);
  }
}
const res = await residue(P);
chk("Z1", res.length === 0, "none", res.join(",") || "none");
console.log(`NEEDS-ACCOUNTANT ${NA.filter((n) => n.want === null).length}/${NA.length} skipped with reason (ledger/hr-briefs/hr-brief-H3.3.md §FOR THE ACCOUNTANT)`);
const exit = REG.finish({ forced: FORCE, crashed, missing: skipReasons });
await P.$disconnect?.().catch?.(() => {});
process.exit(exit);
