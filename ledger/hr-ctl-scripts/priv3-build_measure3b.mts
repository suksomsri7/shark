// QC HR PRIV-3b — CONTROLLER RULINGS r2 (R6 payroll actions vs foreign ids · R7 cancel/respond parity · R8 kiosk PIN replies) · brief hr-brief-PRIV-3.md · notes hr-PRIV-3-oracle.md · ⚠️ ORACLE-EDIT only · QC_FORCE=1 · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-priv-3b.mts
//   registry base = 50b272695 (r3: complete forms · R11 approve/V2 · R12 employee create · R13 decided leave · R14 old index names) · own tenants qc-hr-priv3b-* (ours + a foreign shop) · residue checked in both
import { type Any, type Def, errText, canon, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, addDay, dbDate, rd } from "/root/projects/shark-hr-l5/scripts/qc-hr-lib.mts";
import { installNetGuard, tenantTables, sweepTenants, sweepResidue } from "/root/projects/shark-hr-l5/scripts/qc-hr-h4.3-lib.mts";
import { v1Item } from "/root/projects/shark-hr-l5/scripts/qc-hr-h3.8-lib.mts";
import { bodyOf } from "/root/projects/shark-hr-l5/scripts/qc-hr-priv-2-lib.mts";
import { inScope, fd, h, renderEl, installIntl } from "/root/projects/shark-hr-l5/scripts/qc-hr-priv-3-lib.mts";

const SUITE = "qc-hr-priv-3b", ARGV = process.argv.slice(2), FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run"), PFX = "qc-hr-priv3b-";
const D = (id: string, g: string, sb: string, t: string): Def => [id, g, ({ C: "CRITICAL", M: "MAJOR", m: "MINOR" } as const)[sb[0] as "C"], sb[1] === "R" ? "RED" : "GREEN", t];
const CHECKS: Def[] = [
 D("X1", "R6", "MG", "setSalaryProfileAction as a foreign OWNER / foreign hr.payroll.create holder: our system × {unknown emp, real emp without profile, real emp with profile, our runs} = unknown system · nothing written in either tenant"),
 D("X2", "R6", "MG", "markPaidAction · reverseRunAction · reverseRunV2Action as a foreign OWNER on our run ids: same refusal as unknown system · no audit/row in either tenant"),
 D("X3", "R6 R11", "MR", "[complete forms] every other action of the payroll action files (payroll · opening · work-entries · stock-charge · attendance-pay · payslip · bank-files · filings) as a foreign OWNER: same outcome as unknown system · nothing written"),
 D("X4", "R6", "MG", "squat: after the foreign attempts our owner still creates the profile of an employee that had none · no row on our system outside our tenant"),
 D("X5", "R6", "MG", "[control] same tenant: owner + payroll set a profile · owner marks paid · reverse reaches our run (code ≠ NOT_FOUND)"),
 D("Y1", "R7 R13", "mR", "cancel/respond (leave incl. PENDING leave with a decided chain · OT · swap, form + self paths) as K · N · unrelated staff: real-not-yours = unknown id · nothing written"),
 D("Y2", "R7", "mG", "[control] the filer still cancels own leave"),
 D("K1", "R8", "mG", "kiosk wrong PIN for employees NOT on the kiosk's list (unknown · inactive · other HR system · other tenant · other branch for a branch kiosk) + wrong PIN of a PIN holder ⇒ exactly \"PIN ไม่ถูกต้อง\", no name"),
 D("K2", "R8", "mG", "[control] on-list employee without PIN: reply names them, and the kiosk page already lists that name to the kiosk account (ruling exception)"),
 D("X6", "R6 r2", "MG", "rightful shop creates the profile / the run although a FOREIGN-tenant row holds the same (systemId, employeeId) / (systemId, periodKey) — the fix must not rely on cross-tenant uniqueness (unique indexes are cross-tenant today ⇒ migration decision)"),
 D("X7", "R10", "MG", "[control] uniqueness kept in the OWN tenant: a second profile for the same (system, employee) and a second live run for the same (system, period) are refused by the DB"),
 D("X8", "R10", "MG", "[control] the foreign tenant's squat rows are still there and unchanged after our owner's create (nothing deleted)"),
 D("X9", "R11", "MG", "[positive control] the complete-form driver reaches the write point: our owner's approve writes its audit · create run writes a run · set profile writes (same forms as the foreign matrix)"),
 D("X10", "R11", "MR", "[static] every action of the 8 payroll action files that takes a system/run/employee/adjustment id from the client calls hrTargetOwned before any other awaited work (after the permission checks)"),
 D("E1", "R12", "MR", "createEmployee/update/remove/restore as a foreign OWNER on our system = unknown system · nothing written in either tenant"),
 D("E2", "R12", "MG", "[control] chain closed: with no fake employee, follow-ups (adjustment · OT · roster · schedule · lifecycle · LINE) as a foreign OWNER on our system write nothing"),
 D("E3", "R12", "MR", "[static] the employee create/update/remove/restore actions call hrTargetOwned before any other awaited work"),
 D("M1", "R14", "MG", "[db] lane DB: old unique index names gone · new tenant-scoped unique indexes present"),
 D("Z1", "-", "CG", "residue none in both tenants · rate buckets removed"),
];
const R = makeRegistry(SUITE, "", CHECKS);
if (ARGV.includes("--list")) { R.printList(); process.exit(0); }
const { chk } = R;
const L = (xs: string[], n = 8) => xs.slice(0, n).join(" | ") || "ok";
if (!rd("src/lib/modules/hr/privacy.ts").includes("HR PRIV-3") && !FORCE) R.skipExit(["privacy.ts has no HR PRIV-3 marker"]);

const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard();
process.on("unhandledRejection", () => undefined);
const { P, coreHash } = await qc4Env(SUITE);
installIntl();
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const PAYFILES = ["payroll-actions", "payroll-opening-actions", "work-entries-actions", "stock-charge-actions", "attendance-pay-actions", "payslip-actions", "bank-files/actions", "filings/actions"];
const M: Record<string, Any> = { sys: await imp("@/lib/modules/system/service"), acts: await imp("@/lib/modules/hr/actions"), ot: await imp("@/lib/modules/hr/ot-actions"), swap: await imp("@/lib/modules/hr/swap-actions"), self: await imp("@/lib/modules/hr/self-actions"), ui: await imp("@/lib/modules/hr/ui") };
const CHAIN = ["ot-actions", "roster-actions", "lifecycle-actions", "line-actions"];
for (const f of [...PAYFILES, ...CHAIN, "actions"]) M[f] = await imp(`@/lib/modules/hr/${f}`);
const badImp = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (badImp.length) console.log(`import problems: ${badImp.join(" | ")}`);
const listed = PAYFILES.flatMap((f) => [...rd(`src/lib/modules/hr/${f}.ts`).matchAll(/^export async function (\w+Action)\b/gm)].map((m) => [f, m[1]!] as const));
// ── r3 statics: hrTargetOwned first (R11 · R12) ──
const guardFirst = (src0: string, name: string): string => {
 const src = src0.replace(/\/\/[^\n]*/g, ""), b = bodyOf(src, name);
 if (!b) return "no body";
 const g = b.indexOf("hrTargetOwned(");
 if (g < 0) { // delegated: a local helper called by the action (e.g. one(fd) · systemOf(fd)) must call the shared resolver
  const helpers = [...new Set([...b.matchAll(/\b(\w+)\(/g)].map((m) => m[1]!))].filter((n) => n !== name && new RegExp(`(?:function\\s+${n}\\b|const\\s+${n}\\s*=)`).test(src));
  return helpers.some((n) => bodyOf(src, n).includes("hrTargetOwned(")) ? "" : `no hrTargetOwned${helpers.length ? ` (helpers ${helpers.slice(0, 3).join("/")})` : ""}`;
 }
 const aw = [...b.matchAll(/\bawait\s+(?!requireTenant\(|hrTargetOwned\()/g)].map((m) => m.index!).find((i) => i < g);
 return aw === undefined ? "" : `await before guard: ${b.slice(aw, aw + 40).replace(/\s+/g, " ")}`;
};
const REAL = { ...console };
const mute = () => Object.assign(console, { log: () => {}, info: () => {}, warn: () => {}, error: () => {} });
const unmute = () => Object.assign(console, REAL);

const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${PFX}${Date.now()}${tag}`, fx = makeFixtures(P, coreHash, SLUG);
const D0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10), MONTH = D0.slice(0, 7);
const prevMonth = (k: string, n: number) => { const [y, m] = k.split("-").map(Number); return new Date(Date.UTC(y!, m! - 1 - n, 1)).toISOString().slice(0, 7); };
const unk = () => `c${Math.random().toString(36).slice(2, 12)}zq${Math.random().toString(36).slice(2, 10)}`;
const PAYK = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.reverse": true, "hr.payadjust.request": true, "hr.payadjust.approve": true, "hr.payadjust.reject": true };
const bkk = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+07:00`) + min * 60_000);

async function buildFixture() {
 const T = await fx.newTenant("", "QC PRIV3b shop"), T2 = await fx.newTenant("-x", "QC PRIV3b foreign");
 const U1 = await fx.newUnit(T, `QCP3b สาขาหนึ่ง ${tag}`, "u1"), U2 = await fx.newUnit(T, `QCP3b สาขาสอง ${tag}`, "u2");
 const HRS = (await M.sys.createSystem(T, "HR", `HR ${tag}`)).id as string, HRS2 = (await M.sys.createSystem(T, "HR", `HR2 ${tag}`)).id as string, HRX = (await M.sys.createSystem(T2, "HR", `HRX ${tag}`)).id as string;
 for (const u of [U1, U2]) await M.sys.linkUnit(T, HRS, u).catch(() => undefined);
 await M.sys.linkUnit(T, HRS2, U2).catch(() => undefined);
 const sc = { tenantId: T, systemId: HRS };
 const mk = (k: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = T) => fx.mkUser(tid, k.toLowerCase(), `QCP3b user${k} ${tag}`, r, ua, p);
 const W: Record<string, Any> = {
  O: await mk("O", "OWNER", [], {}), P: await mk("P", "STAFF", ["*"], PAYK), S: await mk("S", "STAFF", ["*"], { "hr.leave.request": true }), U: await mk("U", "STAFF", ["*"], { "hr.leave.request": true }),
  K: await mk("K", "STAFF", ["*"], { "hr.attendance.clock": true }), KB: await mk("KB", "STAFF", [U1], { "hr.attendance.clock": true }), N: await mk("N", "STAFF", [], {}),
  XO: await mk("XO", "OWNER", [], {}, T2), XP: await mk("XP", "STAFF", ["*"], PAYK, T2),
 };
 const E: Record<string, { id: string; name: string }> = {};
 const emp = async (k: string, sys: string, u: string | null, o: Record<string, Any> = {}, tid = T) => { const name = `QCP3b ${k} ${tag}`; E[k] = { id: await fx.mkEmp(tid, sys, name, { code: `B${Object.keys(E).length}`, startDate: "2024-02-01", unitId: u, ...o }), name }; return E[k]!.id; };
 await emp("e1", HRS, U1, { linkedUserId: W.S.id }); await emp("e2", HRS, U1); await emp("e3", HRS, U2, { linkedUserId: W.U.id }); await emp("e4", HRS, U1); await emp("eA", HRS, U1); await emp("eB", HRS, U1);
 await emp("e5", HRS, U1, { active: false }); await emp("h2", HRS2, U2); await emp("x1", HRX, null, {}, T2);
 for (const k of ["e1", "e2", "e3", "e4", "eB"]) await P.hrSalaryProfile.create({ data: { ...sc, employeeId: E[k]!.id, payType: "MONTHLY", baseSalarySatang: 2_000_000, ssoEligible: true } });
 const leave = (await P.hrLeave.create({ data: { ...sc, employeeId: E.e2!.id, type: "PERSONAL", fromDate: dbDate(addDay(D0, 20)), toDate: dbDate(addDay(D0, 20)), status: "PENDING", reason: "ธุระ", days: 1 } })).id as string;
 const ot = (await P.hrOtRequest.create({ data: { ...sc, employeeId: E.e2!.id, date: dbDate(addDay(D0, 2)), startAt: bkk(addDay(D0, 2), 1080), endAt: bkk(addDay(D0, 2), 1140), minutes: 60, timing: "BEFORE", reason: "ปิดร้าน", status: "PENDING" } })).id as string;
 const sh = (await P.hrShift.create({ data: { ...sc, unitId: U1, name: `เช้า ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } })).id as string;
 const entry = async (e: string, day: string) => (await P.hrRosterEntry.create({ data: { ...sc, employeeId: E[e]!.id, date: dbDate(day), shiftId: sh, unitId: U1, startMin: 480, endMin: 1020, breakMin: 60, crossesMidnight: false, published: true, publishedAt: new Date() } })).id as string;
 const swap = (await P.hrShiftSwapRequest.create({ data: { ...sc, requesterEmployeeId: E.e2!.id, targetEmployeeId: E.e1!.id, fromEntryId: await entry("e2", addDay(D0, 5)), toEntryId: await entry("e1", addDay(D0, 5)), status: "AWAITING_PEER", reason: "swap" } })).id as string;
 const run = (periodKey: string, status: string) => P.hrPayrollRun.create({ data: { ...sc, periodKey, payDate: new Date(`${periodKey}-28T12:00:00+07:00`), status, engineVersion: 1, totalGrossSatang: 0, totalSsoEmployeeSatang: 0, totalSsoEmployerSatang: 0, totalWhtSatang: 0, totalNetSatang: 0, totalAddSatang: 0 } }).then((r: Any) => r.id as string);
 const runPaid = await run(prevMonth(MONTH, 2), "PAID"), runApproved = await run(prevMonth(MONTH, 1), "APPROVED"), runDraft = await run(prevMonth(MONTH, 3), "DRAFT");
 await P.hrPayrollItem.create({ data: { ...sc, runId: runDraft, employeeId: E.e2!.id, ...v1Item(2_000_000, [], { add: 0, deduct: 0, gross: 2_000_000, ssoBase: 1_500_000, ee: 75_000, wht: 0 }) } });
 // r3 R13: PENDING leave whose approval chain is already decided (effect not yet written) — filed by the owner, not by K/N/U
 const leaveD = (await P.hrLeave.create({ data: { ...sc, employeeId: E.e2!.id, type: "PERSONAL", fromDate: dbDate(addDay(D0, 24)), toDate: dbDate(addDay(D0, 24)), status: "PENDING", reason: "ธุระ", days: 1, filedById: W.O.id } })).id as string;
 const pol = await P.approvalPolicy.create({ data: { tenantId: T, name: `QCP3b ลา ${tag}`, entityType: "HrLeave", active: true, steps: { create: [{ tenantId: T, order: 1, approverRole: "MANAGER" }] } } });
 await P.approvalRequest.create({ data: { tenantId: T, policyId: pol.id, entityType: "HrLeave", entityId: leaveD, systemId: HRS, status: "APPROVED", requestedById: W.O.id, decidedAt: new Date(), idempotencyKey: `approval-HrLeave-${leaveD}` } });
 const adj = (await P.hrPayAdjustment.create({ data: { ...sc, employeeId: E.e2!.id, periodKey: MONTH, kind: "BONUS", amountSatang: 12_345, status: "PENDING", note: "QC", requestedById: W.O.id } })).id as string;
 return { T, T2, U1, U2, HRS, HRS2, HRX, W, E, leave, leaveD, ot, swap, runPaid, runApproved, runDraft, adj, sh };
}

let crashed = "";
let X: Any = null;
try {
 X = await buildFixture();
 const { W, E, HRS } = X;
 const tables = (await tenantTables(P)).filter((t) => !/^(Session)/.test(t));
 const sql = tables.map((t) => `SELECT '${t}' AS t, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${t}" x WHERE x."tenantId" = $1`).join(" UNION ALL ");
 const dig = async (): Promise<Record<string, string>> => { const o: Record<string, string> = {}; for (const [n, t] of [["T", X.T], ["T2", X.T2]]) for (const r of (await P.$queryRawUnsafe(sql, t)) as Any[]) o[`${n}:${r.t}`] = r.h; return o; };
 const diff = (a: Record<string, string>, b: Record<string, string>) => Object.keys(b).filter((k) => a[k] !== b[k]);
 const IDS = () => [...Object.values(E as Record<string, Any>).map((e) => e.id), X.leave, X.ot, X.swap, X.runPaid, X.runApproved, X.runDraft, X.leaveD, X.adj, HRS, X.HRS2, X.HRX];
 const norm = (s: string, extra: string[] = []) => { let o = s; for (const v of [...IDS(), ...extra]) if (v) o = o.split(String(v)).join("<ID>"); return o.replace(/c[a-z0-9]{20,}/g, "<ID>").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<T>"); };
 const call = async (k: string, path: string, fn: () => Promise<unknown>) => { mute(); try { return String(canon(await inScope(`${W[k].cookie}; LOCALE=th`, path, fn)) ?? "undefined"); } catch (e) { const d = String((e as Any)?.digest ?? ""); return d ? `CTL ${d.split(";").slice(0, 3).join(";")}` : `THROW ${errText(e)}`; } finally { unmute(); } };

 // ── R6 foreign callers on the payroll action files ──
 type Case = { sys: string; emp: string; run: string; adj: string };
 const U0 = unk();
 const CASES: Record<string, Case> = {
  unkEmp: { sys: HRS, emp: U0, run: U0, adj: U0 }, empNoProfile: { sys: HRS, emp: E.eA.id, run: U0, adj: U0 }, empProfile: { sys: HRS, emp: E.eB.id, run: U0, adj: U0 },
  runApproved: { sys: HRS, emp: U0, run: X.runApproved, adj: X.adj }, runDraft: { sys: HRS, emp: E.e2.id, run: X.runDraft, adj: X.adj }, runPaid: { sys: HRS, emp: U0, run: X.runPaid, adj: X.adj }, unkSystem: { sys: U0, emp: U0, run: U0, adj: U0 },
 };
 // r3 R11: COMPLETE forms — every field name the action file reads, filled from OUR shop (ids per case) so the call reaches its write point
 const SRC: Record<string, string> = {};
 const srcOf = (f: string) => (SRC[f] ??= rd(`src/lib/modules/hr/${f}.ts`));
 const namesOf = (f: string) => [...new Set([...srcOf(f).matchAll(/\.(?:get|getAll|has)\(\s*["'`]([\w-]+)["'`]/g), ...srcOf(f).matchAll(/\(\s*(?:fd|formData|form)\s*,\s*["']([\w-]+)["']/g)].map((m) => m[1]!))];
 const val = (n: string, c: Case): string => {
  if (n === "systemId") return c.sys;
  if (n === "employeeId" || n === "targetEmployeeId") return c.emp;
  if (/^run/i.test(n)) return c.run;
  if (n === "shiftId") return X.sh;
  if (n === "unitId") return ""; // "no branch" = valid for an all-branch caller (a foreign owner has no unit of ours)
  if (/^expect(Net|Items|Gross)$/.test(n)) return "0";
  if (n === "expectDigest") return "0".repeat(64);
  if (/Id$|^id$|Ids$/.test(n)) return /file|cert|account|preset|book|journal|finance/i.test(n) ? c.run : c.adj;
  if (/Baht$|amount|Satang|rate/i.test(n)) return "100";
  if (/period|month/i.test(n)) return MONTH;
  if (/year/i.test(n)) return MONTH.slice(0, 4);
  if (/date|Date|On$|^day$|^from$|^to$|Week$/.test(n)) return `${MONTH}-28`;
  if (/^(start|end)$/.test(n)) return n === "start" ? "18:00" : "19:00";
  if (/hours|minutes|qty|count|children|Min$|days|grace/i.test(n)) return "1";
  if (n === "kind") return "BONUS";
  if (/decision|status/i.test(n)) return "APPROVED";
  if (n === "engine" || n === "engineVersion") return "2";
  if (n === "format") return "CSV";
  if (n === "accept") return "1";
  if (n === "pin") return "483920";
  if (/reason|note|desc|name|title|purpose|memo|body|label|item/i.test(n)) return "qc ทดสอบ";
  return "on";
 };
 const formOf = (f: string, c: Case) => fd(Object.fromEntries(namesOf(f).map((n) => [n, val(n, c)])));
 const objOf = (f: string, name: string, c: Case) => Object.fromEntries([...(new RegExp(`function ${name}\\(\\s*input:\\s*\\{([^}]*)\\}`).exec(srcOf(f))?.[1] ?? "").matchAll(/(\w+)\??:/g)].map((m) => [m[1]!, /Min$/.test(m[1]!) ? 480 : val(m[1]!, c)]));
 const argsOf = (f: string, name: string, c: Case): unknown[] => {
  const params = (new RegExp(`function ${name}\\(([^)]*)\\)`).exec(srcOf(f))?.[1] ?? "").split(",").map((x) => x.trim().split(/[?:]/)[0]!.trim()).filter(Boolean);
  return params.map((p) => (/^(formData|fd|form)$/.test(p) ? formOf(f, c) : /prev/i.test(p) ? { status: "idle" } : p === "input" ? objOf(f, name, c) : p === "systemId" ? c.sys : p === "employeeId" ? c.emp : val(p, c)));
 };
 const runAs = async (k: string, f: string, name: string) => {
  const before = await dig(), out: Record<string, string> = {};
  for (const [cn, c] of Object.entries(CASES)) out[cn] = norm(await call(k, `/app/sys/${c.sys}/hr/payroll`, () => M[f][name](...argsOf(f, name, c))));
  const wrote = diff(before, await dig());
  const odd = Object.entries(out).filter(([cn, v]) => cn !== "unkSystem" && v !== out.unkSystem).map(([cn]) => cn);
  return { wrote, odd, out };
 };
 const x1: string[] = [], x2: string[] = [], x3: string[] = [], found: string[] = [];
 const missing = listed.filter(([f, n]) => typeof M[f]?.[n] !== "function").map(([f, n]) => `${f}:${n}`);
 for (const [f, name] of listed) {
  if (typeof M[f]?.[name] !== "function") continue;
  for (const k of name === "setSalaryProfileAction" ? ["XO", "XP"] : ["XO"]) {
   const r = await runAs(k, f, name);
   (globalThis as any).__MEAS ??= {}; (globalThis as any).__MEAS[`${k}:${f}:${name}`] = r.out.unkSystem;
   const bad = r.wrote.length || r.odd.length ? `${k}.${name}: wrote[${r.wrote.join(",")}] differs[${r.odd.join(",")}] unkSystem=${r.out.unkSystem!.slice(0, 50)}${r.odd.length ? ` vs ${r.out[r.odd[0]!]!.slice(0, 70)}` : ""}` : "";
   if (!bad) continue;
   if (name === "setSalaryProfileAction") x1.push(bad);
   else if (["markPaidAction", "reverseRunAction", "reverseRunV2Action"].includes(name)) x2.push(bad);
   else { x3.push(bad); if (r.wrote.length) found.push(`${f}:${name}`); }
  }
 }
 if (found.length) console.log(`🔴🔴 OTHER PAYROLL ACTIONS WRITING FOR A FOREIGN/UNKNOWN SYSTEM (complete forms): ${found.join(", ")}`);
 const writers = [...x1, ...x2, ...x3].filter((x) => /wrote\[[^\]]/.test(x)).map((x) => x.split(":")[0]);
 console.log(`  · WRITES for foreign/unknown system (complete forms): ${writers.join(", ") || "none"}`);
 console.log(`  · payroll action files: ${listed.length} actions enumerated${missing.length ? ` · not loaded: ${missing.join(",")}` : ""}`);
 (await import("node:fs")).writeFileSync(process.env.MEAS_OUT!, JSON.stringify((globalThis as any).__MEAS, null, 1));
 chk("X1", !x1.length, "same refusal · 0 rows", L(x1));
 chk("X2", !x2.length, "same refusal · 0 rows", L(x2));
 {
  const before = await dig(), u = unk();
  const r = await call("XO", `/app/sys/${u}/hr/payroll`, () => M["payroll-actions"].createPayrollRunAction(null, fd({ systemId: u, periodKey: MONTH, payDate: `${MONTH}-28` })));
  const w = diff(before, await dig());
  console.log(`  · createPayrollRunAction as foreign owner on a fresh unknown system: ${r.slice(0, 60)}${w.length ? ` · wrote ${w.join(",")}` : ""}`);
  if (!/"ok":false/.test(r) || w.length) x3.push(`createPayrollRunAction(unknown system): ${r.slice(0, 50)}${w.length ? ` wrote ${w.join(",")}` : ""}`);
 }
 chk("X3", !x3.length && !missing.length, `${listed.length} actions · unknown system refused`, L([...missing, ...x3], 12));
 {
  const bad = listed.map(([f, n]) => [f, n, guardFirst(srcOf(f), n)] as const).filter(([, , w]) => w).map(([f, n, w]) => `${f.split("/").pop()}:${n} ${w}`);
  console.log(`  · X10 actions without hrTargetOwned first (${bad.length}/${listed.length}): ${bad.map((x) => x.split(" ")[0]!.split(":")[1]).join(", ") || "none"}`);
  chk("X10", !bad.length, "guard first", `${bad.length}: ${L(bad, 6)}`);
  const e3 = ["createEmployeeAction", "updateEmployeeAction", "removeEmployeeAction", "restoreEmployeeAction"].map((n) => [n, guardFirst(srcOf("actions"), n)] as const).filter(([, w]) => w).map(([n, w]) => `${n} ${w}`);
  chk("E3", !e3.length, "guard first", L(e3));
 }
 // ── R12 employee register actions (foreign owner) + chain ──
 {
  const e1: string[] = [];
  const chainCases: Record<string, Case> = { realEmp: { sys: HRS, emp: E.e2.id, run: X.runDraft, adj: X.adj }, unkEmp: { sys: HRS, emp: U0, run: U0, adj: U0 }, unkSystem: CASES.unkSystem! };
  const e2: string[] = [], chainList = [["payroll-actions", "requestAdjustmentAction"], ["actions", "setWorkScheduleAction"], ...CHAIN.flatMap((f) => [...srcOf(f).matchAll(/^export async function (\w+Action)\b/gm)].map((m) => [f, m[1]!]))] as [string, string][];
  for (const [f, n] of chainList) {
   if (typeof M[f]?.[n] !== "function") { e2.push(`${f}:${n} not loaded`); continue; }
   const before = await dig();
   for (const c of Object.values(chainCases)) await call("XO", `/app/sys/${c.sys}/hr`, () => M[f][n](...argsOf(f, n, c)));
   const w = diff(before, await dig());
   if (w.length) e2.push(`${n} wrote ${w.join(",")}`);
  }
  chk("E2", !e2.length, "0 rows", L(e2, 10));
  for (const n of ["createEmployeeAction", "updateEmployeeAction", "removeEmployeeAction", "restoreEmployeeAction"]) {
   const before = await dig(), out: Record<string, string> = {};
   for (const [cn, c] of Object.entries({ real: { sys: HRS, emp: n === "restoreEmployeeAction" ? E.e5.id : E.e4.id, run: U0, adj: U0 }, unkSystem: CASES.unkSystem! })) out[cn] = norm(await call("XO", `/app/sys/${c.sys}/hr/employees`, () => M.actions[n](...argsOf("actions", n, c))));
   (globalThis as any).__E1 ??= {}; (globalThis as any).__E1[n] = out.unkSystem; (await import("node:fs")).writeFileSync(process.env.MEAS_OUT! + ".e1", JSON.stringify((globalThis as any).__E1, null, 1));
   const w = diff(before, await dig());
   if (w.length || out.real !== out.unkSystem) e1.push(`${n}: ${w.length ? `wrote ${w.join(",")} ` : ""}${out.real !== out.unkSystem ? `${out.real!.slice(0, 40)} ≠ ${out.unkSystem!.slice(0, 40)}` : ""}`);
  }
  chk("E1", !e1.length, "= unknown system · 0 rows", L(e1));
 }
 {
  const r = await call("O", `/app/sys/${HRS}/hr/payroll`, () => M["payroll-actions"].setSalaryProfileAction(fd({ systemId: HRS, employeeId: E.eA.id, baseSalaryBaht: "25000" })));
  const ours = await P.hrSalaryProfile.findFirst({ where: { tenantId: X.T, systemId: HRS, employeeId: E.eA.id } }), squat = await P.hrSalaryProfile.count({ where: { systemId: HRS, NOT: { tenantId: X.T } } });
  chk("X4", ours?.baseSalarySatang === 2_500_000 && squat === 0, "our row · 0 squat", `ours=${ours?.baseSalarySatang ?? "none"} squat=${squat} ${r.slice(0, 80)}`);
 }
 {
  const bad: string[] = [], pa = M["payroll-actions"], pth = `/app/sys/${HRS}/hr/payroll`;
  await call("O", pth, () => pa.setSalaryProfileAction(fd({ systemId: HRS, employeeId: E.eB.id, baseSalaryBaht: "31000" })));
  if ((await P.hrSalaryProfile.findFirst({ where: { tenantId: X.T, employeeId: E.eB.id } }))?.baseSalarySatang !== 3_100_000) bad.push("owner set");
  await call("P", pth, () => pa.setSalaryProfileAction(fd({ systemId: HRS, employeeId: E.eB.id, baseSalaryBaht: "32000" })));
  if ((await P.hrSalaryProfile.findFirst({ where: { tenantId: X.T, employeeId: E.eB.id } }))?.baseSalarySatang !== 3_200_000) bad.push("payroll set");
  const mp = await call("O", pth, () => pa.markPaidAction(fd({ systemId: HRS, runId: X.runApproved })));
  if ((await P.hrPayrollRun.findUnique({ where: { id: X.runApproved } }))?.status !== "PAID") bad.push(`markPaid ${mp.slice(0, 60)}`);
  await call("O", pth, () => pa.reverseRunAction(fd({ systemId: HRS, runId: X.runPaid, reason: "qc" })));
  const au = (await P.auditLog.findMany({ where: { tenantId: X.T, targetId: X.runPaid, action: { startsWith: "hr.payroll.reverse" } } })) as Any[];
  if (!au.length || au.some((a) => a.after?.code === "NOT_FOUND")) bad.push(`reverse ${au.map((a) => a.after?.code).join("/") || "no audit"}`);
  const v2 = await call("O", pth, () => pa.reverseRunV2Action(fd({ systemId: HRS, runId: X.runPaid }))), v2u = await call("O", pth, () => pa.reverseRunV2Action(fd({ systemId: HRS, runId: unk() })));
  if (v2 === v2u) bad.push(`reverseV2 = unknown (${v2.slice(0, 50)})`);
  chk("X5", !bad.length, "controls work", L(bad));
 }

 // ── X6 (r2): a foreign-tenant row on (our system, employee) / (our system, period) must not block the rightful shop ──
 {
  const bad: string[] = [], pa = M["payroll-actions"], pth = `/app/sys/${HRS}/hr/payroll`, per = prevMonth(MONTH, 4);
  const eC = await fx.mkEmp(X.T, HRS, `QCP3b eC ${tag}`, { code: "BC", startDate: "2024-02-01", unitId: X.U1 });
  await P.hrSalaryProfile.create({ data: { tenantId: X.T2, systemId: HRS, employeeId: eC, payType: "MONTHLY", baseSalarySatang: 1, ssoEligible: true } }).catch((e: unknown) => bad.push(`seed profile ${errText(e).slice(0, 40)}`));
  await P.hrPayrollRun.create({ data: { tenantId: X.T2, systemId: HRS, periodKey: per, payDate: new Date(`${per}-28T12:00:00+07:00`), status: "DRAFT", engineVersion: 1, totalGrossSatang: 0, totalSsoEmployeeSatang: 0, totalSsoEmployerSatang: 0, totalWhtSatang: 0, totalNetSatang: 0, totalAddSatang: 0 } }).catch((e: unknown) => bad.push(`seed run ${errText(e).slice(0, 40)}`));
  const foreign = async () => canon(await Promise.all([P.hrSalaryProfile.findMany({ where: { tenantId: X.T2, systemId: HRS } }), P.hrPayrollRun.findMany({ where: { tenantId: X.T2, systemId: HRS, periodKey: per } })]));
  const f0 = await foreign();
  const r1 = await call("O", pth, () => pa.setSalaryProfileAction(fd({ systemId: HRS, employeeId: eC, baseSalaryBaht: "26000" })));
  if ((await P.hrSalaryProfile.findFirst({ where: { tenantId: X.T, systemId: HRS, employeeId: eC } }))?.baseSalarySatang !== 2_600_000) bad.push(`profile: ${r1.slice(0, 70)}`);
  const r2 = await call("O", pth, () => pa.createPayrollRunAction(null, fd({ systemId: HRS, periodKey: per, payDate: `${per}-28` })));
  if (!(await P.hrPayrollRun.count({ where: { tenantId: X.T, systemId: HRS, periodKey: per } }))) bad.push(`run: ${r2.slice(0, 70)}`);
  chk("X6", !bad.length, "both created in our tenant", L(bad));
  const f1 = await foreign();
  chk("X8", f0 === f1 && f0.includes(eC) && f0.includes(per), "unchanged", f0 === f1 ? "unchanged" : "CHANGED");
  // X7: own-tenant uniqueness (fresh employee + period, no foreign row involved)
  const u7: string[] = [], per2 = prevMonth(MONTH, 6);
  const eD = await fx.mkEmp(X.T, HRS, `QCP3b eD ${tag}`, { code: "BD", startDate: "2024-02-01", unitId: X.U1 });
  await P.hrSalaryProfile.create({ data: { tenantId: X.T, systemId: HRS, employeeId: eD, payType: "MONTHLY", baseSalarySatang: 1_000_000, ssoEligible: true } });
  const dupP = await P.hrSalaryProfile.create({ data: { tenantId: X.T, systemId: HRS, employeeId: eD, payType: "MONTHLY", baseSalarySatang: 1, ssoEligible: true } }).then(() => "created").catch((e: unknown) => ((e as Any)?.code === "P2002" || /unique/i.test(errText(e)) ? "refused" : errText(e).slice(0, 40)));
  if (dupP !== "refused") u7.push(`profile dup ${dupP}`);
  const runRow = (status: string) => P.hrPayrollRun.create({ data: { tenantId: X.T, systemId: HRS, periodKey: per2, payDate: new Date(`${per2}-28T12:00:00+07:00`), status, engineVersion: 1, totalGrossSatang: 0, totalSsoEmployeeSatang: 0, totalSsoEmployerSatang: 0, totalWhtSatang: 0, totalNetSatang: 0, totalAddSatang: 0 } });
  await runRow("DRAFT");
  const dupR = await runRow("DRAFT").then(() => "created").catch((e: unknown) => ((e as Any)?.code === "P2002" || /unique/i.test(errText(e)) ? "refused" : errText(e).slice(0, 40)));
  if (dupR !== "refused") u7.push(`live run dup ${dupR}`);
  chk("X7", !u7.length, "refused", L(u7));
 }
 // ── X9 complete-form reachability (own owner, same forms) ──
 {
  const own: Case = { sys: HRS, emp: E.e4.id, run: X.runDraft, adj: X.adj }, pa = M["payroll-actions"], bad: string[] = [], pth = `/app/sys/${HRS}/hr/payroll`;
  const a0 = await P.auditLog.count({ where: { tenantId: X.T, action: "hr.payroll.approve" } });
  await call("O", pth, () => pa.approvePayrollRunAction(...argsOf("payroll-actions", "approvePayrollRunAction", own)));
  if ((await P.auditLog.count({ where: { tenantId: X.T, action: "hr.payroll.approve" } })) !== a0 + 1) bad.push("approve audit");
  const ownRun: Case = { ...own, run: U0 }, perX = MONTH;
  const r0 = await P.hrPayrollRun.count({ where: { tenantId: X.T, periodKey: perX } });
  const rc = await call("O", pth, () => pa.createPayrollRunAction(...argsOf("payroll-actions", "createPayrollRunAction", ownRun)));
  if ((await P.hrPayrollRun.count({ where: { tenantId: X.T, periodKey: perX } })) !== r0 + 1) bad.push(`create run ${rc.slice(0, 50)}`);
  await call("O", pth, () => pa.setSalaryProfileAction(...argsOf("payroll-actions", "setSalaryProfileAction", own)));
  if ((await P.hrSalaryProfile.findFirst({ where: { tenantId: X.T, employeeId: E.e4.id } }))?.baseSalarySatang !== 10_000) bad.push("set profile");
  chk("X9", !bad.length, "own writes reached", L(bad));
 }
 {
  const ix = (await P.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('HrSalaryProfile','HrPayrollRun')`)) as Any[], has = (n: string) => ix.find((i) => i.indexname === n);
  const bad: string[] = [];
  for (const o of ["HrSalaryProfile_systemId_employeeId_key", "HrPayrollRun_systemId_periodKey_live_key"]) if (has(o)) bad.push(`old ${o} present`);
  const p = ix.find((i) => /UNIQUE/.test(i.indexdef) && /"HrSalaryProfile"/.test(i.indexdef) && /\("tenantId", "systemId", "employeeId"\)/.test(i.indexdef));
  const r = ix.find((i) => /UNIQUE/.test(i.indexdef) && /"HrPayrollRun"/.test(i.indexdef) && /\("tenantId", "systemId", "periodKey"\)/.test(i.indexdef) && /REVERSED/.test(i.indexdef));
  if (!p) bad.push("new profile key missing"); if (!r) bad.push("new run key missing");
  chk("M1", !bad.length, "old gone · new present", L(bad));
 }
 // ── R7 cancel/respond parity ──
 {
  const bad: string[] = [], p = `/app/sys/${HRS}/hr/leave`;
  const ACT: Record<string, (id: string) => Promise<unknown>> = {
   cancelLeave: (id) => M.acts.cancelLeaveAction(fd({ systemId: HRS, leaveId: id })), selfCancelLeave: (id) => M.self.selfCancelLeaveAction(id),
   cancelLeaveDecided: (id) => M.acts.cancelLeaveAction(fd({ systemId: HRS, leaveId: id })), selfCancelLeaveDecided: (id) => M.self.selfCancelLeaveAction(id), // r3 R13
   cancelOt: (id) => M.ot.cancelOtAction(null, fd({ systemId: HRS, id })), selfCancelOt: (id) => M.self.selfCancelOtAction(id),
   respondSwap: (id) => M.swap.respondSwapAction(fd({ systemId: HRS, swapId: id, accept: "1" })), cancelSwap: (id) => M.swap.cancelSwapAction(fd({ systemId: HRS, swapId: id })),
   selfRespondSwap: (id) => M.self.selfRespondSwapAction(id, true), selfCancelSwap: (id) => M.self.selfCancelSwapAction(id),
  };
  const realOf: Record<string, string> = { cancelLeaveDecided: X.leaveD, selfCancelLeaveDecided: X.leaveD, cancelLeave: X.leave, selfCancelLeave: X.leave, cancelOt: X.ot, selfCancelOt: X.ot, respondSwap: X.swap, cancelSwap: X.swap, selfRespondSwap: X.swap, selfCancelSwap: X.swap };
  for (const k of ["K", "N", "U"]) for (const [n, f] of Object.entries(ACT)) {
   const before = await dig(), u = unk(), a = norm(await call(k, p, () => f(realOf[n]!))), b = norm(await call(k, p, () => f(u)), [u]), w = diff(before, await dig());
   if (a !== b || w.length) bad.push(`${k}.${n}: ${a.slice(0, 60)} ≠ ${b.slice(0, 60)}${w.length ? ` wrote ${w.join(",")}` : ""}`);
  }
  chk("Y1", !bad.length, "same · 0 rows", L(bad, 12));
  await call("S", p, () => M.acts.requestLeaveAction(fd({ systemId: HRS, type: "PERSONAL", fromDate: addDay(D0, 30), toDate: addDay(D0, 30) })));
  const own = await P.hrLeave.findFirst({ where: { tenantId: X.T, employeeId: E.e1.id, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  const r = own ? await call("S", p, () => M.acts.cancelLeaveAction(fd({ systemId: HRS, leaveId: own.id }))) : "no own leave";
  const st = own ? (await P.hrLeave.findUnique({ where: { id: own.id } }))?.status : "-";
  chk("Y2", st === "CANCELLED", "CANCELLED", `${st} ${r.slice(0, 60)}`);
 }

 // ── R8 kiosk ──
 {
  const pk = `/app/sys/${HRS}/hr/kiosk`;
  const setPin = await call("O", `/app/sys/${HRS}/hr/employees`, () => M.acts.setPinAction(HRS, E.e2.id, { status: "idle" }, fd({ pin: "483920" })));
  const kiosk = (k: string, id: string, pin = "111111") => call(k, pk, () => M.acts.kioskClockAction(HRS, { status: "idle" }, fd({ employeeId: id, pin })));
  const WRONG = canon({ message: "PIN ไม่ถูกต้อง", status: "error" }), bad: string[] = [];
  const names = Object.values(E as Record<string, Any>).map((e) => e.name);
  const off: [string, string, string][] = [["K", "unknown", unk()], ["K", "inactive", E.e5.id], ["K", "otherSystem", E.h2.id], ["K", "otherTenant", E.x1.id], ["K", "wrongPin", E.e2.id],
   ["KB", "unknown", unk()], ["KB", "inactive", E.e5.id], ["KB", "otherSystem", E.h2.id], ["KB", "otherTenant", E.x1.id], ["KB", "otherBranch", E.e3.id], ["KB", "wrongPin", E.e2.id]];
  for (const [k, n, id] of off) { const r = await kiosk(k, id); if (r !== WRONG || names.some((x) => r.includes(x))) bad.push(`${k}.${n}: ${r.slice(0, 80)}`); }
  chk("K1", !bad.length, WRONG, `${L(bad, 12)} (setPin ${setPin.slice(0, 40)})`);
  const k2: string[] = [];
  for (const k of ["K", "KB"]) {
   const r = await kiosk(k, E.e4.id);
   mute();
   const page = await renderEl(W[k].cookie, pk, () => h(M.ui.HrKioskSection, { systemId: HRS })).finally(unmute);
   const shown = (page.html + page.clientText).includes(E.e4.name);
   if (!(r.includes(E.e4.name) && shown) && r !== WRONG) k2.push(`${k}: reply=${r.slice(0, 60)} listed=${shown}`);
   console.log(`  · R8 ${k}: on-list no-PIN reply = ${r.slice(0, 90)} · name on kiosk page = ${shown}`);
  }
  chk("K2", !k2.length, "named only when listed", L(k2));
 }
} catch (e) {
 crashed = errText(e);
 unmute();
 console.log(`💥 ${crashed}`);
} finally {
 unmute();
 const ts = X ? [X.T, X.T2] : fx.tenants;
 for (const t of ts) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${t}%`).catch(() => 0);
 await P.apiKey?.deleteMany?.({ where: { tenantId: { in: ts } } }).catch(() => undefined);
 await sweepTenants(P, ts);
 await cleanupFx(P, fx, SLUG);
 const res = await residueOf(P, fx, SLUG, PFX), deep = await sweepResidue(P, ts);
 const buckets = (await Promise.all(ts.map((t) => P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${t}%`).then((r: Any) => Number(r[0]?.n ?? 0)).catch(() => -1)))).reduce((a: number, b: number) => a + b, 0);
 chk("Z1", !res.length && !deep.length && buckets === 0, "none", `${[...res, ...deep].join(",") || "none"} buckets=${buckets}`);
}

process.exit(R.finish({ forced: FORCE, crashed, missing: [] }));
