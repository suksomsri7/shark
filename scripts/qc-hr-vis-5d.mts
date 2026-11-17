// QC HR VIS-5d settings page (?tab= panels) + law table to mockup 08 (layout only) · brief hr-brief-VIS-5d.md (+ CONTROLLER RULINGS 18 Nov) · notes hr-VIS-5d-oracle.md · ⚠️ ORACLE-EDIT only · QC_FORCE=1 · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-vis-5d.mts      (QC_VIS5D_RECORD=1 prints the W2 per-viewer id sets of the page as it is)
// Method: statics vs merge-base(HEAD, session/hr) (QC_VIS5_BASE overrides) · TS AST of the inline actions · settingsTabOf vectors · pages rendered in-process as 8 viewers on a fixture shop ·
//   the 22 wrappers invoked (minimal form) to read their redirect. Fold / height / tab strip / disabled reasons in a browser = walk-hr.mts states 14* 15*.
import { createRequire } from "node:module";
import { join } from "node:path";
import { type Any, type Def, ROOT, rd, errText, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, tagOf, sha, stripComments, fileAt, srcFiles, jsonOf, flat, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, changedVsBase, loadOpt, modState } from "./qc-hr-lib.mjs";
import { installNetGuard, NET, sweepTenants, sweepResidue } from "./qc-hr-h4.3-lib.mjs";
import { BASE, hunksOf, changed, installIntl, loadClientSet, inScope, renderTree, CUR, idsWith, elOf, textOfHtml, attrOf, type Rendered } from "./qc-hr-vis-5-lib.mjs";
import { satArith, minus, idMatch } from "./qc-hr-vis-5a-lib.mjs";

const SUITE = "qc-hr-vis-5d", ARGV = process.argv.slice(2), FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run"), RECORD = process.env.QC_VIS5D_RECORD === "1", PFX = "qc-hr-vis5d-";
const H = "src/lib/modules/hr/", APP = "src/app/app/sys/[id]/hr/settings/";
const F = { page: `${APP}page.tsx`, law: `${APP}law/page.tsx`, keys: `${APP}ApiKeysCard.tsx`, lawUi: `${H}law-ui.tsx`, view: `${H}settings-view.ts`, sui: `${H}settings-ui.tsx`, th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json", mx: "scripts/walk-hr-matrix.json", walk: "scripts/walk-hr.mts" };
const PG = "/app/sys/[id]/hr/settings", PG_LAW = "/app/sys/[id]/hr/settings/law";
const MARK = "HR VIS-5d";
/** brief §8 — card functions the builder may touch (base line range by function name) · whole files */
const CARD_FNS: [string, string[]][] = [[`${H}lifecycle-ui.tsx`, ["SettingsForm", "LifecycleSettings", "tplText"]], [`${H}line-ui.tsx`, ["LineSettingsCard"]], [`${H}work-entries-ui.tsx`, ["WorkSettingsCard"]], [`${H}labor-ui.tsx`, ["LaborSettingsCard"]], [`${H}attendance-pay-ui.tsx`, ["AttendancePayPolicyCard"]], [`${H}payroll-run-ui.tsx`, ["PayrollEngineCard"]], [`${H}bank-files/ui.tsx`, ["BankSettingsCard"]], [`${H}filings/ui.tsx`, ["FilingSettingsCard"]]];
const WHOLE = [F.page, F.law, F.keys, F.lawUi, `${H}payroll-accounting-ui.tsx`, `${H}leave-presets-ui.tsx`];
const NEW_SRC = [F.view, F.sui];
const isTre = (f: string) => /^src\/lib\/modules\/hr\/[\w-]*TemplateRowsEditor[\w-]*\.tsx$/.test(f); // Q8 client editor (any file name containing TemplateRowsEditor)
const DATA = [F.th, F.en, F.inv, F.mx];
const OWN = ["scripts/qc-hr-vis-5d.mts"];
const TOOLS = [F.walk, "scripts/seed-hr-walk.mts"]; // walker/seed edits: every hunk "ORACLE-EDIT (HR VIS-5d · controller)"
/** brief §7.10 untouched */
const UNTOUCHED = [`${H}settings.ts`, `${H}settings-actions.ts`, `${H}clock-settings.ts`, `${H}law.ts`, `${H}lifecycle.ts`, `${H}lifecycle-actions.ts`, `${H}scope.ts`, `${H}nav.ts`, `${H}api`, `${H}api-key-actions.ts`, "prisma", "src/lib/core", "scripts/fitness-hr.mts",
 ...srcFiles(H.slice(0, -1)).filter((f) => /\/(line-[\w-]+|labor[\w-]*|payroll[\w-]*|privacy[\w-]*)\.ts$/.test(f)), ...srcFiles(`${H}bank-files`).filter((f) => !f.endsWith("/ui.tsx")), ...srcFiles(`${H}filings`).filter((f) => !f.endsWith("/ui.tsx"))];
/** brief §2.1 table: the 22 inline wrappers → the imported action each calls (AST) · tab the result must land on (§3 + Q2) */
const WRAP: Record<string, [string, string]> = {
 onCreateShift: ["createShiftAction", "shifts"], onArchiveShift: ["archiveShiftAction", "shifts"], onSaveNormalMinutes: ["saveNormalMinutesAction", "shifts"], onSaveLabor: ["saveLaborSettingsAction", "shifts"],
 onCreatePolicy: ["createLeavePolicyAction", "leave"], onArchivePolicy: ["archiveLeavePolicyAction", "leave"], onAddLeavePreset: ["addLeavePresetAction", "leave"],
 onAddHoliday: ["upsertHolidayAction", "holidays"], onDeleteHoliday: ["deleteHolidayAction", "holidays"], onApplyPreset: ["applyHolidayPresetAction", "holidays"],
 onSaveClockPolicy: ["saveClockPolicyAction", "rules"], onSaveClockSite: ["saveClockSiteAction", "rules"], onSaveAttendancePolicy: ["saveAttendancePolicyAction", "rules"], onSaveOtPolicy: ["saveOtPolicyAction", "rules"], onSaveAttPay: ["saveAttendancePayPolicyAction", "rules"],
 onSaveEngine: ["setPayrollEngineAction", "pay"], onSavePayBook: ["setPayrollBookAction", "pay"], onSavePosting: ["setPayrollPostingAction", "pay"], onSavePayAccount: ["setPayrollPayAccountAction", "pay"], onSaveBankProfile: ["saveBankProfileAction", "pay"], onSaveBankPreset: ["saveBankPresetAction", "pay"], onDeleteBankPreset: ["deleteBankPresetAction", "pay"],
};
const TABS = ["shifts", "leave", "holidays", "rules", "pay", "connect", "life"] as const;
type Tab = (typeof TABS)[number];
/** brief §3 settingsTabOf reference: explicit known tab wins · run2|pacct|fmsg|fflds|fdoc → pay · life → life · else shifts (unknown/empty/array tab = absent — oracle reading, notes §corrections) */
const refTab = (sp: Record<string, unknown>): Tab => { const t = sp.tab; if (typeof t === "string" && (TABS as readonly string[]).includes(t)) return t as Tab; if (["run2", "pacct", "fmsg", "fflds", "fdoc"].some((k) => typeof sp[k] === "string")) return "pay"; if (typeof sp.life === "string") return "life"; return "shifts"; };
const VEC: [string, Record<string, Any>, Tab][] = [
 ["default", {}, "shifts"], ["msg", { msg: "ok", year: "2026" }, "shifts"], ["year only", { year: "2027" }, "shifts"], ["unknown tab", { tab: "bogus" }, "shifts"], ["empty tab", { tab: "" }, "shifts"], ["case", { tab: "LEAVE" }, "shifts"], ["array tab", { tab: ["leave", "pay"] }, "shifts"],
 ...TABS.map((t): [string, Record<string, string>, Tab] => [`explicit ${t}`, { tab: t }, t]), ...TABS.map((t): [string, Record<string, string>, Tab] => [`explicit ${t}+msg`, { tab: t, year: "2026", msg: "s.failed" }, t]),
 ["run2 ok", { run2: "ok" }, "pay"], ["run2 okw", { year: "2026", run2: "okw" }, "pay"], ["run2 code", { run2: "e.notOwner" }, "pay"], ["pacct", { year: "2026", pacct: "bookNotFound" }, "pay"], ["fmsg", { fmsg: "saved" }, "pay"], ["fflds+fdoc", { fmsg: "BAD", fflds: "a,b", fdoc: "PND-1" }, "pay"], ["fdoc only", { fdoc: "X" }, "pay"],
 ["life", { life: "ok" }, "life"], ["life code", { life: "e.scope" }, "life"], ["tab wins over run2", { tab: "leave", run2: "ok" }, "leave"], ["tab wins over life", { tab: "connect", life: "ok" }, "connect"], ["tab wins over fmsg", { tab: "rules", fmsg: "saved" }, "rules"], ["unknown tab + pacct", { tab: "x", pacct: "ok" }, "pay"],
];
/** mockup 08 wording (exact) — nav + footnote + connections card (brief §3 §4 #2 #3 #21 #22 · Q5) */
const NAV_TH: Record<string, string> = { shifts: "กะและตารางงาน", leave: "ประเภทลาและโควตา", holidays: "วันหยุด", rules: "กฎสาย/OT", pay: "รอบจ่าย", law: "ตารางกฎหมาย", staff: "สิทธิ์ผู้จัดการ", connect: "การเชื่อมต่อระบบ" };
const MOCK_TH = ["ตั้งค่าพนักงาน", ...Object.values(NAV_TH).filter((x) => x !== "ตารางกฎหมาย"), "ตารางกฎหมายใช้ร่วมทุกสาขา · กะ/วันหยุด/กฎสาย ตั้งแยกรายสาขาได้", "การเชื่อมต่อ (ย่อ)", "ทั้งหมด", "บัญชี", "ลงบัญชีเงินเดือน", "แชท LINE พนักงาน", "แจ้งกะ · ผลอนุมัติ · สลิป"];
const NAV_ORDER = ["shifts", "leave", "holidays", "rules", "pay", "law", "staff", "connect", "life"];
const SSO_COLS = ["มีผลตั้งแต่", "ลูกจ้าง", "นายจ้าง", "ฐานต่ำสุด", "ฐานสูงสุด", "สมทบสูงสุด/เดือน", "สถานะ"], TAX_COLS = ["เงินได้สุทธิทั้งปี (บาท)", "อัตรา", "ภาษีสะสมเมื่อเต็มขั้น"];
const LAW_TITLES = ["ประกันสังคม", "ภาษีเงินได้บุคคล (ขั้นบันได)", "ค่าลดหย่อนพื้นฐาน", "OT และค่าแรงขั้นต่ำ"];
/** brief exceptions (§4 #4 #16 · NF items) — must NOT appear on the law page */
const LAW_NOT = ["แก้ได้โดยไม่ต้องอัปเดตโปรแกรม", "÷ 12", "เพิ่มช่วงมีผลใหม่", "ร้านยืนยัน", "ในร้านตอนนี้", "ผู้ช่วย AI", "ทุกการแก้ไขเก็บประวัติ"];
/** one signature per tab (brief §3 table) — a panel shows its own, none of the others */
const SIG: Record<Tab, RegExp> = {
 shifts: /^hr-settings-shift-(form|list)$|^hr-we-normal$|^hr-labor-settings$/, leave: /^hr-settings-policy-(form|list)$|^hr-settings-law-presets$/, holidays: /^hr-settings-holiday-(form|list|year)$|^hr-holiday-preset-note$/,
 rules: /^hr-clock-site-|^hr-settings-(clock-policy|attendance-policy|ot-policy)$|^hr-attpay-policy$/, pay: /^hr-run2-engine$|^hr-pay-accounting$|^hr-bank-(profile|presets)$|^hr-filing-profile$/, connect: /^hr-line-settings-card$|^hr-apikeys-card$/, life: /^hr-life-settings$/,
};
const FRAME = /^hr-set-|^hr-settings-(page|law-link|message)$/;
/** W2 named exceptions (brief §3 removed/moved · §7.3 controls replaced by read text) — may be missing from the union; anything else lost/gained = fail */
const W2_DROP: Record<string, RegExp> = {
 all: /^hr-settings-stub-note$|^hr-settings-law-preset-off-/,
 MB: /^hr-line-settings-(enabled|mode|digest|cap|unit)$/, MKB: /^hr-line-settings-(enabled|mode|digest|cap|unit)$|^hr-life-(lead-probation|lead-contract|kanban|template-onboarding|template-offboarding)$/,
 MP: /^hr-filing-profile-(f-.+|formflag|slashmode|encoding|wagemode|branchtype|lto)$/,
};
const W2_NEW = /^hr-set-/;
/** W2 golden: per viewer, ids on today's single page (fixture below · ids → fixture keys) — recorded on base c4f5b2b99 with QC_VIS5D_RECORD=1 · ORACLE-EDIT only */
const W2_O = [...(["apikeys-bundle-hr-leave", "apikeys-bundle-hr-payroll-read", "apikeys-bundle-hr-read", "apikeys-card", "apikeys-docs", "apikeys-form", "apikeys-issue", "apikeys-name", "apikeys-ttl", "attpay-absent", "attpay-early", "attpay-enabled", "attpay-free", "attpay-late", "attpay-policy", "attpay-save", "attpay-step", "attpay-warn", "bank-ack-untested", "bank-fmt-KBANK_PCT", "bank-fmt-KTB_IPAY", "bank-preset-save", "bank-presets", "bank-profile", "bank-profile-save", "filing-profile", "filing-profile-branchtype", "filing-profile-encoding", "filing-profile-formflag", "filing-profile-lto", "filing-profile-save", "filing-profile-slashmode", "filing-profile-wagemode", "holiday-preset", "holiday-preset-form", "holiday-preset-note", "labor-save", "labor-settings", "life-kanban", "life-lead-contract", "life-lead-probation", "life-settings", "life-template-offboarding", "life-template-onboarding", "line-settings-cap", "line-settings-card", "line-settings-digest", "line-settings-enabled", "line-settings-mode", "line-settings-pilot", "line-settings-save", "line-settings-sent", "line-settings-unit", "pay-accounting", "pay-advance-note", "pay-book", "pay-book-save", "pay-book-state", "run2-engine", "run2-engine-save", "settings-attendance-policy", "settings-attendance-save", "settings-clock-early", "settings-clock-grace", "settings-clock-policy", "settings-clock-policy-save", "settings-holiday-H1", "settings-holiday-H2", "settings-holiday-HA", "settings-holiday-add", "settings-holiday-date", "settings-holiday-delete-H1", "settings-holiday-delete-H2", "settings-holiday-delete-HA", "settings-holiday-form", "settings-holiday-kind", "settings-holiday-list", "settings-holiday-name", "settings-holiday-unit", "settings-holiday-year", "settings-holiday-year-go", "settings-law-link", "settings-law-preset-childcare", "settings-law-preset-has-personal", "settings-law-preset-off-childcare", "settings-law-preset-personal", "settings-law-presets", "settings-law-presets-open", "settings-ot-policy", "settings-ot-policy-save", "settings-page", "settings-policy-L1", "settings-policy-L2", "settings-policy-LA", "settings-policy-add", "settings-policy-archive-L1", "settings-policy-archive-L2", "settings-policy-archive-LA", "settings-policy-attach-after", "settings-policy-carry-expires", "settings-policy-carry-max", "settings-policy-category", "settings-policy-form", "settings-policy-half-day", "settings-policy-list", "settings-policy-min-service", "settings-policy-name", "settings-policy-paid", "settings-policy-prorata", "settings-policy-quota", "settings-policy-unit", "settings-policy-year-start", "settings-shift-S1", "settings-shift-S2", "settings-shift-SA", "settings-shift-add", "settings-shift-archive-S1", "settings-shift-archive-S2", "settings-shift-archive-SA", "settings-shift-break", "settings-shift-end", "settings-shift-form", "settings-shift-list", "settings-shift-name", "settings-shift-overnight", "settings-shift-start", "settings-shift-unit", "settings-stub-note", "we-normal", "we-normal-input", "we-normal-save"] as string[]), ...["U1", "U2", "all"].flatMap((u) => ["", "-accuracy", "-center-latitude", "-center-longitude", "-enabled", "-gps", "-notice", "-radius", "-save"].map((x) => `clock-site-${u}${x}`)), ...["annual","maternityPaid","maternityUnpaid","military","paternity","sick","unpaid"].flatMap((k) => [k, `add-${k}`, `form-${k}`].map((x) => `settings-law-preset-${x}`)), ...["branch-no", "cert-prefix", "dept-name", "employer-address", "employer-name", "rd-user-id", "signer-name", "sso-account-no", "sso-branch-no", "tax-id"].map((x) => `filing-profile-f-${x}`)].map((x) => `hr-${x}`);
const W2A = String.raw`apikeys-|attpay-(absent|early|enabled|free|late|save|step)$|bank-(ack-untested|fmt-|profile)|pay-book(-save)?$|run2-engine-save$|we-normal-(input|save)$`, W2F = String.raw`bank-preset|filing-profile`, W2C = String.raw`clock-site-|settings-(attendance|clock)-`;
const W2B = String.raw`holiday-preset(-form)?$|labor-save$|line-settings-save$|settings-law-preset-(add|form)-|settings-ot-policy|settings-(holiday|policy|shift)-(H2|L2|S2)$|settings-(holiday-delete|policy-archive|shift-archive)-(HA|LA|SA|H2|L2|S2)$`;
/** per viewer = owner's set minus these (reproduces the measured sets exactly — checked on base) */
const W2_MINUS: Record<string, string> = { O: "", M: [W2A, W2F, W2C, "life-"].join("|"), MK: [W2A, W2F].join("|"), MB: [W2A, W2F, W2C, "life-", W2B].join("|"), MKB: [W2A, W2F, String.raw`clock-site-(U2|all)|settings-(attendance|clock)-`, W2B].join("|"), MP: [W2A, String.raw`filing-profile-save$`, W2C, "life-"].join("|") };
const BASE_IDS: Record<string, string[]> = Object.fromEntries(Object.entries(W2_MINUS).map(([v, m]) => [v, m ? W2_O.filter((i) => !new RegExp(`^hr-(${m})`).test(i)) : W2_O]));
/** §5 role matrix: interactive controls that must NOT render for the viewer (action would refuse) */
const CTL = /^<(input|select|textarea|button|form|fieldset)\b/;
const NOT_M = /^hr-(we-normal-(input|save)|attpay-(enabled|late|early|absent|free|step|save)|run2-engine-save|pay-(book|account)(-save)?$|pay-posting|bank-|filing-|apikeys-|life-|clock-site-|settings-(clock|attendance)-)/;
const NOT_B = /^hr-(holiday-preset(-form)?$|settings-ot-policy|settings-law-preset-(form|add)-|labor-save|line-settings-(enabled|mode|digest|cap|unit|save)$|settings-clock-policy|settings-attendance-|clock-site-all)/;
const MUST_NOT: Record<string, RegExp[]> = {
 O: [], M: [NOT_M], MK: [/^hr-(we-normal-(input|save)|attpay-(enabled|late|early|absent|free|step|save)|run2-engine-save|pay-(book|account)(-save)?$|pay-posting|bank-|filing-|apikeys-)/],
 MB: [NOT_M, NOT_B], MKB: [/^hr-(we-normal-(input|save)|attpay-(enabled|late|early|absent|free|step|save)|run2-engine-save|pay-(book|account)(-save)?$|pay-posting|bank-|filing-|apikeys-|life-)/, NOT_B],
 MP: [/^hr-(we-normal-(input|save)|attpay-(enabled|late|early|absent|free|step|save)|run2-engine-save|pay-(book|account)(-save)?$|pay-posting|bank-profile|filing-profile-|apikeys-|life-|clock-site-|settings-(clock|attendance)-)/],
};
/** read-only replacement must say why (hr-set-readonly-* inside the card) */
const READONLY: Record<string, string[]> = { MB: ["hr-line-settings-card"], MKB: ["hr-line-settings-card", "hr-life-settings"], MP: ["hr-filing-profile"] };
/** visible tabs per viewer (existing gates · Q1 life = canSeeLifecycle) — managers item (Q3) OWNER only */
const NAV_WANT: Record<string, string[]> = { O: [...TABS], M: ["shifts", "leave", "holidays", "rules", "pay", "connect"], MK: [...TABS], MB: ["shifts", "leave", "holidays", "rules", "pay", "connect"], MKB: [...TABS], MP: ["shifts", "leave", "holidays", "rules", "pay", "connect"] };

const D = (id: string, g: string, sb: string, t: string): Def => [id, g, ({ C: "CRITICAL", M: "MAJOR", m: "MINOR" } as const)[sb[0] as "C"], sb[1] === "R" ? "RED" : "GREEN", t];
const CHECKS: Def[] = [
 D("S1", "§8 VIS5D_ALLOW", "MG", "[static] changed files ⊆ brief §8 list (+ messages · inventory · matrix · this oracle · tools/older oracles with ORACLE-EDIT hunks)"),
 D("S2", "§8 marker", "MG", "[static] every src hunk adds \"HR VIS-5d\" + ◂ · card files only inside the named card functions/imports · new files marked in lines 1–3"),
 D("S3", "§7.10", "CG", "[static] untouched files = base · payroll-rules sha"),
 D("S4", "§7.9", "MG", "[static] no new \"use client\" file except TemplateRowsEditor (Q8) · no hex/rgba/bg-blue-/emoji added · no *Satang arithmetic added · no min-w-[ in law page/law-ui"),
 D("S5", "§7.7 §7.8", "CG", "[static] [control] page.tsx keeps its base testid literals (stub-note excepted) + the imports old suites read · law page/law-ui: no form/action/\"use server\" · keeps hr-law-table/-row-/loadLawView"),
 D("S6", "§3", "MR", "[static] both pages pass `wrap` to ModuleTabs · frame max-w-7xl (no max-w-2xl / max-w-3xl root)"),
 D("X1", "§3 §7.1 §7.2", "CG", "[static] [control] 22 inline wrappers (TS AST): same names · each calls the same action with the same arguments · no new captured local · `back` module-level · no inline \"use server\" in any other VIS-5d file"),
 D("X2", "§3 flash", "MR", "[db] each of the 22 wrappers (invoked as owner) redirects to /hr/settings with its result code and lands on its tab (settingsTabOf of the redirect)"),
 D("X3", "§3", "MR", "[db] holiday year GET form carries tab=holidays · LeavePresetSection forms only in the leave panel"),
 D("V1", "§3 settingsTabOf", "CR", "[pure] settingsTabOf vectors (explicit tab · result params of every card · unknown/empty/array)"),
 D("N1", "§3 §4 #2 #3", "MR", "[db] menu per viewer: hr-set-nav · mockup order + exact labels · ?tab= links · one aria-current · ≥44 px · law = hr-settings-law-link · managers item OWNER only → /app/settings/staff · footnote"),
 D("N2", "§3", "MR", "[db] law page: same menu with hr-settings-law-link aria-current · back link kept"),
 D("P1", "§3", "MR", "[db] owner: each tab panel hr-set-panel-<tab> holds only its own sections · no section id in two panels · connections card on every panel"),
 D("P2", "§3 r4 B2", "MR", "[db] tab the viewer lacks (M/MB ?tab=life) → menu + hr-set-empty, no other panel content"),
 D("W2", "§9e control", "MG", "[control] per viewer (O M MK MB MKB MP): ids on today's page = union over the viewer's menu tabs (named exceptions only)"),
 D("G0", "§5", "CG", "[db] [control] P / PS (payroll keys, no settings key): both pages 404"),
 D("G1", "§5 §7.3", "MR", "[db] per viewer no control whose action would refuse (role matrix) · row archive/delete only where allowed · read-only cards carry hr-set-readonly-* reason text"),
 D("G2", "§7.3 §9d", "MR", "[db] no disabled control without a readable reason (aria-describedby → text · title · data-reason) on any tab of any viewer"),
 D("F1", "§3", "MR", "[db] result flashes land in the right panel: ?tab=leave&msg=ok · ?run2=ok · ?pacct=ok · ?life=ok · ?fmsg=saved"),
 D("C1", "§4 #21 #22 Q7", "MR", "[db] hr-set-connections: all-link → /app/settings/connections · 2 rows hr-set-conn-* (accounting · LINE) → pay#hr-pay-accounting / connect#hr-line-settings · no POS/booking/stock rows"),
 D("L1", "§4 #4–#19", "MR", "[db] law page: title + howPicked + warn (exact) · SSO card = table (mockup columns, one row per effective date) · tax columns · card titles exact · exceptions absent"),
 D("I1", "§8 F16.4", "MR", "[static] hr.setview: th = en keys · non-empty · en no Thai · right after hr.settings · no other message key changed"),
 D("I2", "§7.4", "MR", "[static] hr.setview th values carry the mockup 08 wording (exact strings)"),
 D("I3", "§9d EN-THAI", "MR", "[db] en settings tabs + law page: no Thai value of hr.setview in the text (sentinel bundle) · no missing hr.setview key"),
 D("I4", "§7.4", "MR", "[db] th page desc without \"ชั่วคราว\" (Q4) · no Thai literal in added code lines"),
 D("K1", "§8 inventory", "MR", "[static] rows wo VIS-5d for hr-set-* (both pages) · every rendered hr-set-* id has a row · stub-note + law-link rows' conditional changed · base ids of both pages still in source"),
 D("M1", "§9a Q9", "MG", "[tooling] walk matrix: 14-settings + 14v-settings-<6 tabs> (O M MB · 3 sizes · th/en) · 15-law · x7 → ?tab=connect · fold/maxHeight/tabStrip/disabledFail/cleanSeed · walker"),
 D("Z1", "-", "CG", "residue · outbound · no missing message at render"),
];
const R = makeRegistry(SUITE, "", CHECKS);
if (ARGV.includes("--list")) { R.printList(); process.exit(0); }
const { chk } = R;
const all = (r: Record<string, unknown>) => Object.values(r).every((v) => v === true);
const fails = (r: Record<string, unknown>) => Object.entries(r).filter(([, v]) => v !== true).map(([k, v]) => (typeof v === "string" ? `${k}:${v}` : k)).join(",") || "all";
const L = (xs: string[], n = 8) => xs.slice(0, n).join(" | ") + (xs.length > n ? ` (+${xs.length - n})` : "") || "ok";
const built = rd(F.view).includes(MARK) || rd(F.page).includes(MARK);
if (!built && !FORCE) R.skipExit([`no ${MARK} marker in settings-view.ts / settings/page.tsx`]);
const isNew = (f: string) => fileAt(BASE, f) === null;
const base = (f: string) => fileAt(BASE, f) ?? "";
const marked = (h: { added: string[] }) => h.added.some((l) => l.includes(MARK) && l.includes("◂"));
const OE = "ORACLE-EDIT (HR VIS-5d · controller)";

// ═════════════ statics ═════════════
let TS: Any = null;
try { TS = ((await import("typescript")) as Any).default ?? (await import("typescript")); } catch { TS = null; }
/** [first, last] line of a top-level function / const arrow by name (TS AST · 1-based) */
const fnLines = (src: string, name: string): [number, number] | null => {
 if (!TS) return null;
 const sf = TS.createSourceFile("x.tsx", src, TS.ScriptTarget.Latest, true, TS.ScriptKind.TSX);
 let out: [number, number] | null = null;
 const ln = (p: number) => sf.getLineAndCharacterOfPosition(p).line + 1;
 for (const s of sf.statements) {
  if (TS.isFunctionDeclaration(s) && s.name?.text === name) out = [ln(s.getStart(sf)), ln(s.end)];
  if (TS.isVariableStatement(s)) for (const d of s.declarationList.declarations) if (d.name?.getText(sf) === name) out = [ln(s.getStart(sf)), ln(s.end)];
 }
 return out;
};
const importEnd = (src: string) => { let n = 0; src.split("\n").forEach((l, i) => { if (/^import\b|^\s*\}?\s*from\s+["']/.test(l)) n = i + 1; }); return n; };
const CH = changed().filter((f) => !/^(ledger|scratchpad)\//.test(f));
const oeOk = (f: string) => !isNew(f) && hunksOf(f).length > 0 && hunksOf(f).every((h) => h.added.some((l) => l.includes(OE)));
{
 const cardFiles = CARD_FNS.map(([f]) => f), allowed = (f: string) => WHOLE.includes(f) || cardFiles.includes(f) || NEW_SRC.includes(f) || (isTre(f) && isNew(f)) || DATA.includes(f) || OWN.includes(f);
 const out = CH.filter((f) => !allowed(f) && !((TOOLS.includes(f) || /^scripts\/qc-[^/]+\.mts$/.test(f)) && oeOk(f)));
 chk("S1", !out.length, "none outside", `outside=${L(out)} base=${BASE.slice(0, 9)}`);
 const bad: string[] = [];
 for (const f of CH) {
  const n = f.split("/").slice(-2).join("/");
  if (NEW_SRC.includes(f) || isTre(f)) { if (!isNew(f) || !rd(f).split("\n").slice(0, 3).join("\n").includes(MARK)) bad.push(`${n}:header`); continue; }
  if (WHOLE.includes(f)) { const k = hunksOf(f).filter((h) => !marked(h)).length; if (k) bad.push(`${n}:${k} unmarked`); continue; }
  const cf = CARD_FNS.find(([x]) => x === f);
  if (!cf) continue;
  const b = base(f), ie = importEnd(b), rs = cf[1].map((nm) => fnLines(b, nm)).filter(Boolean) as [number, number][];
  for (const h of hunksOf(f)) {
   const inR = rs.some(([s, e]) => (h.an === 0 ? h.a >= s - 1 && h.a <= e : h.a >= s && h.a + h.an - 1 <= e)) || h.a <= ie + 1;
   if (!marked(h)) bad.push(`${n}@${h.a}:unmarked`); else if (!inR) bad.push(`${n}@${h.a}:outside ${cf[1].join("/")}`);
  }
 }
 chk("S2", !bad.length, "all marked · in range", L(bad));
 const u = changedVsBase(BASE, UNTOUCHED), ps = sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA;
 chk("S3", u === "unchanged" && ps, "unchanged", `${u.slice(0, 160)} payroll-rules=${ps}`);
 const s4: string[] = [];
 for (const f of CH.filter((p) => p.startsWith("src/") && isNew(p) && /^\s*["']use client["']/.test(rd(p)))) if (!isTre(f)) s4.push(`new client ${f}`);
 for (const f of CH.filter((p) => /^src\/.*\.tsx?$/.test(p))) {
  const add = isNew(f) ? rd(f).split("\n") : hunksOf(f).flatMap((h) => h.added), rem = isNew(f) ? [] : hunksOf(f).flatMap((h) => h.removed), code = add.map((l) => stripComments(l));
  if (code.some((l) => /#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\(|\bbg-(blue|red|green|gray|slate|yellow)-/.test(l.replace(/href=\{?[`"][^`"]*[`"]/g, "").replace(/#hr-[\w-]+/g, "")))) s4.push(`${f.split("/").pop()}:color`);
  if (code.some((l) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(l))) s4.push(`${f.split("/").pop()}:emoji`);
  const extra = minus(satArith(add), satArith(rem));
  if (extra.length) s4.push(`${f.split("/").pop()}:satang ${extra.slice(0, 2).join(";")}`);
 }
 for (const f of [F.law, F.lawUi]) if (/min-w-\[/.test(stripComments(rd(f)))) s4.push(`${f.split("/").pop()}:min-w-[`);
 chk("S4", !s4.length, "none", L(s4));
 const pg = rd(F.page), lit = (s: string) => [...s.matchAll(/data-testid=(?:"([^"]+)"|\{`([^`]+)`\})/g)].map((m) => (m[1] ?? m[2]!).replace(/\$\{[^}]+\}/g, "${}"));
 const lostIds = lit(base(F.page)).filter((i) => i !== "hr-settings-stub-note" && !lit(pg).includes(i));
 const keep = ["attendance-pay-ui", "lifecycle-ui", "<LeavePresetSection", "<LeavePolicyWarningLines", "addLeavePresetAction(", "lp.${k}"].filter((s) => !pg.includes(s));
 const lawSrc = stripComments(rd(F.law) + "\n" + rd(F.lawUi)), lawBad = [/["']use server["']/, /<form\b/, /\baction=/, /formAction/, /onSubmit/, /@\/lib\/platform/].filter((re) => re.test(lawSrc)).map(String);
 const lawKeep = ["hr-law-table", "hr-law-row-", "loadLawView"].filter((s) => !(rd(F.law) + rd(F.lawUi)).includes(s));
 chk("S5", !lostIds.length && !keep.length && !lawBad.length && !lawKeep.length, "kept", `lostIds=${L(lostIds)} keep=${L(keep)} law=${L([...lawBad, ...lawKeep])}`);
 const frame = [F.page, F.law, F.sui].map((f) => stripComments(rd(f))).join("\n");
 const s6 = { wrapSettings: /<ModuleTabs\b[^>]*\bwrap\b/.test(stripComments(rd(F.page)) + stripComments(rd(F.sui))), wrapLaw: /<ModuleTabs\b[^>]*\bwrap\b/.test(stripComments(rd(F.law)) + stripComments(rd(F.sui))), wide: /max-w-7xl/.test(frame), noNarrow: !/data-testid="hr-(settings|law)-page"[^>]*max-w-(2xl|3xl)|max-w-(2xl|3xl)[^"]*"[^>]*data-testid="hr-(settings|law)-page"/.test(frame) };
 chk("S6", all(s6), "all", fails(s6));
}
// ── X1 inline wrappers (TS AST) ──
type Wr = { name: string; calls: string[]; caps: string[] };
function wrappersOf(src: string): { list: Wr[]; backTop: boolean; err: string } {
 if (!TS) return { list: [], backTop: false, err: "no typescript" };
 const sf = TS.createSourceFile("p.tsx", src, TS.ScriptTarget.Latest, true, TS.ScriptKind.TSX), list: Wr[] = [];
 const useServer = (fn: Any) => !!fn.body && TS.isBlock(fn.body) && fn.body.statements.some((s: Any, i: number) => i < 3 && TS.isExpressionStatement(s) && TS.isStringLiteral(s.expression) && s.expression.text === "use server");
 const isFn = (n: Any) => TS.isArrowFunction(n) || TS.isFunctionExpression(n) || TS.isFunctionDeclaration(n);
 const backTop = sf.statements.some((s: Any) => TS.isFunctionDeclaration(s) && s.name?.text === "back") || sf.statements.some((s: Any) => TS.isVariableStatement(s) && s.declarationList.declarations.some((d: Any) => d.name?.getText(sf) === "back"));
 const page = sf.statements.find((s: Any) => (TS.isFunctionDeclaration(s) && (s.modifiers ?? []).some((m: Any) => m.kind === TS.SyntaxKind.DefaultKeyword)));
 const locals = new Set<string>();
 const collectNames = (n: Any) => { if (TS.isIdentifier(n)) locals.add(n.text); else if (n?.elements) for (const e of n.elements) if (e.name) collectNames(e.name); };
 if (page?.body) for (const st of page.body.statements) if (TS.isVariableStatement(st)) for (const d of st.declarationList.declarations) collectNames(d.name);
 for (const p of page?.parameters ?? []) collectNames(p.name);
 const visit = (n: Any) => {
  if (isFn(n) && useServer(n)) {
   const name = TS.isVariableDeclaration(n.parent) ? n.parent.name.getText(sf) : n.name?.text ?? "(inline)", calls: string[] = [], caps = new Set<string>();
   const walk = (x: Any) => {
    if (TS.isCallExpression(x) && TS.isIdentifier(x.expression) && /Action$/.test(x.expression.text)) calls.push(`${x.expression.text}(${x.arguments.map((a: Any) => a.getText(sf).replace(/\s+/g, " ")).join(", ")})`);
    if (TS.isIdentifier(x) && locals.has(x.text) && !(TS.isPropertyAccessExpression(x.parent) && x.parent.name === x) && !(TS.isPropertyAssignment(x.parent) && x.parent.name === x)) caps.add(x.text);
    TS.forEachChild(x, walk);
   };
   TS.forEachChild(n.body, walk);
   list.push({ name, calls, caps: [...caps].sort() });
  }
  TS.forEachChild(n, visit);
 };
 visit(sf);
 return { list, backTop, err: "" };
}
{
 const now = wrappersOf(rd(F.page)), was = wrappersOf(base(F.page)), x1: string[] = [];
 if (now.err) x1.push(now.err);
 const nn = now.list.map((w) => w.name).sort(), wn = was.list.map((w) => w.name).sort(), want = Object.keys(WRAP).sort();
 if (nn.join() !== want.join()) x1.push(`names: +${minus(nn, want).join("/") || "-"} −${minus(want, nn).join("/") || "-"}`);
 if (wn.join() !== want.join()) x1.push(`base names drift (${wn.length})`);
 for (const w of now.list) {
  const b = was.list.find((x) => x.name === w.name), act = WRAP[w.name]?.[0];
  if (!b) continue;
  if (w.calls.join("|") !== b.calls.join("|")) x1.push(`${w.name}: calls ${w.calls.join(",")} ≠ base ${b.calls.join(",")}`);
  if (act && !w.calls.some((c) => c.startsWith(`${act}(`))) x1.push(`${w.name}: no ${act}(…)`);
  const extra = minus(w.caps, b.caps.concat(["id"]));
  if (extra.length) x1.push(`${w.name}: new capture ${extra.join(",")}`);
 }
 if (!now.backTop) x1.push("back not module-level");
 const other = [F.law, F.sui, F.view, F.keys, F.lawUi, ...CARD_FNS.map(([f]) => f), ...CH.filter(isTre)].filter((f) => rd(f) && wrappersOf(rd(f)).list.length > wrappersOf(base(f)).list.length);
 if (other.length) x1.push(`new inline action in ${other.join(",")}`);
 chk("X1", !x1.length, `22 wrappers = base`, L(x1, 6));
}
// ── messages ──
const MSG: Record<"th" | "en", Any> = { th: { ...JSON.parse(rd(F.th) || "{}"), pos: JSON.parse(rd("src/messages/th/pos.json") || "{}") }, en: { ...JSON.parse(rd(F.en) || "{}"), pos: JSON.parse(rd("src/messages/en/pos.json") || "{}") } };
const SV = { th: flat(MSG.th.hr?.setview ?? {}), en: flat(MSG.en.hr?.setview ?? {}) };
{
 const r: Record<string, unknown> = {};
 for (const lc of ["th", "en"] as const) {
  const p = lc === "th" ? F.th : F.en, b = flat(JSON.parse(base(p) || "{}")), n = flat(jsonOf(p) ?? {});
  const moved = [...new Set([...Object.keys(b), ...Object.keys(n)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(n[k]) && !k.startsWith("hr.setview."));
  r[`${lc}Only`] = !moved.length || moved.slice(0, 3).join(",");
  const hk = Object.keys((jsonOf(p) ?? {}).hr ?? {});
  r[`${lc}After`] = hk.indexOf("setview") > 0 && hk.indexOf("setview") === hk.indexOf("settings") + 1;
 }
 r.parity = Object.keys(SV.th).length > 0 && Object.keys(SV.th).sort().join() === Object.keys(SV.en).sort().join() && [...Object.values(SV.th), ...Object.values(SV.en)].every((v) => typeof v === "string" && v.trim() !== "");
 r.enNoThai = Object.values(SV.en).every((v) => !/[ก-ฺเ-๛]/.test(String(v)));
 chk("I1", all(r), "all", fails(r));
 const vals = new Set(Object.values(SV.th).map(String)), miss = MOCK_TH.filter((m) => !vals.has(m));
 chk("I2", !miss.length, "all mockup strings", `missing=${L(miss, 6)}`);
}
// ── inventory ──
const INVROWS = ((jsonOf(F.inv)?.rows ?? []) as Any[]), INVBASE = ((JSON.parse(base(F.inv) || '{"rows":[]}').rows ?? []) as Any[]);
const K1S: { pre: string[]; seen: Map<string, Set<string>> } = { pre: [], seen: new Map([[PG, new Set()], [PG_LAW, new Set()]]) };
{
 const row = (rows: Any[], p: string, t: string) => rows.find((x) => x.page === p && x.testid === t);
 for (const t of ["hr-settings-stub-note", "hr-settings-law-link"]) if (JSON.stringify(row(INVROWS, PG, t)?.conditional ?? null) === JSON.stringify(row(INVBASE, PG, t)?.conditional ?? null)) K1S.pre.push(`${t}: conditional unchanged`);
 for (const p of [PG, PG_LAW]) if (!INVROWS.some((x) => x.page === p && x.wo === "VIS-5d" && String(x.testid).startsWith("hr-set-nav"))) K1S.pre.push(`${p.split("/").pop()}: no VIS-5d hr-set-nav rows`);
 const src = [...srcFiles(H.slice(0, -1)), ...srcFiles("src/app/app/sys/[id]/hr/settings"), "src/components/module-tabs.tsx"].filter((f) => /\.tsx?$/.test(f)).map((f) => rd(f)).join("\n");
 for (const x of INVBASE.filter((r) => r.page === PG || r.page === PG_LAW)) { const id = String(x.testid).split("*")[0]!.replace(/-$/, ""); if (x.testid !== "hr-settings-stub-note" && !src.includes(id)) K1S.pre.push(`gone ${x.testid}`); }
}
// ── walk matrix (this ticket's tooling) ──
{
 const mx = jsonOf(F.mx) ?? {}, st = (mx.states ?? []) as Any[], w = rd(F.walk), m1: string[] = [];
 const s14 = st.find((s) => s.id === "14-settings");
 for (const t of ["leave", "holidays", "rules", "pay", "connect", "life"]) {
  const s = st.find((x) => x.id === `14v-settings-${t}`);
  if (!s) { m1.push(`no 14v-settings-${t}`); continue; }
  if (!new RegExp(`[?&]tab=${t}\\b`).test(String(s.path)) || ["O", "M", "MB"].some((v) => !s.viewers?.includes(v)) || s.sizes || s.langs) m1.push(`${s.id}: path/viewers/sizes`);
 }
 for (const s of [s14, ...TABS.slice(1).map((t) => st.find((x) => x.id === `14v-settings-${t}`))].filter(Boolean)) for (const k of ["fold", "maxHeight", "tabStrip", "disabledFail", "cleanSeed"]) if (!(k in s)) m1.push(`${s.id}: no ${k}`);
 const law = st.find((s) => s.id === "15-law");
 if (!law || !["O", "MB"].every((v) => law.viewers.includes(v)) || !law.maxHeight || !law.fold || !law.disabledFail) m1.push("15-law fields");
 if (!/[?&]tab=connect\b/.test(String(st.find((s) => s.id === "x7-todo-h4.8-apikeys")?.path))) m1.push("x7 not ?tab=connect");
 const press = new Set(st.filter((s) => /^14(v)?-settings/.test(s.id)).flatMap((s) => s.pressProbe ?? []));
 for (const b of ["hr-settings-shift-add", "hr-settings-policy-add", "hr-settings-holiday-add", "hr-holiday-preset", "hr-settings-ot-policy-save", "hr-labor-save", "hr-run2-engine-save", "hr-bank-preset-save", "hr-line-settings-save", "hr-apikeys-issue"]) if (!press.has(b)) m1.push(`pressProbe lacks ${b}`);
 for (const k of ["PAGE-HEIGHT", "FOLD", "TABS-CLIP", "SEED-DIRTY", "disabledFail"]) if (!w.includes(k)) m1.push(`walker lacks ${k}`);
 chk("M1", !m1.length, "states + walker fields", L(m1, 6));
}

// ═════════════ pure ═════════════
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const SVM = await loadOpt(F.view, "@/lib/modules/hr/settings-view");
const tabOf = (sp: Record<string, unknown>): string => (typeof SVM?.settingsTabOf === "function" ? String(SVM.settingsTabOf(sp)) : refTab(sp));
{
 const fn = SVM?.settingsTabOf, bad: string[] = [];
 if (typeof fn !== "function") bad.push(`settingsTabOf: ${modState(SVM, F.view)}`);
 else for (const [n, sp, want] of VEC) { let got: unknown; try { got = fn(sp); } catch (e) { got = errText(e); } if (got !== want) bad.push(`${n} → ${String(got)} ≠ ${want}`); }
 const self = VEC.filter(([, sp, w]) => refTab(sp) !== w).map(([n]) => n); // the table agrees with the brief rule
 chk("V1", !bad.length && !self.length, `${VEC.length} vectors`, `${bad.length} bad: ${L([...bad, ...self.map((s) => `ref:${s}`)], 5)}`);
}

// ═════════════ render + DB ═════════════
installNetGuard();
const { P, coreHash } = await qc4Env(SUITE);
installIntl();
const req = createRequire(join(ROOT, "src", "qc-vis5d-anchor.cjs"));
const React: Any = req("react");
const imp = async (s: string) => (await import(s).catch((e: unknown) => ({ __err: errText(e) }))) as Any;
const CLIENT = new Set<unknown>();
console.log(`client components known: ${await loadClientSet()}`);
for (const f of [...srcFiles(H.slice(0, -1)), ...srcFiles("src/components"), ...srcFiles(APP.slice(0, -1))].filter((x) => x.endsWith(".tsx") && /^\s*["']use client["']/.test(rd(x)))) {
 const m = await imp(`@/${f.slice(4).replace(/\.tsx$/, "")}`);
 for (const v of Object.values(m ?? {})) if (typeof v === "function" || (v && typeof v === "object" && (v as Any).$$typeof)) CLIENT.add(v);
}
const M = { sys: await imp("@/lib/modules/system/service"), page: await imp(`@/app/app/sys/[id]/hr/settings/page`), law: await imp(`@/app/app/sys/[id]/hr/settings/law/page`), date: await imp("@/lib/ui/date"), lawLib: await imp("@/lib/modules/hr/law") };
const badImp = Object.entries(M).filter(([, m]) => m?.__err).map(([k, m]) => `${k}:${m.__err}`);
if (badImp.length) console.log(`import problems: ${badImp.join(" | ")}`);
const isNextCtl = (e: Any) => /^NEXT_(REDIRECT|HTTP_ERROR|NOT_FOUND)/.test(String(e?.digest ?? e?.message ?? ""));
/** resolve server components (as vis-5-lib) and collect the wrapper functions handed to forms / cards */
async function resolveC(n: Any, acts: Map<string, Any>, d = 0): Promise<Any> {
 if (d > 300 || n === null || n === undefined || typeof n !== "object") return n;
 if (typeof n.then === "function") return resolveC(await n, acts, d + 1);
 if (Array.isArray(n)) return Promise.all(n.map((x) => resolveC(x, acts, d + 1)));
 if (!React.isValidElement(n)) return n;
 const { type, props } = n as Any;
 for (const v of Object.values(props ?? {})) if (typeof v === "function" && WRAP[(v as Any).name]) acts.set((v as Any).name, v);
 const keep = async () => { const p: Any = {}; for (const [k, v] of Object.entries(props ?? {})) p[k] = v && typeof v === "object" && (React.isValidElement(v) || Array.isArray(v)) ? await resolveC(v, acts, d + 1) : v; return React.createElement(type, { ...p, key: n.key }); };
 if (typeof type === "function") {
  if (CLIENT.has(type)) return keep();
  let r: Any;
  const err = console.error;
  console.error = () => undefined;
  try { r = type(props); } catch (e) { if (isNextCtl(e)) throw e; return keep(); } finally { console.error = err; }
  return resolveC(await r, acts, d + 1);
 }
 if (type && typeof type === "object" && (type.$$typeof === Symbol.for("react.forward_ref") || type.$$typeof === Symbol.for("react.memo"))) return keep();
 if (props && "children" in props) return React.cloneElement(n, undefined, ...[].concat(await resolveC(props.children, acts, d + 1) as never));
 return n;
}
type Out = Rendered & { acts: Map<string, Any> };
const digestOf = (e: Any) => `${e?.digest ? `${String(e.digest).split(";").slice(0, 3).join(";")} ` : ""}${errText(e)}`;
async function view(mod: Any, w: Any, path: string, params: Record<string, string>, sp: Record<string, string>, lc: "th" | "en"): Promise<Out> {
 CUR.locale = lc; CUR.messages = MSG[lc]; CUR.missing = []; // VIS-5c R1 lesson: locale before the page function runs
 const acts = new Map<string, Any>();
 try { return await inScope(`${w.cookie}; LOCALE=${lc}`, path, async () => ({ ...(await renderTree(await resolveC(await mod.default({ params: Promise.resolve(params), searchParams: Promise.resolve(sp) }), acts), lc)), acts })); } catch (e) { return { html: "", client: [], clientText: "", err: digestOf(e), acts }; }
}
const allIds = (h: string) => [...new Set([...h.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]!))];
const tagOfEl = (h: string, id: string) => /^<(\w+)/.exec(elOf(h, id))?.[1] ?? "";

const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${PFX}${Date.now()}${tag}`, fx = makeFixtures(P, coreHash, SLUG);
let crashed = "";
try {
 const T = await fx.newTenant("", "QC VIS5d shop");
 const U1 = await fx.newUnit(T, `QCV5d สาขาหนึ่ง ${tag}`, "u1"), U2 = await fx.newUnit(T, `QCV5d สาขาสอง ${tag}`, "u2");
 const HRS = (await M.sys.createSystem(T, "HR", `HR ${tag}`)).id as string;
 for (const u of [U1, U2]) await M.sys.linkUnit(T, HRS, u).catch(() => undefined);
 const sc = { tenantId: T, systemId: HRS }, PAY = { "hr.payroll.read": true, "hr.payroll.pay": true }, KEY = { "hr.employee.create": true };
 const mk = (k: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>) => fx.mkUser(T, k.toLowerCase(), `QCV5d ${k} ${tag}`, r, ua, p);
 /** O owner · M manager all branches (role, no key) · MK staff + hr.employee.create all · MB manager U1 (= walk manager-branch) · MKB staff + key U1 (= brief §5 "MB") · MP manager + payroll keys all · P / PS payroll keys only */
 const W: Record<string, Any> = { O: await mk("O", "OWNER", [], {}), M: await mk("M", "MANAGER", [], {}), MK: await mk("MK", "STAFF", [], KEY), MB: await mk("MB", "MANAGER", [U1], {}), MKB: await mk("MKB", "STAFF", [U1], KEY), MP: await mk("MP", "MANAGER", [], PAY), P: await mk("P", "STAFF", [], PAY), PS: await mk("PS", "STAFF", [], PAY) };
 await fx.mkEmp(T, HRS, `QCV5d self ${tag}`, { linkedUserId: W.PS.id, unitId: U1, code: "V5D1" });
 const Y = Number(String(M.date.thaiDateKey(new Date())).slice(0, 4)), KEYOF = new Map<string, string>([[U1, "U1"], [U2, "U2"], [HRS, "HRS"]]);
 for (const [k, u] of [["A", null], ["1", U1], ["2", U2]] as [string, string | null][]) {
  KEYOF.set((await P.hrShift.create({ data: { ...sc, unitId: u, name: `QCV5d กะ${k}`, startMin: 540 + Number(k === "A" ? 0 : k) * 60, endMin: 1020 } })).id, `S${k}`);
  KEYOF.set((await P.hrLeavePolicy.create({ data: { ...sc, unitId: u, category: "PERSONAL", name: `QCV5d ลา${k}`, quotaDays: 3 } })).id, `L${k}`);
  KEYOF.set((await P.hrHoliday.create({ data: { ...sc, unitId: u, date: new Date(`${Y}-06-1${k === "A" ? 0 : k}T00:00:00Z`), name: `QCV5d หยุด${k}`, kind: "SHOP" } })).id, `H${k}`);
 }
 const norm = (id: string) => { let s = id; for (const [raw, k] of KEYOF) s = s.split(raw).join(k); return s; };
 const path = `/app/sys/${HRS}/hr/settings`, lpath = `${path}/law`, cache = new Map<string, Out>();
 const page = async (v: string, sp: Record<string, string> = {}, lc: "th" | "en" = "th"): Promise<Out> => { const k = `${v}|${JSON.stringify(sp)}|${lc}`; if (!cache.has(k)) cache.set(k, await view(M.page, W[v], path, { id: HRS }, sp, lc)); return cache.get(k)!; };
 const lawp = (v: string, lc: "th" | "en" = "th") => view(M.law, W[v], lpath, { id: HRS }, {}, lc);
 const ok = (o: Out) => !o.err && o.html.length > 500;
 const navOf = (h: string) => idsWith(h, "hr-set-nav-").map((i) => i.slice(11));
 /** the viewer's menu tabs (no menu = today's single page) */
 const tabsOf = async (v: string) => navOf((await page(v)).html).filter((t) => (TABS as readonly string[]).includes(t));
 const unionOf = async (v: string) => { const ts = await tabsOf(v), out = new Set<string>(); for (const sp of ts.length ? ts.map((t) => ({ tab: t })) : [{}]) for (const i of allIds((await page(v, sp)).html)) out.add(norm(i)); return out; };
 const VIEW = ["O", "M", "MK", "MB", "MKB", "MP"];
 // ── G0 + W2 ──
 {
  const g0: string[] = [];
  for (const v of ["P", "PS"]) for (const [n, o] of [["settings", await page(v)], ["law", await lawp(v)]] as [string, Out][]) if (!/404|NOT_FOUND/.test(o.err)) g0.push(`${v} ${n}: ${o.err.slice(0, 40) || `rendered ${o.html.length}`}`);
  chk("G0", !g0.length, "404 ×4", L(g0));
  const rec: Record<string, string[]> = {}, w2: string[] = [];
  for (const v of VIEW) {
   const u = await unionOf(v), first = await page(v);
   if (!ok(first)) { w2.push(`${v}: ${first.err.slice(0, 60)}`); continue; }
   rec[v] = [...u].sort();
   const want = BASE_IDS[v];
   if (!want) { w2.push(`${v}: no golden`); continue; }
   const drop = (i: string) => W2_DROP.all!.test(i) || !!W2_DROP[v]?.test(i);
   const lost = want.filter((i) => !u.has(i) && !drop(i)), gained = [...u].filter((i) => !want.includes(i) && !W2_NEW.test(i) && i !== "hr-settings-law-link");
   if (lost.length || gained.length) w2.push(`${v}: lost=${L(lost, 4)} gained=${L(gained, 4)}`);
  }
  if (RECORD) console.log(`W2_RECORD ${JSON.stringify(rec)}`);
  chk("W2", !w2.length, "union = base set", L(w2, 6));
 }
 // ── N1 menu ──
 {
  const n1: string[] = [];
  for (const v of VIEW) {
   const o = await page(v), nav = elOf(o.html, "hr-set-nav");
   if (!nav) { n1.push(`${v}: no hr-set-nav`); continue; }
   const tabs = navOf(o.html).filter((t) => (TABS as readonly string[]).includes(t));
   if (tabs.join() !== NAV_WANT[v]!.join()) n1.push(`${v}: tabs ${tabs.join(",")} ≠ ${NAV_WANT[v]!.join(",")}`);
   const items: [string, string][] = [...nav.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => [m[0], textOfHtml(m[0]).trim()]);
   const keyOf = (a: string) => { const id = /data-testid="([^"]+)"/.exec(a)?.[1] ?? "", href = attrOf(a, "href"); return id === "hr-settings-law-link" ? "law" : id.startsWith("hr-set-nav-") ? id.slice(11) : /\/app\/settings\/staff/.test(href) ? "staff" : `?${id || href}`; };
   const order = items.map(([a]) => keyOf(a));
   if (order.join() !== NAV_ORDER.filter((k) => order.includes(k)).join() || order.some((k) => k.startsWith("?"))) n1.push(`${v}: order ${order.join(",")}`);
   for (const [a, txt] of items) { const k = keyOf(a), want = k === "life" ? MSG.th.hr.life.settings.title : NAV_TH[k]; if (want && txt !== want) n1.push(`${v}:${k} "${txt}"`); if (!/\b(min-)?h-(11|12|\[4[4-9]px\]|\[5\dpx\])/.test(attrOf(a, "class"))) n1.push(`${v}:${k} <44px`); if ((TABS as readonly string[]).includes(k) && new URLSearchParams(attrOf(a, "href").split("?")[1] ?? "").get("tab") !== k) n1.push(`${v}:${k} href`); }
   if ([...nav.matchAll(/aria-current="(page|true)"/g)].length !== 1 || !/aria-current="(page|true)"[^>]*data-testid="hr-set-nav-shifts"|data-testid="hr-set-nav-shifts"[^>]*aria-current="(page|true)"/.test(nav)) n1.push(`${v}: aria-current`);
   if (!/\/app\/sys\/[^"]+\/hr\/settings\/law"/.test(elOf(nav, "hr-settings-law-link"))) n1.push(`${v}: law link`);
   if ((v === "O") !== order.includes("staff")) n1.push(`${v}: managers item ${order.includes("staff")}`);
   const nt = textOfHtml(nav);
   if (!nt.includes("ตั้งค่าพนักงาน") || !nt.includes(MOCK_TH[MOCK_TH.indexOf("ตารางกฎหมายใช้ร่วมทุกสาขา · กะ/วันหยุด/กฎสาย ตั้งแยกรายสาขาได้")]!)) n1.push(`${v}: heading/footnote`);
  }
  chk("N1", !n1.length, "menu per viewer", L(n1, 6));
  const n2: string[] = [];
  for (const v of ["O", "MB"]) { const o = await lawp(v), nav = elOf(o.html, "hr-set-nav"), ll = elOf(nav, "hr-settings-law-link"); if (!nav || !/aria-current="(page|true)"/.test(ll) || [...nav.matchAll(/aria-current="(page|true)"/g)].length !== 1) n2.push(`${v}: menu/current`); if (!elOf(o.html, "hr-law-back") && !nav) n2.push(`${v}: no way back`); }
  chk("N2", !n2.length, "law menu", L(n2));
 }
 // ── P1 / P2 panels ──
 {
  const p1: string[] = [], where = new Map<string, string[]>();
  for (const t of TABS) {
   const o = await page("O", { tab: t }), ids = allIds(o.html);
   if (!ok(o)) { p1.push(`${t}: ${o.err.slice(0, 50)}`); continue; }
   if (!ids.includes(`hr-set-panel-${t}`)) p1.push(`${t}: no panel`);
   if (!ids.some((i) => SIG[t].test(i))) p1.push(`${t}: no own section`);
   const foreign = TABS.filter((x) => x !== t && ids.some((i) => SIG[x].test(i)));
   if (foreign.length) p1.push(`${t}: +${foreign.join("/")}`);
   if (!ids.includes("hr-set-connections")) p1.push(`${t}: no connections card`);
   for (const i of ids.filter((x) => !FRAME.test(x))) where.set(norm(i), [...(where.get(norm(i)) ?? []), t]);
  }
  const dup = [...where].filter(([, ts]) => ts.length > 1).map(([i, ts]) => `${i}@${ts.join("/")}`);
  if (dup.length) p1.push(`in 2+ panels: ${dup.slice(0, 4).join(" ")}`);
  chk("P1", !p1.length, "own sections only", L(p1, 6));
  const p2: string[] = [];
  for (const v of ["M", "MB"]) { const o = await page(v, { tab: "life" }), ids = allIds(o.html); if (!ids.includes("hr-set-empty") || !ids.includes("hr-set-nav") || TABS.some((t) => ids.some((i) => SIG[t].test(i)))) p2.push(`${v}: empty=${ids.includes("hr-set-empty")} nav=${ids.includes("hr-set-nav")} content=${TABS.filter((t) => ids.some((i) => SIG[t].test(i))).join("/")}`); }
  chk("P2", !p2.length, "menu + empty note", L(p2));
 }
 // ── G1 / G2 role matrix + disabled reasons ──
 {
  const g1: string[] = [], g2: string[] = [];
  for (const v of VIEW) {
   const ts = await tabsOf(v), renders = await Promise.all((ts.length ? ts.map((t) => ({ tab: t })) : [{}]).map((sp) => page(v, sp)));
   for (const o of renders) {
    for (const id of allIds(o.html)) if ((MUST_NOT[v] ?? []).some((re) => re.test(id)) && CTL.test(elOf(o.html, id))) g1.push(`${v}: ${id} <${tagOfEl(o.html, id)}>`);
    for (const m of o.html.matchAll(/<(\w+)\b[^>]*\sdisabled=""[^>]*>/g)) {
     const el = m[0], t = m[1]!;
     if (t === "option") continue;
     const desc = attrOf(el, "aria-describedby"), reason = (desc && desc.split(/\s+/).every((d) => textOfHtml(elOf(o.html.replace(new RegExp(`id="${d}"`), `data-testid="__r"`), "__r")).trim().length > 2)) || !!attrOf(el, "title") || !!attrOf(el, "data-reason");
     if (!reason) g2.push(`${v}: <${t}> ${/data-testid="([^"]+)"/.exec(el)?.[1] ?? attrOf(el, "name") ?? "?"}`);
    }
   }
   const ids = new Set(renders.flatMap((o) => allIds(o.html)).map(norm)), rows = [...ids].filter((i) => /^hr-settings-(shift|policy)-archive-|^hr-settings-holiday-delete-/.test(i)).map((i) => i.replace(/^hr-settings-(shift|policy)-archive-|^hr-settings-holiday-delete-/, "")).sort().join(",");
   const wantRows = ["MB", "MKB"].includes(v) ? "H1,L1,S1" : "H1,H2,HA,L1,L2,LA,S1,S2,SA";
   if (rows !== wantRows) g1.push(`${v}: row buttons ${rows} ≠ ${wantRows}`);
   for (const card of READONLY[v] ?? []) { const o = renders.find((x) => elOf(x.html, card)), el = o ? elOf(o.html, card) : ""; const ro = idsWith(el, "hr-set-readonly-"); if (!el || !ro.length || ro.some((r) => textOfHtml(elOf(el, r)).trim().length < 4)) g1.push(`${v}: ${card} no hr-set-readonly-* reason${el ? "" : " (card absent)"}`); }
  }
  chk("G1", !g1.length, "role matrix", L([...new Set(g1)], 8));
  chk("G2", !g2.length, "every disabled has a reason", L([...new Set(g2)], 8));
 }
 // ── F1 flashes ──
 {
  const f1: string[] = [];
  for (const [sp, t, probe] of [[{ tab: "leave", msg: "ok", year: String(Y) }, "leave", "hr-settings-message"], [{ run2: "ok" }, "pay", "hr-run2-engine"], [{ pacct: "ok" }, "pay", "hr-pay-accounting"], [{ life: "ok" }, "life", "hr-life-settings"], [{ fmsg: "saved" }, "pay", "hr-filing-profile"]] as [Record<string, string>, Tab, string][]) {
   const o = await page("O", sp), panel = elOf(o.html, `hr-set-panel-${t}`);
   if (!panel) { f1.push(`${new URLSearchParams(sp)}: no panel ${t}`); continue; }
   if (!elOf(panel, probe)) f1.push(`${new URLSearchParams(sp)}: ${probe} not in ${t}`);
   if (sp.msg && !/role="alert"/.test(elOf(panel, "hr-settings-message"))) f1.push("msg not alert in panel");
  }
  chk("F1", !f1.length, "flash in panel", L(f1));
 }
 // ── X2 wrappers land on their tab ──
 {
  const acts = new Map<string, Any>();
  for (const sp of [{}, ...TABS.map((t) => ({ tab: t }))]) for (const [k, f] of (await page("O", sp)).acts) acts.set(k, f);
  const x2: string[] = [];
  for (const [name, [, want]] of Object.entries(WRAP)) {
   const f = acts.get(name);
   if (!f) { x2.push(`${name}: not handed to the page`); continue; }
   const fd = new FormData();
   fd.set("systemId", HRS);
   let url = "";
   try { await inScope(`${W.O.cookie}; LOCALE=th`, path, async () => { const e = console.error; console.error = () => undefined; try { await f(fd); } finally { console.error = e; } }); x2.push(`${name}: no redirect`); continue; } catch (e) { const m = /^NEXT_REDIRECT;\w+;(.+);30\d;?/.exec(String((e as Any)?.digest ?? "")); if (!m) { x2.push(`${name}: ${errText(e).slice(0, 60)}`); continue; } url = m[1]!; }
   const u = new URL(url, "http://x"), sp = Object.fromEntries(u.searchParams), got = tabOf(sp);
   if (u.pathname !== path) x2.push(`${name}: → ${u.pathname}`);
   else if (got !== want) x2.push(`${name}: lands ${got} ≠ ${want} (?${u.search.slice(1, 60)})`);
   else if (!["msg", "run2", "pacct"].some((k) => sp[k])) x2.push(`${name}: no result code`);
  }
  chk("X2", !x2.length, "22 land on their tab", `${x2.length} bad: ${L(x2, 6)}`);
  const x3: string[] = [], ho = await page("O", { tab: "holidays" }), yf = (() => { const i = ho.html.indexOf('data-testid="hr-settings-holiday-year"'), s = ho.html.lastIndexOf("<form", i); return i > 0 && s >= 0 ? ho.html.slice(s, ho.html.indexOf("</form>", i)) : ""; })();
  if (!/<input[^>]*name="tab"[^>]*value="holidays"|<input[^>]*value="holidays"[^>]*name="tab"/.test(yf)) x3.push("year form: no tab=holidays");
  for (const t of TABS.filter((x) => x !== "leave")) if (idsWith((await page("O", { tab: t })).html, "hr-settings-law-preset-form-").length) x3.push(`law preset forms in ${t}`);
  if (!idsWith((await page("O", { tab: "leave" })).html, "hr-settings-law-preset-").length) x3.push("no law presets in leave");
  chk("X3", !x3.length, "GET form + presets", L(x3));
 }
 // ── C1 connections ──
 {
  const c1: string[] = [];
  for (const v of ["O", "MB"]) {
   const o = await page(v), c = elOf(o.html, "hr-set-connections"), rows = idsWith(c, "hr-set-conn-"), t = textOfHtml(c);
   if (!c) { c1.push(`${v}: no card`); continue; }
   if (!/href="\/app\/settings\/connections"/.test(c) || !t.includes("ทั้งหมด") || !t.includes("การเชื่อมต่อ (ย่อ)")) c1.push(`${v}: title/link`);
   if (rows.length !== 2) c1.push(`${v}: rows ${rows.join(",")}`);
   const hrefs = [...c.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
   if (!hrefs.some((h) => /[?&]tab=pay[^#]*#hr-pay-accounting$/.test(h)) || !hrefs.some((h) => /[?&]tab=connect[^#]*#hr-line-settings$/.test(h))) c1.push(`${v}: row links ${hrefs.slice(0, 4).join(" ")}`);
   if (!t.includes("บัญชี") || !t.includes("แชท LINE พนักงาน") || /\bPOS\b|จอง|คลัง|เปิดใช้/.test(t)) c1.push(`${v}: rows text`);
  }
  chk("C1", !c1.length, "2 rows + all link", L(c1));
 }
 // ── L1 law page ──
 {
  const o = await lawp("O"), t = textOfHtml(o.html), l1: string[] = [];
  const lv = await M.lawLib.loadLawView(M.date.thaiDateKey(new Date())).catch(() => null), sso = (lv?.groups ?? []).find((g: Any) => g.kind === "SSO")?.rows ?? [];
  if (!ok(o)) l1.push(`render ${o.err.slice(0, 60)}`);
  if (!sso.length) l1.push("control: no SSO rows in the law table of this DB");
  for (const s of ["ตารางกฎหมาย", MSG.th.hr.law.howPicked, `⚠ ${MSG.th.hr.law.warn}`, ...LAW_TITLES]) if (!t.includes(s)) l1.push(`missing "${s.slice(0, 24)}"`);
  for (const s of LAW_NOT) if (t.includes(s)) l1.push(`has "${s}"`);
  const card = elOf(o.html, "hr-law-row-SSO"), tb = /<table\b[\s\S]*?<\/table>/.exec(card)?.[0] ?? "", ths = [...tb.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOfHtml(m[1]!).trim());
  if (ths.join("|") !== SSO_COLS.join("|")) l1.push(`SSO cols ${ths.join("|") || "no table"}`);
  const body = [...tb.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].filter((m) => /<td\b/.test(m[0])).length;
  if (tb && body !== sso.length) l1.push(`SSO rows ${body} ≠ ${sso.length}`);
  const tx = elOf(o.html, "hr-law-row-TAX_BRACKET"), tths = [...tx.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOfHtml(m[1]!).trim());
  if (tths.slice(0, 3).join("|") !== TAX_COLS.join("|")) l1.push(`tax cols ${tths.join("|")}`);
  chk("L1", !l1.length, "wording + SSO table", L(l1, 6));
 }
 // ── I3 en sentinel · I4 desc ──
 {
  const sent = Object.values(SV.th).map(String).filter((x) => /[ก-ฺเ-๛]/.test(x) && x.length > 1).map((x) => x.replace(/\{[^}]*\}/g, "").trim().slice(0, 12)).filter((x) => x.length > 1);
  const ens = [...(await Promise.all(TABS.map((tb) => page("O", { tab: tb }, "en")))), await page("MB", { tab: "connect" }, "en"), await lawp("O", "en")];
  const txt = ens.map((o) => textOfHtml(o.html)).join(" "), hit = sent.filter((s) => txt.includes(s));
  const i3 = { block: sent.length > 0, rendered: ens.every(ok) || ens.map((o) => o.err.slice(0, 30)).join(";"), noMissing: !ens.some((o) => /‹MISSING:hr\.setview/.test(o.html)), noThai: !hit.length || hit.slice(0, 3).join(",") };
  chk("I3", all(i3), "all", fails(i3));
  const th = await page("O"), hd = textOfHtml(th.html.slice(0, th.html.indexOf('data-testid="hr-set-nav"') > 0 ? th.html.indexOf('data-testid="hr-set-nav"') : 4000));
  const thaiLines: string[] = [];
  for (const f of CH.filter((p) => /^src\/.*\.tsx?$/.test(p))) {
   const lines = isNew(f) ? rd(f).split("\n") : hunksOf(f).flatMap((h) => h.added);
   const hit2 = lines.map((l) => stripComments(l).replace(/\{\/\*.*?\*\/\}/g, "")).filter((l) => /[ก-ฺเ-๛]/.test(l));
   if (hit2.length) thaiLines.push(`${f.split("/").pop()}:${hit2.length}`);
  }
  const i4 = { desc: ok(th) && !/ชั่วคราว|แบบย่อ/.test(hd) && !allIds(th.html).includes("hr-settings-stub-note"), noThaiLiteral: !thaiLines.length || L(thaiLines, 3) };
  chk("I4", all(i4), "all", fails(i4));
 }
 // ── K1 inventory (rendered hr-set-* ids need a row on their page) ──
 {
  const noRow: string[] = [];
  for (const [k, o] of cache) for (const id of allIds(o.html).filter((i) => i.startsWith("hr-set-"))) if (!INVROWS.some((r) => r.page === PG && r.wo === "VIS-5d" && idMatch(String(r.testid), id))) noRow.push(id);
  for (const v of ["O", "MB"]) for (const id of allIds((await lawp(v)).html).filter((i) => i.startsWith("hr-set-"))) if (!INVROWS.some((r) => r.page === PG_LAW && r.wo === "VIS-5d" && idMatch(String(r.testid), id))) noRow.push(`law:${id}`);
  const rendered = [...cache.values()].some((o) => allIds(o.html).some((i) => i.startsWith("hr-set-")));
  chk("K1", !K1S.pre.length && !noRow.length && rendered, "rows + conditional + kept", `${L([...K1S.pre, ...[...new Set(noRow)].map((x) => `noRow ${x}`)], 6)}${rendered ? "" : " · no hr-set-* rendered"}`);
 }
} catch (e) {
 crashed = errText(e);
 console.log(`🔴 harness error: ${crashed} ${(e as Error)?.stack?.split("\n").slice(1, 4).join(" | ")}`);
} finally {
 try { await sweepTenants(P, fx.tenants); } catch (e) { console.log(`sweep: ${errText(e)}`); }
 await cleanupFx(P, fx, SLUG);
 const r1 = await sweepResidue(P, fx.tenants), r2 = await residueOf(P, fx, SLUG, PFX), left = await P.tenant.count({ where: { slug: { startsWith: PFX } } }), net = NET.attempts.filter((a: string) => !/fetch:\??$/.test(a));
 const miss = [...new Set(CUR.missing)].filter((m) => !/hr\.setview/.test(m));
 chk("Z1", !r1.length && !r2.length && left === 0 && !net.length, "", `sweep=${r1.join(",") || "none"} fx=${r2.join(",") || "none"} tenants=${left} outbound=${net.join(",") || 0} missing=${miss.slice(0, 3).join(",") || 0}`);
 await P.$disconnect?.();
}
process.exit(R.finish({ forced: FORCE, crashed, missing: [] }));
