// QC HR VIS-5b team overview hub (mockup 01) · brief hr-brief-VIS-5b.md (+ CONTROLLER RULINGS) · notes hr-VIS-5bc-oracle.md · ⚠️ ORACLE-EDIT only · QC_FORCE=1 · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-vis-5b.mts
// No browser: pages are rendered in-process (server components awaited, "use client" components kept with their props) inside a Next request
//   scope — pictures (hour axis, now-line, fold, clipping, 390/1024/1440) are the controller's walk, not this suite.
import { type Any, type Def, ROOT, rd, errText, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, addDay, dbDate, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, sha, stripComments, importsOf, fileAt } from "./qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue } from "./qc-hr-h4.3-lib.mjs";
import { bodyOf } from "./qc-hr-priv-2-lib.mjs";
import { H, BASE, OWN, diffStatics, msgStatics, invHas, baseIdsGone, pinned, installIntl, loadClientSet, renderTree, renderPage, inScope, CUR, idsWith, elOf, showsNum, attrOf, hrefsIn, queryOf, textOfHtml, hunksOf, sha16, h, type Rendered } from "./qc-hr-vis-5-lib.mjs";

const SUITE = "qc-hr-vis-5b", ARGV = process.argv.slice(2), FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run"), PFX = "qc-hr-vis5b-";
const F = { sys: "src/app/app/sys/[id]/page.tsx", tabs: "src/components/module-tabs.tsx", ui: `${H}ui.tsx`, ov: `${H}overview-ui.tsx`, ib: `${H}InboxBatch.tsx`, hubUi: `${H}hub-ui.tsx`, rules: `${H}hub-rules.ts` };
const HUB = "/app/sys/[id]";
const NEW_IDS = ["hr-hub-unit", "hr-hub-day-prev", "hr-hub-day-next", "hr-hub-roster-link", "hr-hub-add-employee", "hr-hub-kpi-arrived", "hr-hub-kpi-late", "hr-hub-kpi-notin", "hr-hub-kpi-leave", "hr-hub-board", "hr-hub-board-row-*", "hr-hub-month", "hr-hub-month-talk-*", "hr-hub-due", "hr-hub-due-*", "hr-hub-kiosk-link"];
const HUB_INBOX_IDS = ["hr-inbox-check-*", "hr-inbox-batch", "hr-inbox-batch-approve", "hr-inbox-batch-reject"];
const KPI = { onShift: "hr-overview-today", arrived: "hr-hub-kpi-arrived", late: "hr-hub-kpi-late", notIn: "hr-hub-kpi-notin", leave: "hr-hub-kpi-leave" } as const;
// golden = sha16(stripComments(bodyOf(file, name))) at base 09713f430 (brief §7 do-not-touch + labour card H4.2/PRIV-2)
const PIN: Record<string, [string, string, string]> = {
 decideInboxAction: [`${H}inbox-actions.ts`, "bdc0411f9bee9911", "action"], decideInbox: [`${H}inbox.ts`, "d9bad252a3372cdc", ""], teamOverviewWithPreview: [`${H}inbox.ts`, "4a68ac354a52b46c", ""],
 loadAttendanceBoard: [`${H}judge.ts`, "632d0a898ab0322b", ""], lifecycleDue: [`${H}lifecycle.ts`, "c9babb1e63c87ffa", ""], loadReport: [`${H}reports.ts`, "4dc796e1bd11ca77", ""], reportAccessOf: [`${H}reports.ts`, "28d935ba41f802e5", ""],
 meetsPattern: [`${H}ai-rules.ts`, "c720c67057989df9", ""], hrNavFilter: [`${H}nav.ts`, "a85ecb46e36251c9", ""] /* HR VIS-5b re-merge ▸ re-pin after session/hr a49f81829: PRIV-3 R4 page gates (register/leave/payroll → requireHrPage) · was 1180200054121ff6 ◂ */, hrTabs: [F.ui, "db9ff39ddd0d08ca", "S1.8"], HrLaborCard: [`${H}labor-ui.tsx`, "fc7fe5dd23e3e2dd", "labour"], canRunKiosk: [`${H}clock-settings.ts`, "ac23c6bc70fa5f90", ""],
};
const MODTABS_GOLDEN = "dd39eef383f01a0c"; // sha16 of ModuleTabs({items: SAMPLE_TABS}) static markup at base (non-HR module) — 5b-1

const D = (id: string, g: string, sb: string, t: string): Def => [id, g, ({ C: "CRITICAL", M: "MAJOR", m: "MINOR" } as const)[sb[0] as "C"], sb[1] === "R" ? "RED" : "GREEN", t];
const CHECKS: Def[] = [
 D("S1", "§6 §7", "MG", "[static] diff vs merge-base(session/hr): only VIS-5b files + shared lists · VIS-5c-only files refused"),
 D("S2", "§7", "MG", "[static] every hunk of a VIS-5b file adds \"HR VIS-5b\" · ui.tsx hunks only in 88-117 / 710-793 / import block · new files marked in first 3 lines"),
 D("S3", "§7", "CG", "[static] [control] payroll-rules.ts byte-identical · pinned bodies (decideInboxAction · decideInbox · loaders · labour card · nav filter · hrTabs) unchanged"),
 D("S4", "F16.1", "CG", "[static] [control] fitness F16.1 clean (\"use client\" HR files touch no sensitive field)"),
 D("S5", "§4", "MR", "[static] hr.hub block: th = en keys · right after hr.inbox · en values have no Thai · no other message key changed · no Thai literal in new JSX/TS"),
 D("S6", "§4", "MR", "[static] inventory: rows (page /app/sys/[id], wo VIS-5b) for every new id + hub rows hr-inbox-check-*/-batch/-batch-approve|reject · every hr-hub-* id in code has a row"),
 D("S7", "§4", "MG", "[static] [control] every test id of /app/sys/[id] in the base inventory still exists in the source"),
 D("S8", "§4 §8", "MR", "[static] hub-rules.ts pure (type-only imports · no Date()/await/IO) · no ฿/Satang/formatBaht in hub-* · overview-ui stays facade (import set unchanged)"),
 D("S9", "§4 §8", "MR", "[pure] kpisOf(board) = {onShift · arrived · late · notIn · leave}: LEAVE/DAY_OFF/NO_SCHEDULE not on shift · notIn = attendance-ui predicate · no shifts ⇒ zeros"),
 D("S10", "§1 §7 §8", "MG", "[static] [control] InboxBatch imports unchanged (no approval module) · sys page diff only HR width/props · hrTabsFor keeps `=== systemId` in first 1200 chars"),
 D("S11", "5b-1", "CG", "[render] [control] ModuleTabs without the opt-in prop: non-HR markup byte-identical to base"),
 D("S12", "5b-1 §3", "MR", "[render] ModuleTabs([]) renders nothing · HR strip opts in (data-scroll=\"x\" + md:flex-wrap) on the hub"),
 D("S13", "5b-2", "MR", "[pure] hrTabsFor(kiosk-only viewer) = [] · [control] owner keeps all 10 tabs"),
 D("K1", "§2 5-9", "MR", "[db] 5 KPI tiles today = counts derived from loadAttendanceBoard (owner)"),
 D("K2", "§2 5-9", "MR", "[db] ?day=yesterday: 5 KPI tiles = board counts · no \"no roster today\" text while people are on shift"),
 D("K3", "§1", "MR", "[db] branch-limited manager: tiles = its own board counts · board rows only its branch"),
 D("K4", "§1", "CG", "[db] [control] branch-limited manager: no other-branch employee in hub HTML or client props"),
 D("B1", "§2 10-11", "MR", "[db] board hr-hub-board: one hr-hub-board-row-<employeeId> per person with a shift slot · rows carry name + a status · DAY_OFF people not as timeline rows"),
 D("B2", "§2 2-4", "MR", "[db] header: hr-hub-unit (units of the board) · day prev/next = board.prevDay/nextDay · roster link (canReadRoster) · + employee → /hr/employees?add=1"),
 D("A1", "§2 14-15", "MR", "[db] approvals on the hub: checkbox per batchable preview item · batch bar approve/reject · adjustment not batchable"),
 D("M1", "§2 18-19", "MR", "[db] month card hr-hub-month = loadReport(time, this month) totals (late · absent · leave) · talk rows = meetsPattern people · no card without the time report"),
 D("D1", "§2 21", "MR", "[db] due strip hr-hub-due: first 3 lifecycleDue items by date (names) + \"+N\" · link to employees"),
 D("L1", "§3", "MR", "[db] layout markers: HR wrapper max-w-7xl · xl:grid-cols-[minmax(0,1fr)_400px] · KPIs md:grid-cols-5 + grid-cols-2"),
 D("P1", "§1 privacy", "CG", "[db] [control] manager without payroll: no ฿ / salary figure on the hub · payroll viewer: no board/KPIs"),
 D("P2", "H4.2 PRIV-2", "CG", "[db] [control] labour card: owner + payroll viewer have hr-labor-card · manager none"),
 D("G1", "5b-2 §3", "MR", "[db] kiosk-only viewer: no tab strip · one card hr-hub-kiosk-link → /hr/kiosk · no employee count/links"),
 D("G2", "§1", "MG", "[db] [control] member without HR keys: no overview, no board, no approvals"),
 D("I1", "§4 §8", "MR", "[db] en hub: hr.hub exists · no missing key · no Thai value of hr.hub in the en HTML · th hub renders hr.hub strings"),
 // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ R-F5-1 / R-F5-2 (17 Nov): hub links only to pages the viewer can open · no employee rows / pending leaves read for viewers without that page ◂
 D("F1", "R-F5-1", "MR", "[db] hub card \"ลงเวลา\" iff hrTabsFor(viewer) has /hr/attendance (O M MB P PB K N + linked staff SL) · no /hr/attendance link at all otherwise · [control] tabs ⇔ attendance page not 404"),
 D("F2", "R-F5-2", "CR", "[db] hub render runs listEmployees' SQL only for viewers with hrPageAccessOf.register (N · SL · K none) · [control] O does run it"),
 D("F3", "R-F5-2", "MR", "[db] hub render runs pendingLeaves' SQL only for viewers with hrPageAccessOf.leave · [control] O does run it"),
 D("F5", "R-F5-1", "MR", "[db] month card hr-hub-month: per talk row a calendar link to /hr/attendance?view=month iff the viewer's tabs have /hr/attendance · premise P/PB have the card with talk rows · [control] O M MB one link per row"), // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ controller follow-up 17 Nov ◂
 D("F4", "R-F5-2", "MR", "[static] HrHub: pageOk = hrPageAccessOf(..) before the reads · every listEmployees( sits under pageOk.register ?/&& · every pendingLeaves( under pageOk.leave ?/&&"),
 D("Z1", "-", "CG", "residue · outbound"),
];
const R = makeRegistry(SUITE, "", CHECKS);
if (ARGV.includes("--list")) { R.printList(); process.exit(0); }
const { chk } = R;
const all = (r: Record<string, unknown>) => Object.values(r).every((v) => v === true);
const fails = (r: Record<string, unknown>) => Object.entries(r).filter(([, v]) => v !== true).map(([k, v]) => (typeof v === "string" ? `${k}:${v}` : k)).join(",") || "all";
const L = (xs: string[], n = 8) => xs.slice(0, n).join(" | ") || "ok";
const built = rd(F.rules).includes("HR VIS-5b") || rd(F.ui).includes("HR VIS-5b");
if (!built && !FORCE) R.skipExit(["no HR VIS-5b marker in hub-rules.ts / ui.tsx"]);

// ═════════════ statics ═════════════
{
 const d = diffStatics("5b");
 chk("S1", !d.outside.length, "none outside", `outside=${L(d.outside)} base=${BASE.slice(0, 9)}`);
 chk("S2", !d.bad.length, "all marked", L(d.bad));
 const pins = pinned(PIN), ps = sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA;
 chk("S3", ps && !pins.length, "identical", `payroll-rules=${ps} changed=${L(pins)}`);
 let f161 = "not run";
 try { const fit = (await import("./fitness-hr.mjs" as string)) as Any, { hits } = fit.scanF161(ROOT); f161 = hits.length ? hits.slice(0, 4).map((h: Any) => `${h.file}:${h.line} ${h.field}`).join(" | ") : ""; } catch (e) { f161 = errText(e); }
 chk("S4", f161 === "", "clean", f161 || "clean");
 const m = msgStatics("5b");
 chk("S5", all(m), "all", fails(m));
 const inv = invHas([...NEW_IDS, ...HUB_INBOX_IDS], HUB, "VIS-5b"), src = [F.ui, F.ov, F.hubUi, F.sys].map(rd).join("\n");
 const inCode = [...new Set([...src.matchAll(/hr-hub-[a-z0-9-]*[a-z0-9-](\$\{)?/g)].map((x) => (x[1] ? `${x[0].slice(0, -2)}*` : x[0])))];
 const missing = NEW_IDS.filter((id) => !src.includes(id.replace(/\*$/, ""))), noRow = inCode.filter((id) => invHas([id], HUB, "VIS-5b").length);
 chk("S6", !inv.length && !missing.length && !noRow.length, "rows + code", `noRow=${L(inv, 5)} notInCode=${L(missing, 5)} codeNoRow=${L(noRow, 4)}`);
 const gone = baseIdsGone(HUB);
 chk("S7", !gone.length, "all present", L(gone));
 const hr = rd(F.rules), hubAll = rd(F.rules) + rd(F.hubUi), imps = importsOf(hr);
 const ovImp = (s: string) => importsOf(stripComments(s)).filter((i) => !i.type).map((i) => i.spec).sort().join(",");
 const s8 = { exists: !!hr && !!rd(F.hubUi), typeOnly: !!hr && imps.every((i) => i.type), noIo: !!hr && !/new Date\(|Date\.now|\bawait\b|fetch\(|prisma|tenantDb/.test(stripComments(hr)), noMoney: !!hubAll && !/฿|Satang|formatBaht/.test(stripComments(hubAll)), facade: ovImp(rd(F.ov)) === ovImp(fileAt(BASE, F.ov) ?? "") };
 chk("S8", all(s8), "all", fails(s8));
 const ib = (s: string) => importsOf(stripComments(s)).map((i) => `${i.type ? "t:" : ""}${i.spec}`).sort().join(",");
 const tf = bodyOf(stripComments(rd(F.ui)), "hrTabsFor");
 const sysBad = hunksOf(F.sys).filter((h) => h.added.concat(h.removed).some((l) => l.trim() && !/HrHub|"HR"|max-w-7xl|max-w-2xl|HR VIS-5b|\bday\b|\bunit\b|searchParams|sp\./.test(l)));
 const s10 = { inboxImports: ib(rd(F.ib)) === ib(fileAt(BASE, F.ib) ?? ""), noApproval: !/modules\/approval|bulkDecide/.test(rd(F.ib)), action: /decideInboxAction\(/.test(rd(F.ib)), sysPage: !sysBad.length || `${sysBad.length} hunk(s)`, tabsFor: /===\s*systemId/.test(tf.slice(0, 1200)) };
 chk("S10", all(s10), "all", fails(s10));
 // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ F4: the reads sit under the page gates (R-F5-2) ◂
 const hub = bodyOf(stripComments(rd(F.ui)), "HrHub"), pv = /const\s+(\w+)\s*=\s*hrPageAccessOf\(/.exec(hub), at = pv?.index ?? -1, gv = pv?.[1] ?? "pageOk";
 const callsOf = (fn: string) => [...hub.matchAll(new RegExp(`\\b${fn}\\(`, "g"))].map((x) => x.index!);
 const under = (fn: string, key: string) => { const cs = callsOf(fn), bad = cs.filter((i) => at < 0 || i < at || !new RegExp(`\\b${gv}\\.${key}\\s*(?:\\?|&&)\\s*(?:await\\s+)?$`).test(hub.slice(Math.max(0, i - 80), i))); return !bad.length || `${bad.length}/${cs.length} unguarded`; };
 const f4 = { hub: hub.length > 200, gate: at >= 0, employees: under("listEmployees", "register"), leaves: under("pendingLeaves", "leave") };
 chk("F4", all(f4), "all", fails(f4));
}

// ═════════════ render + DB ═════════════
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard();
const { P, coreHash } = await qc4Env(SUITE, { countQueries: true }); // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ query events on (F2/F3 read the SQL text) ◂
const CAP = { on: false, q: [] as string[] }; // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ SQL text of one call / one render ◂
P.$on?.("query", (e: Any) => { if (CAP.on) CAP.q.push(String(e?.query ?? "")); });
const capture = async (fn: () => Promise<unknown>): Promise<string[]> => { CAP.q = []; CAP.on = true; try { await fn(); await new Promise((r) => setImmediate(r)); } finally { CAP.on = false; } return CAP.q.slice(); };
installIntl();
const nClient = await loadClientSet();
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const M = { ui: await imp("@/lib/modules/hr/ui"), tabs: await imp("@/components/module-tabs"), judge: await imp("@/lib/modules/hr/judge"), inbox: await imp("@/lib/modules/hr/inbox"), life: await imp("@/lib/modules/hr/lifecycle"), rep: await imp("@/lib/modules/hr/reports"), ai: await imp("@/lib/modules/hr/ai-rules"), sys: await imp("@/lib/modules/system/service"), page: await imp("@/app/app/sys/[id]/page"), rules: rd(F.rules) ? await imp("@/lib/modules/hr/hub-rules") : null };
const badImp = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (badImp.length) console.log(`import problems: ${badImp.join(" | ")}`);
console.log(`client components known: ${nClient}`);

// pure: ModuleTabs + hrTabsFor
const SAMPLE_TABS = [{ href: "/app/sys/x", label: "Overview" }, { href: "/app/sys/x/pos/sales", label: "Sales" }, { href: "/app/sys/x/pos/stock", label: "Stock", perm: "pos.stock.read" }];
{
 const mk = (p: Any) => h(M.tabs.ModuleTabs, p);
 const r1 = await renderTree(mk({ items: SAMPLE_TABS }), "th"), r2 = await renderTree(mk({ items: SAMPLE_TABS, "data-testid": "pos-tabs" }), "th");
 const got = sha16(r1.html + "\u0001" + r2.html);
 console.log(`  ℹ ModuleTabs markup sha16=${got}`);
 chk("S11", !r1.err && got === MODTABS_GOLDEN, MODTABS_GOLDEN, `${got}${r1.err ? ` ${r1.err}` : ""}`);
 const e = await renderTree(mk({ items: [] }), "th");
 const s12a = !e.err && e.html === "";
 (globalThis as Any).__s12a = `${s12a}:${e.html.slice(0, 60)}`;
}
const own = (w: Any) => ({ role: w.role, unitAccess: w.unitAccess, permissions: w.permissions, userId: w.id });

const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${PFX}${Date.now()}${tag}`, fx = makeFixtures(P, coreHash, SLUG);
const D0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10), DM1 = addDay(D0, -1), MONTH = D0.slice(0, 7);
const bkk = (day: string, min: number) => new Date(Date.parse(`${day}T00:00:00+07:00`) + min * 60_000);
const bkkMinNow = Math.floor(((Date.now() + 7 * 3_600_000) % 86_400_000) / 60_000);
const LATE_DAYS = [1, 2, 3].map((n) => addDay(D0, -n)).filter((d) => d.slice(0, 7) === MONTH);
const SAL = 3_123_457;
async function buildFixture() {
 const T = await fx.newTenant("", "QC VIS5b shop");
 const U1 = await fx.newUnit(T, `QCV5b สาขาหนึ่ง ${tag}`, "u1"), U2 = await fx.newUnit(T, `QCV5b สาขาสอง ${tag}`, "u2");
 const HRS = (await M.sys.createSystem(T, "HR", `HR ${tag}`)).id as string;
 for (const u of [U1, U2]) await M.sys.linkUnit(T, HRS, u).catch(() => undefined);
 const sc = { tenantId: T, systemId: HRS };
 const PAY = { "hr.payroll.read": true, "hr.payroll.create": true, "hr.payroll.approve": true, "hr.payroll.pay": true, "hr.payroll.reverse": true };
 const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(T, t, `QCV5b ${t} ${tag}`, r, ua, p);
 const W = { owner: await mk("owner", "OWNER", [], {}), mgr: await mk("mgr", "MANAGER", [], {}), mgrU1: await mk("mgru1", "MANAGER", [U1], {}), pay: await mk("pay", "STAFF", ["*"], PAY), kiosk: await mk("kiosk", "STAFF", [], { "hr.attendance.clock": true }), member: await mk("member", "STAFF", [], {}),
  payU1: await mk("payu1", "STAFF", [U1], PAY), staffL: await mk("staffl", "STAFF", [], {}) }; // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ + PB (payroll, branch 1) · SL (plain staff linked to a7) ◂
 const E: Record<string, Any> = {};
 const defs: [string, string][] = [["a1", U1], ["a2", U1], ["a3", U1], ["a4", U1], ["a5", U1], ["a6", U1], ["a7", U1], ["b1", U2], ["b2", U2], ["b3", U2]];
 for (const [i, [k, u]] of defs.entries()) {
  const name = `QCV5b ${k} ${tag}`, id = await fx.mkEmp(T, HRS, name, { code: `V${i + 1}`, startDate: "2025-01-01", position: "บาริสต้า", unitId: u, status: "ACTIVE" });
  await P.hrSalaryProfile.create({ data: { ...sc, employeeId: id, payType: "MONTHLY", baseSalarySatang: SAL + i, ssoEligible: true } });
  E[k] = { id, name, unit: u };
 }
 await P.hrEmployee.update({ where: { id: E.a7.id }, data: { linkedUserId: W.staffL.id } }); // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ SL linked (a7 has no shift) ◂
 const SH = { [U1]: (await P.hrShift.create({ data: { ...sc, unitId: U1, name: `เช้า1 ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } })).id, [U2]: (await P.hrShift.create({ data: { ...sc, unitId: U2, name: `เช้า2 ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } })).id };
 const roster = (k: string, day: string, s = 480, e = 1020) => P.hrRosterEntry.create({ data: { ...sc, employeeId: E[k].id, date: dbDate(day), shiftId: SH[E[k].unit], unitId: E[k].unit, startMin: s, endMin: e, breakMin: 60, crossesMidnight: false, published: true, publishedAt: new Date() } });
 const punch = (k: string, day: string, kind: "IN" | "OUT", min: number) => P.hrAttendance.create({ data: { ...sc, employeeId: E[k].id, kind, at: bkk(day, min), source: "MOBILE" } });
 const stored = async (k: string, day: string, re: Any, status: string, lateMin = 0) => P.hrAttendanceDay.create({ data: { ...sc, employeeId: E[k].id, date: dbDate(day), slotKey: re.id, rosterEntryId: re.id, unitId: E[k].unit, startMin: 480, endMin: 1020, status, lateMin, workedMin: status === "ABSENT" || status === "LEAVE" ? 0 : 480 - lateMin, judgedAt: new Date() } });
 const pol = (await P.hrLeavePolicy.create({ data: { ...sc, category: "PERSONAL", name: `กิจ ${tag}`, quotaDays: 30, allowHalfDay: false, allowHours: false } })).id;
 // yesterday: a1 a2 b1 on time · a3 a4 b2 late · a5 b3 absent · a6 approved leave · a7 no shift
 const plan: [string, string, number][] = [["a1", "ON_TIME", 0], ["a2", "ON_TIME", 0], ["b1", "ON_TIME", 0], ["a3", "LATE", 25], ["a4", "LATE", 40], ["b2", "LATE", 15], ["a5", "ABSENT", 0], ["b3", "ABSENT", 0], ["a6", "LEAVE", 0]];
 for (const day of [DM1, ...LATE_DAYS.filter((d) => d !== DM1)]) {
  for (const [k, st, late] of day === DM1 ? plan : plan.filter(([k]) => k === "a3")) {
   const re = await roster(k, day);
   if (st === "ON_TIME" || st === "LATE") { await punch(k, day, "IN", 480 + late - (st === "ON_TIME" ? 3 : 0)); await punch(k, day, "OUT", 1022); }
   if (st === "LEAVE") await P.hrLeave.create({ data: { ...sc, employeeId: E[k].id, policyId: pol, type: "PERSONAL", fromDate: dbDate(day), toDate: dbDate(day), status: "APPROVED", reason: "ธุระ", days: 1 } });
   await stored(k, day, re, st, late);
  }
 }
 // today: a1 in · a5 not in yet (shift from 00:05) · a6 leave · b1 in (U2)
 for (const k of ["a1", "a5", "b1"]) await roster(k, D0, 5, 1435);
 if (bkkMinNow > 30) for (const k of ["a1", "b1"]) await punch(k, D0, "IN", 6);
 await P.hrLeave.create({ data: { ...sc, employeeId: E.a6.id, policyId: pol, type: "PERSONAL", fromDate: dbDate(D0), toDate: dbDate(D0), status: "APPROVED", reason: "ธุระ", days: 1 } });
 // inbox: 2 pending leaves (batchable) + 1 pending adjustment (one by one)
 for (const k of ["a2", "a4"]) await P.hrLeave.create({ data: { ...sc, employeeId: E[k].id, policyId: pol, type: "PERSONAL", fromDate: dbDate(addDay(D0, 20)), toDate: dbDate(addDay(D0, 20)), status: "PENDING", reason: "ธุระ", days: 1 } });
 await P.hrPayAdjustment.create({ data: { ...sc, employeeId: E.a1.id, periodKey: MONTH, kind: "BONUS", amountSatang: 50_000, status: "PENDING", note: "QC" } });
 // due: 4 probation/contract dates (3 shown + "+1")
 for (const [k, n, f] of [["a1", 3, "p"], ["a2", 5, "p"], ["b1", 7, "p"], ["a4", 9, "c"]] as [string, number, string][])
  await P.hrEmployee.update({ where: { id: E[k].id }, data: f === "p" ? { employmentStatus: "PROBATION", probationEndAt: dbDate(addDay(D0, n)) } : { contractEndAt: dbDate(addDay(D0, n)) } });
 return { T, U1, U2, HRS, ctx: sc, W, E };
}

const ST_OFF = new Set(["LEAVE", "DAY_OFF", "NO_SCHEDULE"]);
/** oracle KPI from the loader's DTO (brief §4 · notIn = attendance-ui.tsx:143) */
function kpiOf(b: Any) {
 const rows = (b?.rows ?? []) as Any[], has = (f: (s: Any) => boolean) => rows.filter((r) => (r.slots as Any[]).some(f)).length;
 return { onShift: has((s) => !!s.shift && !ST_OFF.has(s.status)), arrived: has((s) => !!s.inAt), late: has((s) => s.status === "LATE"), notIn: has((s) => !s.final && (s.phase === "NOT_IN" || (s.status === "ABSENT" && !s.inAt))), leave: has((s) => s.status === "LEAVE") };
}
const kpiFails = (html: string, k: ReturnType<typeof kpiOf>) => (Object.entries(KPI) as [keyof typeof KPI, string][]).filter(([n, id]) => !showsNum(elOf(html, id), k[n])).map(([n, id]) => `${n}=${k[n]}${elOf(html, id) ? "≠" : "∅"}`);
const NO_ROSTER = ["ไม่มีตารางกะของวันนี้", "ไม่มีตารางกะ"];

let crashed = "";
try {
 const X = await buildFixture();
 const { W, E, ctx } = X;
 const view = (w: Any, sp: Record<string, string> = {}, lc: "th" | "en" = "th"): Promise<Rendered> => { CUR.missing = []; return renderPage(M.page, w.cookie, `/app/sys/${X.HRS}`, { id: X.HRS }, sp, lc); };
 const board = (w: Any, day?: string) => M.judge.loadAttendanceBoard(ctx, own(w), { day }, {});
 const names = (ks: string[]) => ks.map((k) => E[k].name as string);
 // S12 (strip) · S13 (kiosk tabs)
 const o0 = await view(W.owner), strip = (() => { const i = o0.html.indexOf(`/hr/attendance"`), s = o0.html.lastIndexOf("<div", o0.html.lastIndexOf("<a", i)); return i > 0 ? o0.html.slice(s, o0.html.indexOf(">", s) + 1) : ""; })();
 const s12 = { emptyNull: (globalThis as Any).__s12a?.startsWith("true") || String((globalThis as Any).__s12a), scroll: strip.includes('data-scroll="x"'), wrap: /md:flex-wrap/.test(strip), rendered: !o0.err || o0.err };
 chk("S12", all(s12), "all", fails(s12));
 const tk = await M.ui.hrTabsFor?.(X.HRS, own(W.kiosk), false), to = await M.ui.hrTabsFor?.(X.HRS, own(W.owner), false);
 chk("S13", Array.isArray(tk) && tk.length === 0 && Array.isArray(to) && to.length === 10, "kiosk 0 · owner 10", `kiosk=${tk?.length} owner=${to?.length}`);
 // S9 pure kpisOf on a synthetic board (+ the loader's own yesterday board)
 {
  const sl = (o: Any) => ({ slotKey: "k", dayId: null, shift: { name: "x", startMin: 480, endMin: 1020, crossesMidnight: false }, inAt: null, outAt: null, method: null, breaks: [], status: "PENDING", phase: "BEFORE", final: false, stored: false, stale: false, lateMin: 0, earlyOutMin: 0, workedMin: 0, otMin: 0, missingOut: false, leave: null, ...o });
  const row = (id: string, ...slots: Any[]) => ({ employeeId: id, name: id, initial: id[0], position: null, borrowed: false, slots });
  const syn = { day: D0, prevDay: DM1, nextDay: addDay(D0, 1), todayKey: D0, unitSel: "all", units: [], canClockFor: false, alerts: [], totals: { workedMin: 0, counts: {} }, rows: [
   row("r1", sl({ status: "ON_TIME", inAt: "2026-01-01T01:00:00Z", final: true, phase: "DONE" })), row("r2", sl({ status: "LATE", inAt: "2026-01-01T01:30:00Z", phase: "IN" })), row("r3", sl({ status: "LEAVE", leave: { label: "ลา", pending: false } })),
   row("r4", sl({ status: "DAY_OFF", shift: null })), row("r5", sl({ status: "NO_SCHEDULE", shift: null })), row("r6", sl({ phase: "NOT_IN" })), row("r7", sl({ status: "ABSENT" })), row("r8", sl({ status: "ABSENT", final: true, phase: "DONE" })),
   row("r9", sl({ status: "DAY_OFF" })), row("r10", sl({ status: "ON_TIME", inAt: "2026-01-01T01:00:00Z", final: true }), sl({ status: "LATE", inAt: "2026-01-01T09:00:00Z" })) ] };
  const kp = M.rules?.kpisOf, run = (b: Any) => { try { const r = kp(b); return r && typeof r === "object" && "onShift" in r ? r : kp(b.rows); } catch (e) { return { __throw: errText(e) }; } };
  const keys = ["onShift", "arrived", "late", "notIn", "leave"] as const, same = (got: Any, want: Any) => keys.every((k) => Number(got?.[k]) === want[k]);
  const yb = await M.judge.loadAttendanceBoard(X.ctx, own(X.W.owner), { day: DM1 }, {});
  const cases: [string, Any][] = [["synthetic", syn], ["empty", { ...syn, rows: [] }], ["dayOffOnly", { ...syn, rows: syn.rows.filter((r) => ["r4", "r5", "r9"].includes(r.employeeId)) }], ["loaderYesterday", yb]];
  const bad = typeof kp !== "function" ? ["∅ kpisOf"] : cases.filter(([, b]) => !same(run(b), kpiOf(b))).map(([n, b]) => `${n}:${JSON.stringify(run(b)).slice(0, 70)}≠${JSON.stringify(kpiOf(b))}`);
  chk("S9", !bad.length, "= oracle", L(bad, 3));
 }
 // K1 today · K2 yesterday
 const b0 = await board(W.owner), k0 = kpiOf(b0), kf0 = kpiFails(o0.html, k0);
 console.log(`  ℹ today ${D0} kpi ${JSON.stringify(k0)} · rows ${b0?.rows?.length}`);
 chk("K1", !o0.err && kf0.length === 0 && k0.onShift >= 2, "5 tiles = board", `${o0.err || L(kf0)} premise onShift=${k0.onShift}`);
 const o1 = await view(W.owner, { day: DM1 }), b1 = await board(W.owner, DM1), k1 = kpiOf(b1), kf1 = kpiFails(o1.html, k1);
 const contra = k1.onShift > 0 && NO_ROSTER.some((t) => textOfHtml(o1.html).includes(t));
 console.log(`  ℹ yesterday ${DM1} kpi ${JSON.stringify(k1)} · statuses ${(b1?.rows ?? []).map((r: Any) => r.slots.map((s: Any) => s.status).join("/")).join(" ")}`);
 chk("K2", !o1.err && !kf1.length && !contra && k1.late >= 3 && k1.leave === 1, "tiles = board · no contradiction", `${o1.err || L(kf1)} contradiction=${contra} premise late=${k1.late} leave=${k1.leave}`);
 // K3/K4 branch-limited manager
 const m1 = await view(W.mgrU1, { day: DM1 }), bm = await board(W.mgrU1, DM1), km = kpiOf(bm), kfm = kpiFails(m1.html, km);
 const rowIds = idsWith(m1.html, "hr-hub-board-row-").map((x) => x.slice(17)), u2ids = ["b1", "b2", "b3"].map((k) => E[k].id);
 chk("K3", !m1.err && !kfm.length && rowIds.length > 0 && !rowIds.some((r) => u2ids.includes(r)), "own branch only", `${m1.err || L(kfm)} rows=${rowIds.length} u2rows=${rowIds.filter((r) => u2ids.includes(r)).length}`);
 const leak = [...names(["b1", "b2", "b3"]), ...u2ids].filter((s) => m1.html.includes(s) || m1.clientText.includes(s));
 chk("K4", !m1.err && m1.html.length > 500 && !leak.length, "no U2 data", m1.err || L(leak));
 // B1 board rows
 const want = new Set(((b1?.rows ?? []) as Any[]).filter((r) => r.slots.some((s: Any) => !!s.shift && s.status !== "DAY_OFF" && s.status !== "NO_SCHEDULE")).map((r) => r.employeeId as string));
 const got = new Set(idsWith(o1.html, "hr-hub-board-row-").map((x) => x.slice(17)));
 const b1r = { board: !!elOf(o1.html, "hr-hub-board"), sameSet: want.size > 0 && [...want].every((x) => got.has(x)) && [...got].every((x) => want.has(x)) || `want ${want.size} got ${got.size}`, named: [...got].every((id) => { const r = (b1.rows as Any[]).find((x) => x.employeeId === id); return !!r && elOf(o1.html, `hr-hub-board-row-${id}`).includes(r.name); }), noDayOff: !got.has(E.a7.id) };
 chk("B1", all(b1r), "all", fails(b1r));
 // B2 header
 const unitEl = elOf(o1.html, "hr-hub-unit"), prev = attrOf(elOf(o1.html, "hr-hub-day-prev"), "href"), next = attrOf(elOf(o1.html, "hr-hub-day-next"), "href");
 const b2 = { unit: !!unitEl && [X.U1, X.U2].every((u) => unitEl.includes(u)), prev: queryOf(prev || "/").day === b1?.prevDay, next: queryOf(next || "/").day === b1?.nextDay,
  roster: /\/hr\/roster$/.test(attrOf(elOf(o1.html, "hr-hub-roster-link"), "href")), add: /\/hr\/employees\?add=1$/.test(attrOf(elOf(o1.html, "hr-hub-add-employee"), "href")), noRosterForPay: !elOf((await view(W.pay)).html, "hr-hub-roster-link") };
 chk("B2", all(b2), "all", fails(b2));
 // A1 approvals with checkboxes
 const prevw = await M.inbox.listInbox(ctx, own(W.owner), { take: 5 }), items = ((prevw?.items ?? []) as Any[]);
 const bat = items.filter((i) => i.batchable), adj = items.filter((i) => i.type === "ADJUSTMENT");
 const checkOk = (id: string) => { const el = elOf(o0.html, `hr-inbox-check-${id}`); return !!el && !/\sdisabled=/.test(el); };
 const a1 = { premise: bat.length >= 2 && adj.length >= 1 || `bat=${bat.length} adj=${adj.length}`, checks: bat.every((i) => checkOk(i.id)), adjNot: adj.every((i) => !checkOk(i.id)), bar: !!elOf(o0.html, "hr-inbox-batch") && !!elOf(o0.html, "hr-inbox-batch-approve") && !!elOf(o0.html, "hr-inbox-batch-reject"), viaInboxBatch: o0.client.some((c) => c.name === "InboxBatch.tsx" && c.props?.compact !== true) };
 chk("A1", all(a1), "all", fails(a1));
 // M1 month card
 const rep = await M.rep.loadReport(ctx, own(W.owner), { report: "time", period: MONTH }), card = elOf(o0.html, "hr-hub-month");
 const tot = rep?.totals ?? {}, talk = ((rep?.rows ?? []) as Any[]).filter((r) => M.ai.meetsPattern?.({ lateCount: Number(r.values.lateCount ?? 0), absentDays: Number(r.values.absentDays ?? 0) })).map((r) => r.employeeId as string);
 const talkGot = idsWith(card, "hr-hub-month-talk-").map((x) => x.slice(18));
 const m1r = { report: rep?.ok === true || String(rep?.code), card: !!card, totals: ["lateCount", "absentDays", "leaveDays"].every((k) => showsNum(card, Number(tot[k] ?? -1)) || (tot[k] !== undefined && card.includes(`>${tot[k]}<`))) || `want ${tot.lateCount}/${tot.absentDays}/${tot.leaveDays}`, talk: talk.length > 0 && talk.every((t) => talkGot.includes(t)) && talkGot.every((t) => talk.includes(t)) || `want ${talk.length} got ${talkGot.length}`, noneForKiosk: !elOf((await view(W.kiosk)).html, "hr-hub-month") };
 chk("M1", all(m1r), "all", fails(m1r));
 // D1 due strip
 const due = (((await M.life.lifecycleDue(ctx, own(W.owner)))?.items ?? []) as Any[]).slice().sort((a, b) => String(a.date ?? "9999").localeCompare(String(b.date ?? "9999")));
 const dueEl = elOf(o0.html, "hr-hub-due"), dt = textOfHtml(dueEl);
 const d1 = { premise: due.length >= 4 || `items=${due.length}`, first3: due.slice(0, 3).every((i) => dt.includes(i.name)), notFourth: due.length < 4 || !dt.includes(due[3].name) || due.slice(0, 3).some((i) => i.name === due[3].name), more: due.length <= 3 || dt.includes(`+${due.length - 3}`), cards: idsWith(dueEl, "hr-hub-due-").length >= Math.min(3, due.length), link: hrefsIn(dueEl).some((h) => /\/hr\/employees(\?|$)/.test(h)) };
 chk("D1", all(d1), "all", fails(d1));
 // L1 layout markers
 const l1 = { wide: /class="[^"]*\bmax-w-7xl\b/.test(o0.html) && !/^<div class="[^"]*max-w-2xl/.test(o0.html), twoCol: o0.html.includes("xl:grid-cols-[minmax(0,1fr)_400px]"), kpi5: o0.html.includes("md:grid-cols-5"), kpi2: /class="[^"]*\bgrid-cols-2\b[^"]*md:grid-cols-5|class="[^"]*md:grid-cols-5[^"]*\bgrid-cols-2\b/.test(o0.html) };
 chk("L1", all(l1), "all", fails(l1));
 // P1/P2 privacy controls
 const mg = await view(W.mgr), py = await view(W.pay), money = [String(SAL), (SAL / 100).toFixed(2), (SAL / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }), "31,234", "31,235"];
 const p1 = { mgrRendered: !mg.err && mg.html.length > 500, mgrNoMoney: !/฿/.test(mg.html) && !money.some((s) => mg.html.includes(s) || mg.clientText.includes(s)), payNoBoard: !py.err && !elOf(py.html, "hr-hub-board") && !elOf(py.html, "hr-overview-today") && !elOf(py.html, "hr-hub-kpi-arrived") };
 chk("P1", all(p1), "all", fails(p1));
 const p2 = { owner: !!elOf(o0.html, "hr-labor-card"), pay: !!elOf(py.html, "hr-labor-card"), mgrNone: !elOf(mg.html, "hr-labor-card") };
 chk("P2", all(p2), "all", fails(p2));
 // G1 kiosk · G2 member
 const kv = await view(W.kiosk), kl = elOf(kv.html, "hr-hub-kiosk-link");
 const g1 = { rendered: !kv.err || kv.err, noStrip: !/\/hr\/(leave|attendance|employees|payroll)"/.test(kv.html), card: /\/hr\/kiosk$/.test(attrOf(kl, "href")), noCount: !/\d+\s*คน/.test(textOfHtml(kv.html)) };
 chk("G1", all(g1), "all", fails(g1));
 const mv = await view(W.member);
 const g2 = { rendered: !mv.err || mv.err, noOverview: !elOf(mv.html, "hr-overview") && !elOf(mv.html, "hr-hub-board") && !idsWith(mv.html, "hr-inbox-").length };
 chk("G2", all(g2), "all", fails(g2));
 // I1 en
 const en = await view(W.owner, { day: DM1 }, "en"), thHub = Object.values(((JSON.parse(rd("src/messages/th/common.json")).hr ?? {}).hub ?? {}) as Record<string, unknown>).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v as object).filter((x) => typeof x === "string"))) as string[];
 const enText = textOfHtml(en.html), thText = textOfHtml(o1.html);
 const i1 = { hub: thHub.length > 0, rendered: !en.err || en.err, noMissing: !/‹MISSING:hr\.hub/.test(en.html + o1.html) && !CUR.missing.some((m) => m.includes("hr.hub")), noThai: !thHub.filter((t) => /[฀-๿]/.test(t) && t.length > 1).some((t) => enText.includes(t.replace(/\{[^}]*\}/g, "").trim().slice(0, 12))), thUsed: thHub.some((t) => thText.includes(t.replace(/\{[^}]*\}.*$/, "").trim().slice(0, 8))) };
 chk("I1", all(i1), "all", fails(i1));
 // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ R-F5-1 attendance card · R-F5-2 reads under the page gates ◂
 {
  const priv = await imp("@/lib/modules/hr/privacy"), svc = await imp("@/lib/modules/hr/service"), scp = await imp("@/lib/modules/hr/scope"), attPg = await imp("@/app/app/sys/[id]/hr/attendance/page");
  const ATT = `/app/sys/${X.HRS}/hr/attendance`, isAtt = (u: string) => u === ATT || [`?`, `/`, `#`].some((c) => u.startsWith(ATT + c));
  const anchors = (html: string) => [...html.matchAll(/<a\b[^>]*>/g)].map((m) => ({ href: /\shref="([^"]*)"/.exec(m[0])?.[1]?.replace(/&amp;/g, "&") ?? "", cls: /\sclass="([^"]*)"/.exec(m[0])?.[1] ?? "" }));
  const propsHave = (r: Rendered, s: string) => r.client.some((c) => { try { return JSON.stringify(c.props ?? {}).includes(s); } catch { return false; } });
  const sqlOf = (qs: string[], table: string) => qs.filter((q) => new RegExp(`FROM "(?:public"\\.")?${table}"`).test(q)).at(-1) ?? "";
  const VW: [string, Any, boolean][] = [["O", W.owner, false], ["M", W.mgr, false], ["MB", W.mgrU1, false], ["P", W.pay, false], ["PB", W.payU1, false], ["K", W.kiosk, false], ["N", W.member, false], ["SL", W.staffL, true]];
  const WANT_ATT: Record<string, boolean> = { O: true, M: true, MB: true, P: false, PB: false, K: false, N: false, SL: true }; // premise = nav.ts:47-48 (roster || linked) on this fixture
  const f1: string[] = [], f2: string[] = [], f3: string[] = [], f5: string[] = [], info: string[] = []; // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ + f5 ◂
  let ctlE = false, ctlL = false;
  for (const [k, w, linked] of VW) {
   const tabs = ((await M.ui.hrTabsFor?.(X.HRS, own(w), linked)) ?? []) as { href: string }[], tabAtt = tabs.some((t) => isAtt(t.href));
   const pg = await renderPage(attPg, w.cookie, ATT, { id: X.HRS }, {}, "th"), pg404 = /NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND/.test(pg.err);
   if (tabAtt !== WANT_ATT[k]) f1.push(`${k}:premise tabs=${tabAtt}`);
   if (tabAtt === pg404 || (!pg404 && !!pg.err)) f1.push(`${k}:ctl tabs=${tabAtt} page=${pg.err ? pg.err.slice(0, 40) : "ok"}`);
   const gate = priv.hrPageAccessOf?.(own(w)) ?? {};
   const sigE = sqlOf(await capture(() => svc.listEmployees(ctx, 200, scp.hrScopeOf(own(w)))), "HrEmployee");
   const sigL = sqlOf(await capture(() => svc.pendingLeaves(ctx, 100, svc.leaveListScopeOf(own(w), w.id))), "HrLeave");
   let hub: Rendered = { html: "", client: [], clientText: "", err: "" };
   const qs = await capture(async () => { hub = await view(w); });
   const as = anchors(hub.html), card = as.some((a) => isAtt(a.href) && /(^|\s)card(\s|$)/.test(a.cls)), anyAtt = as.some((a) => isAtt(a.href)) || propsHave(hub, ATT);
   const readE = !!sigE && qs.includes(sigE), readL = !!sigL && qs.includes(sigL);
   info.push(`${k}:tabs=${tabs.length}${tabAtt ? "+att" : ""} page=${pg404 ? 404 : "ok"} card=${card} reg=${gate.register} leave=${gate.leave} empSQL=${readE} leaveSQL=${readL}${sigL ? "" : "(no sig)"}`);
   if (hub.err) f1.push(`${k}:render ${hub.err.slice(0, 50)}`);
   if (tabAtt && !card) f1.push(`${k}:no card`);
   if (!tabAtt && anyAtt) f1.push(`${k}:link to 404${card ? " (card)" : ""}`);
   if (!sigE) f2.push(`${k}:no listEmployees SQL learnt`);
   if (gate.register !== true && readE) f2.push(`${k}:listEmployees read (register=false)`);
   if (gate.leave !== true && readL) f3.push(`${k}:pendingLeaves read (leave=false)`);
   if (k === "O") { ctlE = readE; ctlL = readL; }
   { // ORACLE-EDIT (HR VIS-5b F5 · controller) ▸ F5 month-card calendar links (the link N2/F1 did not name) ◂
    const mEl = elOf(hub.html, "hr-hub-month"), rows = idsWith(mEl, "hr-hub-month-talk-").length, cal = anchors(mEl).filter((a) => isAtt(a.href)).length;
    if (["P", "PB", "O", "M", "MB"].includes(k) && (!mEl || rows < 1)) f5.push(`${k}:premise card=${!!mEl} rows=${rows}`);
    if (tabAtt ? cal !== rows : cal > 0) f5.push(`${k}:rows=${rows} calendar links=${cal} tab=${tabAtt}`);
    info.push(`${k}:month rows=${rows} cal=${cal}`);
   }
  }
  console.log(`  ℹ F5 ${info.join(" · ")}`);
  chk("F1", !f1.length, "card iff tab · no 404 link", L(f1));
  chk("F2", ctlE && !f2.length, "only register viewers", `${L(f2)} control(O read)=${ctlE}`);
  chk("F5", !f5.length, "calendar link iff tab", L(f5)); // ORACLE-EDIT (HR VIS-5b F5 · controller) ◂
  chk("F3", ctlL && !f3.length, "only leave viewers", `${L(f3)} control(O read)=${ctlL}`);
 }
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
