// QC HR VIS-5a payroll area to mockup 06 (layout only) · brief hr-brief-VIS-5a.md (+ CONTROLLER RULINGS Q1–Q7) · notes hr-VIS-5a-oracle.md · ⚠️ ORACLE-EDIT only · QC_FORCE=1 · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-vis-5a.mts
// Method: statics on the diff vs merge-base(HEAD, session/hr) · pure vectors · server pages rendered with renderToStaticMarkup inside a Next request scope (priv-2 C1) ·
//   next-intl/server served by a CJS shim with the real message files (lib installIntlShim) — pictures stay with the controller's walk.
import { execFileSync } from "node:child_process";
import { type Any, type Def, ROOT, rd, errText, sha, stripComments, diffHunks, changedVsBase, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, testidsOf, jsonOf, msgParity, srcFiles, spawnTsx, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, loadOpt, modState } from "./qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue } from "./qc-hr-h4.3-lib.mjs";
import { v1Item, v2Item } from "./qc-hr-h3.8-lib.mjs";
import { changedFiles, fileAt, bodyOf } from "./qc-hr-priv-2-lib.mjs";
import { VIEWS, MSG, LOC, installIntlShim, idsIn, idMatch, elById, textOfHtml, THAI, AMOUNT, labelOf, satArith, minus, vis5aUnmarked, oracleEditOk, payrollParams, ROUTES, ROUTE_SRC, spOf, appPages, serverActionCaptures, swcBoundArgs } from "./qc-hr-vis-5a-lib.mjs";

const SUITE = "qc-hr-vis-5a", ARGV = process.argv.slice(2), FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run"), PFX = "qc-hr-vis5a-";
const TICKET_BASE = "09713f4305eb3b8c1a5f8545f909efec0e30b96e";
const git = (a: string[]) => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };
const BASE = process.env.QC_VIS5A_BASE || git(["merge-base", "HEAD", "session/hr"]) || TICKET_BASE;
const H = "src/lib/modules/hr/";
const F = { page: "src/app/app/sys/[id]/hr/payroll/page.tsx", payUi: `${H}payroll-ui.tsx`, runUi: `${H}payroll-run-ui.tsx`, repUi: `${H}reports-ui.tsx`, label: `${H}period-label.ts`, view: `${H}pay-run-view.ts`, th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json", mx: "scripts/walk-hr-matrix.json", payroll: `${H}payroll.ts`, rr: `${H}payroll-run-rules.ts` };
/** brief §7 VIS5A_ALLOW (src: every hunk "HR VIS-5a" + ◂ · JSON data files: no comment syntax ⇒ exempt from the marker) */
const ATT_PAGE = "src/app/app/sys/[id]/hr/attendance/page.tsx"; // ORACLE-EDIT (HR VIS-5a · controller r4 A1): the same closure defect sits in the corrections actions of this page — builder fixes it here (every hunk marked) ◂
const ALLOW_SRC = [F.page, F.payUi, F.runUi, F.repUi, F.label, F.view, ATT_PAGE];
const ALLOW_DATA = [F.th, F.en, F.inv, F.mx];
const OWN = ["scripts/qc-hr-vis-5a.mts", "scripts/qc-hr-vis-5a-lib.mts"];
const TOOL = ["scripts/seed-hr-walk.mts", "scripts/walk-hr.mts"]; // ORACLE-EDIT (HR VIS-5a · controller r4): + walker PAGE-CRASH / press probe / FIT-CLIP / ytd-link reveal ◂ // ORACLE-EDIT (HR VIS-5a · controller): walk seed OT row for the r3 add/OT column (every hunk "HR VIS-5a" + ◂, checked in S2) ◂
// ORACLE-EDIT (HR VIS-5d · controller) S1/S2/S3/S5: explicit allowlist — the later ticket VIS-5d (brief §8): its src files + walk tools when every hunk adds a line with "HR VIS-5d" and "◂" (new settings-view.ts · settings-ui.tsx · *TemplateRowsEditor*.tsx: marker in lines 1–3) · its oracle + the older oracles it edited when every hunk adds "HR VIS-5d" · unmarked still fails ◂
const V5D_EDIT = ["src/app/app/sys/[id]/hr/settings/page.tsx", "src/app/app/sys/[id]/hr/settings/law/page.tsx", "src/app/app/sys/[id]/hr/settings/ApiKeysCard.tsx", ...["law-ui", "lifecycle-ui", "line-ui", "work-entries-ui", "labor-ui", "attendance-pay-ui", "payroll-run-ui", "payroll-accounting-ui", "bank-files/ui", "filings/ui", "leave-presets-ui"].map((x) => `${H}${x}.tsx`), "scripts/walk-hr.mts", "scripts/seed-hr-walk.mts"], V5D_OR = ["vis-5d", "vis-5-lib", "vis-5a", "h3.6", "h3.9", "h4.2-lib", "h4.3-lib", "priv-2", "leave-3", "preprod-1"].map((x) => `scripts/qc-hr-${x}.mts`); // ORACLE-EDIT (HR VIS-5d · controller) ◂
const v5dOk = (f: string): boolean => { const hs = diffHunks(BASE, f) ?? []; if (/^src\/lib\/modules\/hr\/(settings-view\.ts|settings-ui\.tsx|[\w-]*TemplateRowsEditor[\w-]*\.tsx)$/.test(f)) return fileAt(BASE, f) === null && rd(f).split("\n").slice(0, 3).join("\n").includes("HR VIS-5d"); return (V5D_EDIT.includes(f) || V5D_OR.includes(f)) && hs.length > 0 && hs.every((h) => h.added.some((l) => l.includes("HR VIS-5d") && (V5D_OR.includes(f) || l.includes("◂")))); }; // ORACLE-EDIT (HR VIS-5d · controller) ◂
/** brief §7 "Untouched" — whole files/dirs */
const UNTOUCHED = [F.payroll, F.rr, `${H}privacy.ts`, `${H}privacy-shared.ts`, `${H}bank-files`, `${H}filings`, `${H}reports.ts`, `${H}reports-rules.ts`, `${H}scope.ts`, "src/lib/core", "prisma", ...srcFiles("src/lib/modules/hr").filter((f) => /actions\.ts$/.test(f))];
/** loaders/gates the payroll page reads — bodies hashed vs base (privacy + I/O pins) */
const BODIES: [string, string[]][] = [
 [F.payroll, ["previewPayrollRunV2", "listRuns", "listSalaryProfiles", "listAdjustments", "runExclusions", "strandedAdjustments", "giveBackPeriodOf", "getPayrollEngine", "payAccountsOfRun", "getPayrollAccounting", "canRunV2"]],
 [`${H}scope.ts`, ["hrScopeOf", "isAllBranches", "inPayScope", "payScopeWhere", "payScopeEmployeeIds"]], ["src/lib/core/rbac.ts", ["canViewPayroll"]], [`${H}privacy.ts`, ["hrViewerOf"]],
 [`${H}reports.ts`, ["loadReport", "exportReport", "reportAccessOf"]], [`${H}stock-charge.ts`, ["stockConsentByAdjustment"]], [`${H}work-entries.ts`, ["canReadWorkEntries"]],
 [`${H}bank-files/service.ts`, ["bankGateOf"]], [`${H}filings/service.ts`, ["gate"]], [`${H}payslip.ts`, ["certGate"]], [`${H}payroll-opening.ts`, ["listOpeningYtd"]],
];
/** privacy lines that must survive the move verbatim (whitespace-normalized, comments stripped) */
const KEEP: [string, string[]][] = [
 [F.runUi, ["const viewer = hrViewerOf(auth);", 'const payV = auth.active.role === "OWNER" || (auth.active.permissions as Record<string, unknown> | null)?.["hr.payroll.read"] === true;', 'const mgrV = !payV && auth.active.role === "MANAGER";', "if (!payV && !mgrV) return null;", "const act: Run2Actions = payV ? actions : { create: null, rebuild: null, approve: null, pay: null, reverse: null, sync: null, confirm: actions.confirm };", "await previewPayrollRunV2(ctx, viewer, { runId:"]],
 [F.payUi, ["if (!canViewPayroll(membership)) {", "const scope = hrScopeOf(membership);", "const allBranches = isAllBranches(scope);", "listEmployees(ctx, 200, scope),", "listAdjustments(ctx, undefined, 200, scope),", "const employees = listed.filter((e) => inPayScope(scope, e.unitId));", "const payIds = await payScopeEmployeeIds(ctx, scope);", "const inPay = (employeeId: string) => payIds === null || payIds.includes(employeeId);", 'const shownItems = (items: (typeof runs)[number]["items"]) => (allBranches ? items : items.filter((it) => inPay(it.employeeId)));']],
];
/** new run-screen ids (brief §7 names + oracle-pinned names where the brief leaves them open: totals · bar · jv) */
const NEW_IDS = ["hr-run2-banner", "hr-run2-drawer", "hr-run2-excluded", "hr-run2-doclink-*", "hr-run2-totals", "hr-run2-bar", "hr-run2-jv"];
const OLD_RUN2 = ["hr-run2", "hr-run2-flash", "hr-run2-row-*", "hr-run2-create", "hr-run2-sync", "hr-run2-steps", "hr-run2-tiles", "hr-run2-table", "hr-run2-lines-*", "hr-run2-warn", "hr-run2-review", "hr-run2-minutes", "hr-run2-branch-*", "hr-run2-rebuild", "hr-run2-approve", "hr-run2-pay", "hr-run2-reverse", "hr-run2-ytd-link", "hr-run2-engine", "hr-run2-engine-save"];
const V2BTN = /^hr-run2-(approve|pay|reverse|rebuild|branch-.+|sync)$/;
/** one signature per view (brief §3 table) — a view shows its own, none of the others */
const SIG: Record<string, RegExp> = { run: /^hr-run2$/, hours: /^hr-we-panel$/, adjust: /^hr-stock$/, profiles: /^hr-salary-ot-rate/, docs: /^hr-(bank-|filing-|salarycert)/, ytd: /^hr-ytd-card$/, history: /^hr-payroll-(create$|run-)/ };

/** CONTROLLER RULINGS r2 — nav per viewer (existing gates) · section roots per viewer recorded from the base page (fixture below) */
const NAV_WANT: Record<string, string[]> = { owner: [...VIEWS], payU1: ["run", "hours", "adjust", "profiles", "history"], mgr: ["run", "hours", "adjust"] };
const NOACCESS = "ข้อมูลเงินเดือนจำกัดเฉพาะเจ้าของกิจการ";
const ROOT_ID: Record<string, RegExp> = { run2: /^hr-run2$/, we: /^hr-we-panel$/, stock: /^hr-stock$/, stockForm: /^hr-stock-form$/, bank: /^hr-bank-/, filing: /^hr-(filing|taxcert)-/, salarycert: /^hr-salarycert/, ytd: /^hr-ytd-card$/ };
const ROOT_TXT: Record<string, RegExp> = { noaccess: new RegExp(NOACCESS), attendance: /การเข้างานประกอบการจ่าย/, adjust: /OT · คอมมิชชั่น · หักเงิน/, create: /สร้างรอบจ่ายเงินเดือน/, runs: /รอบจ่ายเงินเดือน \(\d+\)/ };
const rootsOf = (h: string): string[] => { const ids = [...idsIn(h).keys()], t = textOfHtml(h), out = Object.keys(ROOT_ID).filter((k) => ids.some((i) => ROOT_ID[k]!.test(i))).concat(Object.keys(ROOT_TXT).filter((k) => ROOT_TXT[k]!.test(t))); if (/เงินเดือนพนักงาน/.test(t) && !ROOT_TXT.noaccess!.test(t)) out.push("profiles"); return out; };
const BASE_ROOTS: Record<string, string[]> = { // recorded from the base page dc478e07b with this fixture (forced run 14 Nov) — ORACLE-EDIT only
 owner: ["adjust", "attendance", "bank", "create", "filing", "profiles", "run2", "runs", "salarycert", "stock", "stockForm", "we", "ytd"],
 payU1: ["adjust", "attendance", "create", "profiles", "run2", "runs", "stock", "we"],
 mgr: ["noaccess", "run2", "stock", "stockForm", "we"],
};
const N1S: { n1: Record<string, boolean>; code: string[]; other: Set<string> } = { n1: {}, code: [], other: new Set() };
/** Tailwind display at width w (base → sm 640 → md 768 → lg 1024 → xl 1280 → 2xl 1536) */
const BP: Record<string, number> = { "": 0, sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };
const shownAt = (cls: string, w: number) => { let on = true; for (const bp of Object.keys(BP)) { if (BP[bp]! > w) continue; for (const tk of cls.split(/\s+/)) { const [p, d] = tk.includes(":") ? [tk.slice(0, tk.indexOf(":")), tk.slice(tk.indexOf(":") + 1)] : ["", tk]; if (p !== bp) continue; if (d === "hidden") on = false; else if (/^(table-cell|block|flex|inline|inline-block|grid|inline-flex)$/.test(d)) on = true; } } return on; };
const satOf = (t: string) => { const m = /(−|-)?฿([\d,]+\.\d{2})/.exec(t); return m ? Math.round(Number(m[2]!.replace(/,/g, "")) * 100) * (m[1] ? -1 : 1) : 0; };
const D = (id: string, g: string, sb: string, t: string): Def => [id, g, ({ C: "CRITICAL", M: "MAJOR", m: "MINOR" } as const)[sb[0] as "C"], sb[1] === "R" ? "RED" : "GREEN", t];
const CHECKS: Def[] = [
 D("S1", "§7 untouched", "CG", "payroll-rules sha · payroll-run-rules byte-identical · untouched files = base"),
 D("S2", "§7 VIS5A_ALLOW", "MG", "changed files ⊆ allow list · older oracle edits marked ORACLE-EDIT (HR VIS-5a · controller)"),
 D("S3", "§1", "MG", "every src hunk adds HR VIS-5a ◂ · new file marker in first 3 lines"),
 D("S4", "§7 privacy · I/O", "CG", "action + loader/gate bodies hash = base · privacy lines kept verbatim"),
 D("S5", "§7 money", "CG", "no new *Satang arithmetic in tsx · no new \"use client\" file"),
 D("S6", "§7 F16.1", "MG", "fitness-hr F16.1 clean"),
 D("S7", "§3 wiring", "MR", "page: payViewOf · we → view=hours · ytd link ?view=ytd · nav hr-pay-view-* · old imports kept"),
 D("V1", "§3 payViewOf", "CR", "payViewOf vectors (redirects · links · GET forms · default · unknown · explicit)"),
 D("V2", "§3 coverage", "MG", "[meta] vector table covers every payroll param the frozen actions emit"),
 D("K1", "§3 parts", "MR", "PayrollSection parts: disjoint · union = default"),
 D("K2", "§7 keep ids", "CG", "every base inventory id of /hr/payroll still in code"),
 D("K3", "§7 h3.4 S1.9", "MG", "hr-run2-* written only in payroll-run-ui.tsx · base hr-run2 ids kept"),
 D("K4", "§4 §7 new ids", "MR", "new run-screen ids in payroll-run-ui.tsx (banner · drawer · excluded · doclink · totals · bar · jv)"),
 D("K5", "§6", "MR", "run table: no min-w-[ · md:table-cell · one table"),
 D("W1", "§3 views r2", "MR", "page per view: own sections only · no id in 2 views · every legacy id in a view · nav per viewer (r2) · no-access notice in run only · engine-1 history"),
 D("W2", "r2 sections", "MG", "[control] sections per viewer (owner · branch payroll · manager): union over nav views = base set"),
 D("R0", "§5 none", "mG", "[control] period without run: create shown"),
 D("R1", "§5 x1/x2", "MR", "live run in period: no create control"),
 D("R2", "§5 x3", "MR", "REVERSED: banner + read-only table + create · no run buttons"),
 D("R3", "§5 x4", "MR", "v1 run: banner + history link · no v2 controls"),
 D("R4", "§5 labels", "MR", "period label th/en · no ISO period · no engine wording"),
 D("R5", "PRIV-2 R1c", "CG", "[privacy] limited viewer: in-scope rows/totals only + excluded note"),
 D("R6", "§7 11a PB", "MR", "hr-run2-excluded: limited viewer only"),
 D("R7", "Q3", "CG", "[privacy] no whole-run figure for limited · accounting callout without amounts"),
 D("R8", "§8c", "CG", "[privacy] manager: no ฿ in run screen"),
 D("R9", "§4 drawer", "MR", "?emp= drawer with that row's lines · unknown emp → none"),
 D("R10", "§7 ?emp", "CG", "[privacy] ?emp out of pay scope shows nothing of that person"),
 D("R11", "Q1", "mR", "OT + commission figures (tiles/col) = Σ stored lines"),
 D("R12", "§8c EN-THAI", "mG", "en run screen: no Thai from UI strings"),
 D("P1", "§5 periodLabel", "MR", "periodLabel vectors th/en"),
 D("B1", "§5 13b", "MR", "13b screen: status translated · engine column hidden · net sticky right-0"),
 D("B2", "Q6", "CG", "[control] 13b data/CSV unchanged (engine + raw status kept)"),
 D("I1", "§7 msgs", "MG", "hr.run2 th=en · every key the run screen uses exists in th and en"),
 D("I2", "§3 §5 msgs", "MR", "hr.payview.* 7 views th+en · hr.run2.title without engine wording · page desc via messages"),
 D("I3", "Q5", "MG", "no Thai literal in added code lines (payroll-ui.tsx moved sections exempt)"),
 D("N1", "§7 inventory r3", "MR", "inventory rows for new ids · every id rendered on payroll has a payroll row (ids owned by another page: that page's row) · hr-run2-lines-* kind link"),
 D("T1", "r3 add/OT", "MR", "run table add vs OT: ≥1280 add excl. OT + OT col · <1280 stored add + 'รวม OT' · each row/total sums to net · no-OT row equal · limited totals in-scope"),
 D("N2", "Q7", "mR", "walk matrix states for hours/adjust/profiles/docs/ytd/history"),
 D("A1", "r4 A1", "CR", "no inline \"use server\" in an HR page/layout captures a function-valued local of its component (TS compiler API · all HR pages)"),
 D("A2", "r4 A1", "CR", "Next SWC server-actions transform (the build's): no bound argument of an HR inline action is function-valued · control: payroll page registers its actions"),
 D("Y1", "r4 B2", "MR", "ytd link per viewer: owner + all-branch payroll → hr-run2-ytd-link to a non-empty ytd view · branch payroll: review text, no link to ?view=ytd"),
 D("Z1", "-", "CG", "residue · outbound · intl shim used · no missing message at render"),
];
const R = makeRegistry(SUITE, "", CHECKS);
if (ARGV.includes("--list")) { R.printList(); process.exit(0); }
const { chk } = R;
const all = (r: Record<string, unknown>) => Object.values(r).every(Boolean);
const fails = (r: Record<string, unknown>) => Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "all";
const L = (xs: string[], n = 8) => xs.slice(0, n).join(" | ") || "ok";
const built = /HR VIS-5a/.test(rd(F.runUi) + rd(F.page));
if (!built && !FORCE) R.skipExit([`${F.runUi} / page.tsx carry no HR VIS-5a marker`]);
const norm = (s: string) => stripComments(s).replace(/\s+/g, " ");
const isNew = (f: string) => fileAt(BASE, f) === null;

// ═════════════ statics ═════════════
const CH = changedFiles(BASE).filter((f) => !/^(ledger|scratchpad)\//.test(f));
{
 const r = { sha: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA, runRules: !!rd(F.rr) && rd(F.rr) === fileAt(BASE, F.rr), untouched: ((u: string) => u === "unchanged" || (u.startsWith("changed: ") && u.slice(9).split(",").every(v5dOk)))(changedVsBase(BASE, UNTOUCHED)) }; // ORACLE-EDIT (HR VIS-5d · controller) S1: bank-files/ui.tsx · filings/ui.tsx (VIS-5d card files) ◂
 chk("S1", all(r), "", `${fails(r)} ${changedVsBase(BASE, UNTOUCHED).slice(0, 120)}`);
 const out = CH.filter((f) => !v5dOk(f) /* ORACLE-EDIT (HR VIS-5d · controller) S2 ◂ */ && ![...ALLOW_SRC, ...ALLOW_DATA, ...OWN].includes(f) && !(/^scripts\/qc-.*\.mts$/.test(f) && !isNew(f) && oracleEditOk(BASE, f)) && !(TOOL.includes(f) && !isNew(f) && !vis5aUnmarked(BASE, [f], isNew).length)); // ORACLE-EDIT (HR VIS-5a · controller): + TOOL ◂
 chk("S2", !out.length, "none", `outside=${L(out)} base=${BASE.slice(0, 9)}`);
 const bad = vis5aUnmarked(BASE, CH.filter((f) => ALLOW_SRC.includes(f) && !v5dOk(f)), isNew); // ORACLE-EDIT (HR VIS-5d · controller) S3: payroll-run-ui.tsx PayrollEngineCard hunks of VIS-5d ◂
 chk("S3", !bad.length, "", L(bad));
 const s4: string[] = [];
 for (const [f, ns] of BODIES) { const a = stripComments(rd(f)), b = stripComments(fileAt(BASE, f) ?? ""); for (const n of ns) { const x = bodyOf(a, n), y = bodyOf(b, n); if (!x || sha(x) !== sha(y)) s4.push(`${f.split("/").pop()}:${n}${x ? "" : "∅"}`); } }
 for (const f of srcFiles("src/lib/modules/hr").filter((p) => /actions\.ts$/.test(p))) { const a = stripComments(rd(f)), b = stripComments(fileAt(BASE, f) ?? ""); for (const m of b.matchAll(/export\s+async\s+function\s+(\w+)/g)) if (sha(bodyOf(a, m[1]!)) !== sha(bodyOf(b, m[1]!))) s4.push(`${f.split("/").pop()}:${m[1]}`); if (sha(a) !== sha(b)) s4.push(`${f.split("/").pop()}:file`); }
 for (const [f, ls] of KEEP) { const t = norm(rd(f)); for (const l of ls) if (!t.includes(norm(l))) s4.push(`${f.split("/").pop()} lost "${l.slice(0, 40)}"`); }
 chk("S4", !s4.length, "", L(s4));
 const s5: string[] = [];
 for (const f of CH.filter((p) => /^src\/.*\.tsx$/.test(p))) {
  const hs = diffHunks(BASE, f) ?? [], extra = minus(satArith(hs.flatMap((h) => h.added)), satArith(hs.flatMap((h) => h.removed)));
  if (extra.length) s5.push(`${f.split("/").pop()}: ${extra.slice(0, 3).join(" ; ")}`);
 }
 for (const f of CH.filter((p) => p.startsWith("src/") && isNew(p) && !(/^src\/lib\/modules\/hr\/(settings-view\.ts|settings-ui\.tsx|[\w-]*TemplateRowsEditor[\w-]*\.tsx)$/.test(p) && v5dOk(p)))) if (/^\s*["']use client["']/.test(rd(f))) s5.push(`new client ${f}`); // ORACLE-EDIT (HR VIS-5d · controller) S5: Q8 TemplateRowsEditor (brief §7.9) ◂
 chk("S5", !s5.length, "", L(s5));
}
{
 const o = await spawnTsx(["scripts/fitness-hr.mts"], { PATH: process.env.PATH, HOME: process.env.HOME });
 const line = o.out.split("\n").find((l) => l.includes("[F16.1]")) ?? "";
 chk("S6", line.includes("✅"), "✅ F16.1", line.slice(0, 140) || `exit ${o.code}`);
}
{
 const pg = stripComments(rd(F.page)), ru = rd(F.runUi), weL = pg.split("\n").filter((l) => /we=/.test(l) && /redirect\(/.test(l));
 const navIds = srcFiles("src").filter((p) => /\.tsx$/.test(p)).some((p) => /hr-pay-view-/.test(rd(p)));
 const r = { payViewOf: /\bpayViewOf\s*\(/.test(pg), weView: weL.length >= 2 && weL.every((l) => /view=hours/.test(l)), ytd: /\?view=ytd#hr-ytd-card/.test(ru) && !/href="#hr-ytd-card"/.test(ru), nav: navIds, imports: ["payroll-run-ui", "work-entries-ui", "stock-charge-ui", "payroll-opening-ui"].every((m) => new RegExp(`from\\s+["'][^"']*${m}["']`).test(pg)), runUi: /YTD_OPENING/.test(ru) && /#hr-ytd-card/.test(ru) && /PAY_SCOPE_EXCLUDED_TEXT/.test(ru) && /PAY_SCOPE_EXCLUDED_TEXT/.test(rd(F.payUi)) };
 chk("S7", all(r), "", fails(r));
}
// ═════════════ r4 A1: closures of inline server actions (controller ruling · round-4 review A1) ═════════════
const A1_DIRS = ["src/app/app/sys/[id]/hr"], A1_INFO = ["src/app/app/sys/[id]/payroll", "src/app/app/me/hr"]; // fail = HR app pages · info = other HR-owned routes (listed, not failed)
const A1_HITS: string[] = [];
{
 const files = appPages([...A1_DIRS, ...A1_INFO]), inHr = (f: string) => A1_DIRS.some((d) => f.startsWith(`${d}/`));
 const cap = await serverActionCaptures(files);
 const bad = cap.hits.filter((h) => inHr(h.file)), info = cap.hits.filter((h) => !inHr(h.file));
 for (const h of cap.hits) A1_HITS.push(`${h.file}:${h.line} ${h.action} captures ${h.name} (${h.kind}, :${h.declLine})${inHr(h.file) ? "" : " [info]"}`);
 const byFile = [...new Set(bad.map((h) => h.file))].map((f) => `${f.split("/hr/")[1] ?? f}: ${[...new Set(bad.filter((h) => h.file === f).map((h) => `${h.action}→${h.name}`))].join(" ")}`);
 chk("A1", !cap.err && cap.actions > 0 && !bad.length, `${cap.actions} inline actions in ${files.length} files`, cap.err ? `analyzer: ${cap.err}` : `${bad.length} captures${info.length ? ` (+${info.length} info)` : ""} · ${byFile.join(" | ")}`);
 const sw = await swcBoundArgs(files), a2: string[] = [], pay = sw.per.get(F.page);
 for (const [f, v] of sw.per) for (const names of v.bound) for (const n of names) { const k = cap.locals.get(f)?.get(n); if (k && inHr(f)) a2.push(`${f.split("/hr/")[1] ?? f}:${n} (${k})`); }
 const ctl = !!pay && pay.regs >= 7;
 chk("A2", !sw.err && ctl && !a2.length, "", sw.err ? `swc: ${sw.err}` : `control=${ctl}(regs ${pay?.regs ?? 0}) bound fn args: ${L([...new Set(a2)], 10)} [${a2.length}]`);
 console.log(`A1 hits (${A1_HITS.length}):\n  ${A1_HITS.join("\n  ") || "none"}`);
}
// ═════════════ pure ═════════════
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
installNetGuard();
installIntlShim();
const { P, coreHash } = await qc4Env(SUITE);
const PV = await loadOpt(F.view, "@/lib/modules/hr/pay-run-view"), PL = await loadOpt(F.label, "@/lib/modules/hr/period-label");
{
 const fn = PV?.payViewOf, bad: string[] = [];
 if (typeof fn !== "function") bad.push(`payViewOf: ${modState(PV, F.view)}`);
 else for (const [src, q, want] of ROUTES) { let got: unknown; try { got = fn(spOf(q)); } catch (e) { got = errText(e); } if (got !== want) bad.push(`${src} ?${q} → ${String(got)} ≠ ${want}`); }
 chk("V1", !bad.length, `${ROUTES.length} vectors`, `${bad.length} bad: ${L(bad, 5)}`);
 const miss: string[] = [];
 for (const [tag, f] of Object.entries(ROUTE_SRC)) { const have = new Set(ROUTES.filter(([s]) => s === tag).flatMap(([, q]) => [...new URLSearchParams(q).keys()])); for (const p of payrollParams(rd(f))) if (!have.has(p) && !["systemId", "ack", "q"].includes(p)) miss.push(`${tag}:${p}`); }
 chk("V2", !miss.length, "", L(miss));
}
{
 const fn = PL?.periodLabel, bad: string[] = [];
 const vec: [string, "th" | "en", string][] = [["2026-09", "th", "ก.ย. 2569"], ["2026-09", "en", "Sep 2026"], ["2026-01", "th", "ม.ค. 2569"], ["2025-12", "th", "ธ.ค. 2568"], ["2026-12", "en", "Dec 2026"], ["2026-06", "th", "มิ.ย. 2569"], ["2027-02", "en", "Feb 2027"]];
 if (typeof fn !== "function") bad.push(`periodLabel: ${modState(PL, F.label)}`);
 else for (const [k, l, w] of vec) { let g: unknown; try { g = fn(k, l); } catch (e) { g = errText(e); } if (g !== w) bad.push(`${k}/${l}=${String(g)}`); }
 chk("P1", !bad.length, "", L(bad));
}
// ═════════════ messages · inventory · matrix ═════════════
{
 const th = jsonOf(F.th)?.hr ?? {}, en = jsonOf(F.en)?.hr ?? {}, mp = msgParity(th.run2 ?? {}, en.run2 ?? {}, []);
 const src = stripComments(rd(F.runUi)), used = new Set<string>(), pre = new Set<string>();
 for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) used.add(m[1]!);
 for (const m of src.matchAll(/\bt\(\s*`([\w]+)\$\{/g)) pre.add(m[1]!);
 const missing = [...used].filter((k) => typeof th.run2?.[k] !== "string" && typeof th.payacct?.[k] !== "string" || typeof en.run2?.[k] !== "string" && typeof en.payacct?.[k] !== "string");
 const noPre = [...pre].filter((p) => !Object.keys(th.run2 ?? {}).some((k) => k.startsWith(p)));
 chk("I1", all(mp) && !missing.length && !noPre.length, "", `${fails(mp)} missing=${L(missing)} prefix=${L(noPre)}`);
 const pv = (o: Any) => VIEWS.every((v) => typeof o?.payview?.[v] === "string" && o.payview[v].trim());
 const pg = stripComments(rd(F.page));
 const r = { payview: pv(th) && pv(en), titleTh: !/เครื่องรุ่นใหม่|รุ่นใหม่/.test(String(th.run2?.title)), titleEn: !/engine/i.test(String(en.run2?.title)), desc: !/desc="[^"]*[฀-๿]/.test(pg) };
 chk("I2", all(r), "", fails(r));
 const i3: string[] = [];
 for (const f of CH.filter((p) => ALLOW_SRC.includes(p) && p !== F.payUi)) {
  const lines = isNew(f) ? rd(f).split("\n") : (diffHunks(BASE, f) ?? []).flatMap((h) => h.added);
  const hit = lines.map((l) => stripComments(l)).filter((l) => THAI.test(l) && !/^\s*(\/\/|\*|\{\/\*)/.test(l));
  if (hit.length) i3.push(`${f.split("/").pop()}:${hit.length} «${hit[0]!.trim().slice(0, 40)}»`);
 }
 chk("I3", !i3.length, "", L(i3));
 const rows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((x) => String(x.page) === "/app/sys/[id]/hr/payroll"), ids = new Set(rows.map((x) => String(x.testid)));
 const code = testidsOf(rd(F.runUi), "hr-run2-"), lines = rows.find((x) => x.testid === "hr-run2-lines-*");
 // r3 fix: N1 is decided after the renders — a code id with no payroll row is excused only when no payroll render shows it AND another page has its row (e.g. PayrollEngineCard on /hr/settings)
 N1S.n1 = { newRows: [...NEW_IDS, "hr-pay-view-*"].every((i) => [...ids].some((t) => t === i || idMatch(t, i.replace("*", "x")))), linesLink: lines?.kind === "link" };
 N1S.code = [...code].filter((c) => !ids.has(c));
 N1S.other = new Set(((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((x) => String(x.page) !== "/app/sys/[id]/hr/payroll").map((x) => String(x.testid)));
 const st = (jsonOf(F.mx)?.states ?? []) as Any[];
 const miss = VIEWS.filter((v) => v !== "run" && !st.some((s) => String(s.page) === "/app/sys/[id]/hr/payroll" && new RegExp(`[?&]view=${v}\\b`).test(String(s.path ?? ""))));
 chk("N2", !miss.length, "", `missing view=${miss.join(",") || "none"}`);
}
{
 const baseInv = JSON.parse(fileAt(BASE, F.inv) ?? '{"rows":[]}').rows.filter((x: Any) => x.page === "/app/sys/[id]/hr/payroll") as Any[];
 const files = [...new Set([...srcFiles(H.slice(0, -1)), ...srcFiles("src/app/app/sys/[id]/hr/payroll"), ...srcFiles("src/components")])].filter((p) => /\.tsx?$/.test(p));
 const strip = (s: string) => s.replace(/-(trigger|sheet)$/, "");
 const codeIds = new Set<string>(), txt = files.map((f) => rd(f)).join("\n");
 for (const pf of ["hr-"]) for (const t of testidsOf(txt, pf)) codeIds.add(t);
 const lost = baseInv.map((x) => String(x.testid)).filter((t) => !codeIds.has(t) && !codeIds.has(strip(t)) && !txt.includes(`"${t}"`) && !(t.includes("*") && (txt.includes(t.split("*")[0]!) )));
 chk("K2", baseInv.length > 100 && !lost.length, `${baseInv.length} rows`, `lost=${L(lost)}`);
 const others = srcFiles("src").filter((p) => /\.tsx?$/.test(p) && p !== F.runUi && /["'`]hr-run2-/.test(rd(p)));
 const ids = testidsOf(rd(F.runUi), "hr-run2-"), gone = OLD_RUN2.filter((t) => t !== "hr-run2" && !ids.has(t));
 chk("K3", !others.length && !gone.length && /data-testid="hr-run2"/.test(rd(F.runUi)), "", `others=${L(others)} gone=${L(gone)}`);
 const k4 = NEW_IDS.filter((i) => !ids.has(i));
 const excl = /data-testid="hr-run2-excluded"[^\n]*PAY_SCOPE_EXCLUDED_TEXT|PAY_SCOPE_EXCLUDED_TEXT[^\n]*data-testid="hr-run2-excluded"/.test(rd(F.runUi)) || /<[^>]*data-testid="hr-run2-excluded"[^>]*>[\s\S]{0,300}PAY_SCOPE_EXCLUDED_TEXT/.test(rd(F.runUi));
 chk("K4", !k4.length && excl, "", `missing=${L(k4)} excludedOnNote=${excl}`);
 const ru = stripComments(rd(F.runUi)), tl = ru.split("\n").filter((l) => /data-testid="hr-run2-table"/.test(l));
 const k5 = { one: tl.length === 1, noMinW: tl.every((l) => !/min-w-\[/.test(l)), md: /md:table-cell/.test(ru), oneTable: (ru.match(/<table\b/g) ?? []).length === 1 };
 chk("K5", all(k5), "", fails(k5));
}

// ═════════════ DB fixture + rendered pages ═════════════
const M: Record<string, Any> = {};
for (const [k, s] of Object.entries({ sys: "@/lib/modules/system/service", ui: "@/lib/modules/hr/payroll-ui", payroll: "@/lib/modules/hr/payroll", rep: "@/lib/modules/hr/reports", page: "@/app/app/sys/[id]/hr/payroll/page", rpage: "@/app/app/sys/[id]/hr/reports/page" })) M[k] = (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const badImp = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (badImp.length) console.log(`import problems: ${badImp.join(" | ")}`);
const REAL = { ...console };
const mute = () => Object.assign(console, { log: () => {}, info: () => {}, warn: () => {}, error: () => {} });
const unmute = () => Object.assign(console, REAL);
const NX = await Promise.all(["app-render/work-async-storage.external.js", "app-render/work-unit-async-storage.external.js", "web/spec-extension/cookies.js"].map((p) => import(`next/dist/server/${p}` as string).catch(() => null))) as Any[];
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
 const [nw, nu, nc] = NX;
 if (!nw?.workAsyncStorage || !nu?.workUnitAsyncStorage || !nc?.RequestCookies) throw new Error("no Next request scope");
 const req = new Request(`http://qc.local${pathname}`, { headers: { cookie } }), jar = new nc.RequestCookies(req.headers);
 const ws = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
 const unit = { type: "request", phase: "render", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
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
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${PFX}${Date.now()}${tag}`, fx = makeFixtures(P, coreHash, SLUG);
const bkMonth = (n: number) => { const d = new Date(Date.now() + 7 * 3_600_000); const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)); return x.toISOString().slice(0, 7); };
const PER = { DRAFT: bkMonth(0), PAID: bkMonth(-1), APPROVED: bkMonth(-2), REVERSED: bkMonth(-3), V1: bkMonth(-4), NONE: bkMonth(-6), YTD: bkMonth(-5) }; // r4 Y1: YTD = second DRAFT whose anna row lacks an opening YTD
const baht = (s: number) => `${s < 0 ? "−" : ""}฿${(Math.abs(s) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const OT = { anna: 171_717, ben: 100_111 }, COM = { anna: 214_159, ben: 100_000 };
let crashed = "";
try {
 const TA = await fx.newTenant("", "QC VIS5A shop");
 const [U1, U2] = [await fx.newUnit(TA, `QCV5 Branch One ${tag}`, "u1"), await fx.newUnit(TA, `QCV5 Branch Two ${tag}`, "u2")];
 const HRS = (await M.sys.createSystem(TA, "HR", `HR ${tag}`)).id as string;
 for (const u of [U1, U2]) await M.sys.linkUnit(TA, HRS, u).catch(() => undefined);
 const s0 = (await P.appSystem.findUnique({ where: { id: HRS } }))?.settings ?? {};
 await P.appSystem.update({ where: { id: HRS }, data: { settings: { ...(s0 as object), hrPayroll: { engineVersion: 2 } } } });
 const sc = { tenantId: TA, systemId: HRS };
 const W = { owner: await fx.mkUser(TA, "owner", `QCV5 owner ${tag}`, "OWNER", [], {}), payU1: await fx.mkUser(TA, "payu1", `QCV5 payu1 ${tag}`, "STAFF", [U1], { "hr.payroll.read": true }), mgr: await fx.mkUser(TA, "mgr", `QCV5 mgr ${tag}`, "MANAGER", [U1], {}), payAll: await fx.mkUser(TA, "payall", `QCV5 payall ${tag}`, "STAFF", [], { "hr.payroll.read": true, "hr.payroll.pay": true }) }; // r4 Y1: payAll = all-branch payroll (filings gate ⇒ ytd view)
 const E: Record<string, Any> = {};
 for (const [i, [key, unit, base]] of ([["anna", U1, 2_312_300], ["ben", U1, 1_876_500], ["cara", U2, 2_987_700]] as [string, string, number][]).entries()) {
  const name = `QCV5 ${key[0]!.toUpperCase()}${key.slice(1)} ${tag}`;
  const id = await fx.mkEmp(TA, HRS, name, { code: `V${i + 1}`, startDate: "2025-01-01", position: "Barista", unitId: unit });
  await P.hrSalaryProfile.create({ data: { ...sc, employeeId: id, payType: "MONTHLY", baseSalarySatang: base, ssoEligible: true } });
  E[key] = { key, id, name, base, unit };
 }
 const L2 = (code: string, amt: number, ref = code.toLowerCase()) => ({ code, ref, day: null, minutes: null, amountSatang: amt });
 const itemOf = (e: Any, v: 1 | 2, k: number) => {
  const ot = (OT as Any)[e.key] ?? 0, com = (COM as Any)[e.key] ?? k * 1_000, add = ot + com;
  return v === 2 ? v2Item([L2("BASE", e.base, "profile"), ...(ot ? [L2("OT", ot)] : []), L2("COMMISSION", com)], { ssoBase: 1_500_000, ee: 75_000, wht: 10_000 + k * 7, whtIncome: e.base + add, add }) : v1Item(e.base, [], { add: 0, deduct: 0, gross: e.base, ssoBase: 1_500_000, ee: 75_000, wht: 10_000 + k * 7 });
 };
 const RUN: Record<string, string> = {};
 for (const [st, v] of [["DRAFT", 2], ["PAID", 2], ["APPROVED", 2], ["REVERSED", 2], ["V1", 1]] as [keyof typeof PER, 1 | 2][]) {
  const status = st === "V1" ? "PAID" : st, pk = PER[st], fin = v === 2 && (st === "PAID" || st === "APPROVED"); // reports read v2 runs once finalized (reports.ts itemsOf)
  const run = await P.hrPayrollRun.create({ data: { ...sc, periodKey: pk, payDate: new Date(`${pk}-28T12:00:00+07:00`), status, engineVersion: v, ...(fin ? { stepsJson: { finalized: true } } : {}), totalGrossSatang: 0, totalSsoEmployeeSatang: 0, totalSsoEmployerSatang: 0, totalWhtSatang: 0, totalNetSatang: 0, totalAddSatang: 0 } });
  for (const [k, e] of Object.values(E).entries()) await P.hrPayrollItem.create({ data: { ...sc, runId: run.id, employeeId: e.id, ...itemOf(e, v, k + 1) } });
  const its = (await P.hrPayrollItem.findMany({ where: { runId: run.id } })) as Any[], sum = (x: string) => its.reduce((a, i) => a + Number(i[x] ?? 0), 0);
  await P.hrPayrollRun.update({ where: { id: run.id }, data: Object.fromEntries(["Gross", "SsoEmployee", "SsoEmployer", "Wht", "Net", "Add", "Deduct"].map((x) => [`total${x}Satang`, sum(`${x[0]!.toLowerCase()}${x.slice(1)}Satang`)])) });
  RUN[st] = run.id;
 }
 { // r4 Y1 fixture: DRAFT v2 run in PER.YTD — anna's row stored ytdOpening "MISSING" and no live opening ⇒ review code YTD_OPENING (payroll.ts ytdReview)
  const run = await P.hrPayrollRun.create({ data: { ...sc, periodKey: PER.YTD, payDate: new Date(`${PER.YTD}-28T12:00:00+07:00`), status: "DRAFT", engineVersion: 2, totalGrossSatang: 0, totalSsoEmployeeSatang: 0, totalSsoEmployerSatang: 0, totalWhtSatang: 0, totalNetSatang: 0, totalAddSatang: 0 } });
  for (const [k, e] of Object.values(E).entries()) { const it = itemOf(e, 2, k + 1) as Any; if (e.key === "anna") it.snapshotJson = { ...it.snapshotJson, ytdOpening: "MISSING" }; await P.hrPayrollItem.create({ data: { ...sc, runId: run.id, employeeId: e.id, ...it } }); }
  RUN.YTD = run.id;
 }
 const runRow = async (st: string) => (await P.hrPayrollRun.findUnique({ where: { id: RUN[st] } })) as Any;
 const itemsOf = async (st: string) => (await P.hrPayrollItem.findMany({ where: { runId: RUN[st] } })) as Any[];
 console.log(`fixture ok: ${JSON.stringify(PER)}`);
 const base = `/app/sys/${HRS}/hr/payroll`;
 const cache = new Map<string, string>();
 const page = async (w: Any, q: string, loc: "th" | "en" = "th", mod = M.page, path = base): Promise<string> => {
  const key = `${w.id}|${q}|${loc}|${path}`;
  if (cache.has(key)) return cache.get(key)!;
  LOC.cur = loc;
  let h: string;
  try { h = await inScope(`${w.cookie}; NEXT_LOCALE=${loc}; locale=${loc}`, path, async () => { mute(); try { const n = await mod.default({ params: Promise.resolve({ id: HRS }), searchParams: Promise.resolve(spOf(q)) }); return await renderHtml(n); } finally { unmute(); } }); } catch (e) { h = `THROW ${errText(e)}`; }
  cache.set(key, h);
  return h;
 };
 const run2 = (h: string) => elById(h, "hr-run2");
 const ok = (h: string) => !h.startsWith("THROW") && h.length > 500;
 const idList = (h: string) => [...idsIn(h).keys()];
 const navOf = async (w: Any) => idList(await page(w, `period=${PER.DRAFT}`)).filter((i) => i.startsWith("hr-pay-view-")).map((i) => i.slice(12));
 // ── W1 views ──
 {
  const w1: string[] = [], where = new Map<string, string[]>();
  for (const v of VIEWS) {
   const h = await page(W.owner, `view=${v}&period=${PER.DRAFT}`), ids = idList(h);
   if (!ok(h)) { w1.push(`${v}:${h.slice(0, 60)}`); continue; }
   if (!ids.some((i) => SIG[v]!.test(i))) w1.push(`${v}:no own`);
   const foreign = VIEWS.filter((o) => o !== v && ids.some((i) => SIG[o]!.test(i)));
   if (foreign.length) w1.push(`${v}:+${foreign.join("/")}`);
   if (!ids.some((i) => i.startsWith("hr-pay-view-"))) w1.push(`${v}:nav`);
   for (const i of ids) if (!i.startsWith("hr-pay-view-")) where.set(i, [...(where.get(i) ?? []), v]);
  }
  const dup = [...where].filter(([, vs]) => vs.length > 1).map(([i, vs]) => `${i}@${vs.join("/")}`);
  if (dup.length) w1.push(`in 2+ views: ${dup.slice(0, 3).join(" ")}`);
  const legacy = idList(await inScope(W.owner.cookie, base, async () => { mute(); try { return await renderHtml(await M.ui.PayrollSection({ systemId: HRS })); } finally { unmute(); } }).catch(() => "")).filter((i) => !where.has(i));
  if (legacy.length) w1.push(`legacy ids in no view: ${legacy.slice(0, 3).join(",")}`);
  for (const [n, w] of [["owner", W.owner], ["payU1", W.payU1], ["mgr", W.mgr]] as const) { const got = (await navOf(w)).sort().join(","), want = [...NAV_WANT[n]!].sort().join(","); if (got !== want) w1.push(`${n} nav=${got || "none"}≠${want}`); } // r2 ruling 1 + 4
  const na = [] as string[];
  for (const v of VIEWS) if (textOfHtml(await page(W.mgr, `view=${v}&period=${PER.DRAFT}`)).includes(NOACCESS)) na.push(v);
  if (na.join(",") !== "run") w1.push(`mgr no-access notice in ${na.join("/") || "none"}≠run`); // r2 ruling 2
  // r2 ruling 3: engine-1 shop — history hidden in nav, explicit ?view=history still renders
  const s1 = (await P.appSystem.findUnique({ where: { id: HRS } }))?.settings ?? {};
  await P.appSystem.update({ where: { id: HRS }, data: { settings: { ...(s1 as object), hrPayroll: { engineVersion: 1 } } } });
  const e1nav = idList(await page(W.owner, `period=${PER.DRAFT}&e1=1`)), e1h = idList(await page(W.owner, `view=history&period=${PER.DRAFT}&e1=1`));
  await P.appSystem.update({ where: { id: HRS }, data: { settings: { ...(s1 as object), hrPayroll: { engineVersion: 2 } } } });
  if (!e1nav.some((i) => i.startsWith("hr-pay-view-")) || e1nav.includes("hr-pay-view-history")) w1.push("engine-1 nav: history shown / no nav");
  if (!e1h.some((i) => SIG.history!.test(i))) w1.push("engine-1 ?view=history empty");
  chk("W1", !w1.length, "", L(w1, 7));
  // ── W2 (r2): sections visible per viewer — union over the viewer's nav views = base set (nothing gained, nothing lost) ──
  const w2: string[] = [];
  for (const [n, w] of [["owner", W.owner], ["payU1", W.payU1], ["mgr", W.mgr]] as const) {
   const views = await navOf(w), got = new Set<string>();
   for (const q of views.length ? views.map((v) => `view=${v}&period=${PER.DRAFT}`) : [`period=${PER.DRAFT}`]) for (const r of rootsOf(await page(w, q))) got.add(r);
   const want = BASE_ROOTS[n]!, lost = want.filter((r) => !got.has(r)), gained = [...got].filter((r) => !want.includes(r));
   if (lost.length || gained.length) w2.push(`${n}: lost=${lost.join("/") || "-"} gained=${gained.join("/") || "-"} (got ${[...got].sort().join(",")})`);
  }
  chk("W2", !w2.length, "", L(w2, 3));
 }
 // ── K1 parts ──
 {
  const parts = ["profiles", "attendance", "adjust", "create", "runs"];
  const one = async (p: unknown) => { try { return await inScope(W.owner.cookie, base, async () => { mute(); try { return await renderHtml(await M.ui.PayrollSection({ systemId: HRS, ...(p ? { parts: p } : {}) })); } finally { unmute(); } }); } catch (e) { return `THROW ${errText(e)}`; } };
  const def = await one(null), sets = await Promise.all(parts.map((p) => one([p]))), D0 = new Set(idList(def));
  const k1: string[] = [];
  if (!ok(def)) k1.push(`default ${def.slice(0, 60)}`);
  const seen = new Map<string, string>();
  sets.forEach((h, i) => { for (const id of idList(h)) { if (seen.has(id)) k1.push(`${id}∈${seen.get(id)}+${parts[i]}`); seen.set(id, parts[i]!); } if (h.length >= def.length && D0.size > 0) k1.push(`${parts[i]}=full`); });
  const union = new Set(seen.keys()), lost = [...D0].filter((x) => !union.has(x)), extra = [...union].filter((x) => !D0.has(x));
  if (lost.length || extra.length) k1.push(`lost=${lost.slice(0, 3)} extra=${extra.slice(0, 3)}`);
  chk("K1", !k1.length, "", L([...new Set(k1)], 5));
 }
 // ── R0–R4 states (owner) ──
 const runQ = (st: keyof typeof PER, extra = "") => `view=run&period=${PER[st]}${extra}`;
 {
  const h = await page(W.owner, runQ("NONE")), ids = idList(h);
  chk("R0", ok(h) && ids.includes("hr-run2-create") && !ids.some((i) => V2BTN.test(i) && i !== "hr-run2-sync"), "create", ids.filter((i) => i.startsWith("hr-run2")).join(",").slice(0, 120));
  const r1: string[] = [];
  for (const st of ["APPROVED", "PAID", "DRAFT"] as const) { const x = idList(await page(W.owner, runQ(st))); if (x.includes("hr-run2-create")) r1.push(`${st}:create`); if (!x.includes("hr-run2-table")) r1.push(`${st}:no table`); }
  chk("R1", !r1.length, "", L(r1));
  const hr = await page(W.owner, runQ("REVERSED")), ir = idList(hr), ban = elById(hr, "hr-run2-banner");
  const r2 = { banner: !!ban, bannerText: textOfHtml(ban).includes(MSG.th.hr.run2.st_REVERSED) || /REVERSED|กลับรายการ/.test(textOfHtml(ban)), table: ir.includes("hr-run2-table"), create: ir.includes("hr-run2-create"), noButtons: !ir.some((i) => V2BTN.test(i) && i !== "hr-run2-sync") };
  chk("R2", all(r2), "", `${fails(r2)} ids=${ir.filter((i) => i.startsWith("hr-run2-")).slice(0, 8).join(",")}`);
  const hv = await page(W.owner, runQ("V1")), iv = idList(hv), bv = elById(hv, "hr-run2-banner");
  const r3 = { banner: !!bv, history: /view=history/.test(bv), noV2: !iv.some((i) => (V2BTN.test(i) && i !== "hr-run2-sync") || i === "hr-run2-create"), table: iv.includes("hr-run2-table") };
  chk("R3", all(r3), "", `${fails(r3)} ids=${iv.filter((i) => i.startsWith("hr-run2-")).slice(0, 8).join(",")}`);
  const r4: string[] = [];
  for (const loc of ["th", "en"] as const) {
   const t = textOfHtml(run2(await page(W.owner, runQ("APPROVED"), loc)));
   if (!t.includes(labelOf(PER.APPROVED, loc))) r4.push(`${loc}: no "${labelOf(PER.APPROVED, loc)}"`);
   const iso = t.match(/\b20\d\d-(0[1-9]|1[0-2])\b(?!-\d)/g);
   if (iso) r4.push(`${loc}: ISO ${iso.slice(0, 2).join(",")}`);
   if (/เครื่องรุ่นใหม่|new engine/i.test(t)) r4.push(`${loc}: engine wording`);
   if (/\b(DRAFT|APPROVED|PAID|REVERSED)\b/.test(t)) r4.push(`${loc}: raw enum`);
  }
  chk("R4", !r4.length, "", L(r4));
 }
 // ── R5–R10 privacy + drawer ──
 {
  const lim = await page(W.payU1, runQ("DRAFT")), its = await itemsOf("DRAFT"), cara = its.find((i) => i.employeeId === E.cara!.id), inS = its.filter((i) => i.employeeId !== E.cara!.id);
  const sec = run2(lim), t = textOfHtml(sec), note = "ไม่รวมพนักงานที่คุณไม่มีสิทธิ์ดูค่าจ้าง 1 คน";
  const r5 = { rendered: ok(lim) && !!sec, noCara: !lim.includes(E.cara!.name), noCaraNet: !lim.includes(baht(cara.netSatang)) && !lim.includes(baht(cara.grossSatang)), names: lim.includes(E.anna!.name) && lim.includes(E.ben!.name), scopedNet: t.includes(baht(inS.reduce((a, i) => a + i.netSatang, 0))), note: t.includes(note) };
  chk("R5", all(r5), "", fails(r5));
  const own = await page(W.owner, runQ("DRAFT")), ex = elById(lim, "hr-run2-excluded");
  chk("R6", !!ex && textOfHtml(ex).includes(note) && !idList(own).includes("hr-run2-excluded"), "", `limited=${!!ex} owner=${idList(own).includes("hr-run2-excluded")}`);
  const r7: string[] = [];
  for (const st of ["DRAFT", "PAID", "APPROVED", "REVERSED"]) { const row = await runRow(st); for (const k of ["totalGrossSatang", "totalNetSatang", "totalSsoEmployeeSatang", "totalSsoEmployerSatang", "totalWhtSatang", "totalAddSatang"]) if (Number(row[k]) && lim.includes(baht(Number(row[k])))) r7.push(`${st}.${k}`); }
  for (const [w, h] of [["limited", lim], ["owner", own]] as const) { const jv = textOfHtml(elById(h, "hr-run2-jv")); if (AMOUNT.test(jv)) r7.push(`${w} jv amount`); }
  chk("R7", !r7.length, "", L(r7));
  const mg = await page(W.mgr, runQ("DRAFT")), ms = run2(mg);
  chk("R8", ok(mg) && !!ms && !/฿/.test(textOfHtml(ms)) && !idList(ms).includes("hr-run2-tiles"), "", `rendered=${ok(mg)} sec=${!!ms} baht=${/฿/.test(textOfHtml(ms))}`);
  const dr = elById(await page(W.owner, runQ("DRAFT", `&emp=${E.anna!.id}`)), "hr-run2-drawer"), none = idList(await page(W.owner, runQ("DRAFT", "&emp=zzqcnoone")));
  const r9 = { drawer: !!dr, name: textOfHtml(dr).includes(E.anna!.name), ot: textOfHtml(dr).includes(baht(OT.anna)), unknown: !none.includes("hr-run2-drawer") };
  chk("R9", all(r9), "", fails(r9));
  const lc = await page(W.payU1, runQ("DRAFT", `&emp=${E.cara!.id}`));
  chk("R10", ok(lc) && !lc.includes(E.cara!.name) && !lc.includes(baht(cara.netSatang)), "", `rendered=${ok(lc)} name=${lc.includes(E.cara!.name)}`);
  const tiles = textOfHtml(run2(own)), otS = Object.values(OT).reduce((a, b) => a + b, 0), comS = its.reduce((a, i) => a + ((i.snapshotJson?.lines ?? []) as Any[]).filter((l) => l.code === "COMMISSION").reduce((x, l) => x + l.amountSatang, 0), 0);
  chk("R11", tiles.includes(baht(otS)) && tiles.includes(baht(comS)), `${baht(otS)} · ${baht(comS)}`, tiles.slice(0, 160));
  const en = textOfHtml(run2(await page(W.owner, runQ("DRAFT"), "en"))).replace(new RegExp(Object.values(E).map((e) => e.name).join("|"), "g"), "");
  const thai = en.split(" ").filter((w) => THAI.test(w));
  chk("R12", !!en && !thai.length, "", `${thai.slice(0, 5).join(" ")}`);
 }
 // ── T1 (r3): add column excludes OT where the OT column shows (xl ≥ 1280), stored additions + hint below it ──
 {
  const keyOf = (txt: string) => { let best = "", n = 0; for (const [k, v] of Object.entries(MSG.th.hr.run2 as Record<string, string>)) if (/^col_/.test(k) && txt.startsWith(v) && v.length > n) { best = k; n = v.length; } return best; };
  const cellsOf = (tr: string) => [...tr.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>|<(td|th)\b([^>]*)\/>/g)].map((m) => ({ cls: /class="([^"]*)"/.exec(m[2] ?? m[5] ?? "")?.[1] ?? "", text: textOfHtml(m[3] ?? "").trim() }));
  const readAt = (tb: string, w: number) => {
   const hd = cellsOf(/<thead[\s\S]*?<\/thead>/.exec(tb)?.[0] ?? "").filter((c) => shownAt(c.cls, w)).map((c) => keyOf(c.text));
   return [...tb.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].slice(1).map((m) => { const cs = cellsOf(m[0]).filter((c) => shownAt(c.cls, w)), o: Record<string, { v: number; t: string }> = {}; cs.forEach((c, i) => { if (hd[i]) o[hd[i]!] = { v: satOf(c.text), t: c.text }; }); return { o, name: cs[0]?.text ?? "", n: cs.length, h: hd.length }; });
  };
  const t1: string[] = [];
  for (const [vn, w] of [["owner", W.owner], ["payU1", W.payU1]] as const) {
   const tb = elById(await page(w, `view=run&period=${PER.DRAFT}`), "hr-run2-table");
   if (!tb) { t1.push(`${vn}: no table`); continue; }
   const A = readAt(tb, 1440), B = readAt(tb, 1024);
   if (!A.length || A.length !== B.length) { t1.push(`${vn}: rows ${A.length}/${B.length}`); continue; }
   A.forEach((a, i) => {
    const b = B[i]!, who = a.name.slice(0, 12) || `#${i}`, g = (o: Any, k: string) => o[k]?.v ?? 0;
    if (a.n !== a.h || b.n !== b.h) t1.push(`${vn} ${who}: cells≠headers (${a.n}/${a.h} · ${b.n}/${b.h})`);
    if (!a.o.col_ot) t1.push(`${vn} ${who}: no OT col ≥1280`);
    if (b.o.col_ot) t1.push(`${vn} ${who}: OT col <1280`);
    const net = g(a.o, "col_net"), wht = g(a.o, "col_wht");
    if (g(a.o, "col_gross") + g(a.o, "col_add") + g(a.o, "col_ot") + g(a.o, "col_deduct") + g(a.o, "col_sso") + wht !== net) t1.push(`${vn} ${who}: ≥1280 sum≠net`);
    if (g(b.o, "col_gross") + g(b.o, "col_add") + g(b.o, "col_deduct") + g(b.o, "col_sso") + wht !== g(b.o, "col_net")) t1.push(`${vn} ${who}: <1280 sum≠net`);
    const ot = g(a.o, "col_ot");
    if (ot && !/รวม OT/.test(b.o.col_add?.t ?? "")) t1.push(`${vn} ${who}: no "รวม OT" hint`);
    if (!ot && g(a.o, "col_add") !== g(b.o, "col_add")) t1.push(`${vn} ${who}: no-OT add differs`);
   });
   if (vn === "owner" && (!A.some((a) => (a.o.col_ot?.v ?? 0) !== 0) || !A.slice(0, -1).some((a) => !(a.o.col_ot?.v ?? 0)))) t1.push(`${vn}: fixture lacks OT/no-OT row`);
   const tot = A[A.length - 1]!, body = A.slice(0, -1);
   for (const k of ["col_add", "col_ot", "col_net"]) if (body.reduce((x, r) => x + (r.o[k]?.v ?? 0), 0) !== (tot.o[k]?.v ?? 0)) t1.push(`${vn}: totals ${k}≠Σ rows`);
   if (vn === "payU1" && body.some((r) => r.name.includes(E.cara!.name))) t1.push("payU1: out-of-scope row");
  }
  const hk = Object.entries(MSG.th.hr.run2 as Record<string, string>).find(([, v]) => /รวม OT/.test(v));
  if (!hk || typeof MSG.en.hr.run2[hk[0]] !== "string") t1.push("hint key th/en");
  chk("T1", !t1.length, "", L([...new Set(t1)], 6));
 }
 {
  const rendered = [...cache.entries()].filter(([k]) => k.endsWith(`|${base}`)).flatMap(([, h]) => [...idsIn(h).keys()]);
  const excused = N1S.code.filter((c) => !rendered.some((r) => idMatch(c, r)) && N1S.other.has(c)), noRow = N1S.code.filter((c) => !excused.includes(c));
  chk("N1", all(N1S.n1) && !noRow.length, "", `${fails(N1S.n1)} noRow=${L(noRow)} excused=${excused.join(",") || "none"}`);
 }
 // ── Y1 (r4 B2): the "กรอกยอดยกมา" link only for a viewer who has the ytd view; it resolves to a non-empty ytd view ──
 {
  const y1: string[] = [], rvTxt = String(MSG.th.hr.run2.rv_YTD_OPENING ?? "").split(" (")[0]!, card = ROOT_ID.ytd!;
  for (const [n, w, want] of [["owner", W.owner, true], ["payAll", W.payAll, true], ["payU1", W.payU1, false]] as const) {
   const h = await page(w, `view=run&period=${PER.YTD}`), sec = run2(h), ids = idList(h);
   if (!ok(h) || !sec) { y1.push(`${n}: no run screen ${h.slice(0, 50)}`); continue; }
   if (!rvTxt || !textOfHtml(sec).includes(rvTxt)) { y1.push(`${n}: control — no YTD_OPENING review text (fixture)`); continue; }
   const link = elById(h, "hr-run2-ytd-link"), ytdHref = [...sec.matchAll(/href="([^"]*[?&](?:amp;)?view=ytd[^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
   if (!want) { if (ids.includes("hr-run2-ytd-link") || ytdHref.length) y1.push(`${n}: link to ?view=ytd offered (${ytdHref[0] ?? "hr-run2-ytd-link"}) — viewer has no ytd view`); continue; }
   const href = (/href="([^"]+)"/.exec(link)?.[1] ?? "").replace(/&amp;/g, "&");
   if (!link || !href) { y1.push(`${n}: no hr-run2-ytd-link`); continue; }
   const q = (href.split("?")[1] ?? "").split("#")[0]!, dest = await page(w, q), dIds = idList(dest), body = textOfHtml(elById(dest, "hr-ytd-card"));
   if (!/(^|&)view=ytd(&|$)/.test(q) || !dIds.some((i) => card.test(i)) || body.length < 40) y1.push(`${n}: ${href} → ytd card ${dIds.some((i) => card.test(i)) ? `text ${body.length}` : "absent"}`);
  }
  chk("Y1", !y1.length, "owner · payAll link → ytd card · payU1 text only", L(y1, 4));
 }
 // ── 13b report ──
 {
  const rp = `/app/sys/${HRS}/hr/reports`, b1: string[] = [];
  for (const loc of ["th", "en"] as const) {
   const h = await page(W.owner, `report=payroll-month&period=${PER.PAID}`, loc, M.rpage, rp), tb = elById(h, "hr-report-table");
   if (!tb) { b1.push(`${loc}: no table ${h.slice(0, 50)}`); continue; }
   const ths = [...tb.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOfHtml(m[1]!).trim()), cells = [...tb.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => textOfHtml(m[1]!).trim());
   if (ths.some((x) => /รุ่นเครื่องคิด|^Engine$/.test(x))) b1.push(`${loc}: engine col`);
   if (cells.includes("PAID") || cells.includes("2")) b1.push(`${loc}: raw PAID/engine cell`);
   if (!cells.includes(MSG[loc].hr.run2.st_PAID)) b1.push(`${loc}: no "${MSG[loc].hr.run2.st_PAID}"`);
   const netTh = [...tb.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)].find((m) => textOfHtml(m[2]!).trim() === (loc === "th" ? "สุทธิ" : "Net pay"));
   if (!netTh || !/sticky/.test(netTh[1]!) || !/right-0/.test(netTh[1]!)) b1.push(`${loc}: net not sticky right-0`);
  }
  chk("B1", !b1.length, "", L(b1));
  const v = { role: "OWNER", unitAccess: [], permissions: {}, userId: W.owner.id }, ctx = { tenantId: TA, systemId: HRS };
  const dto = await M.rep.loadReport(ctx, v, { report: "payroll-month", period: PER.PAID, unitId: null }, { locale: "th" }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  const csv = await M.rep.exportReport(ctx, v, { report: "payroll-month", period: PER.PAID, format: "CSV" }).catch((e: unknown) => ({ ok: false, reason: errText(e) }));
  const ctext = csv?.ok ? Buffer.from(csv.bytes).toString("utf8") : "";
  const b2 = { dto: !!dto?.ok, engineCol: !!dto?.columns?.some((c: Any) => c.key === "engine"), raw: !!dto?.rows?.some((r: Any) => r.values?.status === "PAID"), csv: /รุ่นเครื่องคิด|Engine/.test(ctext) && ctext.includes("PAID") };
  chk("B2", all(b2), "", `${fails(b2)} ${dto?.ok ? "" : String(dto?.reason).slice(0, 60)}`);
 }
} catch (e) {
 unmute();
 crashed = errText(e);
 console.log(`🔴 harness error: ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
 unmute();
 try { await sweepTenants(P, fx.tenants); } catch (e) { console.log(`sweep: ${errText(e)}`); }
 await cleanupFx(P, fx, SLUG);
 const r1 = await sweepResidue(P, fx.tenants), r2 = await residueOf(P, fx, SLUG, PFX), left = await P.tenant.count({ where: { slug: { startsWith: PFX } } }), net = NET.attempts.filter((a) => !/fetch:\??$/.test(a));
 const miss = [...new Set(LOC.misses)];
 chk("Z1", !r1.length && !r2.length && left === 0 && !net.length && LOC.hits > 0 && !miss.length, "", `misses=${miss.slice(0, 4).join(",") || 0} sweep=${r1.join(",") || "none"} fx=${r2.join(",") || "none"} tenants=${left} outbound=${net.join(",") || 0} intl=${LOC.hits}`);
 await P.$disconnect?.();
}
process.exit(R.finish({ forced: FORCE, crashed, missing: [] }));
