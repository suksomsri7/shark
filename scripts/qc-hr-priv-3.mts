// QC HR PRIV-3 page role gates (employees / leave / payroll) · brief hr-brief-PRIV-3.md (+ CONTROLLER RULINGS) · notes hr-PRIV-3-oracle.md · ⚠️ ORACLE-EDIT only · QC_FORCE=1 · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-priv-3.mts
//   QC_PRIV3_MEASURE=1 prints the measured goldens (GOLD) — taken on base ea2b41ea1 (r2 cells on 44a75f37a) · registry base column re-based to b1374b242: all GREEN
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { type Any, type Def, ROOT, rd, errText, canon, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, addDay, dbDate, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, sha, srcFiles, stripComments, QUERY_COUNTER } from "./qc-hr-lib.mjs";
import { installNetGuard } from "./qc-hr-h4.3-lib.mjs";
import { bodyOf } from "./qc-hr-priv-2-lib.mjs";
import { H, BASE, sha16, fileAtBase, hunksOf, changed, importEnd, fnRange, inRange, cycleThrough, installIntl, loadClientSet, renderPage, renderEl, inScope, h, textOfHtml, testids, leaveForm, employeeOptions, hrefsIn, fd, gatedOf, GOLD, type Rendered } from "./qc-hr-priv-3-lib.mjs";

const SUITE = "qc-hr-priv-3", ARGV = process.argv.slice(2), FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run"), PFX = "qc-hr-priv3-", MEASURE = process.env.QC_PRIV3_MEASURE === "1";
const PG = "src/app/app/sys/[id]/hr/";
const F = { priv: `${H}privacy.ts`, nav: `${H}nav.ts`, ui: `${H}ui.tsx`, acts: `${H}actions.ts`, emp: `${PG}employees/page.tsx`, leave: `${PG}leave/page.tsx`, pay: `${PG}payroll/page.tsx`, kiosk: `${PG}kiosk/page.tsx`, inv: "scripts/hr-ui-inventory.json" };
const PAGES = { register: F.emp, leave: F.leave, payroll: F.pay } as const;
const MK = "HR PRIV-3", OE = "ORACLE-EDIT (HR PRIV-3";
const SCHEMA = "prisma/schema/payroll.prisma", LAST_HR_MIG = "20270111000000_hr_line_link"; // r2 R10: latest HR migration at 44a75f37a
/** migration folders that exist now but not at BASE */
const newMigs = () => readdirSync(join(ROOT, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d) && fileAtBase(`prisma/migrations/${d}/migration.sql`) === null);

const D = (id: string, g: string, sb: string, t: string): Def => [id, g, ({ C: "CRITICAL", M: "MAJOR", m: "MINOR" } as const)[sb[0] as "C"], sb[1] === "R" ? "RED" : "GREEN", t];
const CHECKS: Def[] = [
 D("S1", "R1", "CG", "[static] one helper hrPageAccessOf/requireHrPage in privacy.ts, built from existing predicates · no copy · no inline evaluate in pages/ui/nav hunks"),
 D("S2", "R2 R7", "CG", "[static] 3 pages import requireHrPage + call it after the system check and before any data read · fitness pageGuard guarded · PAGE_GUARD_BASELINE −3 (kiosk kept)"),
 D("S3", "R3 R4 R5", "MG", "[static] nav gateOf + requestLeaveAction + HrLeaveSection + HrHub use the helper · hrTabs/HrOtSection bodies = base"),
 D("S4", "§files", "MG", "[static] allowed files only (incl. .mts) · ui/actions hunks in their ranges · every src hunk marked HR PRIV-3 · oracle edits marked · payroll-rules sha · prisma only = R10 schema + migration"),
 D("S6", "r2 R10 R14", "MG", "[static] exactly ONE new migration (after the latest HR migration): only DROP INDEX IF EXISTS / CREATE UNIQUE INDEX (new created BEFORE old dropped) on HrSalaryProfile + HrPayrollRun · keys (tenantId, systemId, employeeId) and (tenantId, systemId, periodKey) WHERE status <> 'REVERSED' · schema @@unique swapped, nothing else · no old compound-key call site"),
 D("S5", "R1", "mG", "[static] no new import cycle through privacy.ts"),
 D("G1", "R1", "CG", "hrPageAccessOf truth table (13 viewers incl. r2 PR/PA + API key) · requireHrPage = table · malformed viewer ⇒ all false — the table qc-hr-h2.10 S7.1 now follows (pinned here)"),
 D("P1", "R2 Q1", "CG", "/hr/employees K N S S0 SR PR PA ⇒ not-found identical to unknown system (digest + SQL count) · nothing rendered"),
 D("P2", "R2 Q6", "CG", "/hr/leave K N S0 ⇒ not-found identical to unknown system · nothing rendered"),
 D("P3", "R2 Q3", "MG", "/hr/payroll K N S S0 SR SD PA ⇒ not-found identical to unknown system · nothing rendered"),
 D("P4", "-", "CG", "[control] /hr/employees/[id]: K N ⇒ not-found = unknown employee · S own ⇒ redirect /app/me/hr/profile · S other ⇒ not-found · entitled open in-scope"),
 D("P5", "R2", "CG", "[control] /hr/employees entitled (O M MB P PB SD): names + testids = base"),
 D("P6", "R2 R3", "CG", "[control] /hr/leave entitled (O M MB P PB S SR SD PR PA): names + testids outside the filing form = base"),
 D("P7", "R2", "CG", "[control] /hr/payroll entitled (O M MB P PB PR): names + testids = base"),
 D("P8", "-", "MG", "[control] other HR pages (hub · attendance · roster · kiosk · requests · reports · settings · law) outcome per viewer = base"),
 D("P9", "-", "MG", "[control] unknown system id ⇒ not-found on the 3 pages for every viewer"),
 D("P10", "r2 R9", "mG", "[control · debt] staff of another HR system of the same shop on this /hr/leave: outcome = 44a75f37a (renders, no employee of this system)"),
 D("L1", "R3", "CG", "leave picker: S P PB SR PR PA ⇒ no employee options · S keeps self form · P PB SR PR PA no form · S page/props carry no other employee"),
 D("L2", "R3", "CG", "[control] leave picker O M MB SD = base option set"),
 D("N1", "R4", "MG", "hrNavFilter (tabs + sidebar): employees/leave/payroll iff gate · other items = base"),
 D("N2", "R5", "MG", "hub: no card/tab/link to a gated page · no headcount for viewers without the register"),
 D("N3", "R5", "MG", "[control] hub entitled (O M MB P PB): links + headcount = base"),
 D("N4", "R4", "mG", "[control] tabs on rendered entitled pages = hrNavFilter of the viewer"),
 D("A1", "§15", "CG", "[control] register actions as K N S: refused · nothing written (rows + audit) · same outcome real vs unknown id"),
 D("A2", "§15", "CG", "[control] leave/OT actions as K N S (on behalf · decide · bulk · OT decide/revoke/request): refused · others' rows untouched · same outcome real vs unknown"),
 D("A3", "-", "MG", "[positive control] owner createEmployeeAction writes in the same harness"),
 D("R1", "§38", "MG", "[control] route handlers (reports/export · bank-file · filing · salary-cert · tax-cert) K N S: same status+bytes as unknown system · owner export 200"),
 D("Z1", "-", "CG", "residue none · other tenant untouched"),
];
const R = makeRegistry(SUITE, "", CHECKS);
if (ARGV.includes("--list")) { R.printList(); process.exit(0); }
const { chk } = R;
const all = (r: Record<string, unknown>) => Object.values(r).every(Boolean);
const fails = (r: Record<string, unknown>) => Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "all";
const L = (xs: string[], n = 8) => xs.slice(0, n).join(" | ") || "ok";
const code = (p: string) => stripComments(rd(p));
const built = rd(F.priv).includes(MK);
if (!built && !FORCE) R.skipExit([`${F.priv} has no ${MK} marker`]);

// ═════════════ statics ═════════════
{
 const pv = code(F.priv), b = bodyOf(pv, "hrPageAccessOf");
 const defs = srcFiles("src").filter((f) => /\.(ts|tsx)$/.test(f) && f !== F.priv && /(?:function|const)\s+(hrPageAccessOf|requireHrPage)\b/.test(code(f)));
 const inl = [F.emp, F.leave, F.pay, F.nav, F.ui].flatMap((f) => hunksOf(f).flatMap((x) => x.added).filter((l) => /\bevaluate\s*\(/.test(stripComments(l))).map(() => f.split("/").slice(-2).join("/")));
 const r = { access: /export\s+function\s+hrPageAccessOf\b/.test(pv), require: /export\s+function\s+requireHrPage\b/.test(pv), openProfile: /hrAccessOf\(/.test(b), pay: ["canViewPayroll", "canReadWorkEntries", "canRequestStockCharge", "canSeeStockCharges"].every((n) => pv.includes(`${n}(`)) && /from\s+["']\.\/work-entries["']/.test(pv) && /from\s+["']\.\/stock-charge["']/.test(pv),
  leaveKeys: ["request", "read", "decide"].map((k) => `hr.leave.${k}`).concat("hr.employee.create", "hr.payadjust.request", "hr.payadjust.approve", "hr.payroll.read").every((k) => pv.includes(`"${k}"`)), noCopy: !defs.length, noInline: !inl.length };
 chk("S1", all(r), "all", `${fails(r)} copies=${defs.join(",") || "-"} inline=${inl.join(",") || "-"}`);
}
let fit: Any = null;
try { fit = await import("./fitness-hr.mjs" as string); } catch (e) { fit = { __err: errText(e) }; }
{
 const bad: string[] = [];
 for (const [pg, f] of Object.entries(PAGES)) {
  const s = code(f), n = f.split("/").slice(-2).join("/");
  if (!/import\s*\{[^}]*\brequireHrPage\b[^}]*\}\s*from\s*["']@\/lib\/modules\/hr\/privacy["']/.test(s)) { bad.push(`${n}:import`); continue; }
  const call = new RegExp(`if\\s*\\(\\s*!\\s*requireHrPage\\(\\s*hrViewerOf\\(\\s*auth\\s*\\)\\s*,\\s*["']${pg}["']\\s*\\)\\s*\\)\\s*notFound\\(\\)`).exec(s);
  const sysAt = s.search(/if\s*\(\s*!sys\s*\)\s*notFound\(\)/);
  if (!call || sysAt < 0 || call.index < sysAt) { bad.push(`${n}:call`); continue; }
  const after = s.slice(sysAt), firstRead = after.slice(after.indexOf("\n")).search(/\bawait\s+(?!params\b|searchParams\b)|\breturn\s*\(|\bhrTabsFor\(/);
  if (firstRead >= 0 && sysAt + after.indexOf("\n") + firstRead < call.index) bad.push(`${n}:order`);
  const pgd = fit?.pageGuard ? fit.pageGuard(ROOT, `${ROOT}/${f}`) : { guarded: false, detail: fit?.__err ?? "no pageGuard" };
  if (!pgd.guarded) bad.push(`${n}:pageGuard`);
 }
 const bl: Map<string, string> | undefined = fit?.PAGE_GUARD_BASELINE;
 const r = { pages: !bad.length, baseline3: !!bl && [F.emp, F.leave, F.pay].every((f) => !bl.has(f)), kioskKept: !!bl?.has(F.kiosk) };
 chk("S2", all(r), "all", `${fails(r)} ${bad.join(",") || ""}`);
}
{
 const nv = code(F.nav), ui = code(F.ui), base = (f: string) => stripComments(fileAtBase(f) ?? "");
 const go = bodyOf(nv, "gateOf"), nf = bodyOf(nv, "hrNavFilter"), rl = bodyOf(code(F.acts), "requestLeaveAction");
 const r = {
  gate: ["employees", "leave", "payroll"].every((p) => go.includes(p)) && /from\s+["']\.\/privacy["']/.test(nv) && /\b(requireHrPage|hrPageAccessOf)\(/.test(nf),
  action: rl.includes("leaveOnBehalf") && /hrPageAccessOf\(/.test(rl) && !/hr\.leave\.decide/.test(rl),
  picker: bodyOf(ui, "HrLeaveSection").includes("leaveOnBehalf"), hub: /\b(requireHrPage|hrPageAccessOf)\(/.test(bodyOf(ui, "HrHub")),
  tabs: sha16(bodyOf(ui, "hrTabs")) === sha16(bodyOf(base(F.ui), "hrTabs")), ot: sha16(bodyOf(ui, "HrOtSection")) === sha16(bodyOf(base(F.ui), "HrOtSection")),
 };
 chk("S3", all(r), "all", fails(r));
}
{
 // r2 (controller): R6 = the 8 payroll action files + payroll.ts (ownership guard only · payroll-rules.ts stays byte-identical below) · R7 = refusal texts in service/ot/swap + their action files
 const R6_FILES = ["payroll-actions", "payroll-opening-actions", "work-entries-actions", "stock-charge-actions", "attendance-pay-actions", "payslip-actions", "bank-files/actions", "filings/actions", "payroll"].map((x) => `${H}${x}.ts`);
 const R7_FILES = ["service", "ot", "swap", "ot-actions", "swap-actions", "self-actions"].map((x) => `${H}${x}.ts`);
 const SRC_OK = [F.priv, F.nav, F.ui, F.acts, F.emp, F.leave, F.pay, ...R6_FILES, ...R7_FILES, SCHEMA]; // r2 R10: + prisma/schema/payroll.prisma (the new migration folder is judged by S6)
 const ORACLE_OWN = ["scripts/qc-hr-priv-3.mts", "scripts/qc-hr-priv-3-lib.mts", "scripts/qc-hr-priv-3b.mts"];
 const CTL = ["scripts/fitness-hr.mts", "scripts/qc-hr-h2.10.mts"], DATA = [F.inv, "scripts/walk-hr-matrix.json"]; // DATA = controller-authorised JSON rows (no comment syntax for a marker)
 const marked = (f: string, m: string) => { const hs = hunksOf(f); return hs.length > 0 && hs.every((x) => x.added.some((l) => l.includes(m))); };
 const ch = changed(), outside: string[] = [], bad: string[] = [];
 const uiB = fileAtBase(F.ui) ?? "", acB = fileAtBase(F.acts) ?? "";
 const RANGES: Record<string, [number, number][]> = { [F.ui]: [[1, importEnd(uiB) + 1], fnRange(uiB, "HrLeaveSection"), fnRange(uiB, "HrHub")], [F.acts]: [[1, importEnd(acB) + 1], [fnRange(acB, "requestLeaveAction")[0], fnRange(acB, "requestLeaveAction")[0] + 16], fnRange(acB, "cancelLeaveAction"), ...["createEmployeeAction", "updateEmployeeAction", "removeEmployeeAction", "restoreEmployeeAction"].map((n) => fnRange(acB, n))] }; // r2 R7: cancelLeaveAction · r3 R12: employee create/update/remove/restore
 for (const f of ch) {
  if (ORACLE_OWN.includes(f) || /^ledger\/wo-notes\/hr-PRIV-3[^/]*\.md$/.test(f) || f === "ledger/hr-briefs/hr-brief-PRIV-3.md") continue; // brief: controller rulings r2 appended
  if (SRC_OK.includes(f)) {
   for (const x of hunksOf(f)) {
    if (!x.added.some((l) => l.includes(MK))) bad.push(`${f.split("/").pop()}@${x.a}:unmarked`);
    if (RANGES[f] && !inRange(x, RANGES[f]!)) bad.push(`${f.split("/").pop()}@${x.a}:range`);
   }
   continue;
  }
  if (f.startsWith(H) && fileAtBase(f) === null) { if (!rd(f).split("\n").slice(0, 3).join("\n").includes(MK)) bad.push(`${f.split("/").pop()}:header`); continue; }
  if (/^prisma\/migrations\/[^/]+\/migration\.sql$/.test(f) && newMigs().includes(f.split("/")[2]!)) continue; // r2 R10 — content judged by S6
  if (DATA.includes(f)) continue; // brief R7 rows — content judged by fitness F16.8 + the controller walk
  if (CTL.includes(f) || (/^scripts\/[^/]+\.mts$/.test(f) && fileAtBase(f) !== null)) { if (!marked(f, OE)) bad.push(`${f}:oracle-edit unmarked`); continue; }
  outside.push(f);
 }
 const r = { files: !outside.length, hunks: !bad.length, rules: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA, prisma: ch.filter((f) => f.startsWith("prisma/")).every((f) => f === SCHEMA || newMigs().some((m) => f === `prisma/migrations/${m}/migration.sql`)), base: !!BASE }; // r2 R10: "no migration" → only the R10 schema + migration (S6)
 chk("S4", all(r), "all", `${fails(r)} outside=${L(outside, 6)} bad=${L(bad, 6)} base=${BASE.slice(0, 9)}`);
}
{
 const cyc = cycleThrough(F.priv), want: string[] = GOLD.cycle ?? [];
 const extra = cyc.filter((f) => !want.includes(f));
 if (MEASURE) console.log(`MEASURE cycle ${JSON.stringify(cyc)}`);
 chk("S5", !extra.length, "⊆ base", `new=${extra.join(",") || "none"} (base ${want.length})`);
}

// ═════════════ r2 R10: exactly ONE migration — tenant-scoped unique keys of HrSalaryProfile / HrPayrollRun (index swap only) ═════════════
{
 const migs = newMigs(), bad: string[] = [];
 const sqlOf = (m: string) => rd(`prisma/migrations/${m}/migration.sql`);
 if (migs.length !== 1) bad.push(`folders=${migs.length}`);
 const m = migs[0] ?? "";
 if (m && m <= LAST_HR_MIG) bad.push(`name ${m} ≤ ${LAST_HR_MIG}`);
 if (m && readdirSync(join(ROOT, "prisma/migrations", m)).some((x) => x !== "migration.sql")) bad.push("extra files");
 const stmts = m ? sqlOf(m).replace(/--[^\n]*/g, "").split(";").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
 const okStmt = (x: string) => /^DROP INDEX (IF EXISTS )?"(HrSalaryProfile|HrPayrollRun)_[A-Za-z_]+"$/.test(x) || /^CREATE UNIQUE INDEX (IF NOT EXISTS )?"(HrSalaryProfile|HrPayrollRun)_[A-Za-z_]+" ON "(HrSalaryProfile|HrPayrollRun)" ?\([^)]*\)( WHERE .*)?$/.test(x);
 const other = stmts.filter((x) => !okStmt(x));
 if (other.length) bad.push(`non-index: ${other[0]!.slice(0, 60)}`);
 const cols = (x: string) => (/\(([^)]*)\)/.exec(x)?.[1] ?? "").replace(/[\s"]/g, "");
 const prof = stmts.find((x) => /^CREATE UNIQUE INDEX .* ON "HrSalaryProfile"/.test(x)), run = stmts.find((x) => /^CREATE UNIQUE INDEX .* ON "HrPayrollRun"/.test(x));
 if (cols(prof ?? "") !== "tenantId,systemId,employeeId") bad.push(`profile key ${cols(prof ?? "") || "none"}`);
 if (cols(run ?? "") !== "tenantId,systemId,periodKey" || !/WHERE \(?\s*"status" <> 'REVERSED'/.test(run ?? "")) bad.push(`run key ${cols(run ?? "") || "none"}`);
 for (const [t, old] of [["HrSalaryProfile", "HrSalaryProfile_systemId_employeeId_key"], ["HrPayrollRun", "HrPayrollRun_systemId_periodKey_live_key"]] as const) { // r3 R14: CREATE new first · DROP INDEX IF EXISTS old
  const di = stmts.findIndex((x) => new RegExp(`^DROP INDEX (IF EXISTS )?"${old}"$`).test(x)), ci = stmts.findIndex((x) => new RegExp(`^CREATE UNIQUE INDEX .* ON "${t}"`).test(x));
  if (di < 0) bad.push(`${old} not dropped`);
  else { if (!/^DROP INDEX IF EXISTS /.test(stmts[di]!)) bad.push(`${t}: DROP without IF EXISTS`); if (ci < 0 || ci > di) bad.push(`${t}: CREATE not before DROP`); }
 }
 const sc = stripComments(rd(SCHEMA)), model = /model HrSalaryProfile \{[\s\S]*?\n\}/.exec(sc)?.[0] ?? "";
 if (!/@@unique\(\[\s*tenantId\s*,\s*systemId\s*,\s*employeeId\s*\]/.test(model) || /@@unique\(\[\s*systemId\s*,\s*employeeId\s*\]/.test(model)) bad.push("schema HrSalaryProfile key");
 const sch = hunksOf(SCHEMA).flatMap((x) => [...x.added, ...x.removed]).filter((l) => !/^\s*(\/\/|$)/.test(l) && !/@@unique|@@index/.test(l));
 if (sch.length) bad.push(`schema other lines: ${sch[0]!.trim().slice(0, 40)}`);
 const sites = srcFiles("src").filter((f) => /systemId_employeeId|systemId_periodKey_live/.test(code(f)) && !f.includes("/account/"));
 if (sites.length) bad.push(`old compound key used: ${sites.join(",")}`);
 chk("S6", !bad.length, "one index-only migration", L(bad));
}

// ═════════════ runtime ═════════════
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard();
const { P, coreHash } = await qc4Env(SUITE, { countQueries: true });
installIntl();
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
console.log(`client components known: ${await loadClientSet([...srcFiles("src/lib/modules/hr"), ...srcFiles("src/components/ui"), "src/components/module-tabs.tsx"])}`);
const M: Record<string, Any> = {
 sys: await imp("@/lib/modules/system/service"), priv: await imp("@/lib/modules/hr/privacy"), nav: await imp("@/lib/modules/hr/nav"), ui: await imp("@/lib/modules/hr/ui"), acts: await imp("@/lib/modules/hr/actions"), ot: await imp("@/lib/modules/hr/ot-actions"), RR: await imp("@/lib/modules/hr/reports-rules"),
 emp: await imp("@/app/app/sys/[id]/hr/employees/page"), prof: await imp("@/app/app/sys/[id]/hr/employees/[employeeId]/page"), leave: await imp("@/app/app/sys/[id]/hr/leave/page"), pay: await imp("@/app/app/sys/[id]/hr/payroll/page"),
 hub: await imp("@/app/app/sys/[id]/page"), att: await imp("@/app/app/sys/[id]/hr/attendance/page"), roster: await imp("@/app/app/sys/[id]/hr/roster/page"), kiosk: await imp("@/app/app/sys/[id]/hr/kiosk/page"), req: await imp("@/app/app/sys/[id]/hr/requests/page"),
 rep: await imp("@/app/app/sys/[id]/hr/reports/page"), set: await imp("@/app/app/sys/[id]/hr/settings/page"), law: await imp("@/app/app/sys/[id]/hr/settings/law/page"), exp: await imp("@/app/app/sys/[id]/hr/reports/export/route"),
 bank: await imp("@/app/app/sys/[id]/hr/payroll/bank-file/[fileId]/route"), fil: await imp("@/app/app/sys/[id]/hr/payroll/filing/[fileId]/route"), cert: await imp("@/app/app/sys/[id]/hr/payroll/salary-cert/[certId]/route"), tax: await imp("@/app/app/sys/[id]/hr/payroll/tax-cert/[certId]/route"),
};
const badImp = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (badImp.length) console.log(`import problems: ${badImp.join(" | ")}`);
const REAL = { ...console };
const mute = () => Object.assign(console, { log: () => {}, info: () => {}, warn: () => {}, error: () => {} });
const unmute = () => Object.assign(console, REAL);

const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${PFX}${Date.now()}${tag}`, fx = makeFixtures(P, coreHash, SLUG);
const D0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const unk = () => `c${Math.random().toString(36).slice(2, 12)}zq${Math.random().toString(36).slice(2, 10)}`;
const PAYK = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.reverse": true, "hr.payadjust.request": true, "hr.payadjust.approve": true, "hr.payadjust.reject": true };
type VK = "O" | "M" | "MB" | "P" | "PB" | "S" | "S0" | "SR" | "SD" | "PR" | "PA" | "K" | "N";
const VKS: VK[] = ["O", "M", "MB", "P", "PB", "S", "S0", "SR", "SD", "PR", "PA", "K", "N"]; // r2 R9: PR = only hr.payadjust.request · PA = only hr.payadjust.approve
//                       register leave payroll onBehalf (brief R1 + rulings Q1/Q3/Q6)
const TRUTH: Record<VK | "API", [boolean, boolean, boolean, boolean]> = {
 O: [true, true, true, true], M: [true, true, true, true], MB: [true, true, true, true], P: [true, true, true, false], PB: [true, true, true, false],
 S: [false, true, false, false], S0: [false, false, false, false], SR: [false, true, false, false], SD: [true, true, false, true], PR: [false, true, true, false], PA: [false, true, false, false], K: [false, false, false, false], N: [false, false, false, false], API: [true, false, false, false],
};
const LINKED: Partial<Record<VK, string>> = { S: "e1", S0: "e7" };
async function buildFixture() {
 const T = await fx.newTenant("", "QC PRIV3 shop"), T2 = await fx.newTenant("-x", "QC PRIV3 other");
 const U1 = await fx.newUnit(T, `QCP3 สาขาหนึ่ง ${tag}`, "u1"), U2 = await fx.newUnit(T, `QCP3 สาขาสอง ${tag}`, "u2");
 const HRS = (await M.sys.createSystem(T, "HR", `HR ${tag}`)).id as string, HRS2 = (await M.sys.createSystem(T2, "HR", `HR2 ${tag}`)).id as string;
 for (const u of [U1, U2]) await M.sys.linkUnit(T, HRS, u).catch(() => undefined);
 const sc = { tenantId: T, systemId: HRS };
 const mk = (k: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(T, k.toLowerCase(), `QCP3 user${k} ${tag}`, r, ua, p);
 const W: Record<string, Any> = {
  O: await mk("O", "OWNER", [], {}), M: await mk("M", "MANAGER", ["*"], {}), MB: await mk("MB", "MANAGER", [U1], {}), P: await mk("P", "STAFF", ["*"], PAYK), PB: await mk("PB", "STAFF", [U1], PAYK),
  S: await mk("S", "STAFF", ["*"], { "hr.leave.request": true }), S0: await mk("S0", "STAFF", ["*"], {}), SR: await mk("SR", "STAFF", ["*"], { "hr.leave.request": true }),
  SD: await mk("SD", "STAFF", ["*"], { "hr.leave.request": true, "hr.leave.read": true, "hr.leave.decide": true }), K: await mk("K", "STAFF", ["*"], { "hr.attendance.clock": true }), N: await mk("N", "STAFF", [], {}),
  PR: await mk("PR", "STAFF", ["*"], { "hr.payadjust.request": true }), PA: await mk("PA", "STAFF", ["*"], { "hr.payadjust.approve": true }), XS: await mk("XS", "STAFF", ["*"], { "hr.leave.request": true }),
 };
 const HRS3 = (await M.sys.createSystem(T, "HR", `HR3 ${tag}`)).id as string; // r2 R9: another HR system of the same shop · XS = its linked staff
 const xs = await fx.mkEmp(T, HRS3, `QCP3 xs ${tag}`, { code: "XS1", linkedUserId: W.XS.id });
 const defs: [string, string | null, Record<string, Any>][] = [["e1", U1, { linkedUserId: W.S.id }], ["e2", U1, {}], ["e3", U2, {}], ["e4", U2, {}], ["e5", U1, { active: false }], ["e6", null, {}], ["e7", U1, { linkedUserId: W.S0.id }]];
 const E: Record<string, { k: string; id: string; name: string }> = {};
 for (const [i, [k, u, o]] of defs.entries()) {
  const name = `QCP3 ${k} ${tag}`, id = await fx.mkEmp(T, HRS, name, { code: `P3${i}`, startDate: "2024-02-01", position: "บาริสต้า", unitId: u, ...o });
  await P.hrSalaryProfile.create({ data: { ...sc, employeeId: id, payType: "MONTHLY", baseSalarySatang: 2_500_000 + i * 1_013, ssoEligible: true } });
  E[k] = { k, id, name };
 }
 const x1 = await fx.mkEmp(T2, HRS2, `QCP3 other ${tag}`, { code: "X1" });
 await P.hrEmployeeUnit.create({ data: { ...sc, employeeId: E.e4!.id, unitId: U1, fromDate: dbDate(addDay(D0, -3)), toDate: null } });
 const doc = (await P.hrEmployeeDoc.create({ data: { ...sc, employeeId: E.e2!.id, kind: "OTHER", title: "เอกสาร", url: `https://files.invalid/${tag}` } })).id as string;
 const pol = (await P.hrLeavePolicy.create({ data: { ...sc, category: "PERSONAL", name: `กิจ ${tag}`, quotaDays: 30, allowHalfDay: false, allowHours: false } })).id;
 const leave = (await P.hrLeave.create({ data: { ...sc, employeeId: E.e2!.id, policyId: pol, type: "PERSONAL", fromDate: dbDate(addDay(D0, 20)), toDate: dbDate(addDay(D0, 20)), status: "PENDING", reason: "ธุระ", days: 1 } })).id as string;
 const bkk = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+07:00`) + min * 60_000);
 const ot = (e: string, day: string, status: string) => P.hrOtRequest.create({ data: { ...sc, employeeId: E[e]!.id, date: dbDate(day), startAt: bkk(day, 1080), endAt: bkk(day, 1140), minutes: 60, timing: "BEFORE", reason: "ปิดร้าน", status } }).then((r: Any) => r.id as string);
 const otP = await ot("e3", addDay(D0, 2), "PENDING"), otA = await ot("e2", addDay(D0, 3), "APPROVED");
 return { T, T2, U1, U2, HRS, HRS2, HRS3, xs, W, E, x1, doc, leave, otP, otA };
}

let crashed = "";
try {
 const X = await buildFixture();
 const { W, E, HRS } = X, keys = Object.keys(E);
 const UNK_SYS = unk();
 console.log(`fixture ok · ${keys.length} employees · ${VKS.length} viewers`);
 const vOf = (k: VK) => ({ role: W[k].role, unitAccess: W[k].unitAccess, permissions: W[k].permissions, userId: W[k].id });
 const seen = (r: Rendered, html = r.html) => keys.filter((k) => (html + r.clientText).includes(E[k]!.name));
 const otherT = (r: Rendered) => (r.html + r.clientText).includes(`QCP3 other ${tag}`);
 const kind = (r: Rendered) => (r.digest ? (r.digest.startsWith("NEXT_REDIRECT") ? `redirect:${r.digest.split(";")[2] ?? "?"}` : r.digest.split(";").slice(0, 2).join(";")) : r.err ? `err:${r.err.slice(0, 50)}` : "ok");
 const gold: Record<string, unknown> = {};
 const cell = (r: Rendered, html = r.html) => `${seen(r, html).join("")}|${sha16(testids(html).join(","))}|${testids(html).length}`;
 const pathOf = (pg: string, sys = HRS) => `/app/sys/${sys}/hr/${pg}`;
 const MODS: Record<"register" | "leave" | "payroll", [Any, string]> = { register: [M.emp, "employees"], leave: [M.leave, "leave"], payroll: [M.pay, "payroll"] };
 /** render + SQL count (one warm-up render on the unknown system first so session touches do not skew the count) */
 const counted = async (mod: Any, k: VK, sys: string, pg: string) => { QUERY_COUNTER.n = 0; mute(); try { const r = await renderPage(mod, W[k].cookie, pathOf(pg, sys), { id: sys }); return { r, q: QUERY_COUNTER.n }; } finally { unmute(); } };

 // ── G1 pure ──
 {
  const bad: string[] = [], A = M.priv?.hrPageAccessOf, Rq = M.priv?.requireHrPage;
  const cols = ["register", "leave", "payroll", "leaveOnBehalf"] as const;
  if (typeof A !== "function" || typeof Rq !== "function") bad.push("absent");
  else {
   const api = { role: "STAFF", unitAccess: ["*"], permissions: { "hr.employee.read": true }, userId: "apikey:qc" };
   for (const k of [...VKS, "API"] as (VK | "API")[]) {
    let a: Any;
    try { a = A(k === "API" ? api : vOf(k)); } catch (e) { bad.push(`${k}:throw`); continue; }
    cols.forEach((c, i) => { if (a?.[c] !== TRUTH[k][i]) bad.push(`${k}.${c}=${a?.[c]}`); });
    for (const pg of ["register", "leave", "payroll"] as const) { let v: unknown; try { v = Rq(k === "API" ? api : vOf(k), pg); } catch { v = "throw"; } if (v !== a?.[pg]) bad.push(`${k}.require(${pg})`); }
   }
   for (const [n, v] of [["null", null], ["undef", undefined], ["num", 42], ["empty", {}], ["role0", { role: null, permissions: {} }], ["perm0", { role: "STAFF", unitAccess: ["*"], permissions: null, userId: "u" }]] as [string, Any][]) {
    let a: Any;
    try { a = A(v); } catch { bad.push(`${n}:throw`); continue; }
    if (!a || cols.some((c) => a[c] !== false)) bad.push(`${n}:${canon(a)}`);
    try { if (Rq(v, "register") !== false || Rq(vOf("O"), "kiosk" as Any) !== false) bad.push(`${n}:require`); } catch { bad.push(`${n}:require-throw`); }
   }
  }
  chk("G1", !bad.length, "table", L(bad, 10));
 }

 // ── P1–P3 · P5–P7 · P9 (3 pages × viewers) ──
 const R3: Record<string, Rendered> = {};
 {
  const refuse: Record<string, string[]> = { P1: [], P2: [], P3: [] }, gBad: Record<string, string[]> = { P5: [], P6: [], P7: [] }, p9: string[] = [];
  const REFUSED: Record<string, VK[]> = { register: ["K", "N", "S", "S0", "SR", "PR", "PA"], leave: ["K", "N", "S0"], payroll: ["K", "N", "S", "S0", "SR", "SD", "PA"] };
  const ENT: Record<string, VK[]> = { register: ["O", "M", "MB", "P", "PB", "SD"], leave: ["O", "M", "MB", "P", "PB", "S", "SR", "SD", "PR", "PA"], payroll: ["O", "M", "MB", "P", "PB", "PR"] };
  const ID: Record<string, [string, string]> = { register: ["P1", "P5"], leave: ["P2", "P6"], payroll: ["P3", "P7"] };
  // ORACLE-EDIT (HR VIS-5a · controller) P7 of HR PRIV-3: VIS-5a splits /hr/payroll into ?view= sub-views ⇒ the entitled cell = UNION over every view the viewer's sub-nav offers
  //   (hr-pay-view-* on the default render, as qc-hr-vis-5a W2) of names + testids, the sub-nav ids themselves left out (not on the base page) · goldens unchanged ◂
  const payUnion = async (k: VK, r0: Rendered) => { // ORACLE-EDIT (HR VIS-5a · controller) P7 of HR PRIV-3 ◂
   const NAV = "hr-pay-view-", views = testids(r0.html).filter((t) => t.startsWith(NAV)).map((t) => t.slice(NAV.length)), rs: Rendered[] = views.length ? [] : [r0];
   for (const v of views) { mute(); try { rs.push(await renderPage(M.pay, W[k].cookie, pathOf("payroll"), { id: HRS }, { view: v })); } finally { unmute(); } }
   const names = keys.filter((n) => rs.some((r) => seen(r).includes(n))), ids = [...new Set(rs.flatMap((r) => testids(r.html)))].filter((t) => !t.startsWith(NAV)).sort();
   if (process.env.QC_PRIV3_P7_IDS === "1") console.log(`P7 ${k} views=${views.join(",") || "-"} ids=${ids.join(",")}`);
   return { bad: rs.filter((r) => kind(r) !== "ok").map(kind), c: `${names.join("")}|${sha16(ids.join(","))}|${ids.length}`, views };
  }; // ORACLE-EDIT (HR VIS-5a · controller) P7 of HR PRIV-3 ◂
  for (const [pg, [mod, seg]] of Object.entries(MODS)) {
   for (const k of VKS) {
    await counted(mod, k, UNK_SYS, seg); // warm-up
    const real = await counted(mod, k, HRS, seg), un = await counted(mod, k, UNK_SYS, seg);
    R3[`${pg}.${k}`] = real.r;
    if (!/NEXT_HTTP_ERROR_FALLBACK;404/.test(un.r.digest)) p9.push(`${pg}.${k}:${kind(un.r)}`);
    if (otherT(real.r)) gBad[ID[pg]![1]]!.push(`${pg}.${k}:other-tenant`);
    if (REFUSED[pg]!.includes(k)) {
     const same = real.r.digest === un.r.digest && real.r.err === un.r.err && real.q === un.q && !real.r.html && !real.r.client.length;
     if (!same) refuse[ID[pg]![0]]!.push(`${k}:${kind(real.r)} q${real.q}/${un.q} names${seen(real.r).length}`);
    } else if (ENT[pg]!.includes(k)) {
     const html = pg === "leave" ? real.r.html.replace(leaveForm(real.r.html), "") : real.r.html, key = `${pg}.${k}`;
     const pu = pg === "payroll" ? await payUnion(k, real.r) : null, c = pu ? pu.c : cell(real.r, html); // ORACLE-EDIT (HR VIS-5a · controller) P7 of HR PRIV-3: payroll = union over offered views ◂
     gold[key] = c;
     if (kind(real.r) !== "ok" || (pu?.bad.length ?? 0) > 0 || GOLD.pages?.[key] !== c) gBad[ID[pg]![1]]!.push(`${k}:${kind(real.r)}${pu ? `[${pu.views.join(",")}]${pu.bad.join(",")}` : ""} ${c} want ${GOLD.pages?.[key]}`); // ORACLE-EDIT (HR VIS-5a · controller) P7 of HR PRIV-3 ◂
    }
   }
  }
  chk("P1", !refuse.P1!.length, "404 = unknown", L(refuse.P1!));
  chk("P2", !refuse.P2!.length, "404 = unknown", L(refuse.P2!));
  chk("P3", !refuse.P3!.length, "404 = unknown", L(refuse.P3!));
  chk("P5", !gBad.P5!.length, "= base", L(gBad.P5!, 4));
  chk("P6", !gBad.P6!.length, "= base", L(gBad.P6!, 4));
  chk("P7", !gBad.P7!.length, "= base", L(gBad.P7!, 4));
  chk("P9", !p9.length, "404", L(p9));
 }
 // ── P4 profile ──
 {
  const bad: string[] = [], prof = (k: VK, id: string) => { mute(); return renderPage(M.prof, W[k].cookie, `${pathOf("employees")}/${id}`, { id: HRS, employeeId: id }).finally(unmute); };
  for (const k of ["K", "N"] as VK[]) { const a = await prof(k, E.e2!.id), b = await prof(k, unk()); if (!/;404/.test(a.digest) || a.digest !== b.digest || a.html) bad.push(`${k}:${kind(a)}`); }
  { const a = await prof("S", E.e1!.id), b = await prof("S", E.e2!.id); if (kind(a) !== "redirect:/app/me/hr/profile") bad.push(`S.own:${kind(a)}`); if (!/;404/.test(b.digest)) bad.push(`S.other:${kind(b)}`); }
  for (const k of ["O", "M", "MB", "P", "PB"] as VK[]) { const a = await prof(k, E.e2!.id); if (kind(a) !== "ok" || !a.html.includes(E.e2!.name)) bad.push(`${k}:${kind(a)}`); }
  chk("P4", !bad.length, "as listed", L(bad));
 }
 // ── P10 (r2 R9 · debt, not fixed here) staff of ANOTHER HR system of the same shop on this system's /hr/leave — current outcome pinned ──
 {
  mute();
  const r = await renderPage(M.leave, W.XS.cookie, pathOf("leave"), { id: HRS }).finally(unmute);
  const got = `${kind(r)}|${seen(r).join("") || "-"}|form:${leaveForm(r.html) ? "y" : "n"}`;
  gold.xs = got;
  chk("P10", got === GOLD.xs, GOLD.xs ?? "measure", got);
 }
 // ── P8 other HR pages ──
 {
  const CTL: [string, Any, string, Record<string, string>][] = [["hub", M.hub, `/app/sys/${HRS}`, {}], ["attendance", M.att, pathOf("attendance"), {}], ["roster", M.roster, pathOf("roster"), {}], ["kiosk", M.kiosk, pathOf("kiosk"), {}], ["requests", M.req, pathOf("requests"), {}], ["reports", M.rep, pathOf("reports"), {}], ["settings", M.set, pathOf("settings"), {}], ["law", M.law, pathOf("settings/law"), {}]];
  const bad: string[] = [], got: Record<string, string> = {};
  for (const [n, mod, path] of CTL) for (const k of VKS) {
   mute();
   const r = await renderPage(mod, W[k].cookie, path, { id: HRS }).finally(unmute);
   got[`${n}.${k}`] = kind(r);
   if (GOLD.control?.[`${n}.${k}`] !== kind(r)) bad.push(`${n}.${k}:${kind(r)}≠${GOLD.control?.[`${n}.${k}`]}`);
  }
  gold.control = got;
  chk("P8", !bad.length, "= base", L(bad, 10));
 }
 // ── L1 / L2 leave picker ──
 {
  const l1: string[] = [], l2: string[] = [], opt: Record<string, string> = {};
  const keyOf = (id: string) => keys.find((k) => E[k]!.id === id) ?? "?";
  for (const k of ["O", "M", "MB", "P", "PB", "S", "SR", "SD", "PR", "PA"] as VK[]) {
   const r = R3[`leave.${k}`]!, form = leaveForm(r.html), o = employeeOptions(form).map(keyOf).sort().join(",");
   opt[k] = o;
   if (["S", "P", "PB", "SR", "PR", "PA"].includes(k)) {
    if (o) l1.push(`${k}:options ${o}`);
    if (k === "S" && (!form || /name="employeeId"/.test(form))) l1.push(`S:form ${!!form}`);
    if (k !== "S" && form) l1.push(`${k}:form`);
   } else if (GOLD.picker?.[k] !== o || !o) l2.push(`${k}:${o}≠${GOLD.picker?.[k]}`);
  }
  const s = R3["leave.S"]!, others = seen(s).filter((x) => x !== "e1");
  if (others.length) l1.push(`S page names ${others.join(",")}`);
  const sProps = s.client.filter((c) => keys.some((x) => x !== "e1" && JSON.stringify(c.props ?? {}).includes(E[x]!.name))).map((c) => c.name);
  if (sProps.length) l1.push(`S props ${sProps.join(",")}`);
  gold.picker = opt;
  chk("L1", !l1.length, "none", L(l1));
  chk("L2", !l2.length, "= base", L(l2));
 }
 // ── N1 nav · N2/N3 hub · N4 tabs on pages ──
 {
  const n1: string[] = [], navG: Record<string, string> = {};
  const items = M.ui.hrTabs(HRS) as { href: string; label: string }[];
  for (const k of VKS) for (const linked of [false, true]) {
   const out = (M.nav.hrNavFilter(items, vOf(k), { linked }) as { href: string }[]).map((x) => x.href);
   const T = TRUTH[k], want = { register: T[0], leave: T[1], payroll: T[2] };
   for (const g of ["register", "leave", "payroll"] as const) if (out.some((x) => gatedOf(x) === g) !== want[g]) n1.push(`${k}${linked ? "+L" : ""}.${g}`);
   const rest = out.filter((x) => !gatedOf(x)).map((x) => x.replace(HRS, "*")).join(",");
   navG[`${k}${linked ? "+L" : ""}`] = sha16(rest);
   if (GOLD.nav?.[`${k}${linked ? "+L" : ""}`] !== sha16(rest)) n1.push(`${k}${linked ? "+L" : ""}:rest ${rest}`);
  }
  gold.nav = navG;
  chk("N1", !n1.length, "iff gate", L(n1));
  const n2: string[] = [], n3: string[] = [], hubG: Record<string, string> = {};
  const nAll = await P.hrEmployee.count({ where: { tenantId: X.T, active: true } });
  for (const k of VKS) {
   mute();
   const r = await renderEl(W[k].cookie, `/app/sys/${HRS}`, () => h(M.ui.HrHub, { systemId: HRS })).finally(unmute);
   const links = hrefsIn(r.html), T = TRUTH[k];
   const dead = links.filter((x) => { const g = gatedOf(x); return g && !T[g === "register" ? 0 : g === "leave" ? 1 : 2]; });
   const head = /(\d+) คน/.exec(textOfHtml(r.html))?.[1] ?? "";
   if (!T[0]) { if (dead.length) n2.push(`${k}:links ${dead.map((x) => x.replace(/.*\/hr\//, "")).join("/")}`); const hc = /พนักงาน\s*(\d+)\s*คน/.exec(textOfHtml(r.html))?.[1]; if (hc) n2.push(`${k}:count ${hc}`); }
   else if (dead.length) n2.push(`${k}:dead ${dead.join("/")}`);
   const c = `${sha16(links.map((x) => x.replace(HRS, "*")).sort().join(","))}|${head}`;
   hubG[k] = c;
   if (["O", "M", "MB", "P", "PB"].includes(k) && (GOLD.hub?.[k] !== c || kind(r) !== "ok")) n3.push(`${k}:${kind(r)} ${c}≠${GOLD.hub?.[k]}`);
  }
  gold.hub = hubG;
  chk("N2", !n2.length, "no gated link · no count", L(n2));
  chk("N3", !n3.length, `= base (active ${nAll})`, L(n3));
  const n4: string[] = [];
  for (const [key, r] of Object.entries(R3)) {
   if (kind(r) !== "ok") continue;
   const k = key.split(".")[1] as VK, tabs = r.client.find((c) => c.name === "module-tabs.tsx" || c.name === "ModuleTabs")?.props?.items as { href: string }[] | undefined;
   const want = (M.nav.hrNavFilter(items, vOf(k), { linked: !!LINKED[k] }) as { href: string }[]).map((x) => x.href).join(",");
   if (!tabs || tabs.map((x) => x.href).join(",") !== want) n4.push(`${key}:${tabs ? tabs.length : "none"}`);
  }
  chk("N4", !n4.length, "= filter", L(n4));
 }

 // ── A1/A2 actions as K N S ──
 const snap = async () => canon(await Promise.all([
  P.hrEmployee.findMany({ where: { tenantId: X.T }, orderBy: { id: "asc" } }),
  P.hrLeave.findMany({ where: { tenantId: X.T }, orderBy: { id: "asc" } }),
  P.hrOtRequest.findMany({ where: { tenantId: X.T }, orderBy: { id: "asc" } }),
  P.hrWorkSchedule.count({ where: { tenantId: X.T } }), P.hrEmployeeDoc.count({ where: { tenantId: X.T } }), P.auditLog.count({ where: { tenantId: X.T } }), P.outboxEvent.count({ where: { tenantId: X.T } }),
 ]));
 const act = async (k: VK, fn: () => Promise<unknown>) => { mute(); try { return String(canon(await inScope(`${W[k].cookie}; LOCALE=th`, pathOf("employees"), fn))); } catch (e) { return `THROW ${(e as Any)?.digest ?? ""} ${errText(e)}`; } finally { unmute(); } };
 const S = HRS, A = M.acts, O = M.ot;
 type Ids = { emp: string; rem: string; doc: string; leave: string; otP: string; otA: string; d: number };
 const real: Ids = { emp: E.e2!.id, rem: E.e5!.id, doc: X.doc, leave: X.leave, otP: X.otP, otA: X.otA, d: 30 }, fake = (): Ids => ({ emp: unk(), rem: unk(), doc: unk(), leave: unk(), otP: unk(), otA: unk(), d: 40 });
 const REG: Record<string, (i: Ids) => Promise<unknown>> = {
  create: () => A.createEmployeeAction(fd({ systemId: S, name: `QCP3 hack ${tag}` })), update: (i) => A.updateEmployeeAction(fd({ systemId: S, employeeId: i.emp, name: "x" })),
  remove: (i) => A.removeEmployeeAction(fd({ systemId: S, employeeId: i.emp })), restore: (i) => A.restoreEmployeeAction(fd({ systemId: S, employeeId: i.rem })),
  setPin: (i) => A.setPinAction(S, i.emp, { status: "idle" }, fd({ pin: "483920" })), schedule: (i) => A.setWorkScheduleAction(fd({ systemId: S, employeeId: i.emp, "on-1": "1" })),
  profile: (i) => A.saveEmployeeProfileAction(S, i.emp, { status: "idle" }, fd({ name: "x" })), addDoc: (i) => A.addEmployeeDocAction(fd({ systemId: S, employeeId: i.emp, kind: "OTHER", title: "x", url: "https://files.invalid/x" })),
  rmDoc: (i) => A.removeEmployeeDocAction(fd({ systemId: S, employeeId: i.emp, docId: i.doc })),
 };
 const day = (n: number) => addDay(D0, n);
 const LV: Record<string, (i: Ids) => Promise<unknown>> = {
  decide: (i) => A.decideLeaveAction(fd({ systemId: S, leaveId: i.leave, status: "APPROVED" })), bulk: (i) => A.bulkDecideLeaveAction(S, { status: "idle" }, fd({ leaveIds: [i.leave], status: "APPROVED" })),
  otDecide: (i) => O.decideOtAction(null, fd({ systemId: S, id: i.otP, decision: "APPROVED" })), otRevoke: (i) => O.revokeOtAction(null, fd({ systemId: S, id: i.otA, reason: "ทดสอบ" })),
  leaveFor: (i) => A.requestLeaveAction(fd({ systemId: S, employeeId: i.emp, type: "PERSONAL", fromDate: day(i.d), toDate: day(i.d) })),
  otFor: (i) => O.requestOtAction(null, fd({ systemId: S, employeeId: i.emp, date: day(i.d - 25), start: "18:00", end: "19:00", reason: "ทดสอบ" })),
 };
 {
  const a1: string[] = [], a2: string[] = [], smp: string[] = [];
  for (const k of ["K", "N", "S"] as VK[]) for (const [set, out] of [[REG, a1], [LV, a2]] as const) for (const [n, f] of Object.entries(set)) {
   const ownWrite = k === "S" && (n === "leaveFor" || n === "otFor"); // S files for itself (actions.ts:420-422) — judged on e2's rows only
   const before = await snap(), e2l = await P.hrLeave.count({ where: { employeeId: E.e2!.id } }), e2o = await P.hrOtRequest.count({ where: { employeeId: E.e2!.id } });
   const r1 = await act(k, () => f(real)), r2 = await act(k, () => f(fake()));
   const after = await snap();
   const refused = /THROW|"ok":false|"status":"error"/.test(r1) || ownWrite;
   const untouched = ownWrite ? (await P.hrLeave.count({ where: { employeeId: E.e2!.id } })) === e2l && (await P.hrOtRequest.count({ where: { employeeId: E.e2!.id } })) === e2o : after === before;
   if (n === "create" || n === "leaveFor") smp.push(`${k}.${n}=${r1.replace(/\s+/g, " ").slice(0, 70)}`);
   if (!refused || !untouched || r1 !== r2) out.push(`${k}.${n}:${refused ? "" : "NOT-REFUSED "}${untouched ? "" : "WROTE "}${r1 === r2 ? "" : `≠ ${r1.slice(0, 60)} / ${r2.slice(0, 60)}`}`);
  }
  console.log(`  · action samples: ${smp.join(" · ")}`);
  chk("A1", !a1.length, "refused · 0 rows · same", L(a1));
  chk("A2", !a2.length, "refused · 0 rows · same", L(a2));
  const n0 = await P.hrEmployee.count({ where: { tenantId: X.T } }), r = await act("O", () => REG.create!(real)), n1 = await P.hrEmployee.count({ where: { tenantId: X.T } });
  chk("A3", n1 === n0 + 1, "+1", `${n0}→${n1} ${r.slice(0, 80)}`);
 }
 // ── R1 export route ──
 {
  const bad: string[] = [], pk = M.RR.REPORT_CATALOG?.register?.period, per = pk === "year" ? D0.slice(0, 4) : pk === "day" ? D0 : D0.slice(0, 7);
  const get = async (k: VK, sys: string) => { mute(); try { return await inScope(`${W[k].cookie}; LOCALE=th`, `/app/sys/${sys}/hr/reports/export`, async () => { const res: Response = await M.exp.GET(new Request(`http://qc.local/app/sys/${sys}/hr/reports/export?report=register&period=${per}&format=csv`), { params: Promise.resolve({ id: sys }) }); return `${res.status} ${Buffer.from(await res.arrayBuffer()).toString("utf8")}`; }); } catch (e) { return `THROW ${errText(e)}`; } finally { unmute(); } };
  for (const k of ["K", "N", "S"] as VK[]) { const a = await get(k, HRS), b = await get(k, UNK_SYS); if (a !== b || /^200/.test(a) || keys.some((x) => a.includes(E[x]!.name))) bad.push(`${k}:${a.slice(0, 40)}≠${b.slice(0, 40)}`); }
  const doc = async (k: VK, sys: string, mod: Any, seg: string, pk: string, id: string) => { mute(); try { return await inScope(`${W[k].cookie}; LOCALE=th`, `/app/sys/${sys}/hr/payroll/${seg}/${id}`, async () => { const res: Response = await mod.GET(new Request(`http://qc.local/app/sys/${sys}/hr/payroll/${seg}/${id}`), { params: Promise.resolve({ id: sys, [pk]: id }) }); return `${res.status} ${Buffer.from(await res.arrayBuffer()).toString("utf8")}`; }); } catch (e) { return `THROW ${errText(e)}`; } finally { unmute(); } };
  for (const [mod, seg, pk] of [[M.bank, "bank-file", "fileId"], [M.fil, "filing", "fileId"], [M.cert, "salary-cert", "certId"], [M.tax, "tax-cert", "certId"]] as [Any, string, string][]) for (const k of ["K", "N", "S"] as VK[]) {
   const id = unk(), a = await doc(k, HRS, mod, seg, pk, id), b = await doc(k, UNK_SYS, mod, seg, pk, id);
   if (a !== b || /^200/.test(a)) bad.push(`${seg}.${k}:${a.slice(0, 30)}≠${b.slice(0, 30)}`);
  }
  const o = await get("O", HRS);
  if (!/^200/.test(o) || !o.includes(E.e2!.name)) bad.push(`owner:${o.slice(0, 50)}`);
  chk("R1", !bad.length, "same · owner 200", L(bad));
 }
 if (MEASURE) console.log(`MEASURE ${JSON.stringify(gold)}`);
 const t2 = await P.hrEmployee.findMany({ where: { tenantId: X.T2 }, select: { id: true, name: true, updatedAt: true } });
 (globalThis as Any).__t2 = t2.length === 1 && t2[0].id === X.x1 && t2[0].name === `QCP3 other ${tag}`;
} catch (e) {
 crashed = errText(e);
 unmute();
 console.log(`💥 ${crashed}`);
} finally {
 unmute();
 await cleanupFx(P, fx, SLUG);
 const res = await residueOf(P, fx, SLUG, PFX);
 chk("Z1", !res.length && (globalThis as Any).__t2 === true, "none · other tenant 1 row", `${res.join(",") || "none"} other=${(globalThis as Any).__t2}`);
}
process.exit(R.finish({ forced: FORCE, crashed, missing: [] }));
