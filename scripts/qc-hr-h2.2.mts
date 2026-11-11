// QC — HR V2 · H2.2 — roster board UI over the H2.1 engine (page hr/roster · loader + leave overlay + action cores · pure shared module ·
//      "use server" wrappers · pointer-event grid · nav · messages · inventory) + H2.1 counter debts D-R3w / D-R3c (owner H2.2)
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Fixtures: tenants `qc-hr-h22-<stamp>` (+ `-d` frozen set · `-other`) · names carry a letter tag (no 9+ digit run) · ids only · swept in finally.
// Brief: ledger/hr-briefs/hr-brief-H2.2.md (R1–R17 · §10 rulings) + controller delta 11 Nov · base session/hr 02f41f34f (H2.1 r3 merged).
// CONTRACT (ORACLE-EDIT if it must differ):
//   roster-board-shared.ts (only `import type`): ROSTER_MSG {code→th} (codes noPerm ended outEmploy shiftOff shiftNotFound shiftOther dup
//     past sameWeek publishRace otherBranch unassigned otherUnit shiftEqual noSystem failed; th = engine text) · ROSTER_MSG_CODE_OF Map<text,code> ·
//     mondayOf(day) · weekLabel(monday) · rosterTitle(monday, unitName) · shiftKind(colour) m|a|c|x · shiftLabel(name) · timeRange(startMin,endMin) ·
//     applyOp(board, op) / rollback(board, opId) / confirmOp|confirm(board, opId, realId) → new board, input untouched, compared on `rows` ·
//     op {id, kind move|copy, entryId, to{employeeId,day}} · canDrop(board, entryId, to) · keyTarget(board, entryId, ArrowLeft|Right|Up|Down) → {employeeId,day}|null
//   roster-board.ts: loadRosterBoard(ctx, viewer, {week?, unit?, todayKey}) → dto | null (null = not a reader) ·
//     dto {monday prevMonday nextMonday todayKey unitSel(all|id) units[{id,name}] canWrite canPublish(=canWrite ∧ count>0) unpublishedCount
//          warnings totalMin notes[] title days[7]{key dow label weekend past headcount holiday?{name,shopOpen}}
//          rows[{employeeId name initial position probation borrowed homeUnitName cells[7] weekMin shiftCount leaveDays warn}]
//          cell{day state(work|off|out|past) entries[{id shiftId label kind start end overnight paidMin published source}] leave?{status,label}}
//          rulePanel{rows[{rule label ok names[] hours entryIds[]}] info[{rule text}]}}
//     rosterOpCore(auth, op) · auth = requireTenant() shape · op {kind generate|copy|add|move|remove|publish, systemId, …engine input} →
//     {ok:true, …counts (created/skipped · published)} | {ok:false, code ∈ ROSTER_MSG} (thrown ⇒ failed)
//   roster-actions.ts "use server": generate/copyRosterWeek/addRosterEntry/moveRosterEntry/removeRosterEntry/publishRoster + "Action"
// "untouched vs base" statics = n/a once the base contains roster-board.ts (H2.2 merged; its SHA does not exist yet) · payroll-rules sha unconditional.
// SKIP while roster-board.ts is absent (exit 0) · QC_FORCE=1 runs · --list · visual gate = CONTROLLER-RUN (list in wo-notes/hr-H2.2-oracle.md).
// Run: bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.2.mts
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type Any, type Def, type Sev, type Base, type Who, ROOT, rd, short, errText, isThai, srt, failedKeys, stripComments, sha, dk, dbDate, sleep, tagOf,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, changedVsBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, authOf, underRosterLock, frozenControls, FROZEN_CLOCK, fitnessNoEnv, importsOf, flat, jsonOf, placeholderRe as phRe,
  testidsOf as tidOf, canon, keysDeep, loadOpt, modState as st, ROSTER_ENGINE_TEXT as ENGINE_TEXT, hrNavLabels, useServerFile, clientImports,
  inventoryParity, msgParity, tokensOnly, HR_FORBIDDEN_DTO_KEYS,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h2.2";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h22-";
const F = {
  page: "src/app/app/sys/[id]/hr/roster/page.tsx",
  board: "src/lib/modules/hr/roster-board.ts",
  shared: "src/lib/modules/hr/roster-board-shared.ts",
  actions: "src/lib/modules/hr/roster-actions.ts",
  ui: "src/lib/modules/hr/roster-ui.tsx",
  roster: "src/lib/modules/hr/roster.ts",
  layout: "src/app/app/layout.tsx",
  hrUi: "src/lib/modules/hr/ui.tsx",
  th: "src/messages/th/common.json",
  en: "src/messages/en/common.json",
  inv: "scripts/hr-ui-inventory.json",
  visual: "scripts/visual-hr.mts",
  fitHr: "scripts/fitness-hr.mts",
  css: "src/app/globals.css",
};
const H = "src/lib/modules/hr/";
const FROZEN_FILES = [
  ...["roster-rules.ts", "service.ts", "payroll.ts", "payroll-actions.ts", "payroll-digest.ts", "privacy-shared.ts", "privacy.ts", "time-rules.ts", "settings.ts", "settings-actions.ts", "actions.ts", "KioskClock.tsx"].map((f) => H + f),
  "src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts", PAYROLL_RULES_FILE,
];
const CODES = [...Object.keys(ENGINE_TEXT), "noSystem", "failed"];
const RULE_LABELS = ["ชม. สูงสุด/วัน 10", "พักระหว่างกะ ≥ 11 ชม.", "วันหยุด ≥ 1/สัปดาห์", "ชม./สัปดาห์ ≤ 48"];
const TESTIDS = ["page", "title", "branch-chip-", "legend", "grid", "day-", "row-", "hours-", "total", "note", "rule-", "rules", "empty", "unpublished", "published-state", "publish", "publish-confirm", "copy-prev", "generate", "week-prev", "week-label", "week-next", "week-today", "cell-", "picker", "picker-shift-", "entry-", "entry-sheet", "entry-remove", "drag-ghost", "message", "daytab-"].map((s) => `hr-roster-${s}`);
const MOCK_TEXTS = ["คัดลอกจากสัปดาห์ก่อน", "ใช้แม่แบบ", "เผยแพร่ให้ทีม", "ยังไม่เผยแพร่ (แก้ {n} จุด)", "เช้า", "บ่าย", "ปิดร้าน", "ลา", "แก้แล้ว ยังไม่เผยแพร่", "พนักงาน", "ชม./สัปดาห์", "หยุด", "รออนุมัติ", "กฎที่ตรวจ", "เตือนเท่านั้น ไม่บล็อกการเผยแพร่", "✓ ผ่าน", "วางที่นี่", "ยืมตัว", "ทดลอง", "เกิน {n}", "+ ลา {n} วัน", "รวม {n} ชม."];

// ═════════════════════════ registry ═════════════════════════
const D = (id: string, g: string, sev: Sev, base: Base, title: string): Def => [`H2.2-${id}`, g, sev, base, title] as const;
const [C, M, m] = ["CRITICAL", "MAJOR", "MINOR"] as const;
const CHECKS: readonly Def[] = [
  D("S1.1", "R2", C, "RED", "[static] page guard (HR system · privacy + scope · notFound) · loader · hrTabs · no rosterOnDay/rosterAt"),
  D("S1.2", "R2", C, "RED", "[loader] owner · mgr-all · mgr-u1 · mgr-[] · writer-staff ⇒ board · payroll-like · staff-u1 · member ⇒ null"),
  D("S1.3", "R14", M, "RED", "[static] nav: roster after attendance in layout + hrTabs · hrTabs settings (D9) · same sets · page exists"),
  D("S1.4", "R3", M, "RED", "[loader] all-branch (owner, mgr-[]) ⇒ unitSel all + u1 + u2 · mgr-u1 ⇒ units [u1], unitSel u1"),
  D("S1.5", "R3", C, "RED", "[loader] mgr-u1 ?unit=u2 ⇒ falls back to u1 · no u2 id · u2 name only as homeUnitName"),
  D("S1.6", "R3", M, "RED", "[pure+loader] ?week any day ⇒ Monday · invalid ⇒ todayKey week · prev/next ±7 across month + year end"),
  D("S1.7", "R3", M, "RED", "[loader] 7 day columns · neighbour-week entries hidden"),
  D("S1.8", "R2", M, "RED", "[loader] canWrite = canManageHrSettings(viewer) for every reader"),
  D("S2.1", "R12", C, "RED", "[core] add / move / remove / generate / copy / publish ⇒ ok + engine rows changed"),
  D("S2.2", "R13", C, "RED", "[pure+core] ROSTER_MSG / th msg.<code> = engine text · en present · 8 refusals map to codes"),
  D("S2.3", "R12", M, "RED", "[core] reason outside the list (range > 31 d) ⇒ failed · malformed auth ⇒ failed · no raw text"),
  D("S2.4", "R10", C, "RED", "[core] 2020 add / move / remove ⇒ past · row unchanged"),
  D("S2.5", "R12", C, "RED", "[core] mgr-u1: e2 (u2) ⇒ otherBranch · e3 (no unit) ⇒ unassigned · e4 borrowed day ⇒ ok"),
  D("S2.6", "R12", C, "RED", "[core] staff-u1 / member / payroll-like × 6 ops ⇒ noPerm · 0 writes · 0 events"),
  D("S2.7", "R12", C, "RED", "[core] other-tenant / non-HR systemId ⇒ noSystem · 0 writes"),
  D("S2.8", "R12", M, "RED", "[static] roster-actions.ts: use server · only exported async fns (6) · each requireTenant + rosterOpCore"),
  D("S2.9", "R12", C, "RED", "[core] no result carries a person / unit name, leave reason or entry note"),
  D("S3.1", "R4", C, "RED", "[loader] u1 rows e1 e5 e6 e7 then borrowed e4 · e4 out-days · probation · position"),
  D("S3.2", "R4", M, "RED", "[loader] ENDED e5 row only via its entry · other cells out"),
  D("S3.3", "R5", M, "RED", "[loader+pure] chip kind / label / snapshot times · shiftKind / shiftLabel / timeRange vectors"),
  D("S3.4", "R5", M, "RED", "[loader] overnight shift-4 chip x · 22:00–06:00 · overnight · start day only"),
  D("S3.5", "R4", M, "RED", "[loader] cell states past · off · out · work"),
  D("S3.6", "R4", M, "RED", "[loader] weekMin / shiftCount / totalMin = Σ displayed paidMin (e1 1800 / 4)"),
  D("S3.7", "R4", M, "RED", "[loader] day DTO labels · weekend · past · headcount · holiday"),
  D("S3.8", "R6", C, "RED", "[loader] leave overlay · label by viewer · leaveDays"),
  D("S3.9", "R4", C, "RED", "[dto] 5 boards: no forbidden key · no secret value"),
  D("S4.1", "R7", M, "RED", "[loader] unpublishedCount = engine (10) · th bar text"),
  D("S4.2", "R7", M, "RED", "[loader] chip.published = engine row.published"),
  D("S4.3", "R7", C, "RED", "[core] publish u1 ⇒ 10 rows flip · u2 untouched · 1 event · engine + board count 0"),
  D("S4.4", "R7", M, "RED", "[core] publish again ⇒ 0 · no event"),
  D("S4.5", "R8", M, "RED", "[loader] rule panel: e7 DAY_OFF + MAX_WEEK 56 named · others ok · no OVERLAP · info"),
  D("S4.6", "R8", M, "RED", "[loader] rule row entryIds = engine warning entryIds ∩ shown chips"),
  D("S4.7", "R8", C, "RED", "[loader] e2 (u2) warning named for owner/all · mgr-u1 board never names e2"),
  D("S4.8", "R8", M, "RED", "[loader] canPublish true while warnings > 0"),
  D("S4.9", "D-R3w", M, "RED", "[race] removal after publish candidate read stays counted"),
  D("S4.10", "D-R3c", M, "RED", "[service] > 500 newer publish audits keep a cleared removal cleared"),
  D("S5.1", "R1", M, "RED", "[static] shared module: type-only imports · no clock · no Intl/toLocale"),
  D("S5.2", "R11", M, "RED", "[pure] applyOp(move) moves + marks changed · rollback exact · input untouched"),
  D("S5.3", "R11", M, "RED", "[pure] applyOp(copy) temp chip · confirm swaps id · rollback removes"),
  D("S5.4", "R11", M, "RED", "[pure] canDrop false: past / same cell / !canWrite · true: other row future cell"),
  D("S5.5", "R11", M, "RED", "[pure] keyTarget edges ⇒ null · one step otherwise"),
  D("S5.6", "R11", M, "RED", "[pure] two queued ops, first rolled back ⇒ only the second applied"),
  D("S5.7", "R11", C, "RED", "[static] roster-ui: use client · imports · no db path · pointer events · actions"),
  D("S6.1", "R14", M, "RED", "[static] every R14 data-testid / family present"),
  D("S6.2", "R14", M, "RED", "[static] inventory /hr/roster ↔ code ids both ways · wo/oracle · fitness-hr F16.8"),
  D("S6.3", "R13", M, "RED", "[static] th hr.roster.* holds the mockup-03 texts"),
  D("S6.4", "R8", M, "RED", "[loader] rule labels from ROSTER_RULE_DEFAULTS (10 h · 11 h · 1 · 48)"),
  D("S6.5", "R3", M, "RED", "[pure] weekLabel same / cross month · rosterTitle BE year"),
  D("S6.6", "R13", M, "RED", "[static] F16.4 th/en hr.roster.* parity · non-empty · msg.<code> for every code"),
  D("S6.7", "R16", M, "RED", "[static] tokens only in roster files · --color-shift-1…12"),
  D("S6.8", "R15", m, "RED", "[static] roster-ui.tsx min-h-[44px]/min-h-11 ≥ <button> count"),
  D("S6.9", "§4", M, "RED", "[static] visual-hr SPECS 2.2: 4 specs + expect statuses"),
  D("S7.1", "R17", C, "GREEN", "[static] payroll-rules sha · frozen files vs base · roster.ts marked hunks only"),
  D("S7.2", "R17", C, "GREEN", "[digest] board session via cores in system D ⇒ H2.1 S8 digests + MONTHLY frozen"),
  D("S7.3", "R17", C, "GREEN", "[run] clock() control " + FROZEN_CLOCK),
  D("S7.4", "R17", C, "GREEN", "[dto] privacy matrix 7 viewers as H2.1 S8.9"),
  D("X2.1", "X2", C, "RED", "[core] other-tenant ids refused · unchanged · sys2 rows hidden"),
  D("X12.1", "X12", M, "GREEN", "[run] fitness + fitness-hr without env ⇒ exit 0"),
  D("Z1", "-", C, "GREEN", "residue: qc-hr-h22-* tenants / rows / users / sessions gone"),
];
const REG = makeRegistry(SUITE, "H2.2-", CHECKS);
const chk = REG.chk;
if (ARGV.includes("--list")) {
  REG.printList();
  process.exit(0);
}

// ═════════════════════════ statics ═════════════════════════
const BASE_REF = baseRef("QC_H22_BASE");
const H22_IN_BASE = pathInBase(F.board, BASE_REF);
const code = (p: string) => stripComments(rd(p));
const rosterMsgs = (p: string) => flat(jsonOf(p)?.hr?.roster ?? {});
function runStatic(): void {
    const [page, ui, board, shared, acts] = [F.page, F.ui, F.board, F.shared, F.actions].map(code);
  {
    const imp = importsOf(page).map((i) => i.spec);
    const r = {
      exists: !!page,
      hrLookup: /appSystem\.find\w*\(\s*\{[^}]*type:\s*["']HR["']/.test(page),
      privacy: imp.includes("@/lib/modules/hr/privacy"),
      scope: imp.includes("@/lib/modules/hr/scope"),
      notFound: /notFound\(\)/.test(page),
      loader: /loadRosterBoard\(/.test(page) && /hrTabs\(/.test(page),
      noSeams: ![page, ui, board, shared, acts].some((s) => /\brosterOnDay\b|\brosterAt\b/.test(s)),
    };
    chk("S1.1", Object.values(r).every(Boolean), "page guard + loader + tabs · no seams", failedKeys(r));
  }
  {
    const n = hrNavLabels();
    const after = (ls: string[]) => ls.indexOf("ตารางกะ") === ls.indexOf("ลงเวลา") + 1;
    const href = (s: string) => /href:\s*`\$\{s\}\/hr\/roster`\s*,\s*label:\s*["']ตารางกะ["']/.test(s);
    const r = { layout: href(n.layout) && after(n.L), tabs: href(n.tabs) && after(n.T), settingsTab: n.T.includes("ตั้งค่า"), sameSets: srt(n.L) === srt(n.T), page: !!page };
    chk("S1.3", Object.values(r).every(Boolean), "roster after attendance in both · settings in hrTabs · same sets · page", `${failedKeys(r)} layout=[${n.L}] tabs=[${n.T}]`);
  }
  {
    const want = ["generateRosterAction", "copyRosterWeekAction", "addRosterEntryAction", "moveRosterEntryAction", "removeRosterEntryAction", "publishRosterAction"];
    const a = useServerFile(acts, want, [/requireTenant\(/, /rosterOpCore\(/]);
    chk("S2.8", Object.values(a.r).every(Boolean), "use server · 6 async fns · requireTenant + rosterOpCore", `${failedKeys(a.r)} exported=[${a.got}]`);
  }
  {
    const imp = importsOf(shared);
    const r = { exists: !!shared, typeOnly: imp.every((i) => i.type) && !/\bimport\s*\(|\brequire\(/.test(shared), noClock: !/Date\.now\(|new Date\(\s*\)/.test(shared), noIntl: !/\bIntl\b|toLocale\w*\(/.test(shared) };
    chk("S5.1", Object.values(r).every(Boolean), "type-only imports · no clock · no Intl", failedKeys(r));
  }
  {
    const allowed = (s: string) => /^(react|next-intl|next\/navigation)$|^@\/components\/|^(\.\/|@\/lib\/modules\/hr\/)(roster-board-shared|roster-actions)$/.test(s);
    const c = clientImports(ui, allowed, /roster-actions$/);
    const r = { useClient: c.useClient, allowedOnly: c.n > 0 && !c.bad.length, noDb: !c.dbReach.length, pointer: /onPointerDown/.test(ui) && !/draggable\s*=|onDragStart/.test(ui), actions: /moveRosterEntryAction\(/.test(ui) && /addRosterEntryAction\(/.test(ui) };
    chk("S5.7", Object.values(r).every(Boolean), "use client · allowed imports · no db path · pointer · actions", `${failedKeys(r)} bad=${c.bad} db=${c.dbReach}`);
  }
  const ids = new Set([...tidOf(rd(F.ui), "hr-roster-"), ...tidOf(rd(F.page), "hr-roster-")]);
  const miss = TESTIDS.filter((t) => ![...ids].some((i) => (t.endsWith("-") ? i.startsWith(t) : i === t)));
  chk("S6.1", ids.size > 0 && !miss.length, `${TESTIDS.length} ids/families`, miss.length ? `missing ${miss}` : "all");
  {
    const p = inventoryParity("/hr/roster", ids, "H2.2", SUITE);
    const f168 = /F16\.8/.test(rd(F.fitHr));
    chk("S6.2", p.rows > 0 && !p.codeNoRow.length && !p.rowNoCode.length && p.meta && f168, "inventory ↔ code · wo/oracle · F16.8", `rows=${p.rows} codeNoRow=${p.codeNoRow.slice(0, 6)} rowNoCode=${p.rowNoCode.slice(0, 6)} meta=${p.meta} F16.8=${f168}`);
  }
  const th = rosterMsgs(F.th);
  const vals = Object.values(th).map(String);
  const missT = MOCK_TEXTS.filter((t) => !vals.some((v) => (t.includes("{n}") ? phRe(t).test(v) : v === t)));
  chk("S6.3", vals.length > 0 && !missT.length, `${MOCK_TEXTS.length} texts`, missT.length ? `missing ${missT.join(" | ")}` : "all");
  const mp = msgParity(th, rosterMsgs(F.en), CODES.map((c) => `msg.${c}`));
  chk("S6.6", Object.values(mp).every(Boolean), "th = en keys · non-empty · codes", failedKeys(mp));
  {
    const css = rd(F.css);
    const r = { files: !!ui && !!page, ...tokensOnly([page, ui, board, shared, acts].join("\n")), shiftTokens: Array.from({ length: 12 }, (_, i) => `--color-shift-${i + 1}:`).every((t) => css.includes(t)) };
    chk("S6.7", Object.values(r).every(Boolean), "tokens only · 12 shift tokens", failedKeys(r));
  }
  const buttons = (ui.match(/<button\b/g) ?? []).length;
  const tall = (ui.match(/min-h-\[44px\]|min-h-11\b/g) ?? []).length;
  chk("S6.8", buttons > 0 && tall >= buttons, "min-h ≥ <button> count", `buttons=${buttons} min-h=${tall}`);
  {
    const v = rd(F.visual);
    const i = v.indexOf('"2.2"');
    const blk = i >= 0 ? v.slice(i, v.indexOf("],", i)) : "";
    const r = { keys: ["roster-huahin", "roster-all", "roster-empty", "roster-refused"].every((k) => blk.includes(`"${k}"`)), expect: /expect\s*:/.test(blk) && /404/.test(blk) && /200/.test(blk), type: /expect\?\s*:/.test(v) };
    chk("S6.9", Object.values(r).every(Boolean), "4 specs + expect", failedKeys(r));
  }
  {
    const rsha = sha(rd(PAYROLL_RULES_FILE));
    const diff = H22_IN_BASE ? "unchanged" : changedVsBase(BASE_REF, FROZEN_FILES);
    const hunks = H22_IN_BASE ? [] : diffHunks(BASE_REF, F.roster);
    const unmarked = hunks === null ? -1 : hunks.filter((h) => !h.added.some((l) => /HR H2\.2/.test(l))).length;
    chk("S7.1", rsha === PAYROLL_RULES_SHA && diff === "unchanged" && unmarked === 0, `${PAYROLL_RULES_SHA.slice(0, 16)} · ${FROZEN_FILES.length} unchanged · roster.ts unmarked hunks 0`, `${rsha.slice(0, 16)} · ${H22_IN_BASE ? "n/a · H2.2 in base" : `${diff} · roster.ts hunks=${hunks?.length ?? "?"} unmarked=${unmarked}`} (base ${BASE_REF.slice(0, 9) || "?"})`);
  }
}

// ═════════════════════════ SKIP guard ═════════════════════════
const skipReasons = existsSync(join(ROOT, F.board)) ? [] : [`H2.2 not built: ${F.board} absent`];
if (skipReasons.length && !FORCE) REG.skipExit(skipReasons);
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — running although: ${skipReasons.join(" · ")} (expect RED for the right reason, no crash)`);
const mods = {
  shared: await loadOpt(F.shared, "@/lib/modules/hr/roster-board-shared"),
  board: await loadOpt(F.board, "@/lib/modules/hr/roster-board"),
  roster: await loadOpt(F.roster, "@/lib/modules/hr/roster"),
  settings: (await import("@/lib/modules/hr/settings")) as Any,
  sysSvc: (await import("@/lib/modules/system/service")) as Any,
};
const ok = (m: Any) => (m && !m.__err ? m : null);
const SH: Any = ok(mods.shared) ?? {};
const BD: Any = ok(mods.board) ?? {};
const EN: Any = ok(mods.roster) ?? {};
console.log(`[${SUITE}] modules: board=${st(mods.board, F.board)} · shared=${st(mods.shared, F.shared)} · roster=${st(mods.roster, F.roster)}`);

const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
const tag = tagOf(stamp);
const fx = makeFixtures(P, coreHash, SLUG);
const leakScan: string[] = []; // every core result JSON (S2.9)
const pure = (fn: string, ...a: unknown[]): Any => {
  if (typeof SH[fn] !== "function") return `∅${fn}`;
  try {
    return SH[fn](...a);
  } catch (e) {
    return `THROW ${errText(e)}`;
  }
};
async function load(ctx: Any, w: Who, input: Record<string, unknown>): Promise<Any> {
  if (typeof BD.loadRosterBoard !== "function") return { __missing: "∅loadRosterBoard" };
  try {
    return await BD.loadRosterBoard(ctx, vOf(w), input);
  } catch (e) {
    return { __missing: `THROW ${errText(e)}` };
  }
}
const isBoard = (b: Any) => !!b && typeof b === "object" && !b.__missing && Array.isArray(b.rows);
async function core(auth: Any, op: Record<string, unknown>): Promise<Any> {
  if (typeof BD.rosterOpCore !== "function") return { ok: false, code: "∅rosterOpCore" };
  try {
    const r = await BD.rosterOpCore(auth, op);
    leakScan.push(JSON.stringify(r) ?? "");
    return r;
  } catch (e) {
    return { ok: false, code: `THROW ${errText(e).slice(0, 60)}` };
  }
}
async function eng(fn: string, ...a: unknown[]): Promise<Any> {
  if (typeof EN[fn] !== "function") return { ok: false, reason: `∅${fn}` };
  try {
    return await EN[fn](...a);
  } catch (e) {
    return { ok: false, reason: `THROW ${errText(e)}` };
  }
}
const rowOf = (b: Any, emp: string): Any => (isBoard(b) ? b.rows.find((r: Any) => r.employeeId === emp) : undefined);
const cellOf = (b: Any, emp: string, day: string): Any => rowOf(b, emp)?.cells?.find((c: Any) => c.day === day);
const chipsOf = (b: Any): Any[] => (isBoard(b) ? b.rows.flatMap((r: Any) => (r.cells ?? []).flatMap((c: Any) => (c.entries ?? []).map((e: Any) => ({ ...e, employeeId: r.employeeId, day: c.day })))) : []);

// ═════════════════════════ DB ═════════════════════════
async function runDb(): Promise<void> {
  const T = await fx.newTenant("", "QC HR H2.2 บอร์ดตารางกะ");
  const TD = await fx.newTenant("-d", "QC HR H2.2 ดิจิสต์");
  const T2 = await fx.newTenant("-other", "QC HR H2.2 ร้านอื่น");
  const u1 = await fx.newUnit(T, `สาขาเหนือ ${tag}`, "u1");
  await sleep(15);
  const u2 = await fx.newUnit(T, `สาขาใต้ ${tag}`, "u2");
  const u2Name = `สาขาใต้ ${tag}`;
  const sA = await mods.sysSvc.createSystem(T, "HR", "ทีมงาน A");
  const sys2 = await mods.sysSvc.createSystem(T, "HR", "ทีมงาน สอง");
  const sMeet = await mods.sysSvc.createSystem(T, "MEETING", "ห้องประชุม");
  const sO = await mods.sysSvc.createSystem(T2, "HR", "ทีมร้านอื่น");
  const ctxA = { tenantId: T, systemId: sA.id };
  const RE = P.hrRosterEntry;
  const U = {
    owner: await fx.mkUser(T, "owner", `QC เจ้าของ ${tag}`, "OWNER", [], {}),
    mgrAll: await fx.mkUser(T, "mgrall", `QC ผู้จัดการทุกสาขา ${tag}`, "MANAGER", ["*"], {}),
    mgrU1: await fx.mkUser(T, "mgru1", `QC ผู้จัดการเหนือ ${tag}`, "MANAGER", [u1], { "hr.employee.create": true }),
    mgrEmpty: await fx.mkUser(T, "mgrempty", `QC ผู้จัดการไม่ระบุ ${tag}`, "MANAGER", [], { "hr.employee.create": true }),
    writer: await fx.mkUser(T, "writer", `QC ผู้จัดกะ ${tag}`, "STAFF", ["*"], { "hr.employee.create": true }),
    payroll: await fx.mkUser(T, "payroll", `QC เงินเดือน ${tag}`, "STAFF", ["*"], { "hr.payroll.read": true }),
    staffU1: await fx.mkUser(T, "staffu1", `QC พนักงานเหนือ ${tag}`, "STAFF", [u1], { "hr.leave.request": true }),
    member: await fx.mkUser(T, "member", `QC สมาชิก ${tag}`, "STAFF", [], {}),
    other: await fx.mkUser(T2, "other", `QC ร้านอื่น ${tag}`, "OWNER", [], {}),
  };
  const A = authOf(U.owner);
  const cA = (kind: string, o: Record<string, unknown> = {}) => core(A, { kind, systemId: sA.id, ...o });
  const mk = async (name: string, o: Any) => {
    const id = await fx.mkEmp(T, sA.id, `${name} ${tag}`, o);
    await sleep(15);
    return id;
  };
  const E = {
    e1: await mk("พนง-หนึ่ง", { unitId: u1, linkedUserId: U.staffU1.id, status: "ACTIVE", position: "บาริสต้า" }),
    e2: await mk("พนง-สอง", { unitId: u2, status: "ACTIVE" }),
    e3: await mk("พนง-สาม", { status: "ACTIVE" }),
    e4: await mk("พนง-สี่", { unitId: u2, status: "ACTIVE" }),
    e5: await mk("พนง-ห้า", { unitId: u1, status: "ENDED", active: false, endDate: "2030-01-31" }),
    e6: await mk("พนง-หก", { unitId: u1, status: "PROBATION" }),
    e7: await mk("พนง-มิ้นท์", { unitId: u1, status: "ACTIVE" }),
    eS: await fx.mkEmp(T, sys2.id, `พนง-ระบบสอง ${tag}`, { unitId: u1 }),
    eX: await fx.mkEmp(T2, sO.id, `พนง-ร้านอื่น ${tag}`, {}),
  };
  const NAME = (e: string) => fx.names.find((n) => n.startsWith(e)) ?? "∅";
  await P.hrEmployee.update({ where: { id: E.e1 }, data: { nationalId: "QC-SECRET-NID", phone: "QC-SECRET-PHONE", email: "qc-secret@qc.invalid", pinHash: `qc-secret-pin-${stamp}` } });
  const WK = ["2030-03-04", "2030-03-05", "2030-03-06", "2030-03-07", "2030-03-08", "2030-03-09", "2030-03-10"];
  const TODAY = WK[1];
  await P.hrEmployeeUnit.create({ data: { ...ctxA, employeeId: E.e4, unitId: u1, fromDate: dbDate(WK[2]), toDate: dbDate(WK[4]) } });
  const shift = async (name: string, s: number, e: number, colour: string | null, o: Any = {}) => (await P.hrShift.create({ data: { ...ctxA, name, startMin: s, endMin: e, colour, ...o } })).id as string;
  const S = {
    m: await shift("กะเช้า", 420, 900, "shift-1"),
    a: await shift("กะบ่าย", 720, 1200, "shift-2"),
    c: await shift("กะปิดร้าน", 900, 1380, "shift-3"),
    n: await shift("กะดึก", 1320, 360, "shift-4", { crossesMidnight: true }),
    u2: await shift("กะใต้", 540, 1020, "shift-1", { unitId: u2 }),
    x: await shift("กะเก่า", 480, 960, null, { active: false }),
    o: (await P.hrShift.create({ data: { tenantId: T2, systemId: sO.id, name: "กะร้านอื่น", startMin: 420, endMin: 900 } })).id as string,
  };
  const SHT = new Map<string, Any>((await P.hrShift.findMany({ where: { tenantId: { in: [T, T2] } } })).map((s: Any) => [s.id, s]));
  const raw = async (emp: string, day: string, sh: string, unitId: string | null, o: { published?: boolean; s?: number; e?: number; note?: string; tenant?: string; system?: string } = {}) => {
    const x = SHT.get(sh);
    const r = await RE.create({ data: { tenantId: o.tenant ?? T, systemId: o.system ?? sA.id, employeeId: emp, date: dbDate(day), shiftId: sh, unitId, startMin: o.s ?? x.startMin, endMin: o.e ?? x.endMin, breakMin: 0, crossesMidnight: !!x.crossesMidnight, published: !!o.published, publishedAt: o.published ? new Date("2030-01-01T00:00:00Z") : null, source: "MANUAL", note: o.note ?? null } });
    return r.id as string;
  };
  const R: Record<string, string> = {
    e1Mon: await raw(E.e1, WK[0], S.m, u1, { published: true }),
    e1Wed: await raw(E.e1, WK[2], S.m, u1, { published: true, note: "QC-SECRET-NOTE" }),
    e1Thu: await raw(E.e1, WK[3], S.a, u1, { s: 840, e: 1200 }),
    e1Fri: await raw(E.e1, WK[4], S.c, u1, { published: true }),
    e1Prev: await raw(E.e1, "2030-03-03", S.m, u1),
    e1Next: await raw(E.e1, "2030-03-11", S.m, u1),
    e3Thu: await raw(E.e3, WK[3], S.m, null),
    e4Mon: await raw(E.e4, WK[0], S.u2, u2),
    e4Thu: await raw(E.e4, WK[3], S.m, u1),
    e5Wed: await raw(E.e5, WK[2], S.m, u1, { published: true }),
    e6Wed: await raw(E.e6, WK[2], S.n, u1),
    s2: await raw(E.eS, WK[2], S.m, u1, { system: sys2.id }),
    other: await raw(E.eX, "2030-04-02", S.o, null, { tenant: T2, system: sO.id }),
  };
  for (const d of WK) await raw(E.e7, d, S.m, u1);
  for (const d of WK) await raw(E.e2, d, S.u2, u2, { published: d === WK[2] });
  const pol = await P.hrLeavePolicy.create({ data: { ...ctxA, category: "VACATION", name: "ลาพักร้อนทดสอบ" } });
  await P.hrLeave.create({ data: { ...ctxA, employeeId: E.e1, type: "VACATION", policyId: pol.id, fromDate: dbDate(WK[1]), toDate: dbDate(WK[1]), status: "APPROVED", reason: "QC-SECRET-REASON" } });
  await P.hrLeave.create({ data: { ...ctxA, employeeId: E.e6, type: "PERSONAL", fromDate: dbDate(WK[5]), toDate: dbDate(WK[6]), status: "PENDING", reason: "QC-SECRET-REASON" } });
  await P.hrHoliday.create({ data: { ...ctxA, date: dbDate(WK[3]), name: "วันหยุดทดสอบ", kind: "PUBLIC", shopOpen: true } });
  const lsO = (w: Record<string, unknown>) => eng("listRoster", ctxA, vOf(U.owner), w);
  const inp = (o: Record<string, unknown> = {}) => ({ week: WK[0], unit: u1, todayKey: TODAY, ...o });
  const ev = async () => P.outboxEvent.count({ where: { tenantId: T, type: "hr.roster.published" } });
  const rosterN = async () => RE.count({ where: { tenantId: { in: [T, T2] } } });

  // ═══ S1 ═══
  const B: Record<string, Any> = {};
  for (const k of ["owner", "mgrAll", "mgrU1", "mgrEmpty", "writer", "payroll", "staffU1", "member"] as const) B[k] = await load(ctxA, U[k], inp({ unit: undefined }));
  {
    const readers = ["owner", "mgrAll", "mgrU1", "mgrEmpty", "writer"].map((k) => `${k}=${isBoard(B[k]) ? "board" : short(B[k]?.__missing ?? B[k], 30)}`);
    const refused = ["payroll", "staffU1", "member"].map((k) => `${k}=${B[k] === null ? "null" : short(B[k]?.__missing ?? "board", 30)}`);
    chk("S1.2", readers.every((s) => s.endsWith("=board")) && refused.every((s) => s.endsWith("=null")), "5 boards · 3 null", [...readers, ...refused].join(" "));
  }
  {
    const unitIds = (b: Any) => (isBoard(b) ? (b.units ?? []).map((u: Any) => u.id).filter((x: string) => x !== "all") : []);
    const allOk = (b: Any) => isBoard(b) && b.unitSel === "all" && [u1, u2].every((u) => unitIds(b).includes(u));
    const r = { owner: allOk(B.owner), mgrEmpty: allOk(B.mgrEmpty), mgrU1: isBoard(B.mgrU1) && srt(unitIds(B.mgrU1)) === u1 && B.mgrU1.unitSel === u1 };
    chk("S1.4", Object.values(r).every(Boolean), "all + u1 + u2 · manager-u1 [u1]", failedKeys(r));
  }
  {
    const b = await load(ctxA, U.mgrU1, inp({ unit: u2 }));
    const j = JSON.stringify(b ?? null);
    const strip = JSON.stringify(b ?? null, (k, v) => (k === "homeUnitName" ? undefined : v));
    chk("S1.5", isBoard(b) && b.unitSel === u1 && !j.includes(u2) && !strip.includes(u2Name), "unitSel u1 · no u2 id · u2 name only as homeUnitName", `u2id=${j.includes(u2)} u2name=${strip.includes(u2Name)} ${short(b?.__missing ?? b?.unitSel, 50)}`);
  }
  {
    const vec: [string, string][] = [["2030-03-07", "2030-03-04"], ["2030-03-10", "2030-03-04"], ["2030-03-04", "2030-03-04"], ["2031-01-01", "2030-12-30"]];
    const bad = vec.filter(([d, m]) => pure("mondayOf", d) !== m).map(([d]) => `${d}→${pure("mondayOf", d)}`);
    const a = await load(ctxA, U.owner, inp({ week: "2030-03-07" }));
    const z = await load(ctxA, U.owner, inp({ week: "bogus" }));
    const y = await load(ctxA, U.owner, inp({ week: "2030-12-31" }));
    const r = { pure: bad.length === 0, any: a?.monday === WK[0] && a?.prevMonday === "2030-02-25" && a?.nextMonday === "2030-03-11", invalid: z?.monday === WK[0], yearEnd: y?.monday === "2030-12-30" && y?.prevMonday === "2030-12-23" && y?.nextMonday === "2031-01-06" };
    chk("S1.6", Object.values(r).every(Boolean), "Mondays · ±7 · year end", `${failedKeys(r)} ${bad}`);
  }
  const bU1 = await load(ctxA, U.owner, inp());
  const chips = chipsOf(bU1);
  {
    const keys = isBoard(bU1) ? (bU1.days ?? []).map((d: Any) => d.key) : [];
    const ids = new Set(chips.map((c) => c.id));
    chk("S1.7", keys.join(",") === WK.join(",") && !ids.has(R.e1Prev) && !ids.has(R.e1Next) && rowOf(bU1, E.e1)?.cells?.length === 7, "7 days · neighbours hidden", `days=${keys.length} prev=${ids.has(R.e1Prev)} next=${ids.has(R.e1Next)}`);
  }
  {
    const bad = ["owner", "mgrAll", "mgrU1", "mgrEmpty", "writer"].filter((k) => !isBoard(B[k]) || B[k].canWrite !== mods.settings.canManageHrSettings(vOf((U as Any)[k])));
    chk("S1.8", bad.length === 0, "canWrite = canManageHrSettings", bad.join(",") || "all");
  }

  // ═══ S3 ═══
  {
    const order = isBoard(bU1) ? bU1.rows.map((r: Any) => r.employeeId) : [];
    const want = [E.e1, E.e5, E.e6, E.e7, E.e4];
    const r4 = rowOf(bU1, E.e4);
    const r = { order: order.join(",") === want.join(","), e4: r4?.borrowed === true && r4?.homeUnitName === u2Name && [WK[1], WK[5], WK[6]].every((d) => cellOf(bU1, E.e4, d)?.state === "out"), e6: rowOf(bU1, E.e6)?.probation === true, e1: rowOf(bU1, E.e1)?.position === "บาริสต้า" && rowOf(bU1, E.e1)?.borrowed === false };
    chk("S3.1", Object.values(r).every(Boolean), "e1 e5 e6 e7 · e4 borrowed", `${failedKeys(r)} order=${order.map((id: string) => Object.entries(E).find(([, v]) => v === id)?.[0])}`);
  }
  {
    const r5 = rowOf(bU1, E.e5);
    const r = { row: !!r5, entry: (cellOf(bU1, E.e5, WK[2])?.entries ?? []).some((e: Any) => e.id === R.e5Wed), out: [WK[3], WK[4], WK[5]].every((d) => cellOf(bU1, E.e5, d)?.state === "out") };
    chk("S3.2", Object.values(r).every(Boolean), "ENDED row via entry · other cells out", failedKeys(r));
  }
  {
    const c = (id: string) => chips.find((x) => x.id === id);
    const mon = c(R.e1Mon);
    const thu = c(R.e1Thu);
    const fri = c(R.e1Fri);
    const tr: [number, number, string][] = [[420, 900, "07–15"], [840, 1200, "14–20"], [1320, 360, "22–06"], [450, 900, "07:30–15"]];
    const r = {
      m: mon?.kind === "m" && mon?.label === "เช้า" && mon?.start === "07:00" && mon?.end === "15:00",
      a: thu?.kind === "a" && thu?.label === "บ่าย" && thu?.start === "14:00" && thu?.end === "20:00",
      c: fri?.kind === "c" && fri?.label === "ปิดร้าน",
      kindFn: pure("shiftKind", "shift-1") === "m" && pure("shiftKind", "shift-3") === "c" && pure("shiftKind", null) === "x" && pure("shiftKind", "shift-9") === "x",
      labelFn: pure("shiftLabel", "กะเช้า") === "เช้า" && pure("shiftLabel", "ดึก") === "ดึก",
      timeRange: tr.every(([s, e, w]) => pure("timeRange", s, e) === w),
    };
    chk("S3.3", Object.values(r).every(Boolean), "m/a/c chips · override times · vectors", `${failedKeys(r)} mon=${short(mon, 90)}`);
  }
  {
    const n = chips.find((x) => x.id === R.e6Wed);
    const thuIds = (cellOf(bU1, E.e6, WK[3])?.entries ?? []).map((e: Any) => e.id);
    chk("S3.4", n?.kind === "x" && n?.label === "ดึก" && n?.start === "22:00" && n?.end === "06:00" && n?.overnight === true && n?.day === WK[2] && !thuIds.includes(R.e6Wed), "x · ดึก · 22:00–06:00 · overnight · Wed only", short(n, 120));
  }
  {
    const s = (e: string, d: string) => cellOf(bU1, e, d)?.state;
    const r = { past: s(E.e1, WK[0]) === "past" && (cellOf(bU1, E.e1, WK[0])?.entries ?? []).length === 1, off: s(E.e1, WK[5]) === "off" && s(E.e4, WK[2]) === "off", out: s(E.e4, WK[1]) === "out", work: s(E.e1, WK[2]) === "work" && s(E.e4, WK[3]) === "work" };
    chk("S3.5", Object.values(r).every(Boolean), "past · off · out · work", failedKeys(r));
  }
  {
    const rows = isBoard(bU1) ? bU1.rows : [];
    const sums = rows.every((r: Any) => r.weekMin === (r.cells ?? []).flatMap((c: Any) => c.entries ?? []).reduce((a: number, e: Any) => a + Number(e.paidMin), 0) && r.shiftCount === (r.cells ?? []).flatMap((c: Any) => c.entries ?? []).length);
    const total = rows.reduce((a: number, r: Any) => a + Number(r.weekMin), 0);
    const e1 = rowOf(bU1, E.e1);
    chk("S3.6", rows.length > 0 && sums && bU1.totalMin === total && e1?.weekMin === 1800 && e1?.shiftCount === 4, "Σ paidMin · e1 1800/4", `sums=${sums} total=${bU1?.totalMin}/${total} e1=${e1?.weekMin}/${e1?.shiftCount}`);
  }
  {
    const days = isBoard(bU1) ? bU1.days : [];
    const labels = ["จ. 4", "อ. 5", "พ. 6", "พฤ. 7", "ศ. 8", "ส. 9", "อา. 10"];
    const r = {
      labels: days.map((d: Any) => d.label).join("|") === labels.join("|"),
      weekend: days.map((d: Any) => !!d.weekend).join() === "false,false,false,false,false,true,true",
      past: days.map((d: Any) => !!d.past).join() === "true,false,false,false,false,false,false",
      headcount: days[2]?.headcount === 4 && days[3]?.headcount === 3,
      holiday: days[3]?.holiday?.name === "วันหยุดทดสอบ" && days[3]?.holiday?.shopOpen === true && !days[2]?.holiday && (bU1?.notes ?? []).length >= 1,
    };
    chk("S3.7", Object.values(r).every(Boolean), "labels · weekend · past · headcount 4/3 · holiday", failedKeys(r));
  }
  const bWriter = await load(ctxA, U.writer, inp());
  {
    const l = (b: Any, e: string, d: string) => cellOf(b, e, d)?.leave;
    const r = {
      e1: l(bU1, E.e1, WK[1])?.status === "APPROVED" && l(bU1, E.e1, WK[1])?.label === "ลาพักร้อนทดสอบ",
      e6: [WK[5], WK[6]].every((d) => l(bU1, E.e6, d)?.status === "PENDING" && isThai(String(l(bU1, E.e6, d)?.label ?? ""))) && !l(bU1, E.e6, WK[4]),
      writer: l(bWriter, E.e1, WK[1])?.label === "ลา" && l(bWriter, E.e6, WK[5])?.label === "ลา",
      days: rowOf(bU1, E.e1)?.leaveDays === 1 && rowOf(bU1, E.e6)?.leaveDays === 2,
    };
    chk("S3.8", Object.values(r).every(Boolean), "APPROVED/PENDING overlay · labels by viewer · leaveDays", failedKeys(r));
  }
  {
    const boards = { owner: bU1, ownerAll: B.owner, mgrAll: B.mgrAll, mgrU1: B.mgrU1, writer: bWriter };
    const bad: string[] = [];
    for (const [k, b] of Object.entries(boards)) {
      if (!isBoard(b)) {
        bad.push(`${k}:no board`);
        continue;
      }
      const ks = [...keysDeep(b)].filter((x) => HR_FORBIDDEN_DTO_KEYS.includes(x) || /salary|Satang$/i.test(x));
      const j = JSON.stringify(b);
      const sec = ["QC-SECRET", "qc-secret", "pinHash"].filter((s) => j.includes(s));
      if (ks.length || sec.length) bad.push(`${k}:${[...ks, ...sec].join("+")}`);
    }
    chk("S3.9", bad.length === 0, "whitelist holds for 5 boards", bad.join(" ") || "clean");
  }

  // ═══ S5 pure reducer (on the real u1 board) ═══
  {
    const before = isBoard(bU1) ? canon(bU1.rows) : "∅";
    const op = { id: "op-1", kind: "move", entryId: R.e1Wed, to: { employeeId: E.e1, day: WK[5] } };
    const a = pure("applyOp", bU1, op);
    const moved = (cellOf(a, E.e1, WK[5])?.entries ?? []).find((e: Any) => e.id === R.e1Wed);
    const gone = !(cellOf(a, E.e1, WK[2])?.entries ?? []).some((e: Any) => e.id === R.e1Wed);
    const back = pure("rollback", a, "op-1");
    const r = { moved: !!moved && moved.published === false, gone, rollback: isBoard(back) && canon(back.rows) === before, pureIn: isBoard(bU1) && canon(bU1.rows) === before };
    chk("S5.2", Object.values(r).every(Boolean), "move · changed · exact rollback · input intact", `${failedKeys(r)} ${typeof a === "string" ? a : ""}`);
  }
  {
    const op = { id: "op-2", kind: "copy", entryId: R.e1Fri, to: { employeeId: E.e6, day: WK[4] } };
    const a = pure("applyOp", bU1, op);
    const tmp = (cellOf(a, E.e6, WK[4])?.entries ?? []).find((e: Any) => e.id !== R.e1Fri);
    const src = (cellOf(a, E.e1, WK[4])?.entries ?? []).some((e: Any) => e.id === R.e1Fri);
    const conf = typeof SH.confirmOp === "function" ? pure("confirmOp", a, "op-2", "real-id-1") : pure("confirm", a, "op-2", "real-id-1");
    const back = pure("rollback", a, "op-2");
    const r = { temp: !!tmp && tmp.published === false && tmp.shiftId === S.c && src, confirm: (cellOf(conf, E.e6, WK[4])?.entries ?? []).some((e: Any) => e.id === "real-id-1"), rollback: isBoard(back) && canon(back.rows) === canon(bU1?.rows) };
    chk("S5.3", Object.values(r).every(Boolean), "temp chip · confirm id · rollback", `${failedKeys(r)} ${typeof a === "string" ? a : ""}`);
  }
  {
    const ro = isBoard(bU1) ? { ...bU1, canWrite: false } : bU1;
    const r = {
      past: pure("canDrop", bU1, R.e1Fri, { employeeId: E.e1, day: WK[0] }) === false,
      same: pure("canDrop", bU1, R.e1Fri, { employeeId: E.e1, day: WK[4] }) === false,
      noWrite: pure("canDrop", ro, R.e1Fri, { employeeId: E.e6, day: WK[4] }) === false,
      ok: pure("canDrop", bU1, R.e1Fri, { employeeId: E.e6, day: WK[4] }) === true,
    };
    chk("S5.4", Object.values(r).every(Boolean), "past/same/!canWrite false · future true", failedKeys(r));
  }
  {
    const e7 = (d: string) => chips.find((c) => c.employeeId === E.e7 && c.day === d)?.id;
    const kt = (id: string | undefined, k: string) => pure("keyTarget", bU1, id, k);
    const eq = (v: Any, emp: string, day: string) => v && v.employeeId === emp && v.day === day;
    const r = {
      sunRight: kt(e7(WK[6]), "ArrowRight") === null,
      intoPast: kt(e7(WK[1]), "ArrowLeft") === null,
      left: eq(kt(e7(WK[2]), "ArrowLeft"), E.e7, WK[1]),
      lastDown: kt(R.e4Thu, "ArrowDown") === null,
      down: eq(kt(e7(WK[3]), "ArrowDown"), E.e4, WK[3]),
      firstUp: kt(R.e1Wed, "ArrowUp") === null,
    };
    chk("S5.5", Object.values(r).every(Boolean), "edges null · one step", failedKeys(r));
  }
  {
    const o1 = { id: "q1", kind: "move", entryId: R.e1Thu, to: { employeeId: E.e1, day: WK[5] } };
    const o2 = { id: "q2", kind: "move", entryId: R.e1Fri, to: { employeeId: E.e1, day: WK[6] } };
    const both = pure("rollback", pure("applyOp", pure("applyOp", bU1, o1), o2), "q1");
    const only2 = pure("applyOp", bU1, o2);
    chk("S5.6", isBoard(both) && isBoard(only2) && canon(both.rows) === canon(only2.rows), "rows = only op 2", isBoard(both) ? "differs" : short(both, 60));
  }

  // ═══ S4 ═══
  const lr = await lsO({ from: WK[0], to: WK[6], unitId: u1 });
  {
    const th = rosterMsgs(F.th);
    const bar = Object.values(th).some((v) => phRe("ยังไม่เผยแพร่ (แก้ {n} จุด)").test(String(v)));
    chk("S4.1", isBoard(bU1) && lr.ok && bU1.unpublishedCount === lr.unpublishedCount && lr.unpublishedCount === 10 && bar, "board = engine = 10 · bar text", `board=${bU1?.unpublishedCount} engine=${lr.unpublishedCount ?? short(lr.reason, 40)} bar=${bar}`);
  }
  {
    const pubOf = new Map<string, boolean>(((lr.entries ?? []) as Any[]).map((e) => [e.id, e.published]));
    const bad = chips.filter((c) => pubOf.get(c.id) !== c.published).map((c) => c.id);
    chk("S4.2", chips.length > 0 && bad.length === 0, "chip.published = engine", `${chips.length} chips · mismatched ${bad.length}`);
  }
  const panelRow = (b: Any, rule: string): Any => (isBoard(b) ? (b.rulePanel?.rows ?? []).find((r: Any) => r.rule === rule) : undefined);
  {
    const rows = isBoard(bU1) ? bU1.rulePanel?.rows ?? [] : [];
    const r = {
      four: ["MAX_DAY", "REST", "DAY_OFF", "MAX_WEEK"].every((k) => panelRow(bU1, k)),
      okRows: panelRow(bU1, "MAX_DAY")?.ok === true && panelRow(bU1, "REST")?.ok === true,
      dayOff: panelRow(bU1, "DAY_OFF")?.ok === false && (panelRow(bU1, "DAY_OFF")?.names ?? []).includes(NAME("พนง-มิ้นท์")),
      maxWeek: panelRow(bU1, "MAX_WEEK")?.ok === false && (panelRow(bU1, "MAX_WEEK")?.names ?? [])[0] === NAME("พนง-มิ้นท์") && panelRow(bU1, "MAX_WEEK")?.hours === 56,
      noOverlap: !rows.some((x: Any) => x.rule === "OVERLAP"),
      info: (bU1?.rulePanel?.info ?? []).some((i: Any) => i.rule === "HOLIDAY_WORK" && i.text === "ทำงานวันหยุด — คิดค่าจ้างวันหยุด"),
      warnRow: rowOf(bU1, E.e7)?.warn === true,
    };
    chk("S4.5", Object.values(r).every(Boolean), "4 rows · e7 DAY_OFF + MAX_WEEK 56 · info", `${failedKeys(r)} ${short(rows, 100)}`);
    const labs = ["MAX_DAY", "REST", "DAY_OFF", "MAX_WEEK"].map((k) => panelRow(bU1, k)?.label);
    chk("S6.4", labs.join("|") === RULE_LABELS.join("|"), RULE_LABELS.join(" | "), labs.join(" | "));
  }
  {
    const shown = new Set(chips.map((c) => c.id));
    const bad: string[] = [];
    for (const k of ["DAY_OFF", "MAX_WEEK"]) {
      const want = new Set(((lr.warnings ?? []) as Any[]).filter((w) => w.rule === k).flatMap((w) => w.entryIds as string[]).filter((id) => shown.has(id)));
      const got = (panelRow(bU1, k)?.entryIds ?? []) as string[];
      if (want.size === 0 || srt(new Set(got)) !== srt(want)) bad.push(`${k}:${got.length}/${want.size}`);
    }
    chk("S4.6", bad.length === 0, "entryIds = engine ∩ shown", bad.join(" ") || "match");
  }
  {
    const e2n = NAME("พนง-สอง");
    const owAll = (panelRow(B.owner, "MAX_WEEK")?.names ?? []).includes(e2n);
    const mgr = !JSON.stringify(B.mgrU1 ?? null).includes(e2n);
    chk("S4.7", isBoard(B.owner) && isBoard(B.mgrU1) && owAll && mgr, "owner names e2 · manager-u1 never", `owner=${owAll} mgrU1Clean=${mgr}`);
  }
  chk("S4.8", isBoard(bU1) && bU1.canPublish === true && (lr.warnings ?? []).length > 0, "canPublish with warnings", `canPublish=${bU1?.canPublish} warnings=${(lr.warnings ?? []).length}`);
  {
    const e0 = await ev();
    const p = await cA("publish", { from: WK[0], to: WK[6], unitId: u1 });
    const e1n = await ev();
    const u1Un = await RE.count({ where: { systemId: sA.id, unitId: u1, published: false, date: { gte: dbDate(WK[0]), lte: dbDate(WK[6]) } } });
    const u2Un = await RE.count({ where: { systemId: sA.id, unitId: u2, published: false, date: { gte: dbDate(WK[0]), lte: dbDate(WK[6]) } } });
    const after = await lsO({ from: WK[0], to: WK[6], unitId: u1 });
    const bAfter = await load(ctxA, U.owner, inp());
    chk("S4.3", p?.ok === true && Number(p.published) === 10 && u1Un === 0 && u2Un === 7 && e1n - e0 === 1 && after.unpublishedCount === 0 && bAfter?.unpublishedCount === 0, "10 flipped · u2 7 untouched · 1 event · count 0", `${p?.ok ? `published=${p.published}` : `code=${p?.code}`} u1Un=${u1Un} u2Un=${u2Un} events +${e1n - e0} engine=${after.unpublishedCount} board=${bAfter?.unpublishedCount}`);
    const p2 = await cA("publish", { from: WK[0], to: WK[6], unitId: u1 });
    chk("S4.4", p2?.ok === true && Number(p2.published) === 0 && (await ev()) === e1n, "0 · no event", `${p2?.ok ? p2.published : p2?.code} events +${(await ev()) - e1n}`);
  }
  {
    // D-R3w: removal of a published row lands after publish read its candidates (publish waits on a holder lock) ⇒ never announced ⇒ still counted
    const wk = { from: "2030-10-14", to: "2030-10-20", unitId: u1 };
    const b = await raw(E.e6, "2030-10-15", S.m, u1, { published: true });
    await raw(E.e1, "2030-10-16", S.m, u1);
    let rm: Any = null;
    const h = typeof EN.publishRoster === "function"
      ? await underRosterLock(P, sA.id, { employeeId: E.e1, date: "2030-10-16" }, () => eng("publishRoster", ctxA, vOf(U.owner), wk), { whileWaiting: async () => (rm = await eng("removeEntry", ctxA, vOf(U.owner), b)) })
      : { res: { ok: false, reason: "∅publishRoster" }, waited: false, holderErr: "", sideErr: "" };
    const c = await lsO(wk);
    const r = { waited: h.waited, removed: rm?.ok === true, published: h.res?.ok === true && Number(h.res?.published) === 1, stillCounted: c.ok && c.unpublishedCount === 1 };
    chk("S4.9", Object.values(r).every(Boolean), "publish 1 · removal after candidate read still counted (1)", `${failedKeys(r)} count=${c.unpublishedCount ?? short(c.reason, 40)} pub=${h.res?.published ?? short(h.res?.reason, 30)}${h.holderErr ? ` holder=${h.holderErr}` : ""}`);
  }
  {
    // D-R3c: removal cleared by a covering (marker) publish must stay cleared when > 500 newer publish audits exist
    const wk = { from: "2030-10-21", to: "2030-10-27", unitId: u1 };
    const x = await raw(E.e1, "2030-10-22", S.m, u1, { published: true });
    const rm = await eng("removeEntry", ctxA, vOf(U.owner), x);
    const c0 = await lsO(wk);
    const p = await eng("publishRoster", ctxA, vOf(U.owner), wk);
    const c1 = await lsO(wk);
    await sleep(20);
    await P.auditLog.createMany({ data: Array.from({ length: 501 }, (_, i) => ({ tenantId: T, actorType: "SYSTEM", action: "hr.roster.publish", targetType: "HrRosterEntry", targetId: `qc-h22-${i}`, after: { systemId: sA.id, publishId: `qc-h22-${i}`, count: 0, unitId: null, from: "2031-01-06", to: "2031-01-12", scopeUnits: null } })) });
    const c2 = await lsO(wk);
    const r = { prep: rm?.ok === true && c0.unpublishedCount === 1 && p?.ok === true && c1.unpublishedCount === 0, afterCap: c2.ok && c2.unpublishedCount === 0 };
    chk("S4.10", Object.values(r).every(Boolean), "1 → 0 → still 0 after 501 newer audits", `${failedKeys(r)} counts=${c0.unpublishedCount}→${c1.unpublishedCount}→${c2.unpublishedCount ?? short(c2.reason, 40)}`);
  }

  // ═══ S2 cores ═══
  {
    await P.hrWorkSchedule.create({ data: { ...ctxA, employeeId: E.e1, weekday: 1, dayOff: false, startMin: 420, endMin: 900 } });
    const add = await cA("add", { employeeId: E.e1, date: "2030-04-02", shiftId: S.m });
    const id = (await RE.findFirst({ where: { employeeId: E.e1, date: dbDate("2030-04-02") } }))?.id ?? "∅";
    const mv = await cA("move", { entryId: id, date: "2030-04-03" });
    const movedOk = dk((await RE.findUnique({ where: { id } }))?.date) === "2030-04-03";
    const rmv = await cA("remove", { entryId: id });
    const gone = !(await RE.findUnique({ where: { id } }));
    const gen = await cA("generate", { from: "2030-04-08", to: "2030-04-14" });
    const genN = await RE.count({ where: { employeeId: E.e1, date: dbDate("2030-04-08") } });
    const cp = await cA("copy", { fromWeek: "2030-04-08", toWeek: "2030-04-15" });
    const cpN = await RE.count({ where: { employeeId: E.e1, date: dbDate("2030-04-15") } });
    const pb = await cA("publish", { from: "2030-04-08", to: "2030-04-21" });
    const pubN = await RE.count({ where: { employeeId: E.e1, published: true, date: { gte: dbDate("2030-04-08"), lte: dbDate("2030-04-21") } } });
    const r = { add: add?.ok === true && id !== "∅", move: mv?.ok === true && movedOk, remove: rmv?.ok === true && gone, generate: gen?.ok === true && genN === 1, copy: cp?.ok === true && cpN === 1, publish: pb?.ok === true && pubN === 2 };
    chk("S2.1", Object.values(r).every(Boolean), "six ops ok + rows changed", `${failedKeys(r)} codes=${[add, mv, rmv, gen, cp, pb].map((x) => (x?.ok ? "ok" : x?.code)).join(",")}`);
  }
  {
    const MSG = SH.ROSTER_MSG ?? {};
    const th = rosterMsgs(F.th);
    const en = rosterMsgs(F.en);
    const table = Object.entries(ENGINE_TEXT).filter(([c, t]) => MSG[c] !== t || th[`msg.${c}`] !== t || !en[`msg.${c}`] || SH.ROSTER_MSG_CODE_OF?.get?.(t) !== c).map(([c]) => c);
    const cases: [string, Record<string, unknown>][] = [
      ["dup", { kind: "add", employeeId: E.e1, date: WK[2], shiftId: S.m }],
      ["shiftOff", { kind: "add", employeeId: E.e1, date: "2030-04-23", shiftId: S.x }],
      ["shiftOther", { kind: "add", employeeId: E.e1, date: "2030-04-23", shiftId: S.u2 }],
      ["sameWeek", { kind: "copy", fromWeek: WK[0], toWeek: WK[0] }],
      ["ended", { kind: "add", employeeId: E.e5, date: "2030-04-23", shiftId: S.m }],
      ["shiftNotFound", { kind: "add", employeeId: E.e1, date: "2030-04-23", shiftId: "qc-no-such-shift" }],
      ["shiftEqual", { kind: "add", employeeId: E.e1, date: "2030-04-24", shiftId: S.m, startMin: 600, endMin: 600 }],
    ];
    const got: [string, string][] = [];
    for (const [want, op] of cases) got.push([want, String((await core(A, { systemId: sA.id, ...op }))?.code)]);
    got.push(["otherUnit", String((await core(authOf(U.mgrU1), { kind: "publish", systemId: sA.id, from: WK[0], to: WK[6], unitId: u2 }))?.code)]);
    const wrong = got.filter(([w, c]) => w !== c).map(([w, c]) => `${w}→${c}`);
    chk("S2.2", Object.keys(MSG).length > 0 && table.length === 0 && wrong.length === 0, "table byte-exact · 8 mapped refusals", `table✗=${table.join(",") || "-"} mapped✗=${wrong.join(" ") || "-"}`);
  }
  {
    const a = await cA("publish", { from: "2030-01-01", to: "2030-03-01" });
    const b = await core({}, { kind: "add", systemId: sA.id, employeeId: E.e1, date: "2030-04-25", shiftId: S.m });
    const j = JSON.stringify([a, b]);
    chk("S2.3", a?.ok === false && a?.code === "failed" && b?.ok === false && b?.code === "failed" && !/Error|\bat\s|เลือกช่วงวัน/.test(j), "failed · failed · clean", short(j, 120));
  }
  {
    const old = await raw(E.e1, "2020-03-04", S.m, u1);
    const snap = JSON.stringify(await RE.findUnique({ where: { id: old } }));
    const out = [
      await cA("add", { employeeId: E.e1, date: "2020-03-03", shiftId: S.m }),
      await cA("move", { entryId: old, date: "2020-03-05" }),
      await cA("remove", { entryId: old }),
    ];
    const same = snap === JSON.stringify(await RE.findUnique({ where: { id: old } }));
    const none = (await RE.count({ where: { employeeId: E.e1, date: dbDate("2020-03-03") } })) === 0;
    chk("S2.4", out.every((x) => x?.code === "past") && same && none, "past ×3 · unchanged", `${out.map((x) => x?.code).join(",")} same=${same} none=${none}`);
  }
  {
    const M = authOf(U.mgrU1);
    const a = await core(M, { kind: "add", systemId: sA.id, employeeId: E.e2, date: "2030-04-23", shiftId: S.m });
    const b = await core(M, { kind: "add", systemId: sA.id, employeeId: E.e3, date: "2030-04-23", shiftId: S.m });
    const c = await core(M, { kind: "add", systemId: sA.id, employeeId: E.e4, date: WK[4], shiftId: S.a });
    chk("S2.5", a?.code === "otherBranch" && b?.code === "unassigned" && c?.ok === true, "otherBranch · unassigned · ok", `${a?.code} · ${b?.code} · ${c?.ok ? "ok" : c?.code}`);
  }
  const sixOps = (sys: string): Record<string, unknown>[] => [
    { kind: "generate", systemId: sys, from: "2030-05-06", to: "2030-05-12" },
    { kind: "copy", systemId: sys, fromWeek: WK[0], toWeek: "2030-05-13" },
    { kind: "add", systemId: sys, employeeId: E.e1, date: "2030-05-07", shiftId: S.m },
    { kind: "move", systemId: sys, entryId: R.e1Fri, date: "2030-03-09" },
    { kind: "remove", systemId: sys, entryId: R.e1Fri },
    { kind: "publish", systemId: sys, from: "2030-05-06", to: "2030-05-12" },
  ];
  {
    const n0 = await rosterN();
    const e0 = await P.outboxEvent.count({ where: { tenantId: T } });
    const codes: string[] = [];
    for (const w of [U.staffU1, U.member, U.payroll]) for (const op of sixOps(sA.id)) codes.push(String((await core(authOf(w), op))?.code));
    const n1 = await rosterN();
    const e1n = await P.outboxEvent.count({ where: { tenantId: T } });
    chk("S2.6", codes.every((c) => c === "noPerm") && n0 === n1 && e0 === e1n, "18 × noPerm · 0 writes", `${srt(new Set(codes))} rows ${n0}→${n1} events ${e0}→${e1n}`);
  }
  {
    const n0 = await rosterN();
    const codes: string[] = [];
    for (const sys of [sO.id, sMeet.id]) for (const op of sixOps(sys)) codes.push(String((await core(A, op))?.code));
    const n1 = await rosterN();
    chk("S2.7", codes.every((c) => c === "noSystem") && n0 === n1, "12 × noSystem · 0 writes", `${srt(new Set(codes))} rows ${n0}→${n1}`);
  }
  {
    const all = leakScan.join("\n");
    const hit = [...fx.names, "QC-SECRET", "ลาพักร้อนทดสอบ"].filter((n) => all.includes(n));
    chk("S2.9", leakScan.length > 20 && hit.length === 0, "no names / reasons / notes", `${leakScan.length} results · hits=${hit.length}`);
  }

  // ═══ X2 ═══
  {
    const snap = async () => JSON.stringify(await RE.findMany({ where: { tenantId: T2 }, orderBy: { id: "asc" } }));
    const before = await snap();
    const out = [
      await cA("add", { employeeId: E.eX, date: "2030-04-23", shiftId: S.m }),
      await cA("add", { employeeId: E.e1, date: "2030-04-26", shiftId: S.o }),
      await cA("move", { entryId: R.other, date: "2030-04-03" }),
      await cA("remove", { entryId: R.other }),
      await cA("remove", { entryId: R.s2 }),
    ];
    const same = before === (await snap());
    const s2Kept = !!(await RE.findUnique({ where: { id: R.s2 } }));
    const noS2 = !chipsOf(bU1).some((c) => c.id === R.s2) && !rowOf(bU1, E.eS);
    chk("X2.1", typeof BD.rosterOpCore === "function" && out.every((x) => x?.ok === false && CODES.includes(String(x?.code))) && same && s2Kept && noS2, "5 refused with codes · unchanged · sys2 hidden", `${out.map((x) => (x?.ok ? "ACCEPTED" : x?.code)).join(",")} same=${same} s2Kept=${s2Kept} noS2=${noS2}`);
  }

  // ═══ S7 frozen ═══
  const fc = await frozenControls(P, fx, TD, T2, U.other, tag, async (fz) => {
    if (typeof BD.rosterOpCore !== "function") return "n/a (board module absent)";
    const OA = authOf(fz.UD.owner);
    const sys = fz.sD;
    const idOf = async (e: string, d: string) => (await RE.findFirst({ where: { systemId: sys, employeeId: e, date: dbDate(d) } }))?.id ?? "∅";
    const rs = [await core(OA, { kind: "add", systemId: sys, employeeId: fz.D.D2, date: "2030-03-19", shiftId: fz.shD })];
    rs.push(await core(OA, { kind: "move", systemId: sys, entryId: await idOf(fz.D.D2, "2030-03-19"), date: "2030-03-20" }));
    rs.push(await core(OA, { kind: "add", systemId: sys, employeeId: fz.D.D1, date: "2030-03-21", shiftId: fz.shD }));
    rs.push(await core(OA, { kind: "remove", systemId: sys, entryId: await idOf(fz.D.D1, "2030-03-21") }));
    rs.push(await core(OA, { kind: "publish", systemId: sys, from: "2030-03-18", to: "2030-03-24" }));
    return rs.every((x) => x?.ok === true) ? "ok" : `✗ ${rs.map((x) => (x?.ok ? "ok" : x?.code))}`;
  });
  chk("S7.2", ...fc.digests);
  chk("S7.3", ...fc.clock);
  chk("S7.4", ...fc.privacy);
  const fit = await fitnessNoEnv();
  chk("X12.1", fit.ok, "exit 0 · exit 0", fit.note);
}

// ═════════════════════════ pure-only (no DB): S6.5 ═════════════════════════
function runPure(): void {
  const a = pure("weekLabel", "2030-03-04");
  const b = String(pure("weekLabel", "2030-04-29"));
  const t = pure("rosterTitle", "2030-03-04", "สาขาหัวหิน");
  chk("S6.5", a === "จ. 4 – อา. 10 มี.ค." && b.startsWith("จ. 29") && b.includes("เม.ย.") && b.includes("พ.ค.") && t === "ตารางกะ · 4–10 มี.ค. 2573 · สาขาหัวหิน", "จ. 4 – อา. 10 มี.ค. · both months · BE title", `${a} | ${b} | ${t}`);
}

let crashed = "";
try {
  runStatic();
  runPure();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanupFx(P, fx, SLUG);
  } catch (e) {
    console.log(`💥 cleanup: ${errText(e)}`);
  }
}
const residue = await residueOf(P, fx, SLUG, SLUG_PREFIX);
chk("Z1", residue.length === 0 && fx.tenants.length > 0, "none", residue.join(",") || "none");
const exit = REG.finish({ forced: FORCE, crashed, missing: skipReasons });
await P.$disconnect?.().catch?.(() => {});
process.exit(exit);
