// QC — HR PRIV-2 "one pay scope: borrowing never widens pay" (fix ticket after the H5.2 privacy hunt F1–F5)
//      brief ledger/hr-briefs/hr-brief-PRIV-2.md · notes ledger/wo-notes/hr-PRIV-2-oracle.md · hunt ledger/wo-notes/hr-H5.2-privacy-hunt.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Pay scope (R1) = the employee's HOME branch is in the viewer's branches (payslip rule H3.8 Q2 = labour rule H4.2 R1) — borrowings never count.
// Fixture (tenant qc-hr-priv2-<stamp>): branches U1/U2/U3 · 10 employees (3 home U1 incl. a leaver · 4 home U2 borrowed into U1: started AFTER the pay
//   period / spanning it / ENDED inside it / leaver with open borrowing · U2 · U3 · no branch) · sentinels in every sensitive field · PAID v1 run of PERIOD +
//   DRAFT run of this month · pending bonus adjustments · roster/punch/leave/OT for the borrowed employee.
// Viewers: OWNER · payAll (STAFF * + pay keys) · payU1s (STAFF [U1] + hr.payroll.read) · payU1m (MANAGER [U1] + all pay keys + leave keys) ·
//   hrAdmin (STAFF * + hr.employee.create) · mgrU1 (MANAGER [U1], no pay) · emp (STAFF, linked to a1) · API keys hr-read / hr-payroll-read · AI actors.
// SKIP while scope.ts has no "HR PRIV-2" marker (QC_FORCE=1 runs) · --list prints the registry
// Base for statics = QC_PRIV2_BASE or the ticket base 60659e7c0 (must be an ancestor of HEAD — in-base guard S6)
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-priv-2.mts
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Any, type Def, ROOT, rd, short, errText, srt, canon, sha, commitInBase, changedVsBase, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, addDay, dbDate,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, srcFiles,
} from "./qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue } from "./qc-hr-h4.3-lib.mjs";
import { v1Item } from "./qc-hr-h3.8-lib.mjs";
import { unzipText, propsText, textOfAny, digest, stableText, BAD_SAMPLES, BAD_RE, GOOD_NAMES, formulaCell, changedFiles, unmarkedHunks, code, bodyOf, fileAt } from "./qc-hr-priv-2-lib.mjs";

const SUITE = "qc-hr-priv-2";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-priv2-";
const TICKET_BASE = "60659e7c0c93e858a6e4a38abd9463c9c5eeedef";
const BASE = process.env.QC_PRIV2_BASE || TICKET_BASE;
const H = "src/lib/modules/hr/";
const F = {
  scope: `${H}scope.ts`, priv: `${H}privacy.ts`, slip: `${H}payslip.ts`, labor: `${H}labor.ts`, rep: `${H}reports.ts`, repRules: `${H}reports-rules.ts`, payroll: `${H}payroll.ts`,
  payUi: `${H}payroll-ui.tsx`, runUi: `${H}payroll-run-ui.tsx`, svc: `${H}service.ts`, ap: `${H}attendance-pay.ts`, acts: `${H}payroll-actions.ts`, bank: `${H}bank-files/service.ts`,
  fil: `${H}filings/service.ts`, keys: `${H}api/keys.ts`,
};
const PAY_SCOPE_EXCLUDED_TEXT = "ไม่รวมพนักงานที่คุณไม่มีสิทธิ์ดูค่าจ้าง {n} คน";
const T_RUN_ALL = "รอบจ่ายเงินเดือนครอบคลุมทุกสาขา — ต้องเป็นผู้ดูแลทุกสาขาจึงทำรายการได้";
/** files the builder may change — only through hunks marked "HR PRIV-2 ▸ … ◂" (S5) */
const MARKED = [F.scope, F.priv, `${H}privacy-shared.ts`, F.slip, F.labor, F.rep, F.repRules, F.payroll, F.payUi, F.runUi, F.svc, `${H}actions.ts`, F.ap, `${H}reports-ui.tsx`, `${H}inbox.ts`];
const HR_ALL = srcFiles("src/lib/modules/hr");
/** frozen (S4): no byte may change */
const FROZEN = [
  "prisma", "package.json", "src/lib/core", "src/lib/ai", `${H}api`, `${H}filings`, `${H}bank-files`, "scripts/qc-hr-lib.mts", "scripts/qc-hr-h4.3-lib.mts", "scripts/qc-hr-h3.8-lib.mts", "scripts/qc-hf-hr-privacy.mts",
  ...HR_ALL.filter((f) => /\/(payroll-rules|payroll-run-rules|payroll-rules-v2|payslip-rules|labor-rules|roster[^/]*|judge[^/]*|leave[^/]*|ot[^/]*|inbox-[^/]*|swap[^/]*|correction[^/]*|lifecycle[^/]*|self[^/]*|clock[^/]*|pin|work-entries[^/]*|settings[^/]*|law[^/]*|ai[^/]*|payroll-opening[^/]*|stock-charge[^/]*|line-[^/]*)\.tsx?$/.test(f)),
  ...srcFiles("scripts").filter((f) => /\/qc-hr-h\d[^/]*\.mts$/.test(f)),
];

const CHECKS: Def[] = [
  // ── statics ──
  ["S1", "R1", "CRITICAL", "RED", "[static] scope.ts exports pure inPayScope(scope, homeUnitId) + payScopeWhere(scope) (no borrowing term) + PAY_SCOPE_EXCLUDED_TEXT = the ruled Thai note · marked HR PRIV-2"],
  ["S2", "R1", "CRITICAL", "RED", "[static] ONE helper: privacy (profile + loadPayslipForViewer) · payslip homeInScope · labor sees · payroll previewPayrollRunV2 · attendance-pay covers · reports money rows · payroll-ui + payroll-run-ui note use it — no second home-only predicate, no employeeInScope/unitWhere on a pay path"],
  ["S3", "R4", "CRITICAL", "GREEN", "[static] [control] every run action (create/approve/markPaid/reverse/deleteDraft/recompute v1 · create/recompute/approve/pay/reverse v2) calls assertRunAllBranches · document gates (bank/filings/certs) need an all-branch viewer"],
  ["S4", "§files", "MAJOR", "GREEN", "[static] [control] frozen files unchanged vs ticket base (prisma · core · ai · hr/api · filings · bank-files · non-pay HR modules · older oracles + libs · package.json) · payroll-rules sha"],
  ["S5", "§files", "MAJOR", "GREEN", "[static] every changed src file is in the allowed list (or a new hr file whose header says HR PRIV-2) · every hunk of an allowed file is marked HR PRIV-2 ▸ … ◂ · no other ticket's marker removed"],
  ["S6", "§base", "MAJOR", "GREEN", "[static] [control] in-base guard: ticket base is an ancestor of HEAD · oracle + lib + brief present"],
  ["S7", "R5", "MAJOR", "RED", "[static] export refusals never interpolate employee names: reports.ts has no {names} replace · reports-rules formula/encoding texts carry no {names}"],
  // ── pure ──
  ["P1", "R1", "CRITICAL", "RED", "[pure] inPayScope truth table: OWNER/*/[] ⇒ true for every home incl. null · [U1] ⇒ U1 true · U2/U3/null false · payScopeWhere([U1]) has no `units` term · payScopeWhere([]) matches nothing · '*' ⇒ {}"],
  // ── R1(a) profile ──
  ["A1", "R1a", "CRITICAL", "RED", "[db] 🔴 F1: payU1s + payU1m open the profile of each borrowed employee (started-after · spanning · leaver-with-open-borrowing) WITHOUT nationalId/SSO/house-reg/bank/payType keys or sentinels · docs [] · canSeeSensitive false"],
  ["A2", "R1a", "CRITICAL", "RED", "[db] borrowed employee's profile for payU1m is byte-identical to mgrU1's (manager without payroll) — same DTO, same docs, same borrowings"],
  ["A3", "R1a", "CRITICAL", "GREEN", "[db] [control] payU1s sees every sensitive sentinel of a1/a2/aLeft (home U1 incl. the leaver) · OWNER + payAll see them for borrowed bNow"],
  ["A4", "R1a", "MAJOR", "RED", "[db] latent twin: loadPayslipForViewer(payU1s, PAID run, bNow/bSpan) = null · a1 = slip (control inside)"],
  ["A5", "R1a", "MAJOR", "GREEN", "[db] [control] refusal parity: payU1s profile of c2 (U3) / cNo (no branch) / unknown id = null each · loadPayslipForViewer same"],
  ["A6", "R6", "MAJOR", "RED", "[db] touched readers re-read the membership: payU1s object kept after its DB row lost hr.payroll.read ⇒ a1 profile without sensitive data · loadPayslipForViewer null; viewer object forged to ['*'] while DB says [U1] ⇒ bNow without sensitive data"],
  // ── R1(b) reports ──
  ["B1", "R1b", "CRITICAL", "RED", "[db] 🔴 F2: payU1s + payU1m loadReport payroll-month · payroll-year · tax-month · tax-year · wages · register (PERIOD): rows = exactly the pay-scope people with a figure (a1,a2,aLeft ⊆) — no bNow/bSpan/bLeft row"],
  ["B2", "R1b", "CRITICAL", "RED", "[db] 🔴 F2: same 6 reports exported CSV + XLSX for payU1s/payU1m: no borrowed name, national id, slip amount or rate in the bytes"],
  ["B3", "R1b", "MAJOR", "RED", "[db] OT report (money columns for a payroll viewer) for payU1m: no borrowed row on page/CSV/XLSX"],
  ["B4", "R1b", "CRITICAL", "GREEN", "[db] [control] OWNER + payAll payroll-month/tax-month/register include bNow + bSpan + bLeft rows · payU1s includes aLeft (home-U1 leaver) · bEnded (borrowing ended) absent for payU1s"],
  ["B5", "R1b", "MAJOR", "GREEN", "[db] [control] money totals of every payU1s money report = Σ of its own rows (H3.9) · opening YTD / salary-cert / filing / bank previews refuse payU1s + payU1m (all-branch gate) and show bNow to payAll"],
  // ── R1(c) payroll page / run ──
  ["C1", "R1c", "CRITICAL", "RED", "[page] 🔴 F3: PayrollSection rendered for payU1m (HTML + every prop handed down): no borrowed / other-branch name, salary, rate, item or adjustment amount"],
  ["C2", "R1c", "CRITICAL", "RED", "[page] 🔴 F3: no whole-run total (gross/net/SSO/WHT) nor whole-run headcount of either run in HTML or props · the PAID run shows Σ of in-scope items + the note with N = hidden count for each run"],
  ["C3", "R1c", "MAJOR", "GREEN", "[page] [control] OWNER render shows whole-run totals, every name, no exclusion note"],
  ["C5", "R1c", "MAJOR", "RED", "[db] inbox (H2.11) of payU1s/payU1m: no pending pay-adjustment item or amount of an out-of-pay-scope employee (bNow's bonus) · a1's bonus still listed with its amount (control inside)"],
  ["C4", "R1c", "MAJOR", "RED", "[db] previewPayrollRunV2(payU1m): rows ⊆ pay scope · totals = Σ rows · run.excludedHeadcount = hidden count (7 PAID / 6 DRAFT) · OWNER excludedHeadcount 0 + whole-run totals"],
  // ── R2 doubling ──
  ["D0", "R2", "MAJOR", "GREEN", "[R2] [control] stability: every covered payload digests identically twice before the change (else the doubling test proves nothing)"],
  ["D1", "R2", "CRITICAL", "RED", "[R2] doubling every out-of-pay-scope employee's pay changes NO byte of payU1s/payU1m reports (9 × page/CSV/XLSX)"],
  ["D2", "R2", "CRITICAL", "RED", "[R2] … nor of profile / loadPayslipForViewer / slipForViewer / slipHistory for every employee"],
  ["D3", "R2", "CRITICAL", "RED", "[R2] … nor of the payroll page (HTML + props) for payU1m"],
  ["D4", "R2", "MAJOR", "RED", "[R2] … nor of previewPayrollRunV2 · labour day/week/month · attendance-pay + work-entry previews · opening YTD · certs · filings · bank preview · inbox · stock charges · team leave"],
  ["D5", "R2", "MAJOR", "GREEN", "[R2] [regression] … nor of AI tools T1–T4 as payU1s/payU1m · REST key hr-read (13 GETs + reports) · hrAdmin/mgrU1/emp profiles + time report"],
  ["D6", "R2", "MAJOR", "GREEN", "[R2] [positive control] OWNER payroll-month CSV · OWNER page · OWNER previewPayrollRunV2 · REST key hr-payroll-read payroll-month DO change"],
  // ── R3 non-money regression ──
  ["E1", "R3", "CRITICAL", "GREEN", "[db] [regression] payU1m + mgrU1 still see borrowed bNow on listRoster(U1, today) · loadRosterBoard · loadAttendanceBoard(U1, punch day) · time report · bNow's profile opens (non-null)"],
  ["E2", "R3", "MAJOR", "GREEN", "[db] [regression] payU1m still acts on bNow: leaveDetail ok · decideLeaveAs REJECTED ok · decideOtRequest REJECTED ok — results carry no money"],
  // ── R4 ──
  ["G1", "R4", "CRITICAL", "GREEN", "[action] [control] payU1m (all pay keys, [U1]) approve DRAFT / markPaid / reverse PAID / delete + recompute DRAFT / create run (v1 + v2 actions) ⇒ the fixed all-branch text · nothing written"],
  // ── R5 ──
  ["W1", "R5", "MAJOR", "RED", "[db] createEmployee / updateEmployee / saveEmployeeProfile refuse a name with each of 18 bad characters (C0 · DEL · C1 · ALM · ZW · LRM/RLM · LRE..RLO · WJ · isolates · LS/PS · BOM) · nothing stored"],
  ["W2", "R5", "MAJOR", "RED", "[db] those refusals are fixed text: no bad character, no part of the submitted name"],
  ["W3", "R5", "MINOR", "GREEN", "[db] [control] Thai with tone marks · apostrophe · inner hyphen · emoji · digits are accepted by all three write paths"],
  ["W4", "R5", "MAJOR", "RED", "[db] 🔴 F4: with stored names carrying RLO/isolate/BEL and a formula prefix, OWNER exports of all 9 reports (CSV + XLSX) succeed"],
  ["W5", "R5", "MAJOR", "RED", "[db] those exports are sanitised: no bad character, no text cell a spreadsheet reads as a formula, no XLSX <f>"],
  ["Z1", "-", "CRITICAL", "GREEN", "residue: tenants qc-hr-priv2-* gone · no row of ours in any tenantId table · users/sessions gone · no outbound request"],
];
const R = makeRegistry(SUITE, "", CHECKS);
if (ARGV.includes("--list")) {
  R.printList();
  process.exit(0);
}
const { chk } = R;

// ═════════════ statics + pure (no DB) ═════════════
const IN_BASE = commitInBase(BASE, "HEAD");
const scopeSrc = code(F.scope);
const built = rd(F.scope).includes("HR PRIV-2");
if (!built && !FORCE) R.skipExit([`${F.scope} has no HR PRIV-2 marker`]);
if (!built) console.log(`⚠️  QC_FORCE=1 — running on an unbuilt tree (expect RED for the right reason, no crash)`);

function statics(): void {
  // S1
  {
    const ex = (n: string) => new RegExp(`export\\s+(?:function|const)\\s+${n}\\b`).test(scopeSrc);
    const where = bodyOf(scopeSrc, "payScopeWhere");
    const text = /export\s+const\s+PAY_SCOPE_EXCLUDED_TEXT\s*=\s*"([^"]*)"/.exec(scopeSrc)?.[1] ?? "∅";
    const r = { inPayScope: ex("inPayScope"), payScopeWhere: ex("payScopeWhere"), noBorrow: !!where && !/\bunits\b|borrow/i.test(where), text: text === PAY_SCOPE_EXCLUDED_TEXT, marked: built };
    chk("S1", Object.values(r).every(Boolean), "both exported · no borrowing term · note text · marked", `${short(r)} text="${text}"`);
  }
  // S2
  {
    const uses = (src: string) => /\b(inPayScope|payScopeWhere)\b/.test(src);
    const priv = code(F.priv), slip = code(F.slip), lab = code(F.labor), rep = code(F.rep), pay = code(F.payroll), ap = code(F.ap), ui = code(F.payUi), rui = code(F.runUi);
    const prof = bodyOf(priv, "loadEmployeeProfileForViewer"), lps = bodyOf(priv, "loadPayslipForViewer");
    const home = bodyOf(slip, "homeInScope"), cov = bodyOf(ap, "covers"), prev = bodyOf(pay, "previewPayrollRunV2");
    const seesLine = (lab.split("\n").find((l) => /\bsees\s*=/.test(l)) ?? "");
    const r = {
      privProfile: uses(prof),
      privSlip: uses(lps) && !/employeeInScope/.test(lps),
      slipHome: !home || uses(home),
      laborSees: uses(seesLine),
      payrollPreview: uses(prev) && !/unitsOfViewer\(/.test(prev),
      apCovers: !cov || uses(cov),
      reports: uses(rep),
      uiNote: /PAY_SCOPE_EXCLUDED_TEXT/.test(ui) && /PAY_SCOPE_EXCLUDED_TEXT/.test(rui),
      oneDef: HR_ALL.filter((f) => f !== F.scope && /(?:function|const)\s+(inPayScope|payScopeWhere)\b/.test(code(f))).length === 0,
    };
    chk("S2", Object.values(r).every(Boolean), "every pay path on the one helper", short(Object.fromEntries(Object.entries(r).filter(([, v]) => !v)), 300) || "all");
  }
  // S3
  {
    const acts = code(F.acts);
    const names = ["createPayrollRunAction", "approvePayrollRunAction", "reverseRunAction", "markPaidAction", "deleteDraftRunAction", "recomputeDraftRunAction", "createPayrollRunV2Action", "recomputeRunV2Action", "approveRunV2Action", "payRunV2Action", "reverseRunV2Action"];
    const miss = names.filter((n) => { const b = bodyOf(acts, n); return !b || !/assertRunAllBranches\(auth\)/.test(b); });
    const bank = bodyOf(code(F.bank), "bankGateOf");
    const fil = bodyOf(code(F.fil), "gate");
    const docs = /isAllBranches\(/.test(bank) && /bankGateOf\(m\)/.test(fil) && /bankGateOf\(/.test(bodyOf(code(F.slip), "certGate"));
    chk("S3", miss.length === 0 && docs, "11 actions guarded · bank/filing/cert gates all-branch", `missing=${miss.join(",") || "none"} docs=${docs}`);
  }
  // S4
  {
    const ch = changedVsBase(BASE, FROZEN);
    const shaOk = sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA;
    chk("S4", ch === "unchanged" && shaOk, "unchanged · sha ok", `${ch.slice(0, 200)} sha=${shaOk}`);
  }
  // S5
  {
    const changed = changedFiles(BASE).filter((f) => f.startsWith("src/"));
    const isNewPriv = (f: string) => f.startsWith(H) && fileAt(BASE, f) === null && /HR PRIV-2/.test(rd(f).split("\n").slice(0, 3).join("\n"));
    const messages = changed.filter((f) => /^src\/messages\/(th|en)\/common\.json$/.test(f));
    const outside = changed.filter((f) => !MARKED.includes(f) && !messages.includes(f) && !isNewPriv(f));
    const bad = unmarkedHunks(BASE, changed.filter((f) => MARKED.includes(f)));
    chk("S5", outside.length === 0 && bad.length === 0, "allowed files only · all hunks marked", `outside=${outside.join(",") || "none"} hunks=${bad.join(",") || "ok"}`);
  }
  // S6
  {
    const files = ["scripts/qc-hr-priv-2.mts", "scripts/qc-hr-priv-2-lib.mts", "ledger/hr-briefs/hr-brief-PRIV-2.md"].every((p) => existsSync(join(ROOT, p)));
    chk("S6", IN_BASE && files, "base ancestor of HEAD · files present", `inBase=${IN_BASE} files=${files} base=${BASE.slice(0, 9)}`);
  }
  // S7
  {
    const rep = code(F.rep), rr = rd(F.repRules);
    const r = { noReplace: !/\{names\}/.test(rep), texts: !/\{names\}/.test(rr) };
    chk("S7", r.noReplace && r.texts, "no {names} anywhere", short(r));
  }
}
statics();

// ═════════════ DB ═════════════
// Next request scope needs a global AsyncLocalStorage BEFORE any next/* module is evaluated (technique of qc-hr-h1.1 / h0.3)
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard();
const { P, coreHash } = await qc4Env(SUITE);
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const M: Record<string, Any> = {};
for (const [k, s] of Object.entries({
  scope: "@/lib/modules/hr/scope", priv: "@/lib/modules/hr/privacy", svc: "@/lib/modules/hr/service", payroll: "@/lib/modules/hr/payroll", slip: "@/lib/modules/hr/payslip", rep: "@/lib/modules/hr/reports",
  RR: "@/lib/modules/hr/reports-rules", labor: "@/lib/modules/hr/labor", ap: "@/lib/modules/hr/attendance-pay", we: "@/lib/modules/hr/work-entries", open: "@/lib/modules/hr/payroll-opening",
  bank: "@/lib/modules/hr/bank-files/service", fil: "@/lib/modules/hr/filings/service", inbox: "@/lib/modules/hr/inbox", stock: "@/lib/modules/hr/stock-charge", leave: "@/lib/modules/hr/leave",
  roster: "@/lib/modules/hr/roster", board: "@/lib/modules/hr/roster-board", judge: "@/lib/modules/hr/judge", ot: "@/lib/modules/hr/ot", ui: "@/lib/modules/hr/payroll-ui", acts: "@/lib/modules/hr/payroll-actions",
  tools: "@/lib/ai/tools", actor: "@/lib/ai/actor", AK: "@/lib/api-keys/service", RT: "@/app/api/v1/hr/[...path]/route", sys: "@/lib/modules/system/service", money: "@/lib/ui/money",
})) M[k] = await imp(s);
const bad = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (bad.length) console.log(`import problems: ${bad.join(" | ")}`);

const REAL = { log: console.log, info: console.info, warn: console.warn, error: console.error };
const mute = () => Object.assign(console, { log: () => {}, info: () => {}, warn: () => {}, error: () => {} });
const unmute = () => Object.assign(console, REAL);
async function call(m: Any, fn: string, ...a: unknown[]): Promise<Any> {
  if (typeof m?.[fn] !== "function") return { __missing: fn };
  mute();
  try { return await m[fn](...a); } catch (e) { return { __throw: errText(e) }; } finally { unmute(); }
}
const okR = (r: Any) => !!r && typeof r === "object" && !("__missing" in r) && !("__throw" in r) && r.ok !== false;

// ── Next request scope (technique of qc-hr-h1.1 / h0.3) ──
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("no Next request scope");
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.142" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
async function renderHtml(node: Any): Promise<string> {
  const server = (await import("react-dom/server" as string)) as Any;
  try {
    return String(server.renderToStaticMarkup(node));
  } catch {
    const st = (await import("react-dom/static" as string)) as Any;
    const { prelude } = await st.prerenderToNodeStream(node);
    let html = "";
    for await (const c of prelude) html += String(c);
    return html;
  }
}
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

// ═════════════ fixture ═════════════
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const D0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const DM1 = addDay(D0, -1);
const MONTH = D0.slice(0, 7);
/** pay period: a closed month that ends ≥ 4 days before today ⇒ a borrowing that starts D0-3 starts AFTER it */
const PERIOD = addDay(D0, -34).slice(0, 7);
const PY = Number(PERIOD.slice(0, 4));
const FIXED_NOW = new Date(`${D0}T05:00:00Z`);
const nidOf = (k: number) => { const b = `1${String(1_000_000_00000 + k * 7919 + (Date.now() % 997) * 13).slice(-11)}`; let s = 0; for (let i = 0; i < 12; i++) s += Number(b[i]) * (13 - i); return b + String((11 - (s % 11)) % 10); };
type Emp = { key: string; id: string; home: string | null; k: number; name: string; nid: string; z: string; base: number; rate: number; gross: number; net: number; pay: "MONTHLY" | "HOURLY" };
const IN_KEYS = ["a1", "a2", "aLeft"];
const BORROWED = ["bNow", "bSpan", "bLeft"];
const OUT_KEYS = ["bNow", "bSpan", "bEnded", "bLeft", "c1", "c2", "cNo"];

async function buildFixture() {
  const TA = await fx.newTenant("", "QC PRIV2 shop");
  const U1 = await fx.newUnit(TA, `QCP2 สาขาหนึ่ง ${tag}`, "u1"), U2 = await fx.newUnit(TA, `QCP2 สาขาสอง ${tag}`, "u2"), U3 = await fx.newUnit(TA, `QCP2 สาขาสาม ${tag}`, "u3");
  const HRS = (await M.sys.createSystem(TA, "HR", `HR ${tag}`)).id as string;
  for (const u of [U1, U2, U3]) await M.sys.linkUnit(TA, HRS, u).catch(() => undefined);
  const ctx = { tenantId: TA, systemId: HRS };
  const FULL_PAY = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.reverse": true };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(TA, t, `QCP2 ${t} ${tag}`, r, ua, p);
  const W = {
    owner: await mk("owner", "OWNER", [], {}),
    payAll: await mk("payall", "STAFF", ["*"], FULL_PAY),
    payU1s: await mk("payu1s", "STAFF", [U1], { "hr.payroll.read": true }),
    payU1m: await mk("payu1m", "MANAGER", [U1], { ...FULL_PAY, "hr.leave.read": true, "hr.leave.decide": true, "hr.payadjust.approve": true }),
    hrAdmin: await mk("hradmin", "STAFF", ["*"], { "hr.employee.create": true }),
    mgrU1: await mk("mgru1", "MANAGER", [U1], {}),
    emp: await mk("emp", "STAFF", [], {}),
  };
  const defs: [string, string | null, "MONTHLY" | "HOURLY", Record<string, Any>][] = [
    ["a1", U1, "MONTHLY", { linkedUserId: W.emp.id }], ["a2", U1, "HOURLY", {}], ["aLeft", U1, "MONTHLY", { status: "ENDED", active: false, endDate: DM1 }],
    ["bNow", U2, "HOURLY", {}], ["bSpan", U2, "MONTHLY", {}], ["bEnded", U2, "MONTHLY", {}], ["bLeft", U2, "MONTHLY", { status: "ENDED", active: false, endDate: DM1 }],
    ["c1", U2, "MONTHLY", {}], ["c2", U3, "HOURLY", {}], ["cNo", null, "MONTHLY", {}],
  ];
  const E: Record<string, Emp> = {};
  let k = 0;
  for (const [key, home, pay, o] of defs) {
    k++;
    const name = `QCP2 ${key} ${tag}`;
    const id = await fx.mkEmp(TA, HRS, name, { code: `P${k}`, startDate: "2025-01-01", position: "บาริสต้า", unitId: home, ...o });
    const z = `z${tag}${key}`;
    const nid = nidOf(k);
    await P.hrEmployee.update({ where: { id }, data: { nationalId: nid, ssoNumber: `${z}SSO`, houseRegAddress: `${z}HOUSE`, bankName: "KBank", bankAccountNo: `${7700000000 + k * 1013}`, bankAccountName: `${z}BANKNAME`, phone: `${z}PHONE`, birthDate: new Date(`198${k % 10}-0${(k % 9) + 1}-1${k % 9}T00:00:00Z`) } });
    await P.hrEmployeeDoc.create({ data: { tenantId: TA, systemId: HRS, employeeId: id, kind: "ID_CARD", title: "บัตร", url: `https://files.invalid/${z}DOC` } });
    const base = 3_000_000 + k * 13_337 + 17, rate = 17_000 + k * 113 + 7;
    await P.hrSalaryProfile.create({ data: { tenantId: TA, systemId: HRS, employeeId: id, payType: pay, baseSalarySatang: pay === "MONTHLY" ? base : 0, hourlyRateSatang: pay === "HOURLY" ? rate : null, ssoEligible: true } });
    const gross = 4_000_000 + k * 21_211 + 919, net = gross - 75_000 - (10_000 + k * 7);
    E[key] = { key, id, home, k, name, nid, z, base, rate, gross, net, pay };
  }
  // borrowings into U1
  const borrow = (e: string, from: string, to: string | null) => P.hrEmployeeUnit.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e]!.id, unitId: U1, fromDate: dbDate(from), toDate: to ? dbDate(to) : null } });
  await borrow("bNow", addDay(D0, -3), null); // started AFTER PERIOD, open
  await borrow("bSpan", addDay(`${PERIOD}-01`, -40), null); // spans PERIOD, open
  await borrow("bEnded", `${PERIOD}-05`, `${PERIOD}-20`); // inside PERIOD, ended
  await borrow("bLeft", `${PERIOD}-01`, null); // leaver, borrowing still open
  // roster today + punches today-1 (bNow borrowed in U1 from D0-3 ⇒ DM1 covered)
  const shift = (u: string, n: string) => P.hrShift.create({ data: { tenantId: TA, systemId: HRS, unitId: u, name: `${n} ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } }).then((s: Any) => s.id as string);
  const SH1 = await shift(U1, "เช้า1");
  for (const day of [D0, DM1]) for (const e of ["a1", "bNow"]) await P.hrRosterEntry.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e]!.id, date: dbDate(day), shiftId: SH1, unitId: U1, startMin: 480, endMin: 1020, breakMin: 60, crossesMidnight: false, published: true, publishedAt: new Date() } });
  const bkk = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+07:00`) + min * 60_000);
  for (const e of ["a1", "bNow"]) for (const [kind, min] of [["IN", 485], ["OUT", 1022]] as const) await P.hrAttendance.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e]!.id, kind, at: bkk(DM1, min), source: "MOBILE" } });
  // leave + OT of bNow (pending, dated inside the open borrowing)
  const pol = (await P.hrLeavePolicy.create({ data: { tenantId: TA, systemId: HRS, category: "PERSONAL", name: `กิจ ${tag}`, quotaDays: 30, allowHalfDay: false, allowHours: false } })).id;
  const leaveB = (await P.hrLeave.create({ data: { tenantId: TA, systemId: HRS, employeeId: E.bNow!.id, policyId: pol, type: "PERSONAL", fromDate: dbDate(addDay(D0, 20)), toDate: dbDate(addDay(D0, 20)), status: "PENDING", reason: "ธุระ", days: 1 } })).id as string;
  const otB = (await P.hrOtRequest.create({ data: { tenantId: TA, systemId: HRS, employeeId: E.bNow!.id, date: dbDate(DM1), startAt: bkk(DM1, 1022), endAt: bkk(DM1, 1082), minutes: 60, timing: "AFTER", reason: "ปิดร้าน", status: "PENDING" } })).id as string;
  // OT approved inside PERIOD (OT report has money columns for payroll viewers): a1 (in scope) · bSpan (borrowed)
  for (const [e, amt] of [["a1", 111_119], ["bSpan", 333_331]] as [string, number][]) await P.hrOtRequest.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e]!.id, date: dbDate(`${PERIOD}-12`), startAt: bkk(`${PERIOD}-12`, 1020), endAt: bkk(`${PERIOD}-12`, 1080), minutes: 60, timing: "AFTER", reason: "สต็อก", status: "APPROVED", amountSatang: amt, settledAt: bkk(`${PERIOD}-13`, 600) } });
  // judged days (time report reads HrAttendanceDay) — a1 + borrowed bNow in U1 on DM1
  for (const e of ["a1", "bNow"]) await P.hrAttendanceDay.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e]!.id, date: dbDate(DM1), slotKey: `qc-${e}`, unitId: U1, startMin: 480, endMin: 1020, status: "ON_TIME", workedMin: 480, judgedAt: new Date() } });
  // PAID run of PERIOD (v1) — every employee · DRAFT run of this month — active employees
  const mkRun = async (periodKey: string, status: string, keys: string[]) => {
    const run = await P.hrPayrollRun.create({ data: { tenantId: TA, systemId: HRS, periodKey, payDate: new Date(`${periodKey}-28T12:00:00+07:00`), status, engineVersion: 1, totalGrossSatang: 0, totalSsoEmployeeSatang: 0, totalSsoEmployerSatang: 0, totalWhtSatang: 0, totalNetSatang: 0, totalAddSatang: 0 } });
    for (const key of keys) {
      const e = E[key]!;
      const wht = 10_000 + e.k * 7;
      await P.hrPayrollItem.create({ data: { tenantId: TA, systemId: HRS, runId: run.id, employeeId: e.id, ...v1Item(e.gross, [], { add: 0, deduct: 0, gross: e.gross, ssoBase: 1_500_000, ee: 75_000, wht }) } });
    }
    await retotal(run.id);
    return run.id as string;
  };
  const runPaid = await mkRun(PERIOD, "PAID", Object.keys(E));
  const runDraft = await mkRun(MONTH, "DRAFT", Object.keys(E).filter((x) => x !== "aLeft" && x !== "bLeft"));
  // pending bonus adjustments (this month) — a1 (in scope) and bNow (borrowed)
  for (const [e, amt] of [["a1", 123_457], ["bNow", 654_321]] as [string, number][]) await P.hrPayAdjustment.create({ data: { tenantId: TA, systemId: HRS, employeeId: E[e]!.id, periodKey: MONTH, kind: "BONUS", amountSatang: amt, status: "PENDING", note: "QC" } });
  return { TA, U1, U2, U3, HRS, ctx, W, E, runPaid, runDraft, leaveB, otB };
}
async function retotal(runId: string): Promise<void> {
  const its = (await P.hrPayrollItem.findMany({ where: { runId } })) as Any[];
  const s = (k: string) => its.reduce((x, i) => x + Number(i[k] ?? 0), 0);
  await P.hrPayrollRun.update({ where: { id: runId }, data: { totalGrossSatang: s("grossSatang"), totalSsoEmployeeSatang: s("ssoEmployeeSatang"), totalSsoEmployerSatang: s("ssoEmployerSatang"), totalWhtSatang: s("whtSatang"), totalNetSatang: s("netSatang"), totalAddSatang: s("addSatang"), totalDeductSatang: s("deductSatang") } });
}

// ═════════════ main ═════════════
let crashed = "";
const vOf = (w: Any) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });
try {
  // P1 pure
  {
    const S = M.scope;
    const has = typeof S?.inPayScope === "function" && typeof S?.payScopeWhere === "function";
    let r: Record<string, boolean> = { has };
    if (has) {
      const sc = (role: string, ua: string[]) => S.hrScopeOf({ role, unitAccess: ua });
      const all = [sc("OWNER", []), sc("STAFF", ["*"]), sc("STAFF", [])];
      const u1 = sc("MANAGER", ["U1"]);
      const w1 = canon(S.payScopeWhere(u1)), w0 = S.payScopeWhere({ unitIds: [] }), wAll = S.payScopeWhere(sc("OWNER", []));
      r = {
        has,
        all: all.every((s: Any) => ["U1", "U2", null].every((h) => S.inPayScope(s, h) === true)),
        u1: S.inPayScope(u1, "U1") === true && S.inPayScope(u1, "U2") === false && S.inPayScope(u1, "U3") === false && S.inPayScope(u1, null) === false && S.inPayScope(u1, undefined) === false,
        whereNoUnits: !/"units"/.test(w1) && /U1/.test(w1),
        whereEmpty: canon(wAll) === "{}" && /"in":\[\]/.test(canon(w0)),
      };
    }
    chk("P1", Object.values(r).every(Boolean), "truth table · where shapes", short(r));
  }

  const X = await buildFixture();
  const { ctx, W, E, U1, runPaid, runDraft } = X;
  const ids = (keys: string[]) => keys.map((k) => E[k]!.id);
  const keyOfId = new Map(Object.values(E).map((e) => [e.id, e.key]));
  const LIM = { payU1s: vOf(W.payU1s), payU1m: vOf(W.payU1m) };
  const money = (sat: number) => (typeof M.money?.formatBaht === "function" ? String(M.money.formatBaht(sat)) : `∅${sat}`);
  const bahtForms = (sat: number) => [String(sat), (sat / 100).toFixed(2), (sat / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })];
  const sensOf = (e: Emp) => [e.nid, `${e.z}SSO`, `${e.z}HOUSE`, `${e.z}BANKNAME`, `${e.z}DOC`];
  const payOf = (e: Emp) => [...bahtForms(e.gross), ...bahtForms(e.net), ...(e.pay === "HOURLY" ? bahtForms(e.rate) : bahtForms(e.base))].filter((s) => s.length >= 5);
  console.log(`fixture ok: PERIOD=${PERIOD} MONTH=${MONTH} employees=${Object.keys(E).length}`);

  // ── A: profile ──
  {
    const prof = async (v: Any, e: string) => call(M.priv, "loadEmployeeProfileForViewer", ctx, v, E[e]!.id);
    const SENS_KEYS = ["nationalId", "ssoNumber", "houseRegAddress", "bankName", "bankAccountNo", "bankAccountName", "payType"];
    const leaky = (r: Any, e: string) => {
      if (!r || r.__throw || r.__missing) return `∅${short(r, 40)}`;
      const keys = SENS_KEYS.filter((k) => r.profile && k in r.profile);
      const t = textOfAny(r);
      const sent = sensOf(E[e]!).filter((s) => t.includes(s));
      return keys.length || sent.length || (r.docs?.length ?? 0) > 0 || r.canSeeSensitive !== false ? `${e}:keys=${keys.join("/")} sent=${sent.length} docs=${r.docs?.length} css=${r.canSeeSensitive}` : "";
    };
    const a1: string[] = [];
    const a2: string[] = [];
    for (const [vn, v] of Object.entries(LIM)) for (const e of BORROWED) {
      const r = await prof(v, e);
      const l = leaky(r, e);
      if (l) a1.push(`${vn}.${l}`);
      if (vn === "payU1m") { const m = await prof(vOf(W.mgrU1), e); if (canon(r) !== canon(m)) a2.push(`${e}${r === null ? "(null)" : ""}`); }
    }
    chk("A1", a1.length === 0, "no sensitive key/sentinel/doc for borrowed", a1.slice(0, 6).join(" | ") || "clean");
    chk("A2", a2.length === 0, "= mgrU1 DTO", a2.length ? `differs: ${a2.join(",")}` : "same");
    const c: string[] = [];
    for (const e of IN_KEYS) { const t = textOfAny(await prof(LIM.payU1s, e)); const miss = sensOf(E[e]!).filter((s) => !t.includes(s)); if (miss.length) c.push(`payU1s.${e} missing ${miss.length}`); }
    for (const w of ["owner", "payAll"]) { const t = textOfAny(await prof(vOf((W as Any)[w]), "bNow")); if (!sensOf(E.bNow!).every((s) => t.includes(s))) c.push(`${w}.bNow missing`); }
    chk("A3", c.length === 0, "home-U1 sensitive visible · owner/payAll see borrowed", c.join(" | ") || "ok");
    const s = { bNow: await call(M.priv, "loadPayslipForViewer", ctx, LIM.payU1s, runPaid, E.bNow!.id), bSpan: await call(M.priv, "loadPayslipForViewer", ctx, LIM.payU1s, runPaid, E.bSpan!.id), a1: await call(M.priv, "loadPayslipForViewer", ctx, LIM.payU1s, runPaid, E.a1!.id) };
    chk("A4", s.bNow === null && s.bSpan === null && !!s.a1?.item, "bNow null · bSpan null · a1 slip", `bNow=${s.bNow === null ? "null" : "SLIP"} bSpan=${s.bSpan === null ? "null" : "SLIP"} a1=${s.a1?.item ? "slip" : short(s.a1, 40)}`);
    const unk = "c" + Math.random().toString(36).slice(2, 12) + "zz9q";
    const par = [await prof(LIM.payU1s, "c2"), await prof(LIM.payU1s, "cNo"), await call(M.priv, "loadEmployeeProfileForViewer", ctx, LIM.payU1s, unk), await call(M.priv, "loadPayslipForViewer", ctx, LIM.payU1s, runPaid, E.c2!.id), await call(M.priv, "loadPayslipForViewer", ctx, LIM.payU1s, runPaid, unk)];
    chk("A5", par.every((x) => x === null), "5 × null", par.map((x) => (x === null ? "null" : short(x, 30))).join(","));
    // A6 stale / forged viewer objects (R6)
    const oldV = LIM.payU1s;
    const forged = { ...oldV, unitAccess: ["*"] };
    const fBorrow = await prof(forged, "bNow");
    await P.membership.updateMany({ where: { tenantId: X.TA, userId: W.payU1s.id }, data: { permissions: {} } });
    let stale: Any = null, staleSlip: Any = "∅";
    try {
      stale = await prof(oldV, "a1");
      staleSlip = await call(M.priv, "loadPayslipForViewer", ctx, oldV, runPaid, E.a1!.id);
    } finally {
      await P.membership.updateMany({ where: { tenantId: X.TA, userId: W.payU1s.id }, data: { permissions: { "hr.payroll.read": true } } });
    }
    const sens = (r: Any, e: string) => sensOf(E[e]!).some((s) => textOfAny(r).includes(s));
    const a6 = { staleProfile: !sens(stale, "a1"), staleSlip: staleSlip === null, forged: !sens(fBorrow, "bNow") };
    chk("A6", Object.values(a6).every(Boolean), "stale ⇒ no pay data · forged ⇒ no borrowed pay data", short(a6));
  }

  // ── B: reports ──
  const IDS: string[] = (M.RR.REPORT_IDS as string[]) ?? [];
  const periodOf = (r: string) => { const k = M.RR.REPORT_CATALOG?.[r]?.period; return k === "year" ? String(PY) : k === "day" ? D0 : PERIOD; };
  const MONEY6 = ["payroll-month", "payroll-year", "tax-month", "tax-year", "wages", "register"];
  {
    const rowsOf = (r: Any) => (Array.isArray(r?.rows) ? r.rows.map((x: Any) => keyOfId.get(x.employeeId) ?? "?") : null);
    const b1: string[] = [], b2: string[] = [], b5: string[] = [];
    for (const [vn, v] of Object.entries(LIM)) for (const rep of MONEY6) {
      const page = await call(M.rep, "loadReport", ctx, v, { report: rep, period: periodOf(rep) });
      const rows = rowsOf(page);
      if (!rows) b1.push(`${vn}.${rep}:${short(page, 50)}`);
      else { const out = rows.filter((k: string) => !IN_KEYS.includes(k)); if (out.length) b1.push(`${vn}.${rep}:${out.join("/")}`); }
      // totals = Σ rows (H3.9 control)
      if (vn === "payU1s" && page?.totals) for (const [col, tot] of Object.entries(page.totals as Record<string, string>)) {
        const num = (s: unknown) => Number(String(s ?? "").replace(/[^\d.-]/g, "")) || 0;
        const sum = (page.rows as Any[]).reduce((x, rw) => x + num(rw.values?.[col]), 0);
        if (tot && /\d/.test(String(tot)) && Math.abs(sum - num(tot)) > 0.001) b5.push(`${rep}.${col}`);
      }
      for (const format of ["CSV", "XLSX"]) {
        const x = await call(M.rep, "exportReport", ctx, v, { report: rep, period: periodOf(rep), format });
        const t = x?.ok ? textOfAny(x.bytes) : "";
        const hits = BORROWED.filter((e) => [E[e]!.name, E[e]!.nid, ...payOf(E[e]!)].some((s) => t.includes(s)));
        if (!x?.ok) b2.push(`${vn}.${rep}.${format}:refused ${short(x?.code ?? x, 20)}`);
        else if (hits.length) b2.push(`${vn}.${rep}.${format}:${hits.join("/")}`);
      }
    }
    chk("B1", b1.length === 0, "rows ⊆ {a1,a2,aLeft}", b1.slice(0, 8).join(" | ") || "clean");
    chk("B2", b2.length === 0, "no borrowed name/id/amount in CSV/XLSX", b2.slice(0, 8).join(" | ") || "clean");
    const b3: string[] = [];
    {
      const page = await call(M.rep, "loadReport", ctx, LIM.payU1m, { report: "ot", period: PERIOD });
      const rows = rowsOf(page) ?? [];
      if (!page?.ok) b3.push(`page:${short(page, 40)}`);
      if (rows.some((k: string) => BORROWED.includes(k))) b3.push(`page:${rows.filter((k: string) => BORROWED.includes(k)).join("/")}`);
      for (const format of ["CSV", "XLSX"]) { const x = await call(M.rep, "exportReport", ctx, LIM.payU1m, { report: "ot", period: PERIOD, format }); const t = x?.ok ? textOfAny(x.bytes) : ""; if (!x?.ok) b3.push(`${format}:refused`); else if (BORROWED.some((e) => t.includes(E[e]!.name))) b3.push(`${format}:borrowed name`); }
    }
    chk("B3", b3.length === 0, "no borrowed row", b3.join(" | ") || "clean");
    const b4: string[] = [];
    for (const w of ["owner", "payAll"]) for (const rep of ["payroll-month", "tax-month", "register"]) { const rows = rowsOf(await call(M.rep, "loadReport", ctx, vOf((W as Any)[w]), { report: rep, period: periodOf(rep) })) ?? []; const miss = BORROWED.filter((e) => !rows.includes(e)); if (miss.length) b4.push(`${w}.${rep} missing ${miss.join("/")}`); }
    { const rows = rowsOf(await call(M.rep, "loadReport", ctx, LIM.payU1s, { report: "payroll-month", period: PERIOD })) ?? []; if (!rows.includes("aLeft")) b4.push("payU1s missing aLeft"); if (rows.includes("bEnded")) b4.push("payU1s has bEnded"); }
    chk("B4", b4.length === 0, "owner/payAll full · aLeft in · bEnded out", b4.join(" | ") || "ok");
    // document previews: refused for the limited viewers, bNow visible to payAll
    const docs = async (v: Any) => ({
      open: await call(M.open, "listOpeningYtd", ctx, v, { taxYear: PY }), certs: await call(M.slip, "listSalaryCertEmployees", ctx, v), fil: await call(M.fil, "listFilingEmployees", ctx, v), bank: await call(M.bank, "previewBankFile", ctx, v, { runId: runPaid, bank: "KBANK", format: "CSV" }),
    });
    const refusedAll = (o: Record<string, Any>) => Object.entries(o).filter(([, r]) => okR(r) && !(r === null)).map(([k]) => k);
    for (const [vn, v] of Object.entries(LIM)) { const ok = refusedAll(await docs(v)); if (ok.length) b5.push(`${vn} opens ${ok.join("/")}`); }
    { const d = await docs(vOf(W.payAll)); const t = textOfAny(d.certs) + textOfAny(d.fil); if (!t.includes(E.bNow!.name)) b5.push(`payAll certs/filings lack bNow (${short(d.certs, 40)})`); }
    chk("B5", b5.length === 0, "Σ rows · previews all-branch only", b5.slice(0, 6).join(" | ") || "ok");
  }

  // ── C: payroll page + run v2 preview ──
  const pagePath = `/app/sys/${X.HRS}/hr/payroll`;
  const renderPage = async (w: Any): Promise<{ html: string; props: string }> => {
    try {
      return await inScope(w.cookie, pagePath, async () => {
        mute();
        try {
          const node = await M.ui.PayrollSection({ systemId: X.HRS });
          return { html: await renderHtml(node), props: propsText(node) };
        } finally { unmute(); }
      });
    } catch (e) {
      return { html: `THROW ${errText(e)}`, props: "" };
    }
  };
  const runTotals = async (runId: string) => (await P.hrPayrollRun.findUnique({ where: { id: runId } })) as Any;
  const itemsOf = async (runId: string) => (await P.hrPayrollItem.findMany({ where: { runId } })) as Any[];
  {
    const pg = await renderPage(W.payU1m);
    const all = pg.html + "\u0001" + pg.props;
    const c1: string[] = [];
    if (pg.html.startsWith("THROW") || pg.html.length < 200) c1.push(`render ${pg.html.slice(0, 100)}`);
    for (const e of OUT_KEYS) { const x = E[e]!; const hits = [x.name, money(x.gross), money(x.net), money(x.pay === "HOURLY" ? x.rate : x.base), String(x.gross), String(x.pay === "HOURLY" ? x.rate : x.base)].filter((s) => all.includes(s)); if (hits.length) c1.push(`${e}:${hits.length}`); }
    if (all.includes(money(654_321)) || all.includes("654321")) c1.push("bNow bonus");
    chk("C1", c1.length === 0, "no out-of-scope name/amount", c1.slice(0, 10).join(" | ") || "clean");
    const c2: string[] = [];
    for (const [rid, label] of [[runPaid, "PAID"], [runDraft, "DRAFT"]] as [string, string][]) {
      const t = await runTotals(rid);
      const its = await itemsOf(rid);
      const shown = its.filter((i) => IN_KEYS.includes(keyOfId.get(i.employeeId) ?? ""));
      for (const [k, v] of Object.entries({ gross: t.totalGrossSatang, net: t.totalNetSatang, sso: t.totalSsoEmployeeSatang, wht: t.totalWhtSatang })) if (all.includes(money(Number(v))) || all.includes(String(v))) c2.push(`${label}.whole.${k}`);
      if (new RegExp(`(^|[^\\d])${its.length} คน`).test(pg.html)) c2.push(`${label}.whole.count`);
      const note = PAY_SCOPE_EXCLUDED_TEXT.replace("{n}", String(its.length - shown.length));
      if (!pg.html.includes(note)) c2.push(`${label}.note(${its.length - shown.length})`);
      if (label === "PAID" && !pg.html.includes(money(shown.reduce((x, i) => x + i.netSatang, 0)))) c2.push("PAID.Σshown.net");
    }
    chk("C2", c2.length === 0, "no whole-run figure · notes · Σ shown", c2.join(" | ") || "ok");
    const po = await renderPage(W.owner);
    const tP = await runTotals(runPaid);
    const c3 = { rendered: !po.html.startsWith("THROW"), total: po.html.includes(money(tP.totalNetSatang)), names: Object.values(E).filter((e) => e.key !== "aLeft" && e.key !== "bLeft").every((e) => po.html.includes(e.name)), noNote: !po.html.includes("ไม่รวมพนักงานที่คุณไม่มีสิทธิ์ดูค่าจ้าง") };
    chk("C3", Object.values(c3).every(Boolean), "owner full page", short(c3));
    const c4: string[] = [];
    for (const [rid, hidden] of [[runPaid, 7], [runDraft, 6]] as [string, number][]) {
      const pv = await call(M.payroll, "previewPayrollRunV2", ctx, LIM.payU1m, { runId: rid });
      if (!pv?.ok) { c4.push(`${hidden}:${short(pv, 40)}`); continue; }
      const out = (pv.rows as Any[]).map((r) => keyOfId.get(r.employeeId) ?? "?").filter((k) => !IN_KEYS.includes(k));
      if (out.length) c4.push(`rows ${out.join("/")}`);
      const sum = (pv.rows as Any[]).reduce((x, r) => x + r.netSatang, 0);
      if (pv.run?.totals?.netSatang !== sum) c4.push(`totals ${pv.run?.totals?.netSatang}≠${sum}`);
      if (pv.run?.excludedHeadcount !== hidden) c4.push(`excluded=${pv.run?.excludedHeadcount}≠${hidden}`);
      const po2 = await call(M.payroll, "previewPayrollRunV2", ctx, vOf(W.owner), { runId: rid });
      const tt = await runTotals(rid);
      if (po2?.run?.excludedHeadcount !== 0 || po2?.run?.totals?.netSatang !== tt.totalNetSatang) c4.push(`owner excluded=${po2?.run?.excludedHeadcount} net=${po2?.run?.totals?.netSatang === tt.totalNetSatang}`);
    }
    // C5 inbox pay items
    const c5: string[] = [];
    for (const [vn, v] of Object.entries(LIM)) {
      const ib = await call(M.inbox, "listInbox", ctx, v, {});
      const t = textOfAny(ib);
      if (!okR(ib)) { c5.push(`${vn}:${short(ib, 40)}`); continue; }
      if (t.includes("654321") || t.includes(money(654_321))) c5.push(`${vn}:bNow bonus`);
      if (vn === "payU1m" && !t.includes("123457")) c5.push(`${vn}:a1 bonus missing`);
    }
    chk("C5", c5.length === 0, "no out-of-scope pay item · own one listed", c5.join(" | ") || "ok");
    chk("C4", c4.length === 0, "rows ⊆ scope · Σ · excludedHeadcount", c4.join(" | ") || "ok");
  }

  // ── E1: R3 reads (before any write) ──
  {
    const e1: string[] = [];
    const has = (r: Any, who: string) => textOfAny(r).includes(E.bNow!.id) || textOfAny(r).includes(E.bNow!.name) ? "" : who;
    for (const [vn, w] of [["payU1m", W.payU1m], ["mgrU1", W.mgrU1]] as [string, Any][]) {
      const v = vOf(w);
      const parts = [
        has(await call(M.roster, "listRoster", ctx, v, { from: D0, to: D0, unitId: U1 }), "roster"),
        has(await call(M.board, "loadRosterBoard", ctx, v, { week: D0, unit: U1 }), "board"),
        has(await call(M.judge, "loadAttendanceBoard", ctx, v, { day: DM1, unit: U1 }), "attendance"),
        has(await call(M.rep, "loadReport", ctx, v, { report: "time", period: DM1.slice(0, 7) }), "time"),
        (await call(M.priv, "loadEmployeeProfileForViewer", ctx, v, E.bNow!.id))?.profile ? "" : "profile",
      ].filter(Boolean);
      if (parts.length) e1.push(`${vn}:${parts.join("/")}`);
    }
    chk("E1", e1.length === 0, "borrowed bNow visible on every non-money surface", e1.join(" | ") || "ok");
  }

  // ── G1: R4 run actions as the limited payroll viewer ──
  {
    const inAct = async (fn: () => Promise<unknown>) => { try { const v = await inScope(W.payU1m.cookie, pagePath, async () => { mute(); try { return await fn(); } finally { unmute(); } }); return textOfAny(v); } catch (e) { return e instanceof Error ? e.message : String(e); } };
    const A = M.acts;
    const before = { runs: await P.hrPayrollRun.count({ where: { systemId: X.HRS } }), paid: (await runTotals(runPaid)).status, draft: (await runTotals(runDraft)).status };
    const dI = await P.hrPayrollItem.count({ where: { runId: runDraft } });
    const tD = await runTotals(runDraft);
    const nextP = addDay(`${MONTH}-28`, 10).slice(0, 7);
    const out: Record<string, string> = {
      approve: await inAct(() => A.approvePayrollRunAction(fd({ systemId: X.HRS, runId: runDraft, expectNet: String(tD.totalNetSatang), expectItems: String(dI) }))),
      markPaid: await inAct(() => A.markPaidAction(fd({ systemId: X.HRS, runId: runDraft }))),
      reverse: await inAct(() => A.reverseRunAction(fd({ systemId: X.HRS, runId: runPaid, reason: "ข้อสอบ" }))),
      del: await inAct(() => A.deleteDraftRunAction(fd({ systemId: X.HRS, runId: runDraft }))),
      recompute: await inAct(() => A.recomputeDraftRunAction(fd({ systemId: X.HRS, runId: runDraft }))),
      create: await inAct(() => A.createPayrollRunAction(null, fd({ systemId: X.HRS, periodKey: nextP, payDate: `${nextP}-28` }))),
      createV2: await inAct(() => A.createPayrollRunV2Action(fd({ systemId: X.HRS, periodKey: nextP, payDate: `${nextP}-28` }))),
      approveV2: await inAct(() => A.approveRunV2Action(fd({ systemId: X.HRS, runId: runDraft, net: String(tD.totalNetSatang), items: String(dI) }))),
      payV2: await inAct(() => A.payRunV2Action(fd({ systemId: X.HRS, runId: runDraft }))),
      reverseV2: await inAct(() => A.reverseRunV2Action(fd({ systemId: X.HRS, runId: runPaid }))),
      recomputeV2: await inAct(() => A.recomputeRunV2Action(fd({ systemId: X.HRS, runId: runDraft }))),
    };
    const after = { runs: await P.hrPayrollRun.count({ where: { systemId: X.HRS } }), paid: (await runTotals(runPaid)).status, draft: (await runTotals(runDraft)).status };
    const notFixed = Object.entries(out).filter(([, t]) => !t.includes(T_RUN_ALL)).map(([k, t]) => `${k}="${short(t, 50)}"`);
    chk("G1", notFixed.length === 0 && canon(before) === canon(after), "11 × fixed text · nothing written", `${notFixed.join(" ") || "all fixed"} · ${canon(before) === canon(after) ? "unchanged" : `CHANGED ${canon(after)}`}`);
  }

  // ── R2: doubling test ──
  {
    const PAY_V = Object.entries(LIM);
    type Cov = [string, string, () => Promise<unknown>];
    const covered: Cov[] = [];
    // D1 reports
    for (const [vn, v] of PAY_V) for (const rep of IDS) {
      covered.push(["D1", `${vn}.${rep}.page`, () => call(M.rep, "loadReport", ctx, v, { report: rep, period: periodOf(rep) })]);
      for (const format of ["CSV", "XLSX"]) covered.push(["D1", `${vn}.${rep}.${format}`, () => call(M.rep, "exportReport", ctx, v, { report: rep, period: periodOf(rep), format })]);
    }
    // D2 profile + slip readers
    for (const [vn, v] of PAY_V) for (const e of Object.values(E)) {
      covered.push(["D2", `${vn}.profile.${e.key}`, () => call(M.priv, "loadEmployeeProfileForViewer", ctx, v, e.id)]);
      covered.push(["D2", `${vn}.lps.${e.key}`, () => call(M.priv, "loadPayslipForViewer", ctx, v, runPaid, e.id)]);
      covered.push(["D2", `${vn}.slip.${e.key}`, () => call(M.slip, "slipForViewer", ctx, v, { runId: runPaid, employeeId: e.id })]);
      covered.push(["D2", `${vn}.hist.${e.key}`, () => call(M.slip, "slipHistory", ctx, v, { employeeId: e.id, taxYear: PY })]);
    }
    // D3 page
    covered.push(["D3", "payU1m.page", async () => { const p = await renderPage(W.payU1m); return p.html + "\u0002" + p.props; }]);
    // D4 other pay-adjacent readers
    for (const [vn, v] of PAY_V) {
      for (const rid of [runPaid, runDraft]) covered.push(["D4", `${vn}.preview.${rid === runPaid ? "paid" : "draft"}`, () => call(M.payroll, "previewPayrollRunV2", ctx, v, { runId: rid })]);
      covered.push(["D4", `${vn}.laborDay`, () => call(M.labor, "laborDay", ctx, v, { day: D0, unitId: U1 }, { now: FIXED_NOW })]);
      covered.push(["D4", `${vn}.laborDayAll`, () => call(M.labor, "laborDay", ctx, v, { day: DM1 }, { now: FIXED_NOW })]);
      covered.push(["D4", `${vn}.laborMonth`, () => call(M.labor, "laborMonth", ctx, v, { periodKey: PERIOD, unitId: U1 }, { now: FIXED_NOW })]);
      covered.push(["D4", `${vn}.apPreview`, () => call(M.ap, "attendanceDeductionPreview", ctx, v, { periodKey: MONTH })]);
      covered.push(["D4", `${vn}.wePreview`, () => call(M.we, "workEntryPreview", ctx, v, { periodKey: MONTH })]);
      covered.push(["D4", `${vn}.openYtd`, () => call(M.open, "listOpeningYtd", ctx, v, { taxYear: PY })]);
      covered.push(["D4", `${vn}.certs`, () => call(M.slip, "listSalaryCertEmployees", ctx, v)]);
      covered.push(["D4", `${vn}.filings`, () => call(M.fil, "listFilingEmployees", ctx, v)]);
      covered.push(["D4", `${vn}.bank`, () => call(M.bank, "previewBankFile", ctx, v, { runId: runPaid, bank: "KBANK", format: "CSV" })]);
      covered.push(["D4", `${vn}.inbox`, () => call(M.inbox, "listInbox", ctx, v, {})]);
      covered.push(["D4", `${vn}.inboxCounts`, () => call(M.inbox, "inboxCounts", ctx, v)]);
      covered.push(["D4", `${vn}.stock`, () => call(M.stock, "listStockCharges", ctx, v, {})]);
      covered.push(["D4", `${vn}.teamLeave`, () => call(M.leave, "teamLeaveBalances", ctx, v, { year: Number(D0.slice(0, 4)) })]);
    }
    // D5 AI + REST hr-read + non-pay viewers
    const memOf = async (w: Any) => P.membership.findFirst({ where: { tenantId: X.TA, userId: w.id }, select: { role: true, unitAccess: true, permissions: true } });
    for (const vn of ["payU1s", "payU1m"]) {
      const w = (W as Any)[vn];
      const actor = M.actor?.aiMemberActor?.(X.TA, w.id, await memOf(w));
      for (const [tool, args] of [["hr_who_is_on_today", { day: DM1 }], ["hr_late_report", { period: MONTH }], ["hr_labor_percent", { day: D0 }], ["hr_labor_percent", { periodKey: PERIOD }], ["hr_leave_balance", { year: Number(D0.slice(0, 4)) }]] as [string, Any][])
        covered.push(["D5", `${vn}.ai.${tool}.${Object.keys(args)[0]}`, () => call(M.tools, "runTool", { tenantId: X.TA, actor }, tool, args)]);
    }
    const key = async (label: string, scopes: string[]) => { mute(); try { const k = await M.AK.createApiKey({ tenantId: X.TA }, `QCP2 ${label} ${tag}`, { scopes, systemId: X.HRS, createdById: W.owner.id }); return k.rawKey as string; } catch (e) { return `∅${errText(e)}`; } finally { unmute(); } };
    const READ = ["hr.employee.read", "hr.roster.read", "hr.leave.read"];
    // the REST limiter counts per key ⇒ a fresh key pair for every snapshot round (3 rounds)
    const KR = [await key("read1", READ), await key("read2", READ), await key("read3", READ)];
    const KP = [await key("pay1", [...READ, "hr.payroll.read"]), await key("pay2", [...READ, "hr.payroll.read"]), await key("pay3", [...READ, "hr.payroll.read"])];
    let ROUND = 0;
    const api = async (raw: string, path: string) => {
      if (typeof M.RT?.GET !== "function") return { __missing: "route" };
      mute();
      try { const res: Response = await M.RT.GET(new Request(`http://x/api/v1/hr${path}`, { headers: { authorization: `Bearer ${raw}` } }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) }); return `${res.status} ${await res.text()}`; } catch (e) { return `THROW ${errText(e)}`; } finally { unmute(); }
    };
    const PATHS = ["/units", "/employees?pageSize=50", "/shifts", `/roster?from=${DM1}&to=${D0}`, `/attendance/day?day=${DM1}`, "/leave-policies", "/leaves?status=PENDING", `/leave-balances?year=${D0.slice(0, 4)}`,
      ...[E.a1!, E.bNow!, E.c1!].flatMap((e) => [`/employees/${e.id}`, `/employees/${e.id}/payslips?taxYear=${PY}`, `/payslips/${runPaid}/${e.id}`]), ...IDS.map((r) => `/reports/${r}?period=${periodOf(r)}`)];
    for (const p of PATHS) covered.push(["D5", `api.read${p.slice(0, 40)}`, () => api(KR[ROUND]!, p)]);
    for (const vn of ["hrAdmin", "mgrU1", "emp"]) {
      const v = vOf((W as Any)[vn]);
      for (const e of Object.values(E)) covered.push(["D5", `${vn}.profile.${e.key}`, () => call(M.priv, "loadEmployeeProfileForViewer", ctx, v, e.id)]);
      covered.push(["D5", `${vn}.time`, () => call(M.rep, "loadReport", ctx, v, { report: "time", period: MONTH })]);
    }
    // D6 positive controls
    const positive: Cov[] = [
      ["D6", "owner.payroll-month.CSV", () => call(M.rep, "exportReport", ctx, vOf(W.owner), { report: "payroll-month", period: PERIOD, format: "CSV" })],
      ["D6", "owner.page", async () => { const p = await renderPage(W.owner); return p.html + "\u0002" + p.props; }],
      ["D6", "owner.preview", () => call(M.payroll, "previewPayrollRunV2", ctx, vOf(W.owner), { runId: runPaid })],
      ["D6", "api.pay.payroll-month", () => api(KP[ROUND]!, `/reports/payroll-month?period=${PERIOD}`)],
    ];
    const TXT = new Map<string, string[]>();
    const snap = async (list: Cov[]) => { const m = new Map<string, string>(); for (const [, n, f] of list) { const v = await f(); m.set(n, digest(v)); if (process.env.QC_PRIV2_DUMP) TXT.set(n, [...(TXT.get(n) ?? []), stableText(v).slice(0, 4000)]); } return m; };
    const dump = (names: string[]) => { if (!process.env.QC_PRIV2_DUMP) return; writeFileSync(join(ROOT, "scratchpad/priv2/dump.json"), JSON.stringify(Object.fromEntries(names.map((n) => [n, TXT.get(n)])), null, 1)); };
    const all = [...covered, ...positive];
    const s1 = await snap(all);
    ROUND = 1;
    const s2 = await snap(all);
    const unstable = all.filter(([, n]) => s1.get(n) !== s2.get(n)).map(([, n]) => n);
    dump(unstable);
    chk("D0", unstable.length === 0, `${all.length} payloads stable`, unstable.slice(0, 8).join(",") || `${all.length} stable`);
    // double the pay of every out-of-pay-scope employee
    for (const k of OUT_KEYS) {
      const e = E[k]!;
      await P.hrSalaryProfile.updateMany({ where: { employeeId: e.id }, data: e.pay === "HOURLY" ? { hourlyRateSatang: e.rate * 2 } : { baseSalarySatang: e.base * 2 } });
      for (const it of (await P.hrPayrollItem.findMany({ where: { employeeId: e.id } })) as Any[]) {
        const sj = it.snapshotJson && typeof it.snapshotJson === "object" ? { ...it.snapshotJson, ...(typeof it.snapshotJson.baseSalarySatang === "number" ? { baseSalarySatang: it.snapshotJson.baseSalarySatang * 2 } : {}) } : it.snapshotJson;
        await P.hrPayrollItem.update({ where: { id: it.id }, data: { grossSatang: it.grossSatang * 2, netSatang: it.netSatang * 2, ssoBaseSatang: it.ssoBaseSatang * 2, ssoEmployeeSatang: it.ssoEmployeeSatang * 2, ssoEmployerSatang: it.ssoEmployerSatang * 2, whtSatang: it.whtSatang * 2, addSatang: it.addSatang * 2, deductSatang: it.deductSatang * 2, snapshotJson: sj } });
      }
      await P.hrPayAdjustment.updateMany({ where: { employeeId: e.id }, data: { amountSatang: { multiply: 2 } } });
      await P.hrOtRequest.updateMany({ where: { employeeId: e.id, amountSatang: { not: null } }, data: { amountSatang: { multiply: 2 } } });
    }
    await retotal(runPaid);
    await retotal(runDraft);
    ROUND = 2;
    const s3 = await snap(all);
    const changed = (g: string) => covered.filter(([gg, n]) => gg === g && s1.get(n) !== s3.get(n)).map(([, n]) => n);
    for (const g of ["D1", "D2", "D3", "D4", "D5"]) { const c = changed(g); const n = covered.filter(([gg]) => gg === g).length; chk(g, c.length === 0, `${n} payloads byte-identical`, c.length ? `${c.length}/${n} changed: ${c.slice(0, 8).join(",")}` : `${n} identical`); }
    if (!unstable.length) dump(covered.filter(([, n]) => s1.get(n) !== s3.get(n)).map(([, n]) => n));
    const same = positive.filter(([, n]) => s1.get(n) === s3.get(n)).map(([, n]) => n);
    chk("D6", same.length === 0, "4 owner/pay-key payloads changed", same.length ? `unchanged: ${same.join(",")}` : "all changed");
  }

  // ── E2: R3 actions on the borrowed employee ──
  {
    const v = LIM.payU1m;
    const det = await call(M.leave, "leaveDetail", ctx, v, X.leaveB);
    const lv = await call(M.leave, "decideLeaveAs", ctx, v, X.leaveB, "REJECTED");
    const ot = await call(M.ot, "decideOtRequest", ctx, v, X.otB, "REJECTED", { now: new Date() });
    const st = { leave: (await P.hrLeave.findUnique({ where: { id: X.leaveB } }))?.status, ot: (await P.hrOtRequest.findUnique({ where: { id: X.otB } }))?.status };
    const moneyFree = !payOf(E.bNow!).some((s) => (textOfAny(det) + textOfAny(lv) + textOfAny(ot)).includes(s));
    chk("E2", det?.ok === true && lv?.ok === true && ot?.ok === true && st.leave === "REJECTED" && st.ot === "REJECTED" && moneyFree, "detail ok · 2 × REJECTED · no money", `detail=${det?.ok} leave=${short(lv, 50)} ot=${short(ot, 50)} st=${short(st)} moneyFree=${moneyFree}`);
  }

  // ── W: R5 names ──
  {
    const w1: string[] = [], w2: string[] = [], w3: string[] = [];
    const target = E.c1!.id;
    const nameNow = async () => (await P.hrEmployee.findUnique({ where: { id: target }, select: { name: true } }))?.name;
    const orig = await nameNow();
    const reasonOf = (r: Any) => (r && typeof r === "object" ? String(r.reason ?? r.__throw ?? r.message ?? "") : String(r ?? ""));
    for (const [cls, ch] of BAD_SAMPLES) {
      const nm = `QCbad${cls}${ch}X${tag}`;
      const n0 = await P.hrEmployee.count({ where: { systemId: X.HRS } });
      const c = await call(M.svc, "createEmployee", ctx, { name: nm });
      const n1 = await P.hrEmployee.count({ where: { systemId: X.HRS } });
      const u = await call(M.svc, "updateEmployee", ctx, target, { name: nm });
      const nu = await nameNow();
      const s = await call(M.svc, "saveEmployeeProfile", ctx, target, { name: nm });
      const ns = await nameNow();
      if (nu !== orig || ns !== orig) await P.hrEmployee.update({ where: { id: target }, data: { name: orig } });
      const created = n1 !== n0;
      if (created || nu !== orig || ns !== orig || u?.ok !== false || s?.ok !== false) w1.push(`${cls}:${created ? "C" : ""}${nu !== orig || u?.ok !== false ? "U" : ""}${ns !== orig || s?.ok !== false ? "S" : ""}`);
      for (const [p, r] of [["C", c], ["U", u], ["S", s]] as [string, Any][]) {
        const t = reasonOf(r);
        if (p === "C" && created) { w2.push(`${cls}.C:accepted`); continue; }
        if (!t || BAD_RE.test(t) || t.includes("QCbad") || t.includes(tag)) w2.push(`${cls}.${p}:${t ? "echo/bad" : "no reason"}`);
      }
    }
    for (const g of GOOD_NAMES) {
      const nm = `${g} ${tag}`;
      const c = await call(M.svc, "createEmployee", ctx, { name: nm });
      const u = await call(M.svc, "updateEmployee", ctx, target, { name: nm });
      const ok1 = (await nameNow()) === nm;
      const s = await call(M.svc, "saveEmployeeProfile", ctx, target, { name: `${nm}.` });
      const ok2 = (await nameNow()) === `${nm}.`;
      await P.hrEmployee.update({ where: { id: target }, data: { name: orig } });
      if (!c?.id || u?.ok !== true || !ok1 || s?.ok !== true || !ok2) w3.push(`${g}:${c?.id ? "" : "C"}${u?.ok && ok1 ? "" : "U"}${s?.ok && ok2 ? "" : "S"}`);
    }
    chk("W1", w1.length === 0, "18 × refused by all 3 paths · nothing stored", w1.slice(0, 8).join(" ") || "all refused");
    chk("W2", w2.length === 0, "fixed reason · no echo", w2.slice(0, 8).join(" ") || "clean");
    chk("W3", w3.length === 0, "good names accepted", w3.join(" ") || "ok");
    // stored bad names (rows written before the rule) — exports must still work, sanitised
    await P.hrEmployee.update({ where: { id: E.a1!.id }, data: { name: `ab\u202ecd\u2066ef\u0007 ${tag}` } });
    await P.hrEmployee.update({ where: { id: E.c1!.id }, data: { name: `=HYPERLINK("http://evil.invalid","x") ${tag}` } });
    await P.hrEmployee.update({ where: { id: E.c2!.id }, data: { name: `@SUM(A1)\u200b ${tag}` } });
    const w4: string[] = [], w5: string[] = [];
    for (const rep of IDS) for (const format of ["CSV", "XLSX"]) {
      const x = await call(M.rep, "exportReport", ctx, vOf(W.owner), { report: rep, period: periodOf(rep), format });
      if (!x?.ok) { w4.push(`${rep}.${format}:${x?.code ?? short(x, 30)}`); if (BAD_RE.test(String(x?.reason ?? ""))) w5.push(`${rep}.${format}:reason`); continue; }
      const buf = Buffer.from(x.bytes);
      const t = format === "XLSX" ? unzipText(buf) : buf.toString("utf8");
      const body = format === "XLSX" ? t.replace(/«[^»]*»/g, "") : t;
      if (BAD_RE.test(body.replace(/\r?\n/g, "").replace(/^\ufeff/, ""))) w5.push(`${rep}.${format}:char`);
      if (format === "CSV" && t.split(/\r?\n/).some((l) => l.split(",").some((c) => formulaCell(c)))) w5.push(`${rep}.CSV:formula`);
      if (format === "XLSX" && (/<f>/.test(t) || [...t.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].some((m) => formulaCell(m[1]!)))) w5.push(`${rep}.XLSX:formula`);
    }
    chk("W4", w4.length === 0, `${IDS.length * 2} exports ok`, w4.slice(0, 8).join(" ") || "all ok");
    chk("W5", w5.length === 0 && w4.length === 0, "no bad char · no formula cell", w4.length ? `${w4.length} exports refused (nothing to inspect)${w5.length ? ` · ${w5.join(" ")}` : ""}` : w5.join(" ") || "clean");
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
  const r1 = await sweepResidue(P, fx.tenants);
  const r2 = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  const left = await P.tenant.count({ where: { slug: { startsWith: SLUG_PREFIX } } });
  chk("Z1", !r1.length && !r2.length && left === 0 && NET.attempts.filter((a) => !/fetch:$|fetch:\?$/.test(a)).length === 0, "no residue · no outbound", `sweep=${r1.join(",") || "none"} fx=${r2.join(",") || "none"} tenants=${left} outbound=${NET.attempts.join(",") || 0}`);
  await P.$disconnect?.();
}
const code_ = R.finish({ forced: FORCE, crashed, missing: [] });
process.exit(code_);
void srt;
