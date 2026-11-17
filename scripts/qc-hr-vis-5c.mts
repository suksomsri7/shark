// QC HR VIS-5c employee register + profile (mockup 02) · number masking · brief hr-brief-VIS-5c.md (+ CONTROLLER RULINGS) · notes hr-VIS-5bc-oracle.md · ⚠️ ORACLE-EDIT only · QC_FORCE=1 · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-vis-5c.mts
// No browser: pages rendered in-process (server components awaited, "use client" components kept with their props = what the browser/RSC receives).
//   Table/card layout per size, sticky footer, fold and clipping are the controller's walk.
import { type Any, type Def, ROOT, rd, errText, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, addDay, dbDate, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, sha, stripComments, importsOf, fileAt } from "./qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue } from "./qc-hr-h4.3-lib.mjs";
import { textOfAny } from "./qc-hr-priv-2-lib.mjs";
import { H, BASE, UI, diffStatics, msgStatics, invHas, invRows, baseIdsGone, pinned, installIntl, loadClientSet, renderPage, CUR, idsWith, elOf, showsNum, attrOf, hrefsIn, queryOf, textOfHtml, isClientFile, type Rendered } from "./qc-hr-vis-5-lib.mjs";

const SUITE = "qc-hr-vis-5c", ARGV = process.argv.slice(2), FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run"), PFX = "qc-hr-vis5c-";
const F = { list: "src/app/app/sys/[id]/hr/employees/page.tsx", prof: "src/app/app/sys/[id]/hr/employees/[employeeId]/page.tsx", form: `${H}EmployeeProfileForm.tsx`, pui: `${H}people-ui.tsx`, prules: `${H}people-rules.ts` };
const PG_LIST = "/app/sys/[id]/hr/employees", PG_PROF = "/app/sys/[id]/hr/employees/[employeeId]";
const NEW_LIST = ["hr-people-add", "hr-people-add-name", "hr-people-tab-*", "hr-people-search", "hr-people-dept", "hr-people-ended", "hr-people-table", "hr-people-row-*", "hr-people-more-*", "hr-people-page-*", "hr-people-panel"];
const NEW_PROF = ["hr-profile-tab-*", "hr-profile-edit", "hr-profile-mask-*", "hr-profile-reveal-*", "hr-profile-connections", "hr-profile-footer"];
const PIN: Record<string, [string, string, string]> = {
 loadEmployeeProfileForViewer: [`${H}privacy.ts`, "f81f520fb7d77683", "PRIV-2"], employeeProfileInputFromForm: [`${H}privacy.ts`, "4881fef53b09c73e", "save"], hrAccessOf: [`${H}privacy.ts`, "f43b250508aacf7a", ""],
 saveEmployeeProfileAction: [`${H}actions.ts`, "a6b692f433368d6c", "action"], createEmployeeAction: [`${H}actions.ts`, "9c1d60297014fae7", "action"] /* HR VIS-5c re-merge ▸ PRIV-3 R12 hrTargetOwned line · was c68d95dd92bd1867 ◂ */, updateEmployeeAction: [`${H}actions.ts`, "6a17e260ed2a0b9c", "action"] /* HR VIS-5c re-merge ▸ PRIV-3 R12 · was 137847337e737078 ◂ */, setWorkScheduleAction: [`${H}actions.ts`, "dddbcec35f25a1bd", "action"], removeEmployeeAction: [`${H}actions.ts`, "522b543a32fb3f5d", "action"] /* HR VIS-5c re-merge ▸ PRIV-3 R12 · was b399879cfad42bc0 ◂ */,
 leaveBalances: [`${H}leave.ts`, "44b7c4aa34a74ca7", ""], cardSubjectOf: [`${H}lifecycle.ts`, "5057bcecdc12fe88", ""], employeeLineStatus: [`${H}line-link.ts`, "6fa7baa0c6e4a7e0", ""], loadLifecycleForViewer: [`${H}lifecycle.ts`, "7bbf9b480808bea4", ""],
 employeesOnLeave: [`${H}service.ts`, "1520032d528518dd", ""], listEmployees: [`${H}service.ts`, "fefee646530f092a", ""], listRemovedEmployees: [`${H}service.ts`, "ef0397108564fb00", ""],
};

const D = (id: string, g: string, sb: string, t: string): Def => [id, g, ({ C: "CRITICAL", M: "MAJOR", m: "MINOR" } as const)[sb[0] as "C"], sb[1] === "R" ? "RED" : "GREEN", t];
const CHECKS: Def[] = [
 D("S1", "§7 §8", "MG", "[static] diff vs merge-base(session/hr): only VIS-5c files + shared lists · VIS-5b-only files refused"),
 D("S2", "§8", "MG", "[static] every hunk of a VIS-5c file adds \"HR VIS-5c\" · ui.tsx hunks only in 432-709 / import block · new files marked in first 3 lines"),
 D("S3", "§8", "CG", "[static] [control] payroll-rules.ts byte-identical · pinned bodies (profile loader · form parser · employee actions · lifecycle/leave/line readers) unchanged"),
 D("S4", "F16.1", "CG", "[static] [control] fitness F16.1 clean"),
 D("S5", "§5", "MR", "[static] hr.people block: th = en keys · right after hr.life · en values have no Thai · no other message key changed · no Thai literal in new JSX/TS"),
 D("S6", "§5", "MR", "[static] inventory rows (wo VIS-5c) for every new id of both pages · hr-profile-unit / -employment-status rows' conditional updated · every hr-people-*/new hr-profile-* id in code has a row"),
 D("S7", "§5", "MG", "[static] [control] every test id of both pages in the base inventory still exists in the source"),
 D("S8", "§5 careless build", "CG", "[static] [control] EmployeeProfileForm <form> tag unchanged + ./privacy-shared import · employees page gains no guard import (PAGE_GUARD_BASELINE) · profile page S-2 shape (one <EmployeeProfileForm …/>, view.* refs, no raw reads) · ui.tsx employees marker kept"),
 D("S9", "§3 §5", "MR", "[static] people-ui.tsx + people-rules.ts exist, neither \"use client\" · people-rules no IO · no money in people-* · ui.tsx exports HrScheduleEditor"),
 D("S10", "§3 §8", "CR", "[pure] mask helpers: 1100000000021 → x-xxxx-xxxxx-02-1 · SSO → xxx-xxx-xx21 · bank → <bank> xxx-x-x4321 · < 4 digits/junk → —"),
 D("R1", "§2 9", "MR", "[db] register table hr-people-table: a row per person with name · code · position · start date"),
 D("R2", "§2 4", "MR", "[db] status tabs (links): rows per tab = data (all · full-time · part-time/daily · probation · ended = removed only) · tab counts shown · counts sum to all"),
 D("R3", "§2 5", "MR", "[db] search box (GET param read from the input): code · phone · part of name → exactly the matching rows"),
 D("R4", "§2 13", "MR", "[db] pagination 20 per page via hr-people-page-* links · pages disjoint · union = all"),
 D("R5", "§2 3 §4", "MR", "[db] + employee hr-people-add · ?add=1 opens the add panel (details open) with hr-people-add-name"),
 D("R6", "§1", "MR", "[db] branch-limited manager: register rows exist and only its scope (home branch + borrowed in)"),
 D("R7", "§1", "CG", "[db] [control] branch-limited manager: no other-branch person in register HTML or client props"),
 D("R8", "5c-2", "CG", "[db] [control] no pay rate / salary figure in the register (owner · HTML + client props)"),
 D("R9", "§2 15", "MR", "[db] ?emp= side panel hr-people-panel = read view of that person (masked numbers only)"),
 D("V1", "5c-1 §3", "CR", "[db] profile default view, entitled viewers (owner · payroll-all · payroll-U1 own branch): only masked ID/SSO/bank strings · no full number / house address in HTML or client props"),
 D("V2", "5c-1 5c-4", "CG", "[db] [control] not entitled today (manager · branch manager · payroll-U1 on a borrowed person): no full number default or ?edit=1 · no mask · no eye"),
 D("V3", "5c-1 Q1", "MR", "[db] eye hr-profile-reveal-* is a link to ?edit=1 (no client reveal) · edit link hr-profile-edit"),
 D("V4", "5c-1", "MG", "[db] [control] ?edit=1 for an entitled viewer: full value in the edit form (as today)"),
 D("V5", "§3 §5", "MR", "[db] EmployeeProfileForm only with ?edit=1 (no viewer gets it in the read view) · edit view has hr-profile-footer + hr-profile-unit"),
 D("V6", "§2 17 24", "MR", "[db] read view: hr-profile-tab-* links (?tab=, one aria-current) · hr-profile-connections"),
 D("V7", "§2 19 23", "MG", "[db] [control] probation banner + onboarding checklist progress 5/7 from lifecycle data (bow)"),
 D("V8", "§5", "MR", "[db] read-view dates: th Buddhist-year formatThaiDateFull · en formatShortDate · no ISO / mm/dd/yyyy / date input"),
 D("V9", "§5 §9", "MR", "[db] en profile + register: hr.people exists · no missing key · no Thai value of hr.people in en HTML"),
 D("Z1", "-", "CG", "residue · outbound"),
];
const R = makeRegistry(SUITE, "", CHECKS);
if (ARGV.includes("--list")) { R.printList(); process.exit(0); }
const { chk } = R;
const all = (r: Record<string, unknown>) => Object.values(r).every((v) => v === true);
const fails = (r: Record<string, unknown>) => Object.entries(r).filter(([, v]) => v !== true).map(([k, v]) => (typeof v === "string" ? `${k}:${v}` : k)).join(",") || "all";
const L = (xs: string[], n = 8) => xs.slice(0, n).join(" | ") || "ok";
const built = rd(F.prules).includes("HR VIS-5c") || rd(F.pui).includes("HR VIS-5c");
if (!built && !FORCE) R.skipExit(["no HR VIS-5c marker in people-rules.ts / people-ui.tsx"]);

// ═════════════ statics ═════════════
{
 const d = diffStatics("5c");
 chk("S1", !d.outside.length, "none outside", `outside=${L(d.outside)} base=${BASE.slice(0, 9)}`);
 chk("S2", !d.bad.length, "all marked", L(d.bad));
 const pins = pinned(PIN), ps = sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA;
 chk("S3", ps && !pins.length, "identical", `payroll-rules=${ps} changed=${L(pins)}`);
 let f161 = "not run", pageGuard: Any = null;
 try { const fit = (await import("./fitness-hr.mjs" as string)) as Any, { hits } = fit.scanF161(ROOT); f161 = hits.length ? hits.slice(0, 4).map((h: Any) => `${h.file}:${h.line} ${h.field}`).join(" | ") : ""; pageGuard = fit.pageGuard(ROOT, `${ROOT}/${F.list}`); } catch (e) { f161 = errText(e); }
 chk("S4", f161 === "", "clean", f161 || "clean");
 const m = msgStatics("5c");
 chk("S5", all(m), "all", fails(m));
 const src = [UI, F.list, F.prof, F.pui, F.form].map(rd).join("\n");
 const inv = [...invHas(NEW_LIST, PG_LIST, "VIS-5c"), ...invHas(NEW_PROF, PG_PROF, "VIS-5c")], missing = [...NEW_LIST, ...NEW_PROF].filter((id) => !src.includes(id.replace(/\*$/, "")));
 const cond = (rows: Any[], id: string) => rows.find((r) => r.page === PG_PROF && r.testid === id)?.conditional ?? "";
 const condMoved = ["hr-profile-unit", "hr-profile-employment-status"].filter((id) => cond(invRows(false), id) === cond(invRows(true), id) || !/edit/i.test(cond(invRows(false), id)));
 const inCode = [...new Set([...src.matchAll(/hr-(people|profile-(tab|edit|mask|reveal|connections|footer))[a-z0-9-]*[a-z0-9-]?(\$\{)?/g)].map((x) => (x[3] ? `${x[0].slice(0, -2)}*` : x[0])))];
 const noRow = inCode.filter((id) => invHas([id], id.startsWith("hr-people") ? PG_LIST : PG_PROF, "VIS-5c").length && !(id.startsWith("hr-people") && !invHas([id], PG_PROF, "VIS-5c").length));
 chk("S6", !inv.length && !missing.length && !condMoved.length && !noRow.length, "rows + code", `noRow=${L(inv, 4)} notInCode=${L(missing, 4)} conditional=${L(condMoved)} codeNoRow=${L(noRow, 3)}`);
 const gone = [...baseIdsGone(PG_LIST), ...baseIdsGone(PG_PROF)];
 chk("S7", !gone.length, "all present", L(gone));
 const formTag = (s: string) => /<form\b[^>]*>/.exec(s)?.[0] ?? "∅", guardImp = (s: string) => importsOf(s).filter((i) => /hr\/(privacy|scope)$/.test(i.spec)).map((i) => i.spec).sort().join();
 const pg = stripComments(rd(F.prof)), forms = pg.match(/<EmployeeProfileForm\b[^>]*\/>/g) ?? [];
 const s8 = { formTag: formTag(rd(F.form)) === formTag(fileAt(BASE, F.form) ?? ""), sharedImp: /from\s+["']\.\/privacy-shared["']/.test(rd(F.form)), noGuardImport: guardImp(rd(F.list)) === guardImp(fileAt(BASE, F.list) ?? "") && pageGuard?.guarded === true, /* HR VIS-5c re-merge ▸ PRIV-3 R1 gated the register page (requireHrPage · row dropped from PAGE_GUARD_BASELINE) ⇒ the page must stay guarded · was guarded === false ◂ */
  oneForm: forms.length === 1 && /systemId=\{id\}\s+emp=\{view\.profile\}\s+canSeeSensitive=\{sensitive\}/.test(forms[0] ?? ""), viewRefs: [...new Set([...pg.matchAll(/\bview\.(\w+)/g)].map((x) => x[1]))].sort().join() === "canSeeSensitive,docs,profile", noRaw: !/getEmployee|tenantDb|hrEmployee|hr\/service/.test(pg), marker: rd(UI).includes("// ───────────── พนักงาน (employees)") };
 chk("S8", all(s8), "all", fails(s8));
 const pr = rd(F.prules), pu = rd(F.pui);
 const s9 = { exist: !!pr && !!pu, notClient: !!pu && !isClientFile(F.pui) && !isClientFile(F.prules), rulesPure: !!pr && importsOf(pr).every((i) => i.type) && !/\bawait\b|prisma|tenantDb|fetch\(/.test(stripComments(pr)), noMoney: !!pu && !/฿|Satang|formatBaht|baseSalary|hourlyRate/.test(stripComments(pr + pu)), scheduleEditor: /export\s+(async\s+)?function\s+HrScheduleEditor\b/.test(rd(UI)) };
 chk("S9", all(s9), "all", fails(s9));
}

// ═════════════ pure: mask helpers (found by behaviour — the brief names formats, not function names) ═════════════
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const NID = "1100000000021", SSO = "1234567821", ACC = "1234564321";
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
{
 const pr = rd(F.prules) ? await imp("@/lib/modules/hr/people-rules") : null, fns = Object.values(pr ?? {}).filter((f) => typeof f === "function") as ((...a: Any[]) => Any)[];
 const tryF = (f: (...a: Any[]) => Any, ...a: Any[]) => { try { return f(...a); } catch { return undefined; } };
 const nid = fns.find((f) => tryF(f, NID) === "x-xxxx-xxxxx-02-1"), sso = fns.find((f) => tryF(f, SSO) === "xxx-xxx-xx21");
 const bankCall = (f: (...a: Any[]) => Any, b: string, a: string) => [tryF(f, b, a), tryF(f, { bankName: b, bankAccountNo: a })].find((x) => typeof x === "string" && x.includes("x"));
 const bank = fns.find((f) => bankCall(f, "KBank", ACC) === "KBank xxx-x-x4321");
 const junk = ["12", "abc", "", null, undefined, "12-3"];
 const r = { nid: !!nid, sso: !!sso, bank: !!bank, nidDash: !!nid && tryF(nid, "1-1000-00000-02-1") === "x-xxxx-xxxxx-02-1", nidJunk: !!nid && junk.every((j) => tryF(nid, j) === "—"), ssoJunk: !!sso && junk.every((j) => tryF(sso, j) === "—"),
  bankJunk: !!bank && ["12", ""].every((j) => { const v = [tryF(bank, "KBank", j), tryF(bank, { bankName: "KBank", bankAccountNo: j })].find((x) => typeof x === "string"); return typeof v === "string" && v.includes("—") && !v.includes("12"); }), noFull: [nid && tryF(nid, NID), sso && tryF(sso, SSO), bank && bankCall(bank, "KBank", ACC)].every((v) => typeof v === "string" && !v.includes(NID) && !v.includes(SSO) && !v.includes(ACC)) };
 chk("S10", all(r), "all", `${fails(r)} exports=${fns.length}`);
}

// ═════════════ render + DB ═════════════
installNetGuard();
const { P, coreHash } = await qc4Env(SUITE);
installIntl();
console.log(`client components known: ${await loadClientSet()}`);
const M = { sys: await imp("@/lib/modules/system/service"), list: await imp("@/app/app/sys/[id]/hr/employees/page"), prof: await imp("@/app/app/sys/[id]/hr/employees/[employeeId]/page"), date: await imp("@/lib/ui/date") };
const badImp = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (badImp.length) console.log(`import problems: ${badImp.join(" | ")}`);

const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${PFX}${Date.now()}${tag}`, fx = makeFixtures(P, coreHash, SLUG);
const D0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const digits = (n: number, seed: number) => String(Math.floor(seed) % 10 ** n).padStart(n, "7");
const SEED = Date.now();
const SAL = 2_765_431;
type Emp = { k: string; id: string; name: string; code: string; phone: string; unit: string; cls: "full" | "part" | "prob" | "ended"; nid: string; sso: string; acc: string; house: string };
async function buildFixture() {
 const T = await fx.newTenant("", "QC VIS5c shop");
 const U1 = await fx.newUnit(T, `QCV5c สาขาหนึ่ง ${tag}`, "u1"), U2 = await fx.newUnit(T, `QCV5c สาขาสอง ${tag}`, "u2");
 const HRS = (await M.sys.createSystem(T, "HR", `HR ${tag}`)).id as string;
 for (const u of [U1, U2]) await M.sys.linkUnit(T, HRS, u).catch(() => undefined);
 const sc = { tenantId: T, systemId: HRS };
 const PAY = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.reverse": true };
 const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(T, t, `QCV5c ${t} ${tag}`, r, ua, p);
 const W = { owner: await mk("owner", "OWNER", [], {}), payAll: await mk("payall", "STAFF", ["*"], PAY), payU1: await mk("payu1", "STAFF", [U1], { "hr.payroll.read": true }), mgr: await mk("mgr", "MANAGER", [], {}), mgrU1: await mk("mgru1", "MANAGER", [U1], {}) };
 const defs: [string, string, Emp["cls"], string, string][] = [];
 for (let i = 1; i <= 12; i++) defs.push([`f${String(i).padStart(2, "0")}`, U1, "full", "FULL_TIME", "ACTIVE"]);
 defs.push(["namfon", U1, "full", "FULL_TIME", "ACTIVE"]);
 for (let i = 1; i <= 6; i++) defs.push([`p${i}`, U1, "part", i % 2 ? "PART_TIME" : "DAILY", "ACTIVE"]);
 for (let i = 1; i <= 5; i++) defs.push([i === 1 ? "bow" : `b${i}`, U1, "prob", "PROBATION", "PROBATION"]);
 defs.push(["u2a", U2, "full", "FULL_TIME", "ACTIVE"], ["u2b", U2, "part", "PART_TIME", "ACTIVE"], ["brw", U2, "full", "FULL_TIME", "ACTIVE"], ["e1", U1, "ended", "FULL_TIME", "ENDED"], ["e2", U2, "ended", "FULL_TIME", "ENDED"]);
 const E: Record<string, Emp> = {};
 for (const [i, [k, u, cls, type, st]] of defs.entries()) {
  const name = `QCV5c ${k} ${tag}`, code = `C5${tag.slice(0, 3)}${String(i + 1).padStart(2, "0")}`, phone = `08${digits(8, SEED / 7 + i * 7919)}`;
  const nid = `1${digits(12, SEED / 3 + i * 104729)}`, sso = digits(10, SEED / 11 + i * 15485863), acc = digits(10, SEED / 13 + i * 32452843), house = `zHOUSE${tag}${k}`;
  const id = await fx.mkEmp(T, HRS, name, { code, startDate: "2023-03-20", position: `ตำแหน่ง${k}`, unitId: u, status: st, ...(cls === "ended" ? { active: false, endDate: addDay(D0, -10) } : {}) });
  await P.hrEmployee.update({ where: { id }, data: { phone, employmentType: type, department: k.startsWith("p") ? "บาร์" : "หน้าร้าน", nationalId: nid, ssoNumber: sso, bankName: "KBank", bankAccountNo: acc, bankAccountName: `BN${tag}`, houseRegAddress: house, birthDate: new Date("1998-11-14T00:00:00Z"), ...(cls === "prob" ? { probationEndAt: dbDate(addDay(D0, 14)) } : {}) } });
  await P.hrSalaryProfile.create({ data: { ...sc, employeeId: id, payType: "MONTHLY", baseSalarySatang: SAL + i, ssoEligible: true } });
  E[k] = { k, id, name, code, phone, unit: u, cls, nid, sso, acc, house };
 }
 await P.hrEmployeeUnit.create({ data: { ...sc, employeeId: E.brw!.id, unitId: U1, fromDate: dbDate(addDay(D0, -3)), toDate: null } });
 for (let i = 0; i < 7; i++) await P.hrOnboardingTask.create({ data: { ...sc, employeeId: E.bow!.id, kind: "ONBOARDING", title: `งาน ${i + 1}`, sortOrder: i, ...(i < 5 ? { doneAt: new Date(), doneById: W.owner.id } : {}) } });
 return { T, U1, U2, HRS, W, E };
}

let crashed = "";
try {
 const X = await buildFixture();
 const { W, E } = X, emps = Object.values(E);
 const list = (w: Any, sp: Record<string, string> = {}, lc: "th" | "en" = "th") => { CUR.missing = []; return renderPage(M.list, w.cookie, `/app/sys/${X.HRS}/hr/employees`, { id: X.HRS }, sp, lc); };
 const prof = (w: Any, e: Emp, sp: Record<string, string> = {}, lc: "th" | "en" = "th") => renderPage(M.prof, w.cookie, `/app/sys/${X.HRS}/hr/employees/${e.id}`, { id: X.HRS, employeeId: e.id }, sp, lc);
 const keyOfRow = (suffix: string) => emps.find((e) => e.id === suffix || e.code === suffix)?.k ?? `?${suffix.slice(0, 6)}`;
 const rowsOf = (r: Rendered) => idsWith(r.html, "hr-people-row-").map((x) => keyOfRow(x.slice(14)));
 /** rows of a list state across its hr-people-page-* links (≤ 6 pages) */
 async function collect(w: Any, sp: Record<string, string>): Promise<{ pages: string[][]; keys: Set<string>; first: Rendered }> {
  const first = await list(w, sp), pages = [rowsOf(first)], seen = new Set<string>([JSON.stringify(sp)]);
  const queue = idsWith(first.html, "hr-people-page-").map((id) => attrOf(elOf(first.html, id), "href")).filter(Boolean);
  while (queue.length && pages.length < 6) { const q = queryOf(queue.shift()!); if (seen.has(JSON.stringify(q))) continue; seen.add(JSON.stringify(q)); const r = await list(w, q); pages.push(rowsOf(r)); }
  return { pages, keys: new Set(pages.flat()), first };
 }
 const set = (ks: string[]) => [...ks].sort().join(",");
 const active = emps.filter((e) => e.cls !== "ended").map((e) => e.k);
 // R1 table
 const o = await list(W.owner), nf = E.namfon!, row = elOf(o.html, idsWith(o.html, "hr-people-row-").find((x) => keyOfRow(x.slice(14)) === "namfon") ?? "∅"), rt = textOfHtml(row);
 const start = [M.date.formatThaiDateFull?.("2023-03-20"), M.date.formatThaiDate?.(new Date("2023-03-20T00:00:00Z"))];
 const r1 = { rendered: !o.err || o.err, table: !!elOf(o.html, "hr-people-table"), row: !!row && rt.includes(nf.name), code: rt.includes(nf.code), position: rt.includes("ตำแหน่งnamfon"), start: start.some((s) => !!s && rt.includes(s)) };
 chk("R1", all(r1), "all", fails(r1));
 // R2 tabs
 const tabs = idsWith(o.html, "hr-people-tab-").map((id) => ({ id, el: elOf(o.html, id) })), want: Record<string, string[]> = { all: active, full: emps.filter((e) => e.cls === "full").map((e) => e.k), part: emps.filter((e) => e.cls === "part").map((e) => e.k), prob: emps.filter((e) => e.cls === "prob").map((e) => e.k), ended: emps.filter((e) => e.cls === "ended").map((e) => e.k) };
 const LBL: [keyof typeof want, string][] = [["all", "ทั้งหมด"], ["part", "พาร์ทไทม์"], ["prob", "ทดลองงาน"], ["ended", "สิ้นสุด"], ["full", "ประจำ"]];
 const r2: string[] = [];
 for (const [cls, label] of LBL) {
  const t = tabs.find((x) => textOfHtml(x.el).includes(label));
  if (!t) { r2.push(`${cls}:no tab`); continue; }
  if (!showsNum(t.el, want[cls]!.length)) r2.push(`${cls}:count≠${want[cls]!.length}`);
  const c = await collect(W.owner, queryOf(attrOf(t.el, "href") || "/"));
  if (set([...c.keys]) !== set(want[cls]!)) r2.push(`${cls}:rows ${c.keys.size}≠${want[cls]!.length}`);
 }
 chk("R2", !r2.length && want.full!.length + want.part!.length + want.prob!.length === want.all!.length, "tabs = data", L(r2));
 // R3 search
 const sEl = elOf(o.html, "hr-people-search"), qName = attrOf(/^<input/.test(sEl) ? sEl : (/<input\b[^>]*>/.exec(sEl)?.[0] ?? ""), "name");
 const r3: string[] = [];
 if (!qName) r3.push("no search input");
 else for (const [q, wantK] of [[nf.code, ["namfon"]], [E.p3!.phone, ["p3"]], [`QCV5c f0`, want.full!.filter((k) => /^f0/.test(k))]] as [string, string[]][]) { const c = await collect(W.owner, { [qName]: q }); if (set([...c.keys]) !== set(wantK)) r3.push(`${q.slice(0, 10)}:${c.keys.size}≠${wantK.length}`); }
 chk("R3", !r3.length, "matches only", L(r3));
 // R4 pagination
 const pg = await collect(W.owner, {}), flat = pg.pages.flat();
 const r4 = { first20: pg.pages[0]!.length === 20, pages: pg.pages.length >= 2, disjoint: flat.length === new Set(flat).size, union: set([...pg.keys]) === set(active) || `${pg.keys.size}≠${active.length}` };
 chk("R4", all(r4), "all", fails(r4));
 // R5 add panel
 const ad = await list(W.owner, { add: "1" }), det = (() => { const i = ad.html.indexOf('data-testid="hr-people-add-name"'), s = ad.html.lastIndexOf("<details", i); return i > 0 && s >= 0 ? ad.html.slice(s, ad.html.indexOf(">", s) + 1) : ""; })();
 const r5 = { addControl: !!elOf(o.html, "hr-people-add"), openOnAdd: /\sopen(=""|\s|>)/.test(det), nameInput: !!elOf(ad.html, "hr-people-add-name") };
 chk("R5", all(r5), "all", fails(r5));
 // R6/R7 branch-limited manager
 const mg = await collect(W.mgrU1, {}), scope = new Set(emps.filter((e) => e.unit === X.U1 || e.k === "brw").map((e) => e.k)), out = [...mg.keys].filter((k) => !scope.has(k));
 chk("R6", mg.keys.size > 0 && !out.length, "rows ⊂ scope", `rows=${mg.keys.size} out=${out.join(",") || "none"}`);
 const u2 = ["u2a", "u2b", "e2"].map((k) => E[k]!), leak = u2.flatMap((e) => [e.name, e.id]).filter((s) => mg.first.html.includes(s) || mg.first.clientText.includes(s));
 chk("R7", !mg.first.err && mg.first.html.length > 300 && !leak.length, "no U2", mg.first.err || L(leak));
 // R8 no pay in register
 const pay = emps.flatMap((e, i) => [String(SAL + i), ((SAL + i) / 100).toFixed(2), ((SAL + i) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })]).concat(["27,654", "27,655"]);
 const payHit = pay.filter((s) => o.html.includes(s) || o.clientText.includes(s));
 chk("R8", !o.err && !payHit.length && !/฿/.test(o.html), "no pay", o.err || L(payHit, 3));
 // profile: masking
 const full = (e: Emp) => [e.nid, `${e.nid[0]}-${e.nid.slice(1, 5)}-${e.nid.slice(5, 10)}-${e.nid.slice(10, 12)}-${e.nid[12]}`, e.sso, e.acc, `${e.acc.slice(0, 3)}-${e.acc[3]}-${e.acc.slice(4, 9)}-${e.acc[9]}`, e.house];
 const mask = (e: Emp) => [`x-xxxx-xxxxx-${e.nid.slice(10, 12)}-${e.nid[12]}`, `xxx-xxx-xx${e.sso.slice(-2)}`, `KBank xxx-x-x${e.acc.slice(-4)}`];
 const hits = (r: Rendered, e: Emp) => full(e).filter((s) => r.html.includes(s) || r.clientText.includes(s));
 const v1: string[] = [], v3: string[] = [], v5: string[] = [];
 const entitled: [string, Any, Emp][] = [["owner", W.owner, nf], ["payAll", W.payAll, nf], ["payU1", W.payU1, nf], ["owner/brw", W.owner, E.brw!]];
 let ownDefault: Rendered | null = null;
 for (const [n, w, e] of entitled) {
  const r = await prof(w, e);
  if (n === "owner") ownDefault = r;
  if (r.err || r.html.length < 300) { v1.push(`${n}:render ${r.err.slice(0, 40)}`); continue; }
  const h = hits(r, e), mk = mask(e).filter((m) => !r.html.includes(m));
  if (h.length) v1.push(`${n}:full×${h.length}`);
  if (mk.length || idsWith(r.html, "hr-profile-mask-").length < 2) v1.push(`${n}:mask ${mk.length ? "missing" : "ids"}`);
  const eyes = idsWith(r.html, "hr-profile-reveal-");
  if (!eyes.length || !eyes.every((id) => /^<a\b/.test(elOf(r.html, id)) && queryOf(attrOf(elOf(r.html, id), "href") || "/").edit === "1")) v3.push(`${n}:eye`);
  if (queryOf(attrOf(elOf(r.html, "hr-profile-edit"), "href") || "/").edit !== "1") v3.push(`${n}:edit link`);
  if (r.client.some((c) => c.name === "EmployeeProfileForm.tsx")) v5.push(`${n}:form in read view`);
 }
 chk("V1", !v1.length, "masked only", L(v1));
 chk("V3", !v3.length, "links to ?edit=1", L(v3));
 // V2 non-entitled (default + edit)
 const v2: string[] = [];
 for (const [n, w, e] of [["mgr", W.mgr, nf], ["mgrU1", W.mgrU1, nf], ["payU1/brw", W.payU1, E.brw!]] as [string, Any, Emp][]) for (const sp of [{}, { edit: "1" }] as Record<string, string>[]) {
  const r = await prof(w, e, sp);
  if (r.err || r.html.length < 300) { v2.push(`${n}${sp.edit ? "+edit" : ""}:render ${r.err.slice(0, 40)}`); continue; }
  if (hits(r, e).length) v2.push(`${n}${sp.edit ? "+edit" : ""}:full`);
  if (mask(e).some((m) => r.html.includes(m)) || idsWith(r.html, "hr-profile-reveal-").length) v2.push(`${n}${sp.edit ? "+edit" : ""}:mask/eye`);
  if (!sp.edit && r.client.some((c) => c.name === "EmployeeProfileForm.tsx")) v5.push(`${n}:form in read view`);
 }
 chk("V2", !v2.length, "nothing", L(v2));
 // V4/V5 edit view
 const ed = await prof(W.owner, nf, { edit: "1" }), edForm = ed.client.find((c) => c.name === "EmployeeProfileForm.tsx");
 chk("V4", !ed.err && !!edForm && textOfAny(edForm.props).includes(nf.nid), "full in edit form", ed.err || `form=${!!edForm}`);
 if (!edForm) v5.push("edit: no form");
 if (!elOf(ed.html, "hr-profile-footer") || !elOf(ed.html, "hr-profile-unit")) v5.push("edit: footer/unit");
 chk("V5", !v5.length, "form only on edit", L(v5));
 // V6 tabs + connections
 const od = ownDefault ?? (await prof(W.owner, nf)), ptabs = idsWith(od.html, "hr-profile-tab-").map((id) => elOf(od.html, id));
 const v6 = { tabs: ptabs.length >= 4 && ptabs.every((t) => /^<a\b/.test(t) && "tab" in queryOf(attrOf(t, "href") || "/")) || `n=${ptabs.length}`, current: ptabs.filter((t) => /aria-current="(page|true)"/.test(t)).length === 1, connections: !!elOf(od.html, "hr-profile-connections") };
 chk("V6", all(v6), "all", fails(v6));
 // V7 lifecycle (bow)
 const bw = await prof(W.owner, E.bow!), bt = textOfHtml(bw.html);
 const v7 = { rendered: !bw.err || bw.err, banner: !!elOf(bw.html, "hr-life-banner"), checklist: !!elOf(bw.html, "hr-life-checklist"), progress: bt.includes("5/7") };
 chk("V7", all(v7), "all", fails(v7));
 // V8 dates
 const odT = textOfHtml(od.html), en = await prof(W.owner, nf, {}, "en"), enT = textOfHtml(en.html);
 const v8 = { thBirth: odT.includes(M.date.formatThaiDateFull?.("1998-11-14") ?? "∅"), thStart: odT.includes(M.date.formatThaiDateFull?.("2023-03-20") ?? "∅"), noIso: !/1998-11-14|11\/14\/1998|type="date"/.test(od.html),
  enBirth: enT.includes(M.date.formatShortDate?.(new Date("1998-11-14T00:00:00Z"), "en") ?? "∅"), enNoBE: !/2541|พ\.ย\./.test(enT) };
 chk("V8", all(v8), "all", fails(v8));
 // R9 side panel
 const sp = await list(W.owner, { emp: nf.id }), panel = elOf(sp.html, "hr-people-panel");
 const r9 = { panel: !!panel && panel.includes(nf.name), masked: mask(nf).every((m) => panel.includes(m)), noFull: !hits(sp, nf).length };
 chk("R9", all(r9), "all", fails(r9));
 // V9 en
 const enL = await list(W.owner, {}, "en"), thPeople = Object.values(((JSON.parse(rd("src/messages/th/common.json")).hr ?? {}).people ?? {}) as Record<string, unknown>).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v as object).filter((x) => typeof x === "string"))) as string[];
 const enAll = enT + " " + textOfHtml(enL.html);
 const v9 = { block: thPeople.length > 0, rendered: (!en.err && !enL.err) || `${en.err}${enL.err}`, noMissing: !/‹MISSING:hr\.people/.test(en.html + enL.html), noThai: !thPeople.filter((t) => /[฀-๿]/.test(t) && t.length > 1).some((t) => enAll.includes(t.replace(/\{[^}]*\}/g, "").trim().slice(0, 12))) };
 chk("V9", all(v9), "all", fails(v9));
} catch (e) {
 crashed = errText(e);
 console.log(`🔴 harness error: ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
 try { await sweepTenants(P, fx.tenants); } catch (e) { console.log(`sweep: ${errText(e)}`); }
 await cleanupFx(P, fx, SLUG);
 const r1 = await sweepResidue(P, fx.tenants), r2 = await residueOf(P, fx, SLUG, PFX), left = await P.tenant.count({ where: { slug: { startsWith: PFX } } }), net = NET.attempts.filter((a) => !/fetch:\??$/.test(a));
 chk("Z1", !r1.length && !r2.length && left === 0 && !net.length, "", `sweep=${r1.join(",") || "none"} fx=${r2.join(",") || "none"} tenants=${left} outbound=${net.join(",") || 0}`);
 await P.$disconnect?.();
}
process.exit(R.finish({ forced: FORCE, crashed, missing: [] }));
