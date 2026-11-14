// QC — HR PRIV-2 one pay scope (borrowing never widens pay) · brief ledger/hr-briefs/hr-brief-PRIV-2.md · notes ledger/wo-notes/hr-PRIV-2-oracle.md
// ⚠️ Oracle under change control — ask for an ORACLE-EDIT, never edit. SKIP while scope.ts lacks "HR PRIV-2" (QC_FORCE=1 runs) · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-priv-2.mts
import { existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { type Any, type Def, ROOT, rd, short, errText, canon, sha, commitInBase, changedVsBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, addDay, dbDate, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, srcFiles } from "./qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue } from "./qc-hr-h4.3-lib.mjs";
import { v1Item } from "./qc-hr-h3.8-lib.mjs";
import { unzipText, propsText, textOfAny as T, digest, BAD_SAMPLES, BAD_RE, GOOD_NAMES, formulaCell, changedFiles, unmarkedHunks, code, bodyOf, fileAt } from "./qc-hr-priv-2-lib.mjs";

const SUITE = "qc-hr-priv-2", ARGV = process.argv.slice(2), FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run"), PFX = "qc-hr-priv2-";
const TICKET_BASE = "60659e7c0c93e858a6e4a38abd9463c9c5eeedef";
const git = (a: string[]) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };
const BASE = process.env.QC_PRIV2_BASE || git(["merge-base", "HEAD", "session/hr"]) || TICKET_BASE; // R9
const H = "src/lib/modules/hr/";
const F = { scope: `${H}scope.ts`, priv: `${H}privacy.ts`, slip: `${H}payslip.ts`, labor: `${H}labor.ts`, rep: `${H}reports.ts`, rr: `${H}reports-rules.ts`, payroll: `${H}payroll.ts`, payUi: `${H}payroll-ui.tsx`, runUi: `${H}payroll-run-ui.tsx`, ap: `${H}attendance-pay.ts`, acts: `${H}payroll-actions.ts`, ot: `${H}ot.ts`, stock: `${H}stock-charge.ts`, h43: "scripts/qc-hr-h4.3-lib.mts" };
const NOTE = "ไม่รวมพนักงานที่คุณไม่มีสิทธิ์ดูค่าจ้าง {n} คน";
const T_RUN_ALL = "รอบจ่ายเงินเดือนครอบคลุมทุกสาขา — ต้องเป็นผู้ดูแลทุกสาขาจึงทำรายการได้";
const MARKED = [F.scope, F.priv, `${H}privacy-shared.ts`, F.slip, F.labor, F.rep, F.rr, F.payroll, F.payUi, F.runUi, `${H}service.ts`, `${H}actions.ts`, F.ap, `${H}reports-ui.tsx`, `${H}inbox.ts`, F.ot, F.stock, "src/lib/modules/booking/service.ts"];
const HR_ALL = srcFiles("src/lib/modules/hr");
const FROZEN = ["prisma", "package.json", "src/lib/core", "src/lib/ai", `${H}api`, `${H}filings`, `${H}bank-files`, "scripts/qc-hr-lib.mts", "scripts/qc-hr-h3.8-lib.mts",
 ...HR_ALL.filter((f) => !MARKED.includes(f) && /\/(payroll-(rules|run-rules|rules-v2|opening[^/]*)|payslip-rules|labor-rules|(roster|judge|leave|swap|correction|lifecycle|self|clock|work-entries|settings|law|ai|ot-|inbox-|stock-charge-|line-)[^/]*|pin)\.tsx?$/.test(f))];
const OLD = readdirSync(join(ROOT, "scripts")).filter((n) => /^qc-.*\.mts$/.test(n) && !/^qc-hr-priv-2|^qc-hr-lib\.mts$|^qc-hr-h3\.8-lib\.mts$/.test(n)).map((n) => `scripts/${n}`);

const D = (id: string, g: string, sb: string, t: string): Def => [id, g, ({ C: "CRITICAL", M: "MAJOR", m: "MINOR" } as const)[sb[0] as "C"], sb[1] === "R" ? "RED" : "GREEN", t];
const CHECKS: Def[] = [
 D("S1", "R1", "CG", "[static] scope.ts: inPayScope + payScopeWhere (no borrowing) + note text"),
 D("S2", "R1 R6", "CR", "[static] one helper on every pay path incl. ot money + stock rows/flags (R6)"),
 D("S3", "R4", "CG", "[static] run actions + document gates all-branch"),
 D("S4", "R9", "MG", "[static] frozen vs base · older oracles via ORACLE-EDIT PRIV-2 · h4.3-lib hunks ORACLE-EDIT (HR-PRIV-2 (R9)"),
 D("S5", "§files", "MG", "[static] changed src ⊆ allowed · hunks marked HR PRIV-2"),
 D("S6", "§base", "MG", "[static] ticket base ancestor · files present"),
 D("S7", "R5", "MG", "[static] no {names} in refusals · core/csv sanitiser"),
 D("P1", "R1", "CG", "[pure] inPayScope / payScopeWhere truth table"),
 D("A1", "R1a", "CG", "[db] borrowed profile: no sensitive data (payU1s/m)"),
 D("A2", "R1a", "CG", "[db] borrowed profile = mgrU1 DTO"),
 D("A3", "R1a", "CG", "[db] [control] in-scope sensitive visible · OWNER/payAll see bNow"),
 D("A4", "R1a", "MG", "[db] slip loader: borrowed null · a1 without whole-run totals"),
 D("A5", "R1a", "MG", "[db] [control] refusal parity"),
 D("A7", "R8", "MG", "[db] own slip = DB figures · no total* keys (R8)"),
 D("B1", "R1b", "CG", "[db] 6 money reports rows ⊆ in-scope"),
 D("B2", "R1b", "CG", "[db] money exports clean"),
 D("B3", "R1b", "MG", "[db] OT report: borrowed row kept, money withheld, note"),
 D("B4", "R1b", "CG", "[db] [control] owner/payAll rows · aLeft/bEnded"),
 D("B5", "R1b", "MG", "[db] [control] Σ rows · document previews all-branch"),
 D("C1", "R1c", "CG", "[page] payroll page: no out-of-scope data"),
 D("C2", "R1c", "CG", "[page] no whole-run figure · notes"),
 D("C3", "R1c", "MG", "[page] [control] owner page"),
 D("C4", "R1c", "MG", "[db] preview v2 rows/Σ/excludedHeadcount"),
 D("C5", "R1c", "MG", "[db] inbox: no out-of-scope adjustment"),
 D("N1", "R6 N1", "MR", "[db] otRequestList: borrowed items = mgrU1's (no money) (R6 N1)"),
 D("N2", "R6 N2", "MR", "[db] stock list + cap flags: no bSpan (R6 N2)"),
 D("N3", "R6", "MR", "[R2] hidden-salary doubling: ot list / stock / flags identical"),
 D("N4", "R6", "MG", "[db] [control] owner money · in-scope money (R6)"),
 D("D0", "R2", "MG", "[R2] [control] payloads stable"),
 D("D1", "R2", "CG", "[R2] doubling: reports identical"),
 D("D2", "R2", "CG", "[R2] doubling: profile/slip loaders identical"),
 D("D3", "R2", "CG", "[R2] doubling: payroll page identical"),
 D("D4", "R2", "MR", "[R2] doubling: other pay readers + otRequestList identical"),
 D("D5", "R2", "MG", "[R2] [regression] doubling: AI · REST · non-pay viewers identical"),
 D("D6", "R2", "MG", "[R2] [positive control] owner/pay-key payloads change"),
 D("E1", "R3", "CG", "[db] [regression] borrowed still on roster/attendance/time"),
 D("E2", "R3", "MG", "[db] [regression] leave/OT decisions on borrowed"),
 D("G1", "R4", "CG", "[action] [control] 11 run actions refused"),
 D("W1", "R5", "MG", "[db] write paths refuse 18 bad chars"),
 D("W2", "R5", "MG", "[db] refusals fixed, no echo"),
 D("W3", "R5", "mG", "[db] [control] good names accepted"),
 D("W4", "R5", "MG", "[db] stored bad names: exports succeed"),
 D("W5", "R5", "MG", "[db] exports sanitised"),
 D("W6", "R10", "MR", "[db] booking staff path names clean (R10)"),
 D("Z1", "-", "CG", "residue none · no outbound"),
];
const R = makeRegistry(SUITE, "", CHECKS);
if (ARGV.includes("--list")) { R.printList(); process.exit(0); }
const { chk } = R;
const all = (r: Record<string, unknown>) => Object.values(r).every(Boolean);
const fails = (r: Record<string, unknown>) => Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "all";
const L = (xs: string[], n = 8) => xs.slice(0, n).join(" | ") || "ok";

// ── statics
const sc0 = code(F.scope), built = rd(F.scope).includes("HR PRIV-2");
if (!built && !FORCE) R.skipExit([`${F.scope} has no HR PRIV-2 marker`]);
{
 const ex = (n: string) => new RegExp(`export\\s+(?:function|const)\\s+${n}\\b`).test(sc0), w = bodyOf(sc0, "payScopeWhere");
 const r = { inPayScope: ex("inPayScope"), payScopeWhere: ex("payScopeWhere"), noBorrow: !!w && !/\bunits\b|borrow/i.test(w), text: /export\s+const\s+PAY_SCOPE_EXCLUDED_TEXT\s*=\s*"([^"]*)"/.exec(sc0)?.[1] === NOTE, built };
 chk("S1", all(r), "", fails(r));
}
{
 const u = (s: string) => /\b(inPayScope|payScopeWhere|payScopeEmployeeIds)\b/.test(s);
 const pv = code(F.priv), lps = bodyOf(pv, "loadPayslipForViewer"), hm = bodyOf(code(F.slip), "homeInScope"), cv = bodyOf(code(F.ap), "covers"), pr = bodyOf(code(F.payroll), "previewPayrollRunV2"), ot = code(F.ot), st = code(F.stock);
 const r = {
  profile: u(bodyOf(pv, "loadEmployeeProfileForViewer")), slip: u(lps) && !/employeeInScope/.test(lps), home: !hm || u(hm), labor: u(code(F.labor).split("\n").find((l) => /\bsees\s*=/.test(l)) ?? ""),
  preview: u(pr) && !/unitsOfViewer\(/.test(pr), covers: !cv || u(cv), reports: u(code(F.rep)), note: /PAY_SCOPE_EXCLUDED_TEXT/.test(code(F.payUi)) && /PAY_SCOPE_EXCLUDED_TEXT/.test(code(F.runUi)),
  otMoney: u(bodyOf(ot, "otRequestList") + bodyOf(ot, "toItems")), stock: u(bodyOf(st, "listStockCharges")) && u(bodyOf(st, "stockPeriodCapFlags")),
  oneDef: !HR_ALL.some((f) => f !== F.scope && /(?:function|const)\s+(inPayScope|payScopeWhere)\b/.test(code(f))),
 };
 chk("S2", all(r), "", fails(r));
}
{
 const a = code(F.acts);
 const miss = ["createPayrollRunAction", "approvePayrollRunAction", "reverseRunAction", "markPaidAction", "deleteDraftRunAction", "recomputeDraftRunAction", "createPayrollRunV2Action", "recomputeRunV2Action", "approveRunV2Action", "payRunV2Action", "reverseRunV2Action"].filter((n) => !/assertRunAllBranches\(auth\)/.test(bodyOf(a, n)));
 const docs = /isAllBranches\(/.test(bodyOf(code(`${H}bank-files/service.ts`), "bankGateOf")) && /bankGateOf\(m\)/.test(bodyOf(code(`${H}filings/service.ts`), "gate")) && /bankGateOf\(/.test(bodyOf(code(F.slip), "certGate"));
 chk("S3", !miss.length && docs, "", `missing=${miss.join(",") || "none"} docs=${docs}`);
}
{
 const ch = changedVsBase(BASE, FROZEN), oc = changedVsBase(BASE, OLD);
 const bad = oc === "unchanged" ? [] : !oc.startsWith("changed: ") ? [oc] : oc.slice(9).split(",").filter((f) => {
  const hs = diffHunks(BASE, f) ?? [];
  return f === F.h43 ? hs.some((h) => !h.added.some((l) => l.includes("ORACLE-EDIT (HR-PRIV-2"))) : !hs.some((h) => h.added.some((l) => /ORACLE-EDIT[^\n]*PRIV-2/.test(l)));
 });
 const r = { frozen: ch === "unchanged", oracles: !bad.length, sha: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA };
 chk("S4", all(r), "", `${fails(r)} ${ch.slice(0, 100)} ${bad.join(",")} base=${BASE.slice(0, 9)}`);
}
{
 const ch = changedFiles(BASE).filter((f) => f.startsWith("src/"));
 const ok = (f: string) => MARKED.includes(f) || /^src\/messages\/(th|en)\/common\.json$/.test(f) || (f.startsWith(H) && fileAt(BASE, f) === null && /HR PRIV-2/.test(rd(f).split("\n").slice(0, 3).join("\n")));
 const out = ch.filter((f) => !ok(f)), bad = unmarkedHunks(BASE, ch.filter((f) => MARKED.includes(f)));
 chk("S5", !out.length && !bad.length, "", `outside=${out.join(",") || "none"} hunks=${bad.join(",") || "ok"}`);
}
{
 const r = { inBase: commitInBase(TICKET_BASE, "HEAD"), files: ["scripts/qc-hr-priv-2.mts", "scripts/qc-hr-priv-2-lib.mts", "ledger/hr-briefs/hr-brief-PRIV-2.md"].every((p) => existsSync(join(ROOT, p))) };
 chk("S6", all(r), "", fails(r));
 const rep = code(F.rep), rr = code(F.rr);
 const r7 = { noReplace: !/\{names\}/.test(rep), texts: !/\{names\}/.test(rd(F.rr)), reuse: /from\s+["']@\/lib\/core\/csv["']/.test(rep + rr) && /\b(neutralizeFormula|csvCell|csvRow)\b/.test(rep + rr) };
 chk("S7", all(r7), "", fails(r7));
}

// ── DB
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage; // before next/*
installNetGuard();
const { P, coreHash } = await qc4Env(SUITE);
const M: Record<string, Any> = {};
const MODS = "scope priv:privacy svc:service payroll slip:payslip rep:reports RR:reports-rules labor ap:attendance-pay we:work-entries open:payroll-opening bank:bank-files/service fil:filings/service inbox stock:stock-charge leave roster board:roster-board judge ot ui:payroll-ui acts:payroll-actions booking:../booking/service sys:../system/service";
const SPECS: Record<string, string> = { ...Object.fromEntries(MODS.split(" ").map((x) => x.split(":")).map(([k, v]) => [k!, `@/lib/modules/hr/${v ?? k}`])), tools: "@/lib/ai/tools", actor: "@/lib/ai/actor", AK: "@/lib/api-keys/service", RT: "@/app/api/v1/hr/[...path]/route", money: "@/lib/ui/money" };
for (const [k, s] of Object.entries(SPECS)) M[k] = (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const badImp = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (badImp.length) console.log(`import problems: ${badImp.join(" | ")}`);
const REAL = { ...console };
const mute = () => Object.assign(console, { log: () => {}, info: () => {}, warn: () => {}, error: () => {} });
const unmute = () => Object.assign(console, REAL);
async function call(m: Any, fn: string, ...a: unknown[]): Promise<Any> {
 if (typeof m?.[fn] !== "function") return { __missing: fn };
 mute();
 try { return await m[fn](...a); } catch (e) { return { __throw: errText(e) }; } finally { unmute(); }
}
const okR = (r: Any) => !!r && typeof r === "object" && !("__missing" in r) && !("__throw" in r) && r.ok !== false;
const NX = await Promise.all(["app-render/work-async-storage.external.js", "app-render/work-unit-async-storage.external.js", "web/spec-extension/cookies.js"].map((p) => import(`next/dist/server/${p}` as string).catch(() => null))) as Any[];
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
 const [nw, nu, nc] = NX;
 if (!nw?.workAsyncStorage || !nu?.workUnitAsyncStorage || !nc?.RequestCookies) throw new Error("no Next request scope");
 const req = new Request(`http://qc.local${pathname}`, { headers: { cookie } }), jar = new nc.RequestCookies(req.headers);
 const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
 const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
 return nw.workAsyncStorage.run(ws, () => nu.workUnitAsyncStorage.run(unit, fn));
}
async function renderHtml(node: Any): Promise<string> {
 try { return String(((await import("react-dom/server" as string)) as Any).renderToStaticMarkup(node)); } catch {
  const { prelude } = await ((await import("react-dom/static" as string)) as Any).prerenderToNodeStream(node);
  let h = "";
  for await (const c of prelude) h += String(c);
  return h;
 }
}
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

// ── fixture
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${PFX}${Date.now()}${tag}`, fx = makeFixtures(P, coreHash, SLUG);
const D0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10), DM1 = addDay(D0, -1), MONTH = D0.slice(0, 7), YEAR = Number(D0.slice(0, 4));
const PERIOD = addDay(D0, -34).slice(0, 7), PY = Number(PERIOD.slice(0, 4)); // bNow's borrowing (D0-3) starts after it
const NOW = new Date(`${D0}T05:00:00Z`);
const bkk = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+07:00`) + min * 60_000);
const nidOf = (k: number) => { const b = `1${String(1_000_000_00000 + k * 7919 + (Date.now() % 997) * 13).slice(-11)}`; let s = 0; for (let i = 0; i < 12; i++) s += Number(b[i]) * (13 - i); return b + String((11 - (s % 11)) % 10); };
type Emp = Any;
const IN = ["a1", "a2", "aLeft"], BOR = ["bNow", "bSpan", "bLeft"], OUT = ["bNow", "bSpan", "bEnded", "bLeft", "c1", "c2", "cNo"];
const AMT = { bonB: 654_321, bonA: 123_457, otSpan: 333_331, otB: 444_443, otA1: 222_227, otSpan2: 555_557, stockSpan: 400_000, dedSpan: 300_000, stockA1: 50_000 };
async function retotal(runId: string): Promise<void> {
 const its = (await P.hrPayrollItem.findMany({ where: { runId } })) as Any[], s = (k: string) => its.reduce((x, i) => x + Number(i[k] ?? 0), 0);
 await P.hrPayrollRun.update({ where: { id: runId }, data: Object.fromEntries(["Gross", "SsoEmployee", "SsoEmployer", "Wht", "Net", "Add", "Deduct"].map((k) => [`total${k}Satang`, s(`${k[0]!.toLowerCase()}${k.slice(1)}Satang`)])) });
}
async function buildFixture() {
 const TA = await fx.newTenant("", "QC PRIV2 shop");
 const [U1, U2, U3] = [await fx.newUnit(TA, `QCP2 สาขาหนึ่ง ${tag}`, "u1"), await fx.newUnit(TA, `QCP2 สาขาสอง ${tag}`, "u2"), await fx.newUnit(TA, `QCP2 สาขาสาม ${tag}`, "u3")];
 const HRS = (await M.sys.createSystem(TA, "HR", `HR ${tag}`)).id as string;
 for (const u of [U1, U2, U3]) await M.sys.linkUnit(TA, HRS, u).catch(() => undefined);
 const sc = { tenantId: TA, systemId: HRS };
 const PAY = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.reverse": true };
 const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(TA, t, `QCP2 ${t} ${tag}`, r, ua, p);
 const W = { owner: await mk("owner", "OWNER", [], {}), payAll: await mk("payall", "STAFF", ["*"], PAY), payU1s: await mk("payu1s", "STAFF", [U1], { "hr.payroll.read": true }),
  payU1m: await mk("payu1m", "MANAGER", [U1], { ...PAY, "hr.leave.read": true, "hr.leave.decide": true, "hr.payadjust.approve": true }), hrAdmin: await mk("hradmin", "STAFF", ["*"], { "hr.employee.create": true }),
  mgrU1: await mk("mgru1", "MANAGER", [U1], {}), emp: await mk("emp", "STAFF", [], {}) };
 const end = { status: "ENDED", active: false, endDate: DM1 };
 const defs: [string, string | null, "MONTHLY" | "HOURLY", Record<string, Any>][] = [["a1", U1, "MONTHLY", { linkedUserId: W.emp.id }], ["a2", U1, "HOURLY", {}], ["aLeft", U1, "MONTHLY", end],
  ["bNow", U2, "HOURLY", {}], ["bSpan", U2, "MONTHLY", {}], ["bEnded", U2, "MONTHLY", {}], ["bLeft", U2, "MONTHLY", end], ["c1", U2, "MONTHLY", {}], ["c2", U3, "HOURLY", {}], ["cNo", null, "MONTHLY", {}]];
 const E: Record<string, Emp> = {};
 for (const [i, [key, home, pay, o]] of defs.entries()) {
  const k = i + 1, name = `QCP2 ${key} ${tag}`, z = `z${tag}${key}`, nid = nidOf(k), base = 3_000_000 + k * 13_337 + 17, rate = 17_000 + k * 113 + 7, gross = 4_000_000 + k * 21_211 + 919;
  const id = await fx.mkEmp(TA, HRS, name, { code: `P${k}`, startDate: "2025-01-01", position: "บาริสต้า", unitId: home, ...o });
  await P.hrEmployee.update({ where: { id }, data: { nationalId: nid, ssoNumber: `${z}SSO`, houseRegAddress: `${z}HOUSE`, bankName: "KBank", bankAccountNo: `${7700000000 + k * 1013}`, bankAccountName: `${z}BANKNAME`, phone: `${z}PHONE`, birthDate: new Date(`198${k % 10}-0${(k % 9) + 1}-1${k % 9}T00:00:00Z`) } });
  await P.hrEmployeeDoc.create({ data: { ...sc, employeeId: id, kind: "ID_CARD", title: "บัตร", url: `https://files.invalid/${z}DOC` } });
  await P.hrSalaryProfile.create({ data: { ...sc, employeeId: id, payType: pay, baseSalarySatang: pay === "MONTHLY" ? base : 0, hourlyRateSatang: pay === "HOURLY" ? rate : null, ssoEligible: true } });
  E[key] = { key, id, k, name, nid, z, base, rate, gross, net: gross - 75_000 - (10_000 + k * 7), pay };
 }
 for (const [e, from, to] of [["bNow", addDay(D0, -3), null], ["bSpan", addDay(`${PERIOD}-01`, -40), null], ["bEnded", `${PERIOD}-05`, `${PERIOD}-20`], ["bLeft", `${PERIOD}-01`, null]] as [string, string, string | null][])
  await P.hrEmployeeUnit.create({ data: { ...sc, employeeId: E[e]!.id, unitId: U1, fromDate: dbDate(from), toDate: to ? dbDate(to) : null } });
 const SH1 = (await P.hrShift.create({ data: { ...sc, unitId: U1, name: `เช้า1 ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } })).id;
 for (const e of ["a1", "bNow"]) {
  for (const day of [D0, DM1]) await P.hrRosterEntry.create({ data: { ...sc, employeeId: E[e]!.id, date: dbDate(day), shiftId: SH1, unitId: U1, startMin: 480, endMin: 1020, breakMin: 60, crossesMidnight: false, published: true, publishedAt: new Date() } });
  for (const [kind, min] of [["IN", 485], ["OUT", 1022]] as const) await P.hrAttendance.create({ data: { ...sc, employeeId: E[e]!.id, kind, at: bkk(DM1, min), source: "MOBILE" } });
  await P.hrAttendanceDay.create({ data: { ...sc, employeeId: E[e]!.id, date: dbDate(DM1), slotKey: `qc-${e}`, unitId: U1, startMin: 480, endMin: 1020, status: "ON_TIME", workedMin: 480, judgedAt: new Date() } });
 }
 const pol = (await P.hrLeavePolicy.create({ data: { ...sc, category: "PERSONAL", name: `กิจ ${tag}`, quotaDays: 30, allowHalfDay: false, allowHours: false } })).id;
 const leaveB = (await P.hrLeave.create({ data: { ...sc, employeeId: E.bNow!.id, policyId: pol, type: "PERSONAL", fromDate: dbDate(addDay(D0, 20)), toDate: dbDate(addDay(D0, 20)), status: "PENDING", reason: "ธุระ", days: 1 } })).id as string;
 const ot = (e: string, day: string, status: string, amt: number | null) => P.hrOtRequest.create({ data: { ...sc, employeeId: E[e]!.id, date: dbDate(day), startAt: bkk(day, 1022), endAt: bkk(day, 1082), minutes: 60, timing: "AFTER", reason: "ปิดร้าน", status, ...(amt ? { amountSatang: amt, settledAt: bkk(day, 1200) } : {}) } }).then((r: Any) => r.id as string);
 const otB = await ot("bNow", DM1, "PENDING", null);
 await ot("a1", `${PERIOD}-12`, "APPROVED", 111_119);
 await ot("bSpan", `${PERIOD}-12`, "APPROVED", AMT.otSpan);
 const otBNow = await ot("bNow", addDay(D0, -2), "APPROVED", AMT.otB); // R6 N1: borrowed day, settled money
 await ot("a1", addDay(D0, -2), "APPROVED", AMT.otA1);
 await ot("bSpan", addDay(D0, -2), "APPROVED", AMT.otSpan2);
 const mkRun = async (periodKey: string, status: string, keys: string[]) => {
  const run = await P.hrPayrollRun.create({ data: { ...sc, periodKey, payDate: new Date(`${periodKey}-28T12:00:00+07:00`), status, engineVersion: 1, totalGrossSatang: 0, totalSsoEmployeeSatang: 0, totalSsoEmployerSatang: 0, totalWhtSatang: 0, totalNetSatang: 0, totalAddSatang: 0 } });
  for (const key of keys) { const e = E[key]!; await P.hrPayrollItem.create({ data: { ...sc, runId: run.id, employeeId: e.id, ...v1Item(e.gross, [], { add: 0, deduct: 0, gross: e.gross, ssoBase: 1_500_000, ee: 75_000, wht: 10_000 + e.k * 7 }) } }); }
  await retotal(run.id);
  return run.id as string;
 };
 const runPaid = await mkRun(PERIOD, "PAID", Object.keys(E)), runDraft = await mkRun(MONTH, "DRAFT", Object.keys(E).filter((x) => !/Left$/.test(x)));
 const adj = (e: string, kind: string, amt: number) => P.hrPayAdjustment.create({ data: { ...sc, employeeId: E[e]!.id, periodKey: MONTH, kind, amountSatang: amt, status: "PENDING", note: "QC" } }).then((r: Any) => r.id as string);
 await adj("a1", "BONUS", AMT.bonA);
 await adj("bNow", "BONUS", AMT.bonB);
 await adj("bSpan", "DEDUCTION", AMT.dedSpan); // R6 N2: bSpan (borrowed, MONTHLY) — overCap + cap flag reveal its salary · a1 = control
 const stock = async (e: string, amt: number) => (await P.hrStockCharge.create({ data: { ...sc, employeeId: E[e]!.id, kind: "DAMAGE", requestKey: `qc-${e}-${tag}`, adjustmentId: await adj(e, "DEDUCTION", amt), description: "แก้วแตก", amountSatang: amt, consentRef: `C-${e}`, consentAt: dbDate(DM1), consentRecordedById: W.owner.id, requestedById: W.owner.id } })).id as string;
 const stockSpan = await stock("bSpan", AMT.stockSpan);
 await stock("a1", AMT.stockA1);
 return { TA, U1, HRS, ctx: sc, W, E, runPaid, runDraft, leaveB, otB, otBNow, stockSpan };
}

// ── main
let crashed = "";
const vOf = (w: Any) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
try {
{
 const S = M.scope;
 let r: Record<string, boolean> = { has: typeof S?.inPayScope === "function" && typeof S?.payScopeWhere === "function" };
 if (r.has) {
  const s = (role: string, ua: string[]) => S.hrScopeOf({ role, unitAccess: ua }), u1 = s("MANAGER", ["U1"]), w1 = canon(S.payScopeWhere(u1));
  r = { ...r, all: [s("OWNER", []), s("STAFF", ["*"]), s("STAFF", [])].every((x: Any) => ["U1", "U2", null].every((h) => S.inPayScope(x, h) === true)),
   u1: S.inPayScope(u1, "U1") === true && ["U2", "U3", null, undefined].every((h) => S.inPayScope(u1, h) === false),
   where: !/"units"/.test(w1) && /U1/.test(w1) && canon(S.payScopeWhere(s("OWNER", []))) === "{}" && /"in":\[\]/.test(canon(S.payScopeWhere({ unitIds: [] }))) };
 }
 chk("P1", all(r), "", fails(r));
}
const X = await buildFixture();
const { ctx, W, E, U1, runPaid, runDraft } = X;
const q = (m: string, fn: string, ...a: unknown[]) => call(M[m], fn, ctx, ...a);
const kOf = new Map(Object.values(E).map((e) => [e.id, e.key]));
const LIM = { payU1s: vOf(W.payU1s), payU1m: vOf(W.payU1m) }, VM = vOf(W.mgrU1), VO = vOf(W.owner);
const money = (s: number) => String(M.money?.formatBaht?.(s));
const baht = (s: number) => [String(s), (s / 100).toFixed(2), (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })];
const sensOf = (e: Emp) => [e.nid, `${e.z}SSO`, `${e.z}HOUSE`, `${e.z}BANKNAME`, `${e.z}DOC`];
const payOf = (e: Emp) => [...baht(e.gross), ...baht(e.net), ...baht(e.pay === "HOURLY" ? e.rate : e.base)].filter((s) => s.length >= 5);
const num = (v: unknown) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
console.log(`fixture ok: PERIOD=${PERIOD} MONTH=${MONTH}`);
{
 const prof = (v: Any, e: string) => q("priv", "loadEmployeeProfileForViewer", v, E[e]?.id ?? e), lps = (v: Any, e: string) => q("priv", "loadPayslipForViewer", v, runPaid, E[e]?.id ?? e);
 const SENS = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName", "payType"];
 const a1: string[] = [], a2: string[] = [], c: string[] = [];
 for (const [vn, v] of Object.entries(LIM)) for (const e of BOR) {
  const r = await prof(v, e), keys = SENS.filter((k) => r?.profile && k in r.profile), sent = sensOf(E[e]!).filter((s) => T(r).includes(s));
  if (!r?.profile || keys.length || sent.length || r.docs?.length || r.canSeeSensitive !== false) a1.push(`${vn}.${e}:${keys.join("/")}|${sent.length}|${r?.docs?.length}`);
  if (vn === "payU1m" && canon(r) !== canon(await prof(VM, e))) a2.push(e);
 }
 chk("A1", !a1.length, "", L(a1));
 chk("A2", !a2.length, "", L(a2));
 for (const e of IN) { const t = T(await prof(LIM.payU1s, e)); if (!sensOf(E[e]!).every((s: string) => t.includes(s))) c.push(`payU1s.${e}`); }
 { const t = T(await prof(VO, "bNow")); if (!sensOf(E.bNow!).every((s: string) => t.includes(s))) c.push("owner.bNow"); }
 chk("A3", !c.length, "", L(c));
 const s = { bNow: await lps(LIM.payU1s, "bNow"), bSpan: await lps(LIM.payU1s, "bSpan"), a1: await lps(LIM.payU1s, "a1") }, rt = await P.hrPayrollRun.findUnique({ where: { id: runPaid } });
 const whole = ["totalGrossSatang", "totalNetSatang", "totalSsoEmployeeSatang", "totalWhtSatang"].filter((k) => T(s.a1).includes(String(rt[k])));
 chk("A4", s.bNow === null && s.bSpan === null && !!s.a1?.item && !whole.length, "", `${s.bNow === null}/${s.bSpan === null}/${!!s.a1?.item} whole=${whole}`);
 const unk = "c" + Math.random().toString(36).slice(2, 12) + "zz9q";
 const par = [await prof(LIM.payU1s, "c2"), await prof(LIM.payU1s, "cNo"), await prof(LIM.payU1s, unk), await lps(LIM.payU1s, "c2"), await lps(LIM.payU1s, unk)];
 chk("A5", par.every((x) => x === null), "", par.map((x) => (x === null ? "null" : short(x, 20))).join(","));
 const own = await lps(vOf(W.emp), "a1"), db = (await P.hrPayrollItem.findFirst({ where: { runId: runPaid, employeeId: E.a1!.id } })) as Any; // A7 (R8)
 const diff = ["grossSatang", "netSatang", "ssoBaseSatang", "ssoEmployeeSatang", "ssoEmployerSatang", "whtSatang", "addSatang", "deductSatang"].filter((k) => k in (own?.item ?? {}) && own.item[k] !== db?.[k]);
 const tot = Object.keys(own?.run ?? {}).filter((k) => /^total/i.test(k));
 const r7 = { slip: !!own?.item, gross: own?.item?.grossSatang === db?.grossSatang, net: own?.item?.netSatang === db?.netSatang, figures: !diff.length, noTotals: !tot.length };
 chk("A7", all(r7), "", `${fails(r7)} diff=${diff.join("/")} totals=${tot.join("/")}`);
}
const IDS: string[] = (M.RR.REPORT_IDS as string[]) ?? [];
const per = (r: string) => { const k = M.RR.REPORT_CATALOG?.[r]?.period; return k === "year" ? String(PY) : k === "day" ? D0 : PERIOD; };
const load = (v: Any, r: string, period = per(r)) => q("rep", "loadReport", v, { report: r, period }), exp = (v: Any, r: string, format: string, period = per(r)) => q("rep", "exportReport", v, { report: r, period, format });
const rowsOf = (r: Any): string[] => (Array.isArray(r?.rows) ? r.rows.map((x: Any) => kOf.get(x.employeeId) ?? "?") : ["∅"]);
{
 const b1: string[] = [], b2: string[] = [], b5: string[] = [];
 for (const [vn, v] of Object.entries(LIM)) for (const rep of ["payroll-month", "payroll-year", "tax-month", "tax-year", "wages", "register"]) {
  const page = await load(v, rep), out = rowsOf(page).filter((k) => !IN.includes(k));
  if (out.length) b1.push(`${vn}.${rep}:${out.join("/")}`);
  if (vn === "payU1s") for (const [col, tot] of Object.entries((page?.totals ?? {}) as Record<string, string>)) if (/\d/.test(String(tot)) && Math.abs((page.rows as Any[]).reduce((x, rw) => x + num(rw.values?.[col]), 0) - num(tot)) > 0.001) b5.push(`${rep}.${col}`);
  for (const f of ["CSV", "XLSX"]) { const x = await exp(v, rep, f), t = x?.ok ? T(x.bytes) : "", hits = BOR.filter((e) => [E[e]!.name, E[e]!.nid, ...payOf(E[e]!)].some((s) => t.includes(s))); if (!x?.ok || hits.length) b2.push(`${vn}.${rep}.${f}:${x?.ok ? hits.join("/") : "refused"}`); }
 }
 chk("B1", !b1.length, "", L(b1, 6));
 chk("B2", !b2.length, "", L(b2, 6));
 const b3: string[] = [];
 const MK: string[] = ((M.RR.REPORT_CATALOG?.ot?.columns ?? []) as Any[]).filter((c) => c.cls === "$").map((c) => c.key);
 const page = await load(LIM.payU1m, "ot", PERIOD), rowOf = (r: Any) => ((r?.rows ?? []) as Any[]).find((x) => x.employeeId === E.bSpan!.id);
 const bp = rowOf(page), bm = rowOf(await load(VM, "ot", PERIOD));
 if (!page?.ok || !bp || !bm) b3.push(`rows page=${!!bp} mgr=${!!bm}`);
 else {
  const leak = MK.filter((k) => ![undefined, null, ""].includes(bp.values?.[k])), dd = Object.keys(bm.values ?? {}).filter((k) => !MK.includes(k) && String(bp.values?.[k] ?? "") !== String(bm.values[k] ?? ""));
  const inR = ((page.rows ?? []) as Any[]).filter((x) => IN.includes(kOf.get(x.employeeId) ?? "")), badT = MK.filter((k) => page.totals?.[k] !== undefined && Math.abs(num(page.totals[k]) - inR.reduce((a: number, x: Any) => a + num(x.values?.[k]), 0)) > 0.001);
  if (leak.length) b3.push(`money ${leak.join("/")}`);
  if (dd.length) b3.push(`op≠mgr ${dd.join("/")}`);
  if (badT.length) b3.push(`totals ${badT.join("/")}`);
  if (page.excludedHeadcount !== 1) b3.push(`excluded=${page.excludedHeadcount}`);
  if (!((page.notes ?? []) as string[]).includes(NOTE.replace("{n}", "1"))) b3.push("note");
 }
 for (const f of ["CSV", "XLSX"]) { const x = await exp(LIM.payU1m, "ot", f, PERIOD), t = x?.ok ? T(x.bytes) : ""; if (!x?.ok || !t.includes(E.bSpan!.name) || baht(AMT.otSpan).some((s) => t.includes(s))) b3.push(`${f}:${x?.ok ? "row/amount" : "refused"}`); }
 chk("B3", !b3.length, "", L(b3));
 const b4: string[] = [];
 for (const w of ["owner", "payAll"]) for (const rep of ["payroll-month", "tax-month", "register"]) { const rows = rowsOf(await load(vOf((W as Any)[w]), rep)); if (!BOR.every((e) => rows.includes(e))) b4.push(`${w}.${rep}`); }
 { const rows = rowsOf(await load(LIM.payU1s, "payroll-month")); if (!rows.includes("aLeft") || rows.includes("bEnded")) b4.push("payU1s aLeft/bEnded"); }
 chk("B4", !b4.length, "", L(b4));
 const docs = async (v: Any) => ({ open: await q("open", "listOpeningYtd", v, { taxYear: PY }), certs: await q("slip", "listSalaryCertEmployees", v), fil: await q("fil", "listFilingEmployees", v), bank: await q("bank", "previewBankFile", v, { runId: runPaid, bank: "KBANK", format: "CSV" }) });
 for (const [vn, v] of Object.entries(LIM)) { const o = Object.entries(await docs(v)).filter(([, r]) => okR(r)).map(([k]) => k); if (o.length) b5.push(`${vn} opens ${o.join("/")}`); }
 { const d = await docs(vOf(W.payAll)); if (!(T(d.certs) + T(d.fil)).includes(E.bNow!.name)) b5.push("payAll lacks bNow"); }
 chk("B5", !b5.length, "", L(b5));
}
const pagePath = `/app/sys/${X.HRS}/hr/payroll`;
const renderPage = async (w: Any): Promise<{ html: string; props: string }> => {
 try { return await inScope(w.cookie, pagePath, async () => { mute(); try { const n = await M.ui.PayrollSection({ systemId: X.HRS }); return { html: await renderHtml(n), props: propsText(n) }; } finally { unmute(); } }); } catch (e) { return { html: `THROW ${errText(e)}`, props: "" }; }
};
const runRow = async (id: string) => (await P.hrPayrollRun.findUnique({ where: { id } })) as Any;
{
 const pg = await renderPage(W.payU1m), both = pg.html + "\u0001" + pg.props;
 const c1: string[] = pg.html.startsWith("THROW") || pg.html.length < 200 ? [`render ${pg.html.slice(0, 80)}`] : [];
 for (const e of OUT) { const x = E[e]!, v = x.pay === "HOURLY" ? x.rate : x.base; if ([x.name, money(x.gross), money(x.net), money(v), String(x.gross), String(v)].some((s) => both.includes(s))) c1.push(e); }
 if (both.includes(money(AMT.bonB)) || both.includes(String(AMT.bonB))) c1.push("bNow bonus");
 chk("C1", !c1.length, "", L(c1));
 const c2: string[] = [];
 for (const [rid, lb] of [[runPaid, "PAID"], [runDraft, "DRAFT"]] as [string, string][]) {
  const t = await runRow(rid), its = (await P.hrPayrollItem.findMany({ where: { runId: rid } })) as Any[], shown = its.filter((i) => IN.includes(kOf.get(i.employeeId) ?? ""));
  for (const k of ["totalGrossSatang", "totalNetSatang", "totalSsoEmployeeSatang", "totalWhtSatang"]) if (both.includes(money(Number(t[k]))) || both.includes(String(t[k]))) c2.push(`${lb}.${k}`);
  if (new RegExp(`(^|[^\\d])${its.length} คน`).test(pg.html)) c2.push(`${lb}.count`);
  if (!pg.html.includes(NOTE.replace("{n}", String(its.length - shown.length)))) c2.push(`${lb}.note`);
  if (lb === "PAID" && !pg.html.includes(money(shown.reduce((x, i) => x + i.netSatang, 0)))) c2.push("PAID.Σnet");
 }
 chk("C2", !c2.length, "", L(c2));
 const po = await renderPage(W.owner);
 const c3 = { rendered: !po.html.startsWith("THROW"), total: po.html.includes(money((await runRow(runPaid)).totalNetSatang)), names: Object.values(E).filter((e) => !/Left$/.test(e.key)).every((e) => po.html.includes(e.name)), noNote: !po.html.includes(NOTE.slice(0, 20)) };
 chk("C3", all(c3), "", fails(c3));
 const c4: string[] = [];
 for (const [rid, hid] of [[runPaid, 7], [runDraft, 6]] as [string, number][]) {
  const pv = await q("payroll", "previewPayrollRunV2", LIM.payU1m, { runId: rid }), ow = await q("payroll", "previewPayrollRunV2", VO, { runId: rid });
  if (!pv?.ok) { c4.push(`${hid}:${short(pv, 30)}`); continue; }
  const out = (pv.rows as Any[]).map((r) => kOf.get(r.employeeId) ?? "?").filter((k) => !IN.includes(k));
  if (out.length) c4.push(`rows ${out.join("/")}`);
  if (pv.run?.totals?.netSatang !== (pv.rows as Any[]).reduce((x, r) => x + r.netSatang, 0)) c4.push("Σ");
  if (pv.run?.excludedHeadcount !== hid) c4.push(`excluded=${pv.run?.excludedHeadcount}≠${hid}`);
  if (ow?.run?.excludedHeadcount !== 0 || ow?.run?.totals?.netSatang !== (await runRow(rid)).totalNetSatang) c4.push(`owner ${ow?.run?.excludedHeadcount}`);
 }
 chk("C4", !c4.length, "", L(c4));
 const adjItems = (r: Any): Any[] => { const o: Any[] = [], seen = new WeakSet(); const w = (x: Any) => { if (!x || typeof x !== "object" || seen.has(x)) return; seen.add(x); if (typeof x.employeeId === "string" && x.detail && typeof x.detail === "object" && "amountSatang" in x.detail) o.push(x); Object.values(x).forEach(w); }; w(r); return o; };
 const c5: string[] = [];
 for (const [vn, v] of Object.entries(LIM)) {
  const ib = await q("inbox", "listInbox", v, {});
  if (!okR(ib)) { c5.push(`${vn}:${short(ib, 30)}`); continue; }
  const out = adjItems(ib).filter((x) => !IN.includes(kOf.get(x.employeeId) ?? ""));
  if (out.length || T(ib).includes(String(AMT.bonB))) c5.push(`${vn}:${out.map((x) => kOf.get(x.employeeId)).join("/") || "amount"}`);
  if (vn === "payU1m" && !T(ib).includes(String(AMT.bonA))) c5.push("a1 missing");
 }
 if (adjItems(await q("inbox", "listInbox", VM, {})).length) c5.push("mgrU1 premise");
 chk("C5", !c5.length, "", L(c5));
}
{
 const otl = (v: Any) => q("ot", "otRequestList", v, {}), ls = (v: Any) => q("stock", "listStockCharges", v, {}), flags = (v: Any, it: Any[]) => q("stock", "stockPeriodCapFlags", v, it);
 const item = (r: Any, id: string) => ((r?.items ?? []) as Any[]).find((x) => x.id === id);
 const rows = (await P.hrOtRequest.findMany({ where: { tenantId: X.TA, employeeId: { in: [E.bNow!.id, E.bSpan!.id] }, status: "APPROVED", date: { gte: dbDate(addDay(D0, -5)) } }, select: { id: true } })) as Any[];
 const lm = await otl(LIM.payU1m), mg = await otl(VM), n1: string[] = [];
 for (const { id } of rows) { const a = item(lm, id); if (!a) n1.push("missing"); else if ("amountSatang" in a || "segments" in a || canon(a) !== canon(item(mg, id))) n1.push(`${kOf.get(a.employeeId)}:${"amountSatang" in a ? "money" : "≠mgr"}`); }
 chk("N1", !n1.length && rows.length >= 2, "", L(n1));
 const own = await ls(VO), lim = await ls(LIM.payU1m), span = ((own?.items ?? []) as Any[]).find((i) => i.id === X.stockSpan);
 const fl = span ? await flags(LIM.payU1m, [span]) : null;
 const n2 = { list: okR(lim), noRow: !((lim?.items ?? []) as Any[]).some((i) => i.employeeId === E.bSpan!.id), noFlag: !!span && !(fl instanceof Set && fl.has(X.stockSpan)) };
 chk("N2", all(n2), "", fails(n2));
 const of = span ? await flags(VO, [span]) : null, li = (lim?.items ?? []) as Any[];
 const n4 = { ownerOt: item(await otl(VO), X.otBNow)?.amountSatang === AMT.otB, ownerStock: span?.amountSatang === AMT.stockSpan && span?.overCap === true, ownerFlag: of instanceof Set && of.has(X.stockSpan),
  limOtA1: ((lm?.items ?? []) as Any[]).some((i) => i.employeeId === E.a1!.id && i.amountSatang === AMT.otA1), limStockA1: li.some((i) => i.employeeId === E.a1!.id && i.amountSatang === AMT.stockA1) };
 chk("N4", all(n4), "", fails(n4));
 const snap = async () => { const l = await ls(LIM.payU1m); return [digest(await otl(LIM.payU1m)), digest(l), digest(await flags(LIM.payU1m, [...((l?.items ?? []) as Any[]), ...(span ? [span] : [])]))]; };
 const s1 = await snap(), p0 = (await P.hrSalaryProfile.findMany({ where: { employeeId: { in: [E.bNow!.id, E.bSpan!.id] } } })) as Any[];
 for (const p of p0) await P.hrSalaryProfile.update({ where: { id: p.id }, data: { baseSalarySatang: p.baseSalarySatang * 2, ...(p.hourlyRateSatang ? { hourlyRateSatang: p.hourlyRateSatang * 2 } : {}) } });
 const s2 = await snap();
 for (const p of p0) await P.hrSalaryProfile.update({ where: { id: p.id }, data: { baseSalarySatang: p.baseSalarySatang, hourlyRateSatang: p.hourlyRateSatang } });
 const ch = ["otRequestList", "listStockCharges", "capFlags"].filter((_, i) => s1[i] !== s2[i]);
 chk("N3", !ch.length, "", ch.join(",") || "identical");
}
{
 const e1: string[] = [], has = (r: Any, w: string) => (T(r).includes(E.bNow!.id) || T(r).includes(E.bNow!.name) ? "" : w);
 for (const [vn, v] of [["payU1m", LIM.payU1m], ["mgrU1", VM]] as [string, Any][]) {
  const p = [has(await q("roster", "listRoster", v, { from: D0, to: D0, unitId: U1 }), "roster"), has(await q("board", "loadRosterBoard", v, { week: D0, unit: U1 }), "board"), has(await q("judge", "loadAttendanceBoard", v, { day: DM1, unit: U1 }), "attendance"),
   has(await load(v, "time", DM1.slice(0, 7)), "time"), (await q("priv", "loadEmployeeProfileForViewer", v, E.bNow!.id))?.profile ? "" : "profile"].filter(Boolean);
  if (p.length) e1.push(`${vn}:${p.join("/")}`);
 }
 chk("E1", !e1.length, "", L(e1));
}
{
 const act = async (fn: () => Promise<unknown>) => { try { return T(await inScope(W.payU1m.cookie, pagePath, async () => { mute(); try { return await fn(); } finally { unmute(); } })); } catch (e) { return e instanceof Error ? e.message : String(e); } };
 const A = M.acts, s0 = { systemId: X.HRS }, d = { ...s0, runId: runDraft }, p = { ...s0, runId: runPaid };
 const state = async () => canon({ runs: await P.hrPayrollRun.count({ where: { systemId: X.HRS } }), p: (await runRow(runPaid)).status, d: (await runRow(runDraft)).status });
 const before = await state(), n = String(await P.hrPayrollItem.count({ where: { runId: runDraft } })), net = String((await runRow(runDraft)).totalNetSatang), nx = addDay(`${MONTH}-28`, 10).slice(0, 7), np = { ...s0, periodKey: nx, payDate: `${nx}-28` };
 const tbl: [string, string, Any][] = [["approve", "approvePayrollRunAction", { ...d, expectNet: net, expectItems: n }], ["markPaid", "markPaidAction", d], ["reverse", "reverseRunAction", { ...p, reason: "ข้อสอบ" }], ["del", "deleteDraftRunAction", d],
  ["recompute", "recomputeDraftRunAction", d], ["createV2", "createPayrollRunV2Action", np], ["approveV2", "approveRunV2Action", { ...d, net, items: n }], ["payV2", "payRunV2Action", d], ["reverseV2", "reverseRunV2Action", p], ["recomputeV2", "recomputeRunV2Action", d]];
 const out: Record<string, string> = { create: await act(() => A.createPayrollRunAction(null, fd(np))) };
 for (const [k, fn, o] of tbl) out[k] = await act(() => A[fn](fd(o)));
 const nf = Object.entries(out).filter(([, t]) => !t.includes(T_RUN_ALL)).map(([k, t]) => `${k}="${short(t, 40)}"`), after = await state();
 chk("G1", !nf.length && before === after, "", `${nf.join(" ") || "all fixed"} ${before === after ? "unchanged" : `CHANGED ${after}`}`);
}
{
 type Cov = [string, string, () => Promise<unknown>];
 const cov: Cov[] = [];
 for (const [vn, v] of Object.entries(LIM)) {
  for (const r of IDS) { cov.push(["D1", `${vn}.${r}.page`, () => load(v, r)]); for (const f of ["CSV", "XLSX"]) cov.push(["D1", `${vn}.${r}.${f}`, () => exp(v, r, f)]); }
  for (const e of Object.values(E)) cov.push(["D2", `${vn}.profile.${e.key}`, () => q("priv", "loadEmployeeProfileForViewer", v, e.id)], ["D2", `${vn}.lps.${e.key}`, () => q("priv", "loadPayslipForViewer", v, runPaid, e.id)],
   ["D2", `${vn}.slip.${e.key}`, () => q("slip", "slipForViewer", v, { runId: runPaid, employeeId: e.id })], ["D2", `${vn}.hist.${e.key}`, () => q("slip", "slipHistory", v, { employeeId: e.id, taxYear: PY })]);
  const d4: [string, string, string, ...unknown[]][] = [
   ["prevPaid", "payroll", "previewPayrollRunV2", { runId: runPaid }], ["prevDraft", "payroll", "previewPayrollRunV2", { runId: runDraft }], ["laborDay", "labor", "laborDay", { day: D0, unitId: U1 }, { now: NOW }],
   ["laborDayAll", "labor", "laborDay", { day: DM1 }, { now: NOW }], ["laborMonth", "labor", "laborMonth", { periodKey: PERIOD, unitId: U1 }, { now: NOW }], ["ap", "ap", "attendanceDeductionPreview", { periodKey: MONTH }],
   ["we", "we", "workEntryPreview", { periodKey: MONTH }], ["open", "open", "listOpeningYtd", { taxYear: PY }], ["certs", "slip", "listSalaryCertEmployees"], ["filings", "fil", "listFilingEmployees"],
   ["bank", "bank", "previewBankFile", { runId: runPaid, bank: "KBANK", format: "CSV" }], ["inbox", "inbox", "listInbox", {}], ["inboxCounts", "inbox", "inboxCounts"], ["stock", "stock", "listStockCharges", {}],
   ["teamLeave", "leave", "teamLeaveBalances", { year: YEAR }], ["otList", "ot", "otRequestList", {}],
  ];
  for (const [n, m, fn, ...a] of d4) cov.push(["D4", `${vn}.${n}`, () => q(m, fn, v, ...a)]);
  const actor = M.actor?.aiMemberActor?.(X.TA, v.userId, await P.membership.findFirst({ where: { tenantId: X.TA, userId: v.userId }, select: { role: true, unitAccess: true, permissions: true } }));
  for (const [tool, args] of [["hr_who_is_on_today", { day: DM1 }], ["hr_late_report", { period: MONTH }], ["hr_labor_percent", { day: D0 }], ["hr_labor_percent", { periodKey: PERIOD }], ["hr_leave_balance", { year: YEAR }]] as [string, Any][])
   cov.push(["D5", `${vn}.ai.${tool}.${Object.keys(args)[0]}`, () => call(M.tools, "runTool", { tenantId: X.TA, actor }, tool, args)]);
 }
 const pageTxt = async (w: Any) => { const p = await renderPage(w); return p.html + "\u0002" + p.props; };
 cov.push(["D3", "payU1m.page", () => pageTxt(W.payU1m)]);
 const key = async (l: string, scopes: string[]) => { mute(); try { return (await M.AK.createApiKey({ tenantId: X.TA }, `QCP2 ${l} ${tag}`, { scopes, systemId: X.HRS, createdById: W.owner.id })).rawKey as string; } catch (e) { return `∅${errText(e)}`; } finally { unmute(); } };
 const READ = ["hr.employee.read", "hr.roster.read", "hr.leave.read"], KR: string[] = [], KP: string[] = []; // REST limiter counts per key ⇒ fresh keys per snapshot round
 for (let i = 0; i < 3; i++) { KR.push(await key(`r${i}`, READ)); KP.push(await key(`p${i}`, [...READ, "hr.payroll.read"])); }
 let RD = 0;
 const api = async (raw: string, path: string) => {
    mute();
  try { const res: Response = await M.RT.GET(new Request(`http://x/api/v1/hr${path}`, { headers: { authorization: `Bearer ${raw}` } }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) }); return `${res.status} ${await res.text()}`; } catch (e) { return `THROW ${errText(e)}`; } finally { unmute(); }
 };
 for (const p of ["/units", "/employees?pageSize=50", "/shifts", `/roster?from=${DM1}&to=${D0}`, `/attendance/day?day=${DM1}`, "/leave-policies", "/leaves?status=PENDING", `/leave-balances?year=${YEAR}`,
  ...[E.a1!, E.bNow!, E.c1!].flatMap((e) => [`/employees/${e.id}`, `/employees/${e.id}/payslips?taxYear=${PY}`, `/payslips/${runPaid}/${e.id}`]), ...IDS.map((r) => `/reports/${r}?period=${per(r)}`)])
  cov.push(["D5", `api.read${p.slice(0, 40)}`, () => api(KR[RD]!, p)]);
 for (const vn of ["hrAdmin", "mgrU1", "emp"]) {
  const v = vOf((W as Any)[vn]);
  for (const e of Object.values(E)) cov.push(["D5", `${vn}.profile.${e.key}`, () => q("priv", "loadEmployeeProfileForViewer", v, e.id)]);
  cov.push(["D5", `${vn}.time`, () => load(v, "time", MONTH)]);
 }
 const pos: Cov[] = [["D6", "owner.csv", () => exp(VO, "payroll-month", "CSV", PERIOD)], ["D6", "owner.page", () => pageTxt(W.owner)], ["D6", "owner.preview", () => q("payroll", "previewPayrollRunV2", VO, { runId: runPaid })], ["D6", "api.pay", () => api(KP[RD]!, `/reports/payroll-month?period=${PERIOD}`)]];
 const allC = [...cov, ...pos];
 const snap = async () => { const m = new Map<string, string>(); for (const [, n, f] of allC) m.set(n, digest(await f())); return m; };
 const s1 = await snap();
 RD = 1;
 const s2 = await snap(), unstable = allC.filter(([, n]) => s1.get(n) !== s2.get(n)).map(([, n]) => n);
 chk("D0", !unstable.length, `${allC.length} stable`, unstable.slice(0, 8).join(",") || `${allC.length} stable`);
 for (const k of OUT) {
  const e = E[k]!, w = { employeeId: e.id }, x2 = { amountSatang: { multiply: 2 } };
  await P.hrSalaryProfile.updateMany({ where: w, data: e.pay === "HOURLY" ? { hourlyRateSatang: e.rate * 2 } : { baseSalarySatang: e.base * 2 } });
  for (const it of (await P.hrPayrollItem.findMany({ where: w })) as Any[]) {
   const sj = typeof it.snapshotJson?.baseSalarySatang === "number" ? { ...it.snapshotJson, baseSalarySatang: it.snapshotJson.baseSalarySatang * 2 } : it.snapshotJson;
   await P.hrPayrollItem.update({ where: { id: it.id }, data: { ...Object.fromEntries(["gross", "net", "ssoBase", "ssoEmployee", "ssoEmployer", "wht", "add", "deduct"].map((f) => [`${f}Satang`, it[`${f}Satang`] * 2])), snapshotJson: sj } });
  }
  await P.hrPayAdjustment.updateMany({ where: w, data: x2 });
  await P.hrOtRequest.updateMany({ where: { ...w, amountSatang: { not: null } }, data: x2 });
  await P.hrStockCharge.updateMany({ where: w, data: x2 });
 }
 await retotal(runPaid);
 await retotal(runDraft);
 RD = 2;
 const s3 = await snap();
 for (const g of ["D1", "D2", "D3", "D4", "D5"]) { const l = cov.filter(([gg]) => gg === g), c = l.filter(([, n]) => s1.get(n) !== s3.get(n)).map(([, n]) => n); chk(g, !c.length, `${l.length} identical`, c.length ? `${c.length}/${l.length}: ${c.slice(0, 8).join(",")}` : `${l.length} identical`); }
 const same = pos.filter(([, n]) => s1.get(n) === s3.get(n)).map(([, n]) => n);
 chk("D6", !same.length, "", same.join(",") || "all changed");
}
{
 const v = LIM.payU1m, det = await q("leave", "leaveDetail", v, X.leaveB), lv = await q("leave", "decideLeaveAs", v, X.leaveB, "REJECTED"), ot = await q("ot", "decideOtRequest", v, X.otB, "REJECTED", { now: new Date() });
 const st = canon({ l: (await P.hrLeave.findUnique({ where: { id: X.leaveB } }))?.status, o: (await P.hrOtRequest.findUnique({ where: { id: X.otB } }))?.status }), free = !payOf(E.bNow!).some((s) => (T(det) + T(lv) + T(ot)).includes(s));
 chk("E2", det?.ok === true && lv?.ok === true && ot?.ok === true && st === canon({ l: "REJECTED", o: "REJECTED" }) && free, "", `${det?.ok} ${short(lv, 40)} ${short(ot, 40)} ${st} free=${free}`);
}
{
 const w1: string[] = [], w2: string[] = [], w3: string[] = [], tgt = E.c1!.id;
 const nameNow = async () => (await P.hrEmployee.findUnique({ where: { id: tgt }, select: { name: true } }))?.name, orig = await nameNow(), cnt = () => P.hrEmployee.count({ where: { systemId: X.HRS } });
 const why = (r: Any) => (r && typeof r === "object" ? String(r.reason ?? r.__throw ?? r.message ?? "") : String(r ?? ""));
 for (const [cls, ch] of BAD_SAMPLES) {
  const nm = `QCbad${cls}${ch}X${tag}`, n0 = await cnt(), c = await q("svc", "createEmployee", { name: nm }), created = (await cnt()) !== n0;
  const u = await q("svc", "updateEmployee", tgt, { name: nm }), nu = await nameNow(), s = await q("svc", "saveEmployeeProfile", tgt, { name: nm }), ns = await nameNow();
  if (nu !== orig || ns !== orig) await P.hrEmployee.update({ where: { id: tgt }, data: { name: orig } });
  if (created || nu !== orig || ns !== orig || u?.ok !== false || s?.ok !== false) w1.push(`${cls}:${created ? "C" : ""}${nu !== orig || u?.ok !== false ? "U" : ""}${ns !== orig || s?.ok !== false ? "S" : ""}`);
  for (const [p, r] of [["C", c], ["U", u], ["S", s]] as [string, Any][]) { const t = why(r); if ((p === "C" && created) || !t || BAD_RE.test(t) || t.includes("QCbad") || t.includes(tag)) w2.push(`${cls}.${p}`); }
 }
 for (const g of GOOD_NAMES) {
  const nm = `${g} ${tag}`, c = await q("svc", "createEmployee", { name: nm }), u = await q("svc", "updateEmployee", tgt, { name: nm }), ok1 = (await nameNow()) === nm;
  const s = await q("svc", "saveEmployeeProfile", tgt, { name: `${nm}.` }), ok2 = (await nameNow()) === `${nm}.`;
  await P.hrEmployee.update({ where: { id: tgt }, data: { name: orig } });
  if (!c?.id || u?.ok !== true || !ok1 || s?.ok !== true || !ok2) w3.push(g);
 }
 chk("W1", !w1.length, "", L(w1));
 chk("W2", !w2.length, "", L(w2));
 chk("W3", !w3.length, "", L(w3));
 for (const [cls, ch] of BAD_SAMPLES.filter(([c]) => ["C0-BEL", "RLO", "LRI", "ZWSP", "LS", "BOM"].includes(c))) { // W6 (R10) booking staff path
  await call(M.booking, "createStaff", { tenantId: X.TA, unitId: U1, name: `QCbk${cls}${ch}Y${tag}` });
  await P.bookingStaff.create({ data: { tenantId: X.TA, unitId: U1, name: `QCbl${cls}${ch}Z${tag}` } }).catch(() => undefined);
 }
 await call(M.booking, "linkStaffToHr", { tenantId: X.TA, unitId: U1 });
 const made = (await P.hrEmployee.findMany({ where: { tenantId: X.TA, OR: [{ name: { contains: "QCbk" } }, { name: { contains: "QCbl" } }] }, select: { name: true } })) as Any[];
 const dirty = made.filter((m) => BAD_RE.test(m.name)).map((m) => m.name.slice(0, 7));
 chk("W6", !dirty.length, "", dirty.length ? `${dirty.length} dirty: ${[...new Set(dirty)].join(",")}` : `clean (${made.length})`);
 await P.hrEmployee.update({ where: { id: E.a1!.id }, data: { name: `ab\u202ecd\u2066ef\u0007 ${tag}` } }); // rows stored before the rule
 await P.hrEmployee.update({ where: { id: E.c1!.id }, data: { name: `=HYPERLINK("http://evil.invalid","x") ${tag}` } });
 await P.hrEmployee.update({ where: { id: E.c2!.id }, data: { name: `@SUM(A1)\u200b ${tag}` } });
 const w4: string[] = [], w5: string[] = [];
 for (const r of IDS) for (const f of ["CSV", "XLSX"]) {
  const x = await exp(VO, r, f);
  if (!x?.ok) { w4.push(`${r}.${f}:${x?.code ?? short(x, 20)}`); continue; }
  const b = Buffer.from(x.bytes), t = f === "XLSX" ? unzipText(b) : b.toString("utf8");
  if (BAD_RE.test((f === "XLSX" ? t.replace(/«[^»]*»/g, "") : t).replace(/\r?\n/g, "").replace(/^\ufeff/, ""))) w5.push(`${r}.${f}:char`);
  if (f === "CSV" ? t.split(/\r?\n/).some((l) => l.split(",").some(formulaCell)) : /<f>/.test(t) || [...t.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].some((m) => formulaCell(m[1]!))) w5.push(`${r}.${f}:formula`);
 }
 chk("W4", !w4.length, `${IDS.length * 2} ok`, L(w4));
 chk("W5", !w5.length && !w4.length, "", w4.length ? `${w4.length} refused` : L(w5));
}
} catch (e) {
 unmute();
 crashed = errText(e);
 console.log(`🔴 harness error: ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
 unmute();
 try { await sweepTenants(P, fx.tenants); } catch (e) { console.log(`sweep: ${errText(e)}`); }
 await cleanupFx(P, fx, SLUG);
 await P.apiKey?.deleteMany?.({ where: { tenantId: { in: fx.tenants } } }).catch(() => undefined);
 const r1 = await sweepResidue(P, fx.tenants), r2 = await residueOf(P, fx, SLUG, PFX), left = await P.tenant.count({ where: { slug: { startsWith: PFX } } }), net = NET.attempts.filter((a) => !/fetch:\??$/.test(a));
 chk("Z1", !r1.length && !r2.length && left === 0 && !net.length, "", `sweep=${r1.join(",") || "none"} fx=${r2.join(",") || "none"} tenants=${left} outbound=${net.join(",") || 0}`);
 await P.$disconnect?.();
}
process.exit(R.finish({ forced: FORCE, crashed, missing: [] }));
