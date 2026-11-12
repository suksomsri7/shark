// QC — HR V2 · H2.11 manager team overview + unified request inbox (leave · OT · swap · correction · adjustment) · brief ledger/hr-briefs/hr-brief-H2.11.md
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// Tenants qc-hr-h211-<stamp> · 2031 dates · opts.now injected · SKIP while hr/inbox.ts is absent (QC_FORCE=1 runs) · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.11.mts
// Fixtures are built ONLY through each type's own request functions (F1 = GREEN control on the base) · every expectation below is a literal or the
//   type's own exported text · base = baseRef("QC_H211_BASE") · no "newest migration" assertion · other WOs' marked hunks tolerated (S13)
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  type Any, type Def, type Sev, type Base, type Who, ROOT, rd, short, errText, srt, failedKeys, stripComments, sha, dbDate, tagOf,
  PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, pathInBase, diffHunks, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf,
  vOf, importsOf, flat, jsonOf, testidsOf, loadOpt, modState, msgParity, tokensOnly, useServerFile, clientImports, hrNavLabels, canon, keysDeep, QUERY_COUNTER,
} from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h2.11";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h211-";
const H = "src/lib/modules/hr/";
const F = {
  inbox: `${H}inbox.ts`, shared: `${H}inbox-shared.ts`, acts: `${H}inbox-actions.ts`, ui: `${H}overview-ui.tsx`, client: `${H}InboxBatch.tsx`,
  page: "src/app/app/sys/[id]/hr/requests/page.tsx", leave: `${H}leave.ts`, payroll: `${H}payroll.ts`, corr: `${H}correction.ts`, hrui: `${H}ui.tsx`,
  layout: "src/app/app/layout.tsx", th: "src/messages/th/common.json", en: "src/messages/en/common.json", inv: "scripts/hr-ui-inventory.json", visual: "scripts/visual-hr.mts",
};
const X: Record<string, string> = {
  noAccess: "คุณไม่มีสิทธิ์ดูหรือตัดสินคำขอในหน้านี้",
  noRight: "คุณไม่มีสิทธิ์ตัดสินคำขอนี้",
  key: "คำขอไม่สมบูรณ์ — กรุณาเปิดหน้านี้ใหม่แล้วลองอีกครั้ง",
  empty: "กรุณาเลือกอย่างน้อย 1 รายการ",
  tooMany: "เลือกได้ครั้งละไม่เกิน 50 รายการ",
  badItem: "รายการที่เลือกไม่ถูกต้อง — กรุณาเปิดหน้านี้ใหม่",
  rejectReason: "กรุณาใส่เหตุผลที่ไม่อนุมัติ (3–200 ตัวอักษร)",
  oneByOne: "รายการเพิ่ม/หักเงินต้องตัดสินทีละรายการ — เปิดดูยอดและหนังสือยินยอมก่อนกด",
  batchDiff: "ชุดนี้ถูกส่งไปแล้วด้วยรายการอื่น — กรุณาเปิดหน้านี้ใหม่",
  inProgress: "ชุดนี้กำลังดำเนินการอยู่ — รอสักครู่แล้วเปิดหน้านี้ใหม่",
};
const LV = {
  stale: "สถานะใบลาเปลี่ยนไปแล้ว กรุณาเปิดดูใหม่",
  chain: "ใบลานี้อยู่ในสายอนุมัติ — ตัดสินได้ที่หน้า “อนุมัติ” (คำขอรอตัดสิน)",
  self: "ใบลานี้เป็นของบัญชีผู้ตัดสินเอง — ให้หัวหน้าหรือเจ้าของกิจการเป็นผู้ตัดสิน",
  nf: "ไม่พบใบลา หรืออยู่นอกร้านนี้",
};
const ADJ_OWN_REQ = "อนุมัติรายการที่ตัวเองยื่นไม่ได้ — ให้เจ้าของหรือผู้มีสิทธิ์อนุมัติแทน";
const ITEM_KEYS = "ageDays,batchable,blocker,canDecide,createdAt,detail,employeeId,employeeName,id,impact,type,unitId";
const DETAIL_KEYS: Record<string, string> = {
  LEAVE: "category,days,fromDate,halfDay,hours,needsAttachment,policyName,toDate",
  OT: "date,dayClass,endAt,multiplierBp,reason,requestedMin,startAt,timing,warnWeek",
  SWAP: "from,requester,shape,target,to",
  CORRECTION: "action,day,evidence,filedOnBehalf,kind,originalAt,periodCount,proposedAt,reason,repeat",
  ADJUSTMENT: "amountSatang,consent,kind,note,periodKey,source",
};
const IMPACT_KEYS: Record<string, string> = { LEAVE: "balance,duty,othersOff", OT: "measuredMin,weekWarn", CORRECTION: "deltaMin,monthClosed", ADJUSTMENT: "targetPeriod" };
const COUNT_KEYS = "ADJUSTMENT,CORRECTION,LEAVE,OT,SWAP,decidable,total";
// ORACLE-EDIT (builder H2.11 · S1.2): + inboxSubjects (leave.ts, marked addition) — DTO ของ OT/แก้เวลา/สลับกะ ไม่มีสาขา/ผู้ยื่น/ของตัวเอง/สายอนุมัติ
//   (ot.ts · swap.ts · service.ts · scope.ts แช่แข็ง) แต่ R4/R5 ต้องใช้ (unitId · own · FILED_BY_YOU · CHAIN) ⇒ ตัวอ่านข้อเท็จจริงแบบชุด 1 ตัว (คืนเฉพาะค่าเทียบผู้ดู)
const ALLOWED_FROM_TYPES = new Set(
  "inboxSubjects pendingLeaves leaveListScopeOf decideLeaveAs leaveDetailsMany teamLeaveBalances otRequestList decideOtRequest listSwapsForManager decideSwap listCorrections decideCorrection listAdjustments decideAdjustmentAs stockConsentByAdjustment stockChargeTargetPeriod listRuns leaveDutyHintsMany loadAttendanceBoard attendanceNeedsRecompute otDaySpans lifecycleDue rosterLeaveOverlay hrScopeOf unitsForScope hrAccessOf".split(" "),
);
const TYPE_MODULES = new Set(["service", "leave", "ot", "swap", "correction", "payroll", "stock-charge", "availability", "judge", "lifecycle", "roster-board", "scope", "privacy"]);
const UI_IDS = ["hr-overview", "hr-overview-today", "hr-overview-inbox", "hr-overview-recompute", "hr-overview-due", "hr-inbox", "hr-inbox-filter-type", "hr-inbox-filter-unit", "hr-inbox-filter-age", "hr-inbox-batch", "hr-inbox-batch-approve", "hr-inbox-batch-reject", "hr-inbox-reject-reason", "hr-inbox-result", "hr-inbox-more", "hr-inbox-quota"];
const UI_DYN = ["count", "item", "check", "approve", "reject", "impact"].map((s) => `hr-inbox-${s}-*`);
const FROZEN = [`${H}ot.ts`, `${H}swap.ts`, `${H}service.ts`, `${H}actions.ts`, `${H}payroll-actions.ts`, `${H}stock-charge.ts`, `${H}availability.ts`, `${H}judge.ts`, `${H}lifecycle.ts`, `${H}privacy.ts`, `${H}privacy-shared.ts`, `${H}scope.ts`, "src/lib/approval-effects.ts", "src/lib/outbox-consumers.ts"];

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS: readonly Def[] = `
S1.1|R1|M|R|[static] inbox.ts server-only (no directive) · exports listInbox inboxCounts decideInbox teamOverview teamLeaveQuota
S1.2|R3|C|R|[static] inbox.ts imports from type modules ⊆ R3 list · never decideLeave/bulkDecideLeave/decideAdjustment · other specs allowed
S1.3|R3|C|R|[static] inbox.ts: no prisma, no hr*/approval* table accessor, no *RawUnsafe (auditLog only)
S1.4|R1|M|R|[static] inbox-shared.ts: no imports · INBOX_TEXT byte-exact (10 texts)
S1.5|R1|C|R|[static] inbox-actions.ts "use server": decideInboxAction → requireTenant + hrViewerOf + decideInbox · no now
S1.6|R12|C|R|[static] page + overview-ui import no per-type module · InboxBatch "use client" imports allowed · no DB reach
S1.7|R2|C|R|[static] wrappers: leave.ts decideLeaveAs/leaveDetailsMany/teamLeaveBalances · payroll.ts decideAdjustmentAs + listAdjustments pendingUnbound
F1|fixture|C|G|[db] fixtures through own request functions: each type's own lister shows the owner all 17 pending T1 items
F2|fixture|M|G|[db] L3 owned by a PENDING approval request · L4 APPROVED · other-tenant LO/AO pending in T2
S2.1|R5|C|R|[db] owner: exact list (17 · L3 CHAIN)
S2.2|R5|C|R|[db] MANAGER[u1] linked: L1 L3c O1 OL S1r C1r CPr (own LM/OM/CM hidden · no ADJ · no u2)
S2.3|R5|C|R|[db] STAFF[u1] hr.employee.create: S1 C1 CP CM
S2.4|R5|C|R|[db] STAFF[u1] leave.decide+payadjust: L1 LM L3c O1f OM OL
S2.5|R5|C|R|[db] STAFF* payroll+approve: O1 O2 OM OL A1 A2f AS
S2.6|R5|C|R|[db] STAFF* payroll-only: all OT + ADJ read-only NO_RIGHT
S2.7|R4|C|R|[db] staff · kiosk · member: listInbox/inboxCounts null · decideInbox noAccess (nothing written)
S3.1|R4|C|R|[db] item keys exact for every viewer · type/blocker vocab
S3.2|R4|C|R|[db] detail keys per type exact · leave reason only for leave readers · swap reason only for deciders
S3.3|R4|C|R|[db] no ฿/segments/paidMin/linkedUserId/pin/salary/national id keys (non-payroll viewers: no amountSatang at all)
S3.4|R4|M|R|[db] ADJUSTMENT: AS source STOCK + consent {at,ref} · A1 MANUAL + consent null
S3.5|R4|M|R|[db] batchable = canDecide ∧ type≠ADJUSTMENT
S4.1|R4|C|R|[db] counts = list lengths per type · decidable · inboxCounts = listInbox counts (all viewers)
S4.2|R4|M|R|[db] type filter OT ⇒ only OT items · counts unchanged
S4.3|R4|C|R|[db] unit filter: owner u2 ⇒ u2 items only · MANAGER[u1] asking u2 ⇒ [] (no leak)
S4.4|R4|M|R|[db] age filter minAgeDays 7 ⇒ exactly the two back-dated items
S4.5|R4|M|R|[db] sort createdAt asc/id asc · paging take 4 ⇒ union = full list, no dupes, last nextCursor null
S5.1|R4|C|R|[db] LEAVE impact: keys · duty = leaveDutyHintsMany entry · balance keys · othersOff owner [E3] / manager u1 []
S5.2|R4|M|R|[db] OT impact measuredMin null (no punches) · weekWarn false · SWAP impact null
S5.3|R4|C|R|[db] CORRECTION impact: CP monthClosed true · C1 false · deltaMin null (ADD)
S5.4|R4|M|R|[db] ADJUSTMENT impact targetPeriod 2031-06 (A1, AS)
S6.1|R6|C|R|[db] whole-call refusals: noAccess · key · empty · tooMany(51) · badItem · rejectReason — no audit row
S6.2|R6|C|R|[db] batch MANAGER[u1] (14 mixed items) ⇒ per-item results = each type's own text
S6.3|R6|C|R|[db] batch key holder (paid month · other branch swap) ⇒ per-item results
S6.4|R6|C|R|[db] payroll approver: batch ADJ ⇒ oneByOne · single A1/AS ok · single A2 own-requested text
S6.5|R6|M|R|[db] reject with reason ⇒ REJECTED · reason in hr.inbox.decide audit
S7.1|R8|C|R|[db] double submit same key ⇒ replayed:true · identical results · nothing decided again
S7.2|R8|M|R|[db] same key, other items ⇒ batchDiff
S7.3|R8|C|R|[db] two approvers in parallel on one OT ⇒ exactly one ok, other OT decided text · 1 approve audit
S7.4|R8|C|R|[db] two approvers in parallel on one leave ⇒ one ok, other stale · 1 USE row
S8.1|inv|C|R|[db] leave ledger: L1 one USE row = −days · L2 REJECTED no USE · L3 still PENDING
S8.2|inv|C|R|[db] OT O1/O2/OM APPROVED · OL PENDING · no OT_REQUEST adjustment (future days not settled)
S8.3|inv|C|R|[db] correction C1/CM APPROVED with one OUT punch each · CP CANCELLED · C2 PENDING
S8.4|inv|C|R|[db] swap S1 APPROVED · shifts exchanged · one hr.swap.apply · S2 PENDING
S8.5|inv|C|R|[db] adjustments A1/AS APPROVED (one hr.payadjust.approve each) · A2 PENDING
S8.6|inv|C|R|[db] each decided item decided exactly once (decision audit = 1 per target · never 2)
S8.7|R8|M|R|[db] inbox audits: hr.inbox.decide = 29 · hr.inbox.batch = 11 · hr.inbox.batch_done = 11
S9.1|R9|M|R|[db] teamOverview owner: keys · board = loadAttendanceBoard · counts = inboxCounts · recompute/due = readers
S9.2|R9|M|R|[db] teamOverview MANAGER[u1] board = its own board · staff ⇒ null when every reader is null
S10.1|R10|M|R|[db] teamLeaveQuota owner: rows E1..E4+EM · cells = leaveBalances strings
S10.2|R10|M|R|[db] teamLeaveQuota MANAGER[u1] u1 rows only · key holder / payroll ⇒ null
S11.1|R11|C|R|[db] listInbox query count: +4 each of LEAVE/OT/CORRECTION/ADJUSTMENT ⇒ same count · ≤ 60
S12.1|R12|M|R|[static] tab "คำขอ" right after "ใบลา" in hrTabs and layout HR children · page file exists
S12.2|UI|M|R|[static] testids present · inventory rows (wo H2.11) both ways
S12.3|UI|m|R|[static] messages hr.inbox th=en · tokens only · visual spec "2.11"
S13.1|frozen|C|G|[static] frozen files unchanged (other WOs' marked hunks tolerated) · payroll-rules sha · no prisma change
S13.2|hunks|M|G|[static] leave.ts/payroll.ts: marked additions only · correction.ts/ui.tsx/layout.tsx: marked hunks only
Z1|house|C|G|no residue
`.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H2.11-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H2.11-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.inbox))) skipReasons.push(`${F.inbox} absent (H2.11 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
const BASE = baseRef("QC_H211_BASE");
const git = (a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const MARK_OTHER = /HR (H(?!2\.11\b)\d+\.\d+|SYNC|VIS)/;

// ═════════════════════════ statics ═════════════════════════
const namedImports = (src: string) =>
  [...src.matchAll(/^\s*import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm)].map((m) => ({
    type: !!m[1],
    spec: m[3],
    names: m[2].split(",").map((x) => x.trim()).filter(Boolean).filter((x) => !/^type\s/.test(x)).map((x) => x.split(/\s+as\s+/)[0].trim()),
  }));
function runStatic(): void {
  const inbox = stripComments(rd(F.inbox));
  ck("S1.1", { file: !!inbox, noDirective: !!inbox && !/^\s*["']use (server|client)["']/.test(rd(F.inbox)), exports: ["listInbox", "inboxCounts", "decideInbox", "teamOverview", "teamLeaveQuota"].every((n) => new RegExp(`export\\s+async\\s+function\\s+${n}\\(`).test(inbox)) }, "5 exports", inbox ? `${inbox.length} B` : "∅ file");
  {
    const imps = namedImports(inbox);
    const typeMod = (s: string) => s.startsWith("./") && TYPE_MODULES.has(s.slice(2));
    const okSpec = (s: string) => typeMod(s) || ["./inbox-shared", "@/lib/core/db", "@/lib/core/audit", "@/lib/core/rbac", "@/lib/ui/date", "@prisma/client"].includes(s);
    const badNames = imps.filter((i) => !i.type && typeMod(i.spec)).flatMap((i) => i.names.filter((n) => !ALLOWED_FROM_TYPES.has(n) && !/^[A-Z]/.test(n)));
    const forbidden = imps.flatMap((i) => i.names).filter((n) => ["decideLeave", "bulkDecideLeave", "decideAdjustment"].includes(n));
    const otherImps = importsOf(inbox).filter((i) => !i.type && !okSpec(i.spec)).map((i) => i.spec);
    ck("S1.2", { file: !!inbox, names: badNames.length === 0, forbidden: forbidden.length === 0, specs: otherImps.length === 0 }, "R3 list", `bad=${badNames.join(",") || "-"} forb=${forbidden.join(",") || "-"} specs=${otherImps.join(",") || "-"}`);
  }
  {
    const acc = [...inbox.matchAll(/\.\s*((?:hr|approval)[A-Z]\w*)\s*\./g)].map((m) => m[1]);
    ck("S1.3", { file: !!inbox, noPrisma: !/\bprisma\b/.test(inbox), noTable: acc.length === 0, noUnsafe: !/RawUnsafe/.test(inbox) }, "auditLog only", acc.join(",") || "-");
  }
  {
    const sh = rd(F.shared);
    ck("S1.4", { file: !!sh, noImports: !!sh && importsOf(sh).length === 0, texts: Object.values(X).every((t) => sh.includes(`"${t}"`)) }, "10 texts", sh ? `missing=${Object.entries(X).filter(([, t]) => !sh.includes(`"${t}"`)).map(([k]) => k).join(",") || "-"}` : "∅");
  }
  {
    const a = rd(F.acts);
    const { r } = useServerFile(stripComments(a), ["decideInboxAction"], [/requireTenant\(/, /hrViewerOf\(/, /decideInbox\(/]);
    ck("S1.5", { file: !!a, ...r, noNow: !/\bnow\s*:/.test(stripComments(a)) }, "use server · delegates", a ? "" : "∅");
  }
  {
    const page = rd(F.page);
    const ui = rd(F.ui);
    const hrMods = (src: string) => importsOf(src).filter((i) => !i.type).map((i) => i.spec).map((s) => (s.startsWith("@/lib/modules/hr/") ? s.slice(17) : s.startsWith("./") ? s.slice(2) : null)).filter((x): x is string => !!x);
    const okHr = new Set(["overview-ui", "inbox", "inbox-shared", "inbox-actions", "InboxBatch", "ui"]);
    const bad = [...hrMods(page), ...hrMods(ui)].filter((m) => !okHr.has(m));
    const cl = clientImports(rd(F.client), (s) => /^(react|next\/|next-intl|@\/components\/|@\/lib\/ui\/|\.\/inbox-actions$|\.\/inbox-shared$)/.test(s), /inbox-actions/);
    ck("S1.6", { page: !!page, ui: !!ui, client: cl.useClient, facadeOnly: bad.length === 0, clientOk: cl.bad.length === 0 && cl.dbReach.length === 0 }, "facade only", `bad=${bad.join(",") || "-"} client=${cl.bad.join(",") || "-"}`);
  }
  {
    const lv = rd(F.leave);
    const pr = rd(F.payroll);
    ck("S1.7", { decideLeaveAs: /export\s+async\s+function\s+decideLeaveAs\(/.test(lv), details: /export\s+async\s+function\s+leaveDetailsMany\(/.test(lv), team: /export\s+async\s+function\s+teamLeaveBalances\(/.test(lv), adj: /export\s+async\s+function\s+decideAdjustmentAs\(/.test(pr), pending: /pendingUnbound/.test(pr) }, "wrappers", "");
  }
  {
    const n = hrNavLabels();
    const after = (xs: string[]) => xs.indexOf("คำขอ") > 0 && xs.indexOf("คำขอ") === xs.indexOf("ใบลา") + 1;
    ck("S12.1", { tabs: after(n.T), layout: after(n.L), page: existsSync(join(ROOT, F.page)) }, "after ใบลา", `T=${n.T.join("/")} L=${n.L.join("/")}`);
  }
  {
    const src = rd(F.ui) + rd(F.client);
    const ids = testidsOf(src, "hr-");
    const rows = ((jsonOf(F.inv)?.rows ?? []) as Any[]).filter((r) => r.wo === "H2.11");
    const rowIds = new Set(rows.map((r) => String(r.testid)));
    const need = [...UI_IDS, ...UI_DYN];
    ck("S12.2", { code: need.every((t) => ids.has(t)), rows: need.every((t) => rowIds.has(t)), noOrphan: [...rowIds].every((t) => ids.has(t)), meta: rows.length > 0 && rows.every((r) => r.oracle === "qc-hr-h2.11") }, "ids ↔ rows", `missingCode=${need.filter((t) => !ids.has(t)).length} missingRows=${need.filter((t) => !rowIds.has(t)).length}`);
  }
  {
    const th = flat(jsonOf(F.th)?.hr?.inbox ?? {});
    const en = flat(jsonOf(F.en)?.hr?.inbox ?? {});
    const tk = tokensOnly(stripComments(rd(F.ui) + rd(F.client)));
    ck("S12.3", { ...msgParity(th, en, []), ...tk, files: !!rd(F.ui) && !!rd(F.client), visual: /["']2\.11["']\s*:/.test(rd(F.visual)) }, "parity · tokens · spec", `th=${Object.keys(th).length}`);
  }
  {
    const bad: string[] = [];
    const hunkOk = (h: { added: string[]; removed: string[] }) => h.added.some((l) => MARK_OTHER.test(l));
    for (const f of FROZEN) {
      const hs = diffHunks(BASE, f);
      if (hs === null) bad.push(`${f}:git`);
      else if (hs.some((h) => !hunkOk(h))) bad.push(f);
    }
    let apr = "";
    let prisma = "";
    try {
      apr = git(["diff", "--name-only", BASE, "--", "src/lib/modules/approval"]);
      prisma = git(["diff", "--name-only", BASE, "--", "prisma"]);
    } catch (e) {
      apr = `git ${errText(e).slice(0, 40)}`;
    }
    for (const f of apr.split("\n").filter(Boolean)) if ((diffHunks(BASE, f) ?? [{ added: [], removed: ["?"] }]).some((h) => !hunkOk(h))) bad.push(f);
    ck("S13.1", { frozen: bad.length === 0, rules: sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA, noPrisma: prisma === "" }, "unchanged", `${bad.join(",") || "-"} prisma=${prisma.replace(/\n/g, ",") || "-"} base=${BASE.slice(0, 9)}`);
  }
  {
    const own = /HR H2\.11/;
    const marked = (h: { added: string[] }) => h.added.some((l) => own.test(l) || MARK_OTHER.test(l));
    const addOnly = [F.leave, F.payroll].flatMap((f) => (diffHunks(BASE, f) ?? []).filter((h) => h.removed.length > 0 || !marked(h)).map(() => f));
    const markOnly = [F.corr, F.hrui, F.layout].flatMap((f) => (diffHunks(BASE, f) ?? []).filter((h) => !marked(h)).map(() => f));
    ck("S13.2", { addOnly: addOnly.length === 0, marked: markOnly.length === 0 }, "marked hunks", `${[...new Set([...addOnly, ...markOnly])].join(",") || "-"}`);
  }
}

// ═════════════════════════ DB ═════════════════════════
const { P, coreHash } = await qc4Env(SUITE, { countQueries: true });
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const IN = await loadOpt(F.inbox, "@/lib/modules/hr/inbox");
console.log(`[${SUITE}] inbox=${modState(IN, F.inbox)} · base=${BASE.slice(0, 9)}${pathInBase(F.inbox, BASE) ? " (H2.11 in base)" : ""}`);
async function call(fn: string, ...args: unknown[]): Promise<{ v: Any; err: string }> {
  const m = IN && !IN.__err ? IN : null;
  if (typeof m?.[fn] !== "function") return { v: undefined, err: `∅${fn} (${modState(IN, F.inbox)})` };
  try {
    return { v: await m[fn](...args), err: "" };
  } catch (e) {
    return { v: undefined, err: `THROW ${errText(e)}` };
  }
}
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const svc = (await import("@/lib/modules/hr/service")) as Any;
const lv = (await import("@/lib/modules/hr/leave")) as Any;
const ot = (await import("@/lib/modules/hr/ot")) as Any;
const sw = (await import("@/lib/modules/hr/swap")) as Any;
const co = (await import("@/lib/modules/hr/correction")) as Any;
const cr = (await import("@/lib/modules/hr/correction-rules")) as Any;
const pay = (await import("@/lib/modules/hr/payroll")) as Any;
const st = (await import("@/lib/modules/hr/stock-charge")) as Any;
const av = (await import("@/lib/modules/hr/availability")) as Any;
const jd = (await import("@/lib/modules/hr/judge")) as Any;
const lc = (await import("@/lib/modules/hr/lifecycle")) as Any;
const sc = (await import("@/lib/modules/hr/scope")) as Any;
const ap = (await import("@/lib/modules/approval/service")) as Any;
const OT_T = ot.OT_TEXT as Record<string, string>;
const SW_T = sw.SWAP_REFUSAL as Record<string, string>;
const CO_T = cr.CORRECTION_TEXT as Record<string, string>;
const BRANCH = sc.HR_OTHER_BRANCH_TEXT as string;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const bkk = (day: string, hm = "10:00") => new Date(`${day}T${hm}:00+07:00`);
const NOW = bkk("2031-06-20");
const EXTRA_TABLES = ["HrStockCharge", "HrAttendanceAlert", "HrAttendanceDay", "PosShift", "HrOnboardingTask", "HrReviewNote"];

async function runDb(): Promise<void> {
  const fxErr: string[] = [];
  const must = async <T,>(what: string, f: () => Promise<T>): Promise<T | null> => {
    try {
      const r = (await f()) as Any;
      if (r && typeof r === "object" && r.ok === false) throw new Error(String(r.reason ?? "refused"));
      return r as T;
    } catch (e) {
      fxErr.push(`${what}: ${errText(e).slice(0, 90)}`);
      return null;
    }
  };
  const T1 = await fx.newTenant("", `QC H2.11 ${tag}`);
  const T2 = await fx.newTenant("-b", `QC H2.11 อื่น ${tag}`);
  const u1 = await fx.newUnit(T1, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(T1, `สาขาใต้ ${tag}`, "u2");
  const sA = (await sysSvc.createSystem(T1, "HR", `ทีม ${tag}`)).id as string;
  const sC = (await sysSvc.createSystem(T1, "HR", `ทีมวัด ${tag}`)).id as string;
  const sB = (await sysSvc.createSystem(T2, "HR", `ทีมอื่น ${tag}`)).id as string;
  const cA = { tenantId: T1, systemId: sA };
  const cC = { tenantId: T1, systemId: sC };
  const cB = { tenantId: T2, systemId: sB };
  const W = {
    owner: await fx.mkUser(T1, "owner", `QC เจ้าของ ${tag}`, "OWNER", [], {}),
    mgr1: await fx.mkUser(T1, "mgr1", `QC ผจก.เหนือ ${tag}`, "MANAGER", [u1], {}),
    key1: await fx.mkUser(T1, "key1", `QC จัดกะเหนือ ${tag}`, "STAFF", [u1], { "hr.employee.create": true }),
    dec1: await fx.mkUser(T1, "dec1", `QC อนุมัติเหนือ ${tag}`, "STAFF", [u1], { "hr.leave.decide": true, "hr.payadjust.approve": true, "hr.payadjust.request": true }),
    pay: await fx.mkUser(T1, "pay", `QC เงินเดือน ${tag}`, "STAFF", ["*"], { "hr.payroll.read": true, "hr.payadjust.approve": true }),
    payRead: await fx.mkUser(T1, "payread", `QC ดูเงินเดือน ${tag}`, "STAFF", ["*"], { "hr.payroll.read": true }),
    s1: await fx.mkUser(T1, "s1", `QC พนักงานหนึ่ง ${tag}`, "STAFF", [], {}),
    s2: await fx.mkUser(T1, "s2", `QC พนักงานสอง ${tag}`, "STAFF", [], {}),
    s3: await fx.mkUser(T1, "s3", `QC พนักงานสาม ${tag}`, "STAFF", [], {}),
    s4: await fx.mkUser(T1, "s4", `QC พนักงานสี่ ${tag}`, "STAFF", [], {}),
    kiosk: await fx.mkUser(T1, "kiosk", `QC จอลงเวลา ${tag}`, "STAFF", [], { "hr.attendance.clock": true }),
    member: await fx.mkUser(T1, "member", `QC สมาชิก ${tag}`, "STAFF", [], {}),
    other: await fx.mkUser(T2, "other", `QC ร้านอื่น ${tag}`, "OWNER", [], {}),
  };
  const emp = (c: Any, name: string, unitId: string | null, linked: Who | null) => fx.mkEmp(c.tenantId, c.systemId, `${name} ${tag}`, { unitId, linkedUserId: linked?.id ?? null, startDate: "2030-01-01" });
  const E1 = await emp(cA, "QC-H211 หนึ่ง", u1, W.s1);
  const E2 = await emp(cA, "QC-H211 สอง", u1, W.s2);
  const E3 = await emp(cA, "QC-H211 สาม", u2, W.s3);
  const E4 = await emp(cA, "QC-H211 สี่", u2, W.s4);
  const EM = await emp(cA, "QC-H211 ผจก", u1, W.mgr1);
  const EO = await emp(cB, "QC-H211 ร้านอื่น", null, null);
  for (const e of [E1, E2, E3, E4, EM]) await P.hrSalaryProfile.create({ data: { tenantId: T1, systemId: sA, employeeId: e, baseSalarySatang: 1_500_000 } });
  const pol = (await P.hrLeavePolicy.create({ data: { tenantId: T1, systemId: sA, category: "PERSONAL", name: `ลากิจ ${tag}`, quotaDays: null, allowHalfDay: true, allowHours: false } })).id as string;
  const polB = (await P.hrLeavePolicy.create({ data: { tenantId: T2, systemId: sB, category: "PERSONAL", name: `ลากิจ B ${tag}`, quotaDays: null, allowHalfDay: true, allowHours: false } })).id as string;
  const polC = (await P.hrLeavePolicy.create({ data: { tenantId: T1, systemId: sC, category: "PERSONAL", name: `ลากิจ C ${tag}`, quotaDays: null, allowHalfDay: true, allowHours: false } })).id as string;
  const leave = async (what: string, c: Any, employeeId: string, from: string, to: string, actor: Who, policyId: string, reason: string | null = null) =>
    ((await must(what, () => svc.requestLeave(c, { employeeId, type: "PERSONAL", fromDate: from, toDate: to, policyId, actorUserId: actor.id, reason }))) as Any)?.id ?? "";
  const otReq = async (what: string, c: Any, actor: Who, employeeId: string, date: string) =>
    ((await must(what, () => ot.requestOt(c, vOf(actor), { employeeId, date, start: "18:00", end: "20:00", reason: "ปิดร้านช้า" }, { now: NOW }))) as Any)?.id ?? "";
  const att = (c: Any, e: string, day: string) => P.hrAttendance.create({ data: { ...c, employeeId: e, kind: "IN", at: bkk(day, "09:00"), source: "KIOSK" } });
  const corr = async (what: string, c: Any, actor: Who, day: string, employeeId?: string) =>
    ((await must(what, () => co.requestCorrection(c, vOf(actor), { action: "ADD", kind: "OUT", at: bkk(day, "18:00"), reason: "ลืมลงเวลาออก", ...(employeeId ? { employeeId } : {}) }, { now: NOW }))) as Any)?.id ?? "";
  const adj = async (what: string, c: Any, employeeId: string, kind: string, amountSatang: number, by: Who) =>
    ((await must(what, () => pay.requestAdjustment(c, { employeeId, periodKey: "2031-06", kind, amountSatang, note: `รายการ ${kind}`, requestedById: by.id }))) as Any)?.id ?? "";

  // ── LEAVE (L4 = E2 full day 2031-06-25, approved after OL) ──
  const L1 = await leave("L1", cA, E1, "2031-07-15", "2031-07-16", W.s1, pol, "ไปงานแต่งพี่สาว");
  const L2 = await leave("L2", cA, E3, "2031-07-15", "2031-07-15", W.s3, pol, "ธุระที่บ้าน");
  const LM = await leave("LM", cA, EM, "2031-07-17", "2031-07-17", W.mgr1, pol);
  const L4 = await leave("L4", cA, E2, "2031-06-25", "2031-06-25", W.s2, pol);
  const LO = await leave("LO", cB, EO, "2031-07-15", "2031-07-15", W.other, polB);
  // ── OT (2031-06-25 18:00–20:00 · BEFORE) ──
  const O1 = await otReq("O1", cA, W.dec1, E1, "2031-06-25");
  const O2 = await otReq("O2", cA, W.owner, E3, "2031-06-25");
  const OM = await otReq("OM", cA, W.owner, EM, "2031-06-25");
  const OL = await otReq("OL", cA, W.owner, E2, "2031-06-25");
  if (L4) await must("L4 approve", () => svc.decideLeave(cA, L4, "APPROVED", W.owner.id));
  // ── chain policy on sA, then L3 ──
  await must("policy", () => ap.createPolicy({ tenantId: T1 }, { name: `สายใบลา ${tag}`, entityType: "HrLeave", systemId: sA, steps: [{ order: 1, approverRole: "OWNER" }] }));
  const L3 = await leave("L3", cA, E2, "2031-07-22", "2031-07-22", W.s2, pol);
  // ── SWAP (published 2031-07-01/02) ──
  const shift = (await P.hrShift.create({ data: { tenantId: T1, systemId: sA, name: `เช้า ${tag}`, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false } })).id as string;
  const ent = async (e: string, day: string, unitId: string) =>
    (await P.hrRosterEntry.create({ data: { tenantId: T1, systemId: sA, employeeId: e, date: dbDate(day), shiftId: shift, unitId, startMin: 540, endMin: 1020, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date(Date.now() - 60_000), source: "MANUAL" } })).id as string;
  const [x1, x2, x3, x4] = [await ent(E1, "2031-07-01", u1), await ent(E2, "2031-07-02", u1), await ent(E3, "2031-07-01", u2), await ent(E4, "2031-07-02", u2)];
  const swap = async (what: string, req: Who, from: string, target: string, to: string, peer: Who) => {
    const r = (await must(`${what} request`, () => sw.requestSwap(cA, vOf(req), { fromEntryId: from, targetEmployeeId: target, toEntryId: to }))) as Any;
    if (r?.id) await must(`${what} accept`, () => sw.respondSwap(cA, vOf(peer), r.id, { accept: true }));
    return (r?.id as string) ?? "";
  };
  const S1 = await swap("S1", W.s1, x1, E2, x2, W.s2);
  const S2 = await swap("S2", W.s3, x3, E4, x4, W.s4);
  // ── CORRECTION (IN punches; CP in 2031-05 then a PAID run for 2031-05) ──
  for (const [e, d] of [[E1, "2031-06-18"], [E3, "2031-06-18"], [EM, "2031-06-18"], [E2, "2031-05-28"]] as const) await att(cA, e, d);
  const C1 = await corr("C1", cA, W.s1, "2031-06-18");
  const C2 = await corr("C2", cA, W.s3, "2031-06-18");
  const CM = await corr("CM", cA, W.mgr1, "2031-06-18");
  const CP = await corr("CP", cA, W.s2, "2031-05-28");
  await P.hrPayrollRun.create({ data: { tenantId: T1, systemId: sA, periodKey: "2031-05", payDate: bkk("2031-05-31"), status: "PAID" } });
  // ── ADJUSTMENT ──
  const A1 = await adj("A1", cA, E1, "BONUS", 100_000, W.owner);
  const A2 = await adj("A2", cA, E3, "ADVANCE", 200_000, W.pay);
  const AO = await adj("AO", cB, EO, "BONUS", 100_000, W.other);
  const asR = (await must("AS", () => st.requestStockCharge(cA, vOf(W.owner), { requestKey: `qc211${tag}k1`, employeeId: E2, kind: "DAMAGE", amountSatang: 50_000, description: "แก้วแตก", consent: { confirmed: true, ref: "ยินยอม-001", at: "2031-06-20" } }, { now: NOW }))) as Any;
  const AS = (asR?.adjustmentId as string) ?? "";

  const IT: Record<string, { type: string; id: string }> = {
    L1: { type: "LEAVE", id: L1 }, L2: { type: "LEAVE", id: L2 }, LM: { type: "LEAVE", id: LM }, L3: { type: "LEAVE", id: L3 },
    O1: { type: "OT", id: O1 }, O2: { type: "OT", id: O2 }, OM: { type: "OT", id: OM }, OL: { type: "OT", id: OL },
    S1: { type: "SWAP", id: S1 }, S2: { type: "SWAP", id: S2 },
    C1: { type: "CORRECTION", id: C1 }, C2: { type: "CORRECTION", id: C2 }, CP: { type: "CORRECTION", id: CP }, CM: { type: "CORRECTION", id: CM },
    A1: { type: "ADJUSTMENT", id: A1 }, A2: { type: "ADJUSTMENT", id: A2 }, AS: { type: "ADJUSTMENT", id: AS },
  };
  const X2: Record<string, { type: string; id: string }> = { L4: { type: "LEAVE", id: L4 }, LO: { type: "LEAVE", id: LO }, AO: { type: "ADJUSTMENT", id: AO } };
  const labelOf = new Map([...Object.entries(IT), ...Object.entries(X2)].map(([k, v]) => [v.id, k]));
  const ref = (k: string) => (IT[k] ?? X2[k])!;

  // ── F1/F2 fixture controls (own listers) ──
  {
    const ov = vOf(W.owner);
    const ids = new Set<string>();
    const add = (xs: Any[] | undefined, f = (x: Any) => x.id) => (xs ?? []).forEach((x) => ids.add(f(x)));
    add(await svc.pendingLeaves(cA, 200, svc.leaveListScopeOf(ov, W.owner.id)).catch(() => []));
    add((await ot.otRequestList(cA, ov, { status: "PENDING", from: "2000-01-01", to: "2100-12-31" }).catch(() => null))?.items);
    add((await sw.listSwapsForManager(cA, ov, { status: "PENDING" }).catch(() => null))?.items);
    add((await co.listCorrections(cA, ov, { status: "PENDING" }).catch(() => null))?.items);
    add(((await pay.listAdjustments(cA, undefined, 200).catch(() => [])) as Any[]).filter((a) => a.status === "PENDING"));
    const missing = Object.entries(IT).filter(([, v]) => !v.id || !ids.has(v.id)).map(([k]) => k);
    chk("F1", missing.length === 0 && fxErr.length === 0, "17 pending · 0 fixture errors", `missing=${missing.join(",") || "-"} err=${fxErr.join(" | ").slice(0, 300) || "-"}`);
    const chain = await P.approvalRequest.count({ where: { tenantId: T1, entityType: "HrLeave", entityId: L3 || "∅", status: "PENDING" } });
    const l4 = await P.hrLeave.findUnique({ where: { id: L4 || "∅" }, select: { status: true } });
    const lo = await P.hrLeave.findUnique({ where: { id: LO || "∅" }, select: { status: true, tenantId: true } });
    const ao = await P.hrPayAdjustment.findUnique({ where: { id: AO || "∅" }, select: { status: true, tenantId: true } });
    ck("F2", { chain: chain === 1, l4: l4?.status === "APPROVED", lo: lo?.status === "PENDING" && lo?.tenantId === T2, ao: ao?.status === "PENDING" && ao?.tenantId === T2 }, "chain · approved · T2", "");
  }

  // ── back-date two items (age filter) ──
  const old = new Date(Date.now() - 10 * 86_400_000);
  await P.$executeRawUnsafe(`UPDATE "HrLeave" SET "createdAt" = $2 WHERE "id" = $1`, L1 || "∅", old).catch(() => 0);
  await P.$executeRawUnsafe(`UPDATE "HrOtRequest" SET "createdAt" = $2 WHERE "id" = $1`, O2 || "∅", old).catch(() => 0);

  // ── S2 matrix ──
  const lst = async (w: Who, filter: Any = {}) => call("listInbox", cA, vOf(w), filter);
  const show = (items: Any[] | undefined) =>
    srt((items ?? []).map((i) => `${labelOf.get(i?.id) ?? `?${short(i?.id, 8)}`}${i?.canDecide ? "" : `:${i?.blocker ?? "?"}`}`));
  const EXP: Record<string, string[]> = {
    owner: ["L1", "L2", "LM", "L3:CHAIN", "O1", "O2", "OM", "OL", "S1", "S2", "C1", "C2", "CP", "CM", "A1", "A2", "AS"],
    mgr1: ["L1", "L3:CHAIN", "O1", "OL", "S1:NO_RIGHT", "C1:NO_RIGHT", "CP:NO_RIGHT"],
    key1: ["S1", "C1", "CP", "CM"],
    dec1: ["L1", "LM", "L3:CHAIN", "O1:FILED_BY_YOU", "OM", "OL"],
    pay: ["O1", "O2", "OM", "OL", "A1", "A2:FILED_BY_YOU", "AS"],
    payRead: ["O1", "O2", "OM", "OL", "A1", "A2", "AS"].map((k) => `${k}:NO_RIGHT`),
  };
  const lists: Record<string, Any> = {};
  for (const [n, id] of [["owner", "S2.1"], ["mgr1", "S2.2"], ["key1", "S2.3"], ["dec1", "S2.4"], ["pay", "S2.5"], ["payRead", "S2.6"]] as const) {
    const r = await lst((W as Any)[n]);
    lists[n] = r.v;
    const got = show(r.v?.items);
    chk(id, !r.err && got === srt(EXP[n]), srt(EXP[n]), r.err || got);
  }
  {
    const outs: string[] = [];
    for (const n of ["s1", "kiosk", "member"]) {
      const w = (W as Any)[n] as Who;
      const a = await lst(w);
      const b = await call("inboxCounts", cA, vOf(w));
      const d = await call("decideInbox", cA, vOf(w), { batchKey: `qcN${tag}${n}`, decision: "APPROVED", items: [{ type: "LEAVE", id: L1 }] }, { now: NOW });
      outs.push(`${n}:${a.err || (a.v === null ? "null" : "obj")}/${b.err || (b.v === null ? "null" : "obj")}/${d.err || (d.v?.ok === false && d.v?.reason === X.noAccess ? "noAccess" : short(d.v, 40))}`);
    }
    const ok = outs.every((o) => /:null\/null\/noAccess$/.test(o));
    chk("S2.7", ok, "null/null/noAccess ×3", outs.join(" "));
  }

  // ── S3 DTO ──
  const all = Object.entries(lists).flatMap(([n, v]) => ((v?.items ?? []) as Any[]).map((i) => ({ n, i })));
  {
    const badKeys = all.filter(({ i }) => srt(Object.keys(i ?? {})) !== ITEM_KEYS).map(({ n, i }) => `${n}:${labelOf.get(i?.id)}`);
    const badVocab = all.filter(({ i }) => !["LEAVE", "OT", "SWAP", "CORRECTION", "ADJUSTMENT"].includes(i?.type) || ![null, "CHAIN", "FILED_BY_YOU", "NO_RIGHT"].includes(i?.blocker) || (i?.canDecide === true) !== (i?.blocker === null));
    chk("S3.1", all.length > 0 && badKeys.length === 0 && badVocab.length === 0, ITEM_KEYS, all.length ? `bad=${badKeys.slice(0, 6).join(",") || "-"} vocab=${badVocab.length}` : "no items");
  }
  const itemOf = (n: string, k: string): Any => ((lists[n]?.items ?? []) as Any[]).find((i) => i?.id === ref(k).id);
  const dk2 = (i: Any) => (i?.detail && typeof i.detail === "object" ? srt(Object.keys(i.detail)) : "∅");
  {
    const want = (t: string, extra: string[] = []) => srt([...DETAIL_KEYS[t].split(","), ...extra]);
    const r = {
      leaveOwner: dk2(itemOf("owner", "L1")) === want("LEAVE", ["reason"]),
      leaveDec: dk2(itemOf("dec1", "L1")) === want("LEAVE"),
      ot: ["owner", "mgr1", "pay", "payRead"].every((n) => dk2(itemOf(n, "O1")) === want("OT")),
      swapOwner: dk2(itemOf("owner", "S1")) === want("SWAP", ["reason"]),
      swapMgr: dk2(itemOf("mgr1", "S1")) === want("SWAP"),
      corr: dk2(itemOf("owner", "C1")) === want("CORRECTION") && dk2(itemOf("key1", "CP")) === want("CORRECTION"),
      adj: dk2(itemOf("pay", "A1")) === want("ADJUSTMENT"),
    };
    ck("S3.2", r, "detail keys per type", `L1(owner)=${dk2(itemOf("owner", "L1"))} L1(dec1)=${dk2(itemOf("dec1", "L1"))}`);
  }
  {
    const never = ["segments", "paidMin", "linkedUserId", "pinHash", "pinCode", "baseSalarySatang", "nationalId", "bankAccountNo", "ssoNumber", "attachmentKey"];
    const leaks: string[] = [];
    for (const [n, v] of Object.entries(lists)) {
      const ks = keysDeep(v);
      for (const k of never) if (ks.has(k)) leaks.push(`${n}:${k}`);
      if (["mgr1", "key1", "dec1"].includes(n) && ks.has("amountSatang")) leaks.push(`${n}:amountSatang`);
    }
    const otMoney = all.filter(({ i }) => i?.type === "OT" && i?.detail && "amountSatang" in i.detail).length;
    chk("S3.3", Object.keys(lists).length === 6 && Object.values(lists).every(Boolean) && leaks.length === 0 && otMoney === 0, "no forbidden keys", `${leaks.join(",") || "-"} otMoney=${otMoney}`);
  }
  {
    const as = itemOf("owner", "AS")?.detail;
    const a1 = itemOf("owner", "A1")?.detail;
    ck("S3.4", { as: as?.source === "STOCK" && canon(as?.consent) === canon({ at: "2031-06-20", ref: "ยินยอม-001" }) && as?.amountSatang === 50_000, a1: a1?.source === "MANUAL" && a1?.consent === null && a1?.amountSatang === 100_000 }, "STOCK consent · MANUAL null", short({ as, a1 }, 160));
  }
  {
    const bad = all.filter(({ i }) => i && i.batchable !== (i.canDecide === true && i.type !== "ADJUSTMENT")).length;
    chk("S3.5", all.length > 0 && bad === 0, "batchable rule", `bad=${bad}/${all.length}`);
  }

  // ── S4 counts / filters / paging ──
  {
    const bad: string[] = [];
    for (const [n, v] of Object.entries(lists)) {
      const c = v?.counts;
      const its = (v?.items ?? []) as Any[];
      const by = (t: string) => its.filter((i) => i.type === t).length;
      const okc = !!c && srt(Object.keys(c)) === COUNT_KEYS && c.total === its.length && ["LEAVE", "OT", "SWAP", "CORRECTION", "ADJUSTMENT"].every((t) => c[t] === by(t)) && c.decidable === its.filter((i) => i.canDecide).length;
      const ic = await call("inboxCounts", cA, vOf((W as Any)[n]));
      if (!okc || canon(ic.v) !== canon(c)) bad.push(n);
    }
    chk("S4.1", bad.length === 0, "counts = lengths = inboxCounts", bad.join(",") || "all");
  }
  {
    const r = await lst(W.owner, { type: "OT" });
    chk("S4.2", !r.err && show(r.v?.items) === srt(["O1", "O2", "OM", "OL"]) && canon(r.v?.counts) === canon(lists.owner?.counts), "OT only · counts same", r.err || show(r.v?.items));
  }
  {
    const a = await lst(W.owner, { unitId: u2 });
    const b = await lst(W.mgr1, { unitId: u2 });
    chk("S4.3", !a.err && show(a.v?.items) === srt(["L2", "O2", "S2", "C2", "A2"]) && Array.isArray(b.v?.items) && b.v.items.length === 0, "u2 · []", `${a.err || show(a.v?.items)} | mgr1 ${b.err || show(b.v?.items)}`);
  }
  {
    const r = await lst(W.owner, { minAgeDays: 7 });
    chk("S4.4", !r.err && show(r.v?.items) === srt(["L1", "O2"]), "L1,O2", r.err || show(r.v?.items));
  }
  {
    const created = new Map<string, number>();
    const tbl: Record<string, string> = { LEAVE: "HrLeave", OT: "HrOtRequest", SWAP: "HrShiftSwapRequest", CORRECTION: "HrTimeCorrection", ADJUSTMENT: "HrPayAdjustment" };
    for (const v of Object.values(IT)) {
      const r = await fx.rawRows(`SELECT "createdAt" FROM "${tbl[v.type]}" WHERE "id" = $1`, v.id || "∅");
      created.set(v.id, r?.[0]?.createdAt ? new Date(r[0].createdAt).getTime() : 0);
    }
    const want = EXP.owner.map((k) => ref(k.split(":")[0]).id).sort((a, b) => created.get(a)! - created.get(b)! || (a < b ? -1 : a > b ? 1 : 0));
    const full = ((lists.owner?.items ?? []) as Any[]).map((i) => i.id);
    const pages: string[] = [];
    let cur: Any = undefined;
    let last: Any = null;
    for (let i = 0; i < 8; i++) {
      const r = await lst(W.owner, { take: 4, ...(cur ? { cursor: cur } : {}) });
      last = r.v;
      pages.push(...((r.v?.items ?? []) as Any[]).map((x) => x.id));
      cur = r.v?.nextCursor;
      if (!cur) break;
    }
    ck("S4.5", { order: full.join() === want.join(), pages: pages.join() === want.join(), noDupes: new Set(pages).size === pages.length, end: !!last && last.nextCursor === null }, "asc · pages", `full=${full.map((x) => labelOf.get(x)).join(",") || "∅"} pages=${pages.length}`);
  }

  // ── S5 impact ──
  {
    const l1 = itemOf("owner", "L1");
    const hints = await av.leaveDutyHintsMany(cA, vOf(W.owner), { leaveIds: [L1] }).catch(() => null);
    const duty = hints?.get?.(L1) ?? null;
    const im = l1?.impact;
    const offOwner = ((im?.othersOff ?? null) as Any[] | null)?.map((o) => o?.name) ?? null;
    const offMgr = itemOf("mgr1", "L1")?.impact?.othersOff;
    ck("S5.1", { keys: !!im && srt(Object.keys(im)) === IMPACT_KEYS.LEAVE, duty: !!im && canon(im.duty) === canon(duty), balance: !!im?.balance && srt(Object.keys(im.balance)) === "available,pending,used", owner: canon(offOwner) === canon([`QC-H211 สาม ${tag}`]), mgr: Array.isArray(offMgr) && offMgr.length === 0 }, "keys · duty · othersOff", short(im, 140));
  }
  {
    const o1 = itemOf("owner", "O1")?.impact;
    const s1 = itemOf("owner", "S1");
    ck("S5.2", { keys: !!o1 && srt(Object.keys(o1)) === IMPACT_KEYS.OT, measured: o1?.measuredMin === null, week: o1?.weekWarn === false, swap: !!s1 && s1.impact === null }, "OT · swap null", short({ o1, s1: s1?.impact }, 100));
  }
  {
    const cp = itemOf("owner", "CP")?.impact;
    const c1 = itemOf("owner", "C1")?.impact;
    ck("S5.3", { keys: !!c1 && srt(Object.keys(c1)) === IMPACT_KEYS.CORRECTION, cp: cp?.monthClosed === true, c1: c1?.monthClosed === false, delta: c1?.deltaMin === null }, "CP closed · C1 open", short({ cp, c1 }, 100));
  }
  {
    const a1 = itemOf("pay", "A1")?.impact;
    const as = itemOf("pay", "AS")?.impact;
    ck("S5.4", { keys: !!a1 && srt(Object.keys(a1)) === IMPACT_KEYS.ADJUSTMENT, a1: a1?.targetPeriod === "2031-06", as: as?.targetPeriod === "2031-06" }, "2031-06", short({ a1, as }, 80));
  }

  // ── S9 overview · S10 quota (before writes) ──
  {
    const ref9 = async (w: Who) => {
      const v = vOf(w);
      const [b, n, d, c] = await Promise.all([
        jd.loadAttendanceBoard(cA, v, { day: "2031-06-18" }, { now: NOW }).catch(() => "✗"),
        jd.attendanceNeedsRecompute(cA, v, { now: NOW }).catch(() => "✗"),
        lc.lifecycleDue(cA, v, { now: NOW }).catch(() => "✗"),
        call("inboxCounts", cA, v),
      ]);
      return { board: b, needsRecompute: n && n !== "✗" ? n.count : null, lifecycleDue: d && d !== "✗" ? d.items.length : null, inbox: c.v ?? null };
    };
    const ow = await call("teamOverview", cA, vOf(W.owner), { day: "2031-06-18" }, { now: NOW });
    const ro = await ref9(W.owner);
    ck("S9.1", { keys: !!ow.v && srt(Object.keys(ow.v)) === "board,inbox,lifecycleDue,needsRecompute", board: canon(ow.v?.board) === canon(ro.board), inbox: !!ro.inbox && canon(ow.v?.inbox) === canon(ro.inbox), other: ow.v?.needsRecompute === ro.needsRecompute && ow.v?.lifecycleDue === ro.lifecycleDue }, "= readers", ow.err || short(ow.v && Object.keys(ow.v), 80));
    const mg = await call("teamOverview", cA, vOf(W.mgr1), { day: "2031-06-18" }, { now: NOW });
    const rm = await ref9(W.mgr1);
    const sf = await call("teamOverview", cA, vOf(W.s1), { day: "2031-06-18" }, { now: NOW });
    const rs = await ref9(W.s1);
    const sNull = [rs.board, rs.needsRecompute, rs.lifecycleDue, rs.inbox].every((x) => x === null);
    ck("S9.2", { mgr: !!mg.v && canon(mg.v.board) === canon(rm.board), staff: !sf.err && (sNull ? sf.v === null : !!sf.v) }, "scoped · null", mg.err || sf.err || `staffAllNull=${sNull}`);
  }
  {
    const quota = async (w: Who) => call("teamLeaveQuota", cA, vOf(w), { year: 2031 });
    const cellsRef = async (w: Who, e: string) => (((await lv.leaveBalances(cA, vOf(w), { employeeId: e, year: 2031 }).catch(() => null))?.items ?? []) as Any[]).map((x) => ({ available: x.available, pending: x.pending, policyId: x.policyId, used: x.used }));
    const q = await quota(W.owner);
    const rows = (q.v?.rows ?? []) as Any[];
    const want = [E1, E2, E3, E4, EM];
    const bad: string[] = [];
    for (const e of want) {
      const row = rows.find((r) => r?.employeeId === e);
      if (!row || canon(row.cells) !== canon(await cellsRef(W.owner, e))) bad.push(e.slice(-4));
    }
    ck("S10.1", { rows: srt(rows.map((r) => r?.employeeId)) === srt(want), cells: bad.length === 0, policies: Array.isArray(q.v?.policies) && q.v.policies.some((p: Any) => p?.id === pol && srt(Object.keys(p)) === "category,id,name,unlimited") }, "rows · cells", q.err || `bad=${bad.join(",") || "-"} rows=${rows.length}`);
    const m = await quota(W.mgr1);
    const k = await quota(W.key1);
    const p = await quota(W.pay);
    ck("S10.2", { mgr: srt(((m.v?.rows ?? []) as Any[]).map((r) => r?.employeeId)) === srt([E1, E2, EM]), key: !k.err && k.v === null, pay: !p.err && p.v === null }, "u1 · null · null", m.err || `${((m.v?.rows ?? []) as Any[]).length} rows`);
  }

  // ── S6 / S7 decide ──
  const items = (...ks: string[]) => ks.map((k) => ({ type: ref(k).type, id: ref(k).id }));
  const dec = (w: Who, key: string, decision: string, ks: string[], reason?: string) =>
    call("decideInbox", cA, vOf(w), { batchKey: `${key}${tag}`, decision, items: items(...ks), ...(reason !== undefined ? { reason } : {}) }, { now: NOW });
  const res = (r: { v: Any; err: string }) =>
    r.err ? r.err : r.v?.ok !== true ? `✗${short(r.v?.reason, 40)}` : ((r.v.results ?? []) as Any[]).map((x) => `${labelOf.get(x?.id) ?? "?"}=${x?.ok ? x?.status : x?.reason}`).join("|");
  const expRes = (pairs: [string, string][]) => pairs.map(([k, v]) => `${k}=${v}`).join("|");
  const resKeysOk = (r: { v: Any }) => ((r.v?.results ?? []) as Any[]).every((x) => srt(Object.keys(x ?? {})) === (x?.ok ? "id,ok,status,type" : "id,ok,reason,type"));
  const auditN = async (action: string, id?: string) => ((await P.auditLog.findMany({ where: { tenantId: T1, action }, select: { targetId: true, after: true } })) as Any[]).filter((a) => !id || a.targetId === id || a.after?.otRequestId === id || a.after?.id === id).length;
  {
    const inboxAudits0 = await auditN("hr.inbox.decide");
    const fake = Array.from({ length: 51 }, (_, i) => ({ type: "LEAVE", id: `qcfake${i}x${tag}` }));
    const outs = [
      await call("decideInbox", cA, vOf(W.owner), { batchKey: "x", decision: "APPROVED", items: items("L1") }, { now: NOW }),
      await call("decideInbox", cA, vOf(W.owner), { batchKey: `qcE${tag}`, decision: "APPROVED", items: [] }, { now: NOW }),
      await call("decideInbox", cA, vOf(W.owner), { batchKey: `qcT${tag}`, decision: "APPROVED", items: fake }, { now: NOW }),
      await call("decideInbox", cA, vOf(W.owner), { batchKey: `qcI${tag}`, decision: "APPROVED", items: [{ type: "FOO", id: L1 }] }, { now: NOW }),
      await dec(W.owner, "qcR", "REJECTED", ["L2"]),
    ].map((r) => (r.err ? r.err : r.v?.ok === false ? r.v.reason : "ok"));
    const want = [X.key, X.empty, X.tooMany, X.badItem, X.rejectReason];
    chk("S6.1", outs.join("‖") === want.join("‖") && (await auditN("hr.inbox.decide")) === inboxAudits0, want.map((t) => t.slice(0, 12)).join("‖"), outs.map((t) => short(t, 30)).join("‖"));
  }
  const B1 = await dec(W.mgr1, "qcB1", "APPROVED", ["L1", "L2", "L3", "LM", "LO", "O1", "OL", "O2", "S1", "C1", "A1", "AS", "L4", "OM"]);
  {
    const want = expRes([["L1", "APPROVED"], ["L2", BRANCH], ["L3", LV.chain], ["LM", LV.self], ["LO", LV.nf], ["O1", "APPROVED"], ["OL", OT_T.leaveDay], ["O2", OT_T.notFound], ["S1", SW_T.noPermission], ["C1", CO_T.noPerm], ["A1", X.oneByOne], ["AS", X.oneByOne], ["L4", LV.stale], ["OM", OT_T.self]]);
    chk("S6.2", res(B1) === want && resKeysOk(B1) && B1.v?.replayed === false, short(want, 120), res(B1));
  }
  {
    const r = await dec(W.key1, "qcB2", "APPROVED", ["CP", "C1", "S1", "S2", "CM"]);
    const want = expRes([["CP", CO_T.paid], ["C1", "APPROVED"], ["S1", "APPROVED"], ["S2", BRANCH], ["CM", "APPROVED"]]);
    chk("S6.3", res(r) === want && resKeysOk(r), short(want, 120), res(r));
  }
  {
    const b = await dec(W.pay, "qcB3", "APPROVED", ["O2", "A1"]);
    const a1 = await dec(W.pay, "qcB3a", "APPROVED", ["A1"]);
    const as = await dec(W.pay, "qcB3s", "APPROVED", ["AS"]);
    const a2 = await dec(W.pay, "qcB3o", "APPROVED", ["A2"]);
    const got = [res(b), res(a1), res(as), res(a2)].join(" ‖ ");
    const want = [expRes([["O2", "APPROVED"], ["A1", X.oneByOne]]), "A1=APPROVED", "AS=APPROVED", `A2=${ADJ_OWN_REQ}`].join(" ‖ ");
    chk("S6.4", got === want, short(want, 120), got);
  }
  {
    const r = await dec(W.owner, "qcRj", "REJECTED", ["L2"], "ไม่มีคนแทนช่วงนั้น");
    const a = ((await P.auditLog.findMany({ where: { tenantId: T1, action: "hr.inbox.decide" } })) as Any[]).find((x) => JSON.stringify(x.after ?? {}).includes(L2) && JSON.stringify(x.after ?? {}).includes("ไม่มีคนแทนช่วงนั้น"));
    ck("S6.5", { res: res(r) === "L2=REJECTED", audit: !!a, status: (await P.hrLeave.findUnique({ where: { id: L2 || "∅" } }))?.status === "REJECTED" }, "REJECTED + audit reason", res(r));
  }
  {
    const before = [await auditN("hr.leave.decide", L1), await auditN("hr.ot.approve", O1)].join();
    const again = await dec(W.mgr1, "qcB1", "APPROVED", ["L1", "L2", "L3", "LM", "LO", "O1", "OL", "O2", "S1", "C1", "A1", "AS", "L4", "OM"]);
    const after = [await auditN("hr.leave.decide", L1), await auditN("hr.ot.approve", O1)].join();
    ck("S7.1", { replayed: again.v?.replayed === true, same: !!B1.v && canon(again.v?.results) === canon(B1.v?.results), nothing: before === after && before === "1,1" }, "replay", `${again.err || again.v?.replayed} audits ${before}→${after}`);
    const diff = await dec(W.mgr1, "qcB1", "APPROVED", ["L2"]);
    chk("S7.2", diff.v?.ok === false && diff.v?.reason === X.batchDiff, X.batchDiff, diff.err || short(diff.v, 80));
  }
  {
    const [a, b] = await Promise.all([dec(W.owner, "qcP1", "APPROVED", ["OM"]), dec(W.dec1, "qcP2", "APPROVED", ["OM"])]);
    const got = srt([res(a), res(b)]);
    chk("S7.3", got === srt(["OM=APPROVED", `OM=${OT_T.decided}`]) && (await auditN("hr.ot.approve", OM)) === 1, "one wins", got);
    const [c, d] = await Promise.all([dec(W.owner, "qcP3", "APPROVED", ["LM"]), dec(W.dec1, "qcP4", "APPROVED", ["LM"])]);
    const got2 = srt([res(c), res(d)]);
    const use = await P.hrLeaveBalanceTxn.count({ where: { sourceKey: `use:${LM || "∅"}` } });
    chk("S7.4", got2 === srt(["LM=APPROVED", `LM=${LV.stale}`]) && use === 1, "one wins · 1 USE", `${got2} use=${use}`);
  }

  // ── S8 invariants ──
  const stOf = async (model: string, id: string) => ((await P[model].findUnique({ where: { id: id || "∅" }, select: { status: true } })) as Any)?.status ?? "∅";
  {
    const l1 = (await P.hrLeave.findUnique({ where: { id: L1 || "∅" } })) as Any;
    const use = (await P.hrLeaveBalanceTxn.findMany({ where: { sourceKey: `use:${L1 || "∅"}` } })) as Any[];
    const l2use = await P.hrLeaveBalanceTxn.count({ where: { sourceKey: `use:${L2 || "∅"}` } });
    ck("S8.1", { l1: l1?.status === "APPROVED", use: use.length === 1 && Number(use[0]?.days) === -Number(l1?.days), l2: (await stOf("hrLeave", L2)) === "REJECTED" && l2use === 0, l3: (await stOf("hrLeave", L3)) === "PENDING" }, "ledger", `use=${use.length} days=${l1?.days}`);
  }
  {
    const s = [await stOf("hrOtRequest", O1), await stOf("hrOtRequest", O2), await stOf("hrOtRequest", OM), await stOf("hrOtRequest", OL)].join();
    const rows = await P.hrPayAdjustment.count({ where: { tenantId: T1, sourceType: "OT_REQUEST" } });
    chk("S8.2", s === "APPROVED,APPROVED,APPROVED,PENDING" && rows === 0, "APPROVED×3,PENDING · 0 rows", `${s} rows=${rows}`);
  }
  {
    const outs = async (e: string) => P.hrAttendance.count({ where: { tenantId: T1, employeeId: e, kind: "OUT", voidedAt: null, at: bkk("2031-06-18", "18:00") } });
    const s = [await stOf("hrTimeCorrection", C1), await stOf("hrTimeCorrection", CM), await stOf("hrTimeCorrection", CP), await stOf("hrTimeCorrection", C2)].join();
    const n = [await outs(E1), await outs(EM), await outs(E3)].join();
    chk("S8.3", s === "APPROVED,APPROVED,CANCELLED,PENDING" && n === "1,1,0", "statuses · punches 1,1,0", `${s} · ${n}`);
  }
  {
    const e1 = (await P.hrRosterEntry.findUnique({ where: { id: x1 } })) as Any;
    const e2 = (await P.hrRosterEntry.findUnique({ where: { id: x2 } })) as Any;
    ck("S8.4", { s1: (await stOf("hrShiftSwapRequest", S1)) === "APPROVED", swapped: e1?.employeeId === E2 && e2?.employeeId === E1, once: (await auditN("hr.swap.apply", S1)) === 1, s2: (await stOf("hrShiftSwapRequest", S2)) === "PENDING" }, "applied once", `${e1?.employeeId === E2} ${e2?.employeeId === E1}`);
  }
  {
    const s = [await stOf("hrPayAdjustment", A1), await stOf("hrPayAdjustment", AS), await stOf("hrPayAdjustment", A2)].join();
    const a = [await auditN("hr.payadjust.approve", A1), await auditN("hr.payadjust.approve", AS)].join();
    chk("S8.5", s === "APPROVED,APPROVED,PENDING" && a === "1,1", "APPROVED,APPROVED,PENDING · 1,1", `${s} · ${a}`);
  }
  {
    const pairs: [string, string][] = [["hr.leave.decide", L1], ["hr.leave.decide", LM], ["hr.leave.decide", L2], ["hr.ot.approve", O1], ["hr.ot.approve", O2], ["hr.ot.approve", OM], ["hr.swap.apply", S1], ["hr.correction.decide", C1], ["hr.correction.decide", CM], ["hr.payadjust.approve", A1], ["hr.payadjust.approve", AS]];
    const twice: string[] = [];
    for (const [a, id] of pairs) {
      const n = await auditN(a, id);
      if (n !== 1) twice.push(`${labelOf.get(id)}=${n}`);
    }
    chk("S8.6", twice.length === 0, "1 each", twice.join(",") || "none");
  }
  {
    const n = [await auditN("hr.inbox.decide"), await auditN("hr.inbox.batch"), await auditN("hr.inbox.batch_done")].join();
    chk("S8.7", n === "29,11,11", "29,11,11", n);
  }

  // ── S11 query budget (system sC: 1 → 5 employees × 4 types) ──
  {
    const qerr: string[] = [];
    const before = fxErr.length;
    const addSet = async (i: number) => {
      const e = await fx.mkEmp(T1, sC, `QC-H211 วัด${i} ${tag}`, { unitId: u1, startDate: "2030-01-01" });
      await P.hrSalaryProfile.create({ data: { tenantId: T1, systemId: sC, employeeId: e, baseSalarySatang: 1_500_000 } });
      await leave(`K${i} leave`, cC, e, `2031-08-0${i + 1}`, `2031-08-0${i + 1}`, W.owner, polC);
      await otReq(`K${i} ot`, cC, W.owner, e, "2031-06-26");
      await att(cC, e, "2031-06-18");
      await corr(`K${i} corr`, cC, W.key1, "2031-06-18", e);
      await adj(`K${i} adj`, cC, e, "BONUS", 10_000, W.owner);
    };
    const measure = async () => {
      QUERY_COUNTER.n = 0;
      const r = await call("listInbox", cC, vOf(W.owner), {});
      return { n: QUERY_COUNTER.n, items: (r.v?.items ?? []).length as number, err: r.err };
    };
    await addSet(0);
    const q1 = await measure();
    for (let i = 1; i <= 4; i++) await addSet(i);
    const q2 = await measure();
    if (fxErr.length > before) qerr.push(...fxErr.slice(before));
    ck("S11.1", { items: q1.items === 4 && q2.items === 20, same: !q1.err && q1.n === q2.n, cap: q1.n > 0 && q1.n <= 60, fixtures: qerr.length === 0 }, "same count ≤ 60", `${q1.err || ""} q=${q1.n}/${q2.n} items=${q1.items}/${q2.items} ${qerr.join(" | ").slice(0, 160)}`);
  }
}

// ═════════════════════════ run ═════════════════════════
let crashed = "";
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  for (const tid of fx.tenants) for (const t of EXTRA_TABLES) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => null);
  await cleanupFx(P, fx, SLUG);
  const left = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  for (const tid of fx.tenants)
    for (const t of EXTRA_TABLES) {
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (r && Number(r[0]?.n) !== 0) left.push(`${t}=${r[0]?.n}`);
    }
  chk("Z1", left.length === 0, "none", left.join() || "clean");
}
process.exit(finish({ forced: FORCE, crashed, missing: skipReasons }));
