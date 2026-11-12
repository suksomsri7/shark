// QC — HR V2 · H2.9 — OT requests (before / ≤ N h after) → direct approval → settlement from MEASURED minutes (H2.5) →
//      HrPayAdjustment(kind OT, sourceType OT_REQUEST) into the next open period · day class × law table · writer #18 (otHourlyRateSatang).
// Brief: ledger/hr-briefs/hr-brief-H2.9.md (DRAFT · Q1–Q14 defaults) · base 39ea9782c · branch wip/hr-h2.9 · MONEY WO.
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Every money value is a LITERAL satang integer (worked in ledger/wo-notes/hr-H2.9-oracle.md), never computed by the code under test.
// CONTRACT (brief R2–R14; ORACLE-EDIT if it must differ):
//   hr/ot-rules.ts (pure): OT_LAW_DEFAULT · otLawOf(rows[{id,kind,effectiveFrom,status,json}], day) → {ok,law,lawRowId}|{ok:false,code} ·
//     otPaidMinutes({reqStart,reqEnd,from,outAt,otMin,stepMin}) → int · otAmount({payType,baseSalarySatang,dailyRateSatang,hourlyRateSatang,
//     otHourlyRateSatang,hasShift,dayClass,minutes,law}) → {ok,segments[{cls,minutes,multiplierBp,amountSatang}],amountSatang}|{ok:false,code} ·
//     otWindow({startAt,endAt,now,afterHours,maxAheadDays}) → {ok,timing}|{ok:false,code} · otLegalRateFloor(profile, law) → int|null · otPolicyOf(raw)
//   hr/ot.ts: requestOt(ctx, actor, {employeeId?,date,start,end,reason?}, {now?}) · decideOtRequest(ctx, viewer, id, "APPROVED"|"REJECTED", {now?}) ·
//     cancelOtRequest(ctx, actor, id) · revokeOtRequest(ctx, viewer, id, {reason}, {now?}) · settleOtRequests({tenantId?, now, maxTx?}) ·
//     otRequestList(ctx, viewer, {from?,to?,status?}) · myOtRequests(ctx, actor) · getOtPolicy(ctx) · saveOtPolicy(ctx, viewer, {afterHours,maxAheadDays}) · OT_TEXT
//   viewer/actor = { role, unitAccess, permissions, userId } · refusals { ok:false, reason } (Thai, byte-exact OT_TEXT)
//   UI testids: hr-ot-form hr-ot-submit hr-ot-list hr-ot-approve hr-ot-reject hr-ot-revoke hr-settings-ot-policy hr-salary-ot-rate (+ inventory rows wo "H2.9")
// SKIP while hr/ot.ts is absent (exit 0) · QC_FORCE=1 / --force-run runs anyway · --list prints the ids.
// Own tenants `qc-hr-h29-*`, July 2031 (Mon 7 … Sun 13), `opts.now` everywhere, swept in finally (Z1).
// Run (lane DB): bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h2.9.mts
import { type Any, type Def, rd, short, errText, stripComments, sha, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, changedVsBase, diffHunks, makeRegistry, qc4Env, fitnessNoEnv, jsonOf, loadOpt, modState, tagOf, makeFixtures, cleanupFx, residueOf, vOf, canon, testidsOf, inventoryParity, msgParity, dbDate, sleep, frozenControls, type Who } from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h2.9";
const SLUG_PREFIX = "qc-hr-h29-";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const H = "src/lib/modules/hr/";
const F = {
  rules: H + "ot-rules.ts", ot: H + "ot.ts", act: H + "ot-actions.ts", ui: H + "ot-ui.tsx", payroll: H + "payroll.ts", pact: H + "payroll-actions.ts", hrUi: H + "ui.tsx",
  judge: H + "judge.ts", index: H + "index.ts", cons: "src/lib/outbox-consumers.ts", auto: "src/lib/automation/labels.ts", hooks: "src/lib/webhooks/labels.ts",
  hourly: "src/app/api/cron/hourly/route.ts", schema: "prisma/schema/hr.prisma", mig: "prisma/migrations/20270102000000_hr_ot_settlement/migration.sql",
  th: "src/messages/th/common.json", en: "src/messages/en/common.json",
};
const FROZEN = [
  ...["payroll-rules.ts", "payroll-rules-v2.ts", "law.ts", "judge-rules.ts", "clock.ts", "clock-rules.ts", "clock-settings.ts", "leave.ts", "leave-rules.ts", "holidays.ts", "roster.ts", "roster-rules.ts", "swap.ts", "swap-rules.ts", "service.ts", "privacy.ts", "privacy-shared.ts", "lifecycle.ts", "time-rules.ts", "pos-seam.ts"].map((f) => H + f),
  "src/lib/platform/hr-law.ts", "src/lib/modules/approval", "src/lib/approval-effects.ts", "scripts/seed-hr-qc.mts", "scripts/hr-qc-env.mts",
];
const T = {
  noEmp: "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน — ติดต่อผู้จัดการ",
  noPermRequest: "คุณไม่มีสิทธิ์ยื่นคำขอ OT แทนพนักงานคนนี้",
  range: "เวลาเริ่มและเลิก OT ไม่ถูกต้อง — ตรวจวันที่และเวลาอีกครั้ง",
  tooShort: "คำขอ OT ต้องยาวอย่างน้อย 15 นาที",
  tooLong: "คำขอ OT ยาวได้ไม่เกิน 16 ชั่วโมงต่อครั้ง",
  late24: "เลยกำหนดยื่นคำขอ OT แล้ว — ยื่นได้ก่อนทำหรือภายใน 24 ชั่วโมงหลังทำ",
  late0: "เลยกำหนดยื่นคำขอ OT แล้ว — ยื่นได้ก่อนทำหรือภายใน 0 ชั่วโมงหลังทำ",
  tooFar31: "ยื่นคำขอ OT ล่วงหน้าได้ไม่เกิน 31 วัน",
  outOfEmployment: "วันที่ขอ OT อยู่นอกช่วงการจ้างงาน",
  ended: "พนักงานคนนี้สิ้นสุดการจ้างแล้ว",
  overlap: "ช่วงเวลานี้มีคำขอ OT ที่รออนุมัติหรืออนุมัติแล้ว — ยกเลิกคำขอเดิมก่อน",
  dayOffOne: "วันหยุดยื่นคำขอ OT ได้วันละ 1 คำขอ — ยกเลิกคำขอเดิมแล้วยื่นใหม่ให้ครอบคลุมทั้งวัน",
  notFound: "ไม่พบคำขอ OT นี้ หรือคุณไม่มีสิทธิ์ดำเนินการ",
  self: "ตัดสินคำขอ OT ของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน",
  fourEyes: "อนุมัติคำขอ OT ที่คุณยื่นแทนพนักงานเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน",
  decided: "คำขอ OT นี้ตัดสินไปแล้ว",
  cancelNo: "ยกเลิกได้เฉพาะคำขอ OT ที่ยังรออนุมัติของคุณ",
  revokeReason: "ใส่เหตุผลที่ยกเลิก OT ที่อนุมัติแล้ว (3–200 ตัวอักษร)",
  listNo: "คุณไม่มีสิทธิ์ดูคำขอ OT",
  rateBad: "อัตรา OT ต่อชั่วโมงต้องเป็นจำนวนเต็มสตางค์ที่มากกว่า 0",
  rateBelowLaw: "อัตรา OT ต่อชั่วโมงต้องไม่ต่ำกว่า 1.5 เท่าของค่าจ้างต่อชั่วโมงตามกฎหมาย",
  sAfter: "ระยะยื่นหลังทำต้องอยู่ระหว่าง 0 ถึง 72 ชั่วโมง",
  nTitleA: "คำขอ OT ได้รับอนุมัติ",
};
const BASE_KEYS = "date,dayClass,employeeId,employeeName,endAt,id,multiplierBp,paidMin,reason,requestedMin,settled,startAt,status,timing,warnWeek";
const PAY_KEYS = "amountSatang,date,dayClass,employeeId,employeeName,endAt,id,multiplierBp,paidMin,reason,requestedMin,segments,settled,startAt,status,timing,warnWeek";
const C = "CRITICAL", M = "MAJOR";
const D = (id: string, g: string, s: "CRITICAL" | "MAJOR" | "MINOR", b: "RED" | "GREEN", t: string): Def => [`H2.9-${id}`, g, s, b, t] as const;
const CHECKS: Def[] = [
  D("S1.1", "R2", C, "RED", "[static] ot-rules.ts pure (type imports, no db/clock/float rounding) · BigInt"),
  D("S1.2", "R8", C, "RED", "[static] ot.ts: tenantDb only · locks hr:ot: hr:ot-emp: payroll hr:judge: · emitOutbox · OT_REQUEST"),
  D("S1.3", "R7", C, "RED", "[static] payroll.ts: marked HR H2.9 hunks · ≤ 2 removed · CRM block kept · writeOtAdjustmentInTx + writer"),
  D("S1.4", "R1", C, "GREEN", "[static] frozen files unchanged vs base"),
  D("S1.5", "C.4", C, "GREEN", "[static] payroll-rules.ts sha frozen"),
  D("S1.6", "Mig", C, "RED", "[static] migration 20270102000000_hr_ot_settlement: 13 cols + 5 CHECKs · schema · HrOtRequest only"),
  D("S1.7", "R6", M, "RED", "[static] judge.ts: one marked export hunk, 0 removed"),
  D("S1.8", "R12", M, "RED", "[static] consumer hr.ot.decided · 1 label · no webhook · cron settleOtRequests try/catch"),
  D("S1.9", "R1", M, "RED", "[static] ot-actions.ts use server · 5 actions · no now"),
  D("S1.10", "C.12", M, "RED", "[static] UI testids · inventory · hr.ot th=en · salary form field"),
  D("S2.1", "R4", C, "RED", "[pure] otAmount V1–V8 literal satang"),
  D("S2.2", "R4", C, "RED", "[pure] otAmount V9–V19 literal satang"),
  D("S2.3", "R2", C, "RED", "[pure] otLawOf L1–L8 + OT_LAW_DEFAULT"),
  D("S2.4", "R2", C, "RED", "[pure] otPaidMinutes M1–M10"),
  D("S2.5", "R2", C, "RED", "[pure] otWindow W1–W12"),
  D("S2.6", "R13", M, "RED", "[pure] otLegalRateFloor · otPolicyOf · purity"),
  D("S3.1", "R5", C, "RED", "[db] requestOt self BEFORE + on-behalf AFTER rows"),
  D("S3.2", "R5", C, "RED", "[db] 11 refusals byte-exact · nothing written"),
  D("S3.3", "R5", C, "RED", "[db] overlap · cancel · cancelNo · dayOffOne"),
  D("S3.4", "Q9", M, "RED", "[db] warnWeek false/false/true (2220 > 2160)"),
  D("S4.1", "R9", C, "RED", "[db] decide before final ⇒ APPROVED, unsettled, no row"),
  D("S4.2", "R6", C, "RED", "[db] settle F1 ⇒ one row 17500 · <id>:1 · 2031-07 · request columns"),
  D("S4.3", "R3", C, "RED", "[db] F2 day off 110000 · F3 holiday 26250 · F4 hourly 9375"),
  D("S4.4", "R9", C, "RED", "[db] self · fourEyes · notFound ×3"),
  D("S4.5", "Q8", C, "RED", "[db] never worked ⇒ 0 · no profile ⇒ NO_RATE"),
  D("S4.6", "R6", C, "RED", "[db] STALE wait · recompute ⇒ 13502"),
  D("S4.7", "R6", C, "RED", "[db] idempotent settle/decide"),
  D("S5.1", "R7", C, "RED", "[db] createPayrollRun binds 20000 + 10000"),
  D("S5.2", "R10", C, "RED", "[db] re-settle bound ⇒ gen2 +5000 2031-08 · Σ 15000"),
  D("S5.3", "R10", C, "RED", "[db] revoke bound ⇒ DEDUCTION 20000 2031-08 · Σ 0"),
  D("S5.4", "R10", C, "RED", "[db] revoke unbound ⇒ REJECTED · Σ 0"),
  D("S5.5", "R7", C, "RED", "[db] nothing unbound in a period with an APPROVED run"),
  D("S6.1", "R9", C, "RED", "[db] race: 2 approvers ⇒ 1 ok · 8750"),
  D("S6.2", "R6", C, "RED", "[db] race: settle ×3 ⇒ 1 row"),
  D("S6.3", "R8", C, "RED", "[db] race: run created in target ⇒ 2031-09"),
  D("S6.4", "R8", C, "RED", "[db] race: judge holder ⇒ 30 min 3858"),
  D("S7.1", "R11", C, "RED", "[db] list keys: manager no money · owner/payroll money · plain listNo"),
  D("S7.2", "C.7", C, "RED", "[db] myOtRequests own only · noEmp"),
  D("S7.3", "C.2", C, "RED", "[db] IDOR other tenant/system ⇒ notFound · no leak"),
  D("S8.1", "R12", C, "RED", "[db] hr.ot.decided key + 4-key payload"),
  D("S8.2", "R12", M, "RED", "[db] replay ⇒ 1 notification, no money"),
  D("S9.1", "R13", C, "RED", "[db] writer #18 save/below/bad/keep/clear"),
  D("S9.2", "R14", M, "RED", "[db] OT policy 0 ⇒ late0 · 73 ⇒ sAfter"),
  D("X1", "frozen", C, "GREEN", "[db] frozen digests + MONTHLY"),
  D("X2", "frozen", C, "GREEN", "[db] frozen clock"),
  D("X3", "frozen", C, "GREEN", "[db] frozen privacy matrix"),
  D("X12.1", "fitness", M, "GREEN", "[static] fitness no env"),
  D("Z1", "residue", C, "GREEN", "[db] no residue"),
];
const REG = makeRegistry(SUITE, "H2.9-", CHECKS);
const chk = REG.chk;
if (ARGV.includes("--list")) {
  REG.printList();
  process.exit(0);
}

// ═════════════════════════ helpers ═════════════════════════
const code = (p: string) => stripComments(rd(p));
const bk = (day: string, hm: string): Date => {
  const plus = hm.startsWith("+1 ") ? 1 : 0;
  const [h, mi, s] = hm.replace("+1 ", "").split(":").map(Number);
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d! + plus, h!, mi!, s ?? 0) - 7 * 3_600_000);
};
const missing: string[] = [];
const base = process.env.QC_H29_BASE || "39ea9782c"; // WO base (session/hr + H2.5); merge-base with session/hr would count H2.5 as changed
const OR0 = await loadOpt(F.ot, "@/lib/modules/hr/ot");
const RU0 = await loadOpt(F.rules, "@/lib/modules/hr/ot-rules");
if (!OR0 && !FORCE) REG.skipExit([`${F.ot} absent — H2.9 not built (QC_FORCE=1 to run RED)`]);
const OT: Any = OR0 && !OR0.__err ? OR0 : {};
const RU: Any = RU0 && !RU0.__err ? RU0 : {};
if (!OR0 || OR0.__err) missing.push(modState(OR0, F.ot));
if (!RU0 || RU0.__err) missing.push(modState(RU0, F.rules));
const pure = (fn: string, ...a: unknown[]): Any => {
  try {
    return typeof RU[fn] === "function" ? RU[fn](...a) : `∅${fn}`;
  } catch (e) {
    return `THROW ${errText(e).slice(0, 60)}`;
  }
};
async function call(fn: string, ...a: unknown[]): Promise<Any> {
  if (typeof OT[fn] !== "function") return { __err: `∅${fn}` };
  try {
    return await OT[fn](...a);
  } catch (e) {
    return { __err: `THROW ${errText(e)}` };
  }
}
const said = (r: Any, t: string) => !!r && r.ok === false && r.reason === t;
const sh = (r: Any) => (!r ? "null" : r.__err ? r.__err : r.ok === false ? `"${short(r.reason, 50)}"` : short(r, 90));

// ═════════════════════════ S1 statics ═════════════════════════
console.log("── S1 statics ──");
{
  const src = rd(F.rules);
  const c = stripComments(src);
  const imps = [...c.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)];
  const r = { exists: !!src, typeOnly: imps.every((m) => !!m[1]), noDb: !/core\/db|@prisma\/client|prisma\./.test(c), noClock: !/Date\.now|new Date\(|Math\.random/.test(c), noFloat: !/Math\.round|parseFloat|toFixed/.test(c), bigint: /BigInt\(|\d+n\b/.test(c) };
  chk("S1.1", Object.values(r).every(Boolean), "pure + BigInt", short(r, 160));
}
{
  const c = code(F.ot);
  const r = { exists: !!c, tenantDb: /tenantDb\(/.test(c), noPrisma: !/\bprisma\./.test(c) && !/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from/.test(c), ot: /hr:ot:/.test(c), emp: /hr:ot-emp:/.test(c), pay: /hr:payroll:run:/.test(c) || /writeOtAdjustmentInTx/.test(c), judge: /hr:judge:/.test(c), outbox: /emitOutbox\(/.test(c), src: /OT_REQUEST/.test(c + code(F.payroll)) };
  chk("S1.2", Object.values(r).every(Boolean), "all true", short(r, 200));
}
{
  const hunks = diffHunks(base, F.payroll) ?? [];
  const removed = hunks.flatMap((h) => h.removed);
  const unmarked = hunks.filter((h) => !h.added.concat(h.removed).some((l) => /HR H2\.9/.test(l)));
  const c = code(F.payroll);
  const r = { changed: hunks.length > 0, marked: unmarked.length === 0, fewRemoved: removed.length <= 2, crmKept: !removed.some((l) => /CRM C3\.3|requestCommissionAdjustment|withdrawCommissionAdjustment/.test(l)), writer: /export\s+async\s+function\s+writeOtAdjustmentInTx\s*\(/.test(c), ovr: /otHourlyRateSatang/.test(c.slice(c.indexOf("function setSalaryProfile"), c.indexOf("function listSalaryProfiles"))) };
  chk("S1.3", Object.values(r).every(Boolean), "marked hunks only", `${short(r, 160)} hunks=${hunks.length} unmarked=${unmarked.length} removed=${removed.length}`);
}
{
  const ch = changedVsBase(base, FROZEN);
  chk("S1.4", ch === "unchanged", "unchanged", ch);
  const s = sha(rd(PAYROLL_RULES_FILE));
  chk("S1.5", s === PAYROLL_RULES_SHA, PAYROLL_RULES_SHA.slice(0, 12), s.slice(0, 12));
}
{
  const sql = rd(F.mig);
  const cols = ["paidMinutes", "amountSatang", "segmentsJson", "basisJson", "attendanceDayId", "attendanceDayVersion", "lawRowId", "settleGen", "settleCode", "settledAt", "revokedAt", "revokedById", "revokeReason"];
  const model = (() => {
    const s = rd(F.schema);
    const i = s.indexOf("model HrOtRequest {");
    return i < 0 ? "" : s.slice(i, s.indexOf("\n}", i));
  })();
  const tables = [...sql.matchAll(/ALTER TABLE\s+"(\w+)"/g)].map((m) => m[1]);
  const r = {
    file: !!sql, cols: cols.every((c) => sql.includes(`"${c}"`)), model: cols.every((c) => new RegExp(`\\b${c}\\b`).test(model)), checks: (sql.match(/CHECK\s*\(/g) ?? []).length >= 5,
    minutes: /"minutes"\s+BETWEEN\s+1\s+AND\s+960/.test(sql), gen: /"settleGen"\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0/i.test(sql), onlyOt: tables.length > 0 && tables.every((t) => t === "HrOtRequest"),
  };
  chk("S1.6", Object.values(r).every(Boolean), "13 cols · 5 CHECKs · HrOtRequest only", short(r, 200));
}
{
  const hunks = diffHunks(base, F.judge) ?? [];
  const r = { one: hunks.length === 1, noRemoved: hunks.every((h) => h.removed.length === 0), marked: hunks.every((h) => h.added.some((l) => /HR H2\.9/.test(l))), exports: hunks.every((h) => h.added.some((l) => /\bexport\b/.test(l))) };
  chk("S1.7", Object.values(r).every(Boolean), "one marked export hunk", `${short(r)} hunks=${hunks.length}`);
}
{
  const cons = code(F.cons);
  const raw = rd(F.cons);
  const auto = rd(F.auto);
  const hooks = rd(F.hooks);
  const hourly = rd(F.hourly);
  const blk = hourly.slice(Math.max(0, hourly.indexOf("HR H2.9")), hourly.indexOf("HR H2.9") + 900);
  const r = {
    consumer: /["']hr\.ot\.decided["']\s*:/.test(cons), marked: (raw.match(/\/\/ HR H2\.9 ▸/g) ?? []).length === 1, label: (auto.match(/["']hr\.ot\.decided["']/g) ?? []).length === 1, noHook: !hooks.includes("hr.ot.decided"),
    cron: hourly.includes("HR H2.9") && /settleOtRequests\(/.test(blk) && /try\s*\{/.test(blk) && /logOps\(/.test(blk),
  };
  chk("S1.8", Object.values(r).every(Boolean), "all true", short(r));
}
{
  const src = rd(F.act);
  const c = stripComments(src);
  const names = ["requestOtAction", "decideOtAction", "revokeOtAction", "cancelOtAction", "saveOtPolicyAction"];
  const reqFn = c.slice(c.indexOf("function requestOtAction"), c.indexOf("function requestOtAction") + 2500);
  const r = { useServer: /^\s*["']use server["']/.test(src), names: names.every((n) => new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).test(c)), noNow: !/\bnow\s*:/.test(c), selfNoId: /employeeOfUser|myEmployee|self/.test(reqFn) || /requestOt\(/.test(reqFn) };
  chk("S1.9", Object.values(r).every(Boolean), "all true", short(r));
}
{
  const ui = rd(F.ui) + rd(F.hrUi);
  const ids = testidsOf(ui, "hr-ot-");
  const need = ["hr-ot-form", "hr-ot-submit", "hr-ot-list", "hr-ot-approve", "hr-ot-reject", "hr-ot-revoke"];
  const inv = ((jsonOf("scripts/hr-ui-inventory.json")?.rows ?? []) as Any[]).filter((x) => x.wo === "H2.9").map((x) => String(x.testid));
  const th = jsonOf(F.th)?.hr?.ot ?? {};
  const en = jsonOf(F.en)?.hr?.ot ?? {};
  const mp = msgParity(th, en, []);
  const r = { ids: need.every((n) => ids.has(n)), policy: /hr-settings-ot-policy/.test(ui + rd("src/app/app/sys/[id]/hr/settings/page.tsx")), rate: /hr-salary-ot-rate/.test(rd(F.hrUi)) && /otHourlyRateSatang/.test(rd(F.pact)), inv: need.every((n) => inv.includes(n)), msg: mp.some && mp.same && mp.noEmpty };
  chk("S1.10", Object.values(r).every(Boolean), "all true", `${short(r)} ids=${[...ids].slice(0, 6).join(",")}`);
}

// ═════════════════════════ S2 pure vectors (literal) ═════════════════════════
console.log("── S2 pure ──");
const LAW = { workdayOtBp: 15000, holidayWorkPaidBp: 10000, holidayWorkUnpaidBp: 20000, holidayOtBp: 30000, daysPerMonth: 30, hoursPerDay: 8 };
const LAW7 = { ...LAW, hoursPerDay: 7 };
type Seg = [string, number, number, number];
type V = [string, Record<string, unknown>, Seg[] | string, number | null];
const P0 = { baseSalarySatang: 0, dailyRateSatang: null, hourlyRateSatang: null, otHourlyRateSatang: null };
const mo = (s: number, x: Record<string, unknown> = {}) => ({ ...P0, payType: "MONTHLY", baseSalarySatang: s, ...x });
const dy = (s: number) => ({ ...P0, payType: "DAILY", dailyRateSatang: s });
const hr = (s: number) => ({ ...P0, payType: "HOURLY", hourlyRateSatang: s });
const W = (m: number) => ({ hasShift: true, dayClass: "WORKDAY", minutes: m });
const HS = (m: number) => ({ hasShift: true, dayClass: "HOLIDAY", minutes: m });
const OFF = (m: number) => ({ hasShift: false, dayClass: "WORKDAY", minutes: m });
const HOFF = (m: number) => ({ hasShift: false, dayClass: "HOLIDAY", minutes: m });
const VEC: V[] = [
  ["V1", { ...mo(1_400_000), ...W(120) }, [["OT_WORKDAY", 120, 15000, 17500]], 17500], // mockup 05: ฿14,000 · 2 h · ×1.5 = ฿175
  ["V2", { ...mo(1_234_500), ...W(105) }, [["OT_WORKDAY", 105, 15000, 13502]], 13502], // 13502.34375 (v1 rate-first = 13503)
  ["V3", { ...mo(1_600_000), ...W(360) }, [["OT_WORKDAY", 360, 15000, 60000]], 60000], // mockup 07 slip: 6 h × ฿66.67 × 1.5 = ฿600
  ["V4", { ...mo(1_234_567), ...HS(45) }, [["OT_HOLIDAY", 45, 30000, 11574]], 11574], // 3703701/320 = 11574.07
  ["V5", { ...mo(1_500_000), ...OFF(600) }, [["HOLIDAY_WORK", 480, 10000, 50000], ["OT_HOLIDAY", 120, 30000, 37500]], 87500],
  ["V6", { ...dy(40_000), ...W(90) }, [["OT_WORKDAY", 90, 15000, 11250]], 11250],
  ["V7", { ...dy(40_000), ...OFF(540) }, [["HOLIDAY_WORK", 480, 20000, 80000], ["OT_HOLIDAY", 60, 30000, 15000]], 95000],
  ["V8", { ...dy(37_000), ...HOFF(480) }, [["HOLIDAY_WORK", 480, 10000, 37000]], 37000],
  ["V9", { ...hr(5_000), ...W(75) }, [["OT_WORKDAY", 75, 15000, 9375]], 9375],
  ["V10", { ...hr(4_333), ...HS(15) }, [["OT_HOLIDAY", 15, 30000, 3250]], 3250], // 3249.75 ⇒ 3250
  ["V11", { ...mo(1_400_000, { otHourlyRateSatang: 10_000 }), ...W(90) }, [["OT_WORKDAY", 90, 15000, 15000]], 15000], // override 10000/h × 1.5 h
  ["V12", { ...mo(1_400_000, { otHourlyRateSatang: 10_000 }), ...HS(60) }, [["OT_HOLIDAY", 60, 30000, 17500]], 17500], // override ignored on holiday
  ["V13", { ...mo(1_000_000), ...W(15) }, [["OT_WORKDAY", 15, 15000, 1563]], 1563], // 1562.5 half-up
  ["V14", { ...hr(5_000), ...OFF(300) }, [["HOLIDAY_WORK", 300, 20000, 50000]], 50000],
  ["V15", { ...hr(2_147_483_647), ...HS(960) }, "OVERFLOW", null],
  ["V16", { ...dy(33_333), ...W(45) }, [["OT_WORKDAY", 45, 15000, 4687]], 4687], // 4687.45
  ["V17", { ...mo(0), ...W(60) }, "NO_RATE", null],
  ["V18", { ...mo(1_500_000), ...HOFF(0) }, [], 0],
  ["V19", { ...mo(1_400_000), ...W(120), law: LAW7 }, [["OT_WORKDAY", 120, 15000, 20000]], 20000], // ÷30÷7
];
const amtStr = (o: Any) => (typeof o === "string" ? o : !o || typeof o !== "object" ? String(o) : o.ok === false ? String(o.code) : o.ok === true ? `${(o.segments ?? []).map((s: Any) => `${s.cls}:${s.minutes}:${s.multiplierBp}:${s.amountSatang}`).join("+")}=${o.amountSatang}` : short(o, 60));
const amtWant = (v: V) => (typeof v[2] === "string" ? v[2] : `${v[2].map((s) => s.join(":")).join("+")}=${v[3]}`);
for (const [g, a, b] of [["S2.1", 0, 8], ["S2.2", 8, 19]] as const) {
  const bad: string[] = [];
  for (const v of VEC.slice(a, b)) {
    const got = amtStr(pure("otAmount", { law: LAW, ...v[1] }));
    if (got !== amtWant(v)) bad.push(`${v[0]}=${got}`);
  }
  chk(g, !bad.length, `${b - a} vectors`, bad.slice(0, 3).join(" · ") || "all");
}
{
  const row = (id: string, eff: string, status: string, json: unknown, kind = "OT") => ({ id, kind, effectiveFrom: eff, status, json });
  const DEF = canon({ ok: true, law: LAW, lawRowId: null });
  const j7 = { workdayMultiplierBp: 15000, daysPerMonth: 30, hoursPerDay: 7 };
  const jAll = { workdayMultiplierBp: 16000, holidayWorkPaidBp: 11000, holidayWorkUnpaidBp: 21000, holidayOtBp: 31000, daysPerMonth: 30, hoursPerDay: 8 };
  const cases: [string, unknown[], string][] = [
    ["L1", [], DEF],
    ["L2", [row("r1", "2031-01-01", "ACTIVE", j7)], canon({ ok: true, law: LAW7, lawRowId: "r1" })],
    ["L3", [row("r1", "2031-01-01", "DRAFT", j7)], DEF],
    ["L4", [row("r1", "2031-08-01", "ACTIVE", j7)], DEF],
    ["L5", [row("r1", "2031-01-01", "ACTIVE", j7), row("r2", "2031-01-01", "ACTIVE", jAll)], canon({ ok: false, code: "LAW_AMBIGUOUS" })],
    ["L6", [row("r1", "2031-01-01", "ACTIVE", { ...j7, hoursPerDay: 7.5 })], canon({ ok: false, code: "LAW_SHAPE" })],
    ["L7", [row("r0", "2030-01-01", "ACTIVE", j7), row("r2", "2031-07-07", "ACTIVE", jAll)], canon({ ok: true, law: { workdayOtBp: 16000, holidayWorkPaidBp: 11000, holidayWorkUnpaidBp: 21000, holidayOtBp: 31000, daysPerMonth: 30, hoursPerDay: 8 }, lawRowId: "r2" })],
    ["L8", [row("s1", "2031-01-01", "ACTIVE", { a: 1 }, "SSO")], DEF],
  ];
  const bad = cases.filter(([, rows, want]) => canon(pure("otLawOf", rows, "2031-07-07")) !== want).map(([id, rows]) => `${id}=${short(pure("otLawOf", rows, "2031-07-07"), 70)}`);
  const defOk = canon(RU.OT_LAW_DEFAULT) === canon(LAW);
  chk("S2.3", !bad.length && defOk, "8 cases + OT_LAW_DEFAULT literal", `${bad.slice(0, 2).join(" · ") || "cases ok"} default=${defOk}`);
}
{
  const d = "2031-07-07";
  const M: [string, string, string, string, string | null, number, number, number][] = [
    ["M1", "20:00", "22:00", "20:00", "22:04", 120, 15, 120], ["M2", "21:00", "23:00", "20:00", "22:04", 120, 15, 60], ["M3", "20:00", "22:00", "20:00", "21:44", 90, 15, 90],
    ["M4", "20:00", "21:00", "20:00", "20:59", 30, 30, 30], ["M5", "20:00", "22:00", "20:00", null, 0, 15, 0], ["M6", "19:00", "21:00", "20:00", "21:10", 60, 15, 60],
    ["M7", "20:00", "20:37", "20:00", "20:50", 50, 1, 37], ["M8", "09:00", "19:00", "09:00", "19:30", 600, 15, 600], ["M9", "23:30", "+1 01:00", "22:00", "+1 00:40", 150, 15, 60],
    ["M10", "23:00", "23:30", "20:00", "22:04", 120, 15, 0],
  ];
  const bad = M.filter(([, a, b, f, o, ot, st, want]) => pure("otPaidMinutes", { reqStart: bk(d, a), reqEnd: bk(d, b), from: bk(d, f), outAt: o ? bk(d, o) : null, otMin: ot, stepMin: st }) !== want).map(([id, a, b, f, o, ot, st]) => `${id}=${short(pure("otPaidMinutes", { reqStart: bk(d, a), reqEnd: bk(d, b), from: bk(d, f), outAt: o ? bk(d, o) : null, otMin: ot, stepMin: st }), 30)}`);
  chk("S2.4", !bad.length, "10 vectors", bad.slice(0, 4).join(" · ") || "all");
}
{
  const s = bk("2031-07-07", "20:00"), e = bk("2031-07-07", "22:00");
  const w = (startAt: Date, endAt: Date, now: Date, afterHours = 24, maxAheadDays = 31) => { const r = pure("otWindow", { startAt, endAt, now, afterHours, maxAheadDays }); return r?.ok === true ? r.timing : r?.ok === false ? r.code : short(r, 30); };
  const add = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
  const cases: [string, string, string][] = [
    ["W1", w(s, e, bk("2031-07-07", "18:00")), "BEFORE"], ["W2", w(s, e, bk("2031-07-08", "22:00")), "AFTER"], ["W3", w(s, e, bk("2031-07-08", "22:01")), "LATE"],
    ["W4", w(s, e, bk("2031-07-07", "21:00")), "AFTER"], ["W5", w(s, e, bk("2031-07-07", "22:00"), 0), "AFTER"], ["W6", w(s, e, bk("2031-07-07", "22:01"), 0), "LATE"],
    ["W7", w(bk("2031-08-07", "11:00"), bk("2031-08-07", "12:00"), bk("2031-07-07", "12:00")), "BEFORE"], ["W8", w(bk("2031-08-07", "13:00"), bk("2031-08-07", "14:00"), bk("2031-07-07", "12:00")), "TOO_FAR"],
    ["W9", w(s, s, bk("2031-07-07", "12:00")), "RANGE"], ["W10", w(s, add(s, 14), bk("2031-07-07", "12:00")), "TOO_SHORT"],
    ["W11", w(s, add(s, 961), bk("2031-07-07", "12:00")) + "/" + w(s, add(s, 960), bk("2031-07-07", "12:00")), "TOO_LONG/BEFORE"], ["W12", w(new Date(s.getTime() + 30_000), e, bk("2031-07-07", "12:00")), "RANGE"],
  ];
  const bad = cases.filter(([, got, want]) => got !== want).map(([id, got]) => `${id}=${got}`);
  chk("S2.5", !bad.length, "12 vectors", bad.slice(0, 4).join(" · ") || "all");
}
{
  const fl = (p: Record<string, unknown>) => pure("otLegalRateFloor", { ...P0, ...p }, LAW);
  const pol = (x: unknown) => canon(pure("otPolicyOf", x));
  const PD = canon({ afterHours: 24, maxAheadDays: 31 });
  const inp = { law: LAW, ...mo(1_234_500), ...W(105) };
  const before = canon(inp);
  const r = {
    floor: fl({ payType: "MONTHLY", baseSalarySatang: 1_400_000 }) === 8750 && fl({ payType: "MONTHLY", baseSalarySatang: 1_234_500 }) === 7716 && fl({ payType: "DAILY", dailyRateSatang: 40_000 }) === 7500 && fl({ payType: "HOURLY", hourlyRateSatang: 4_333 }) === 6500 && fl({ payType: "MONTHLY", baseSalarySatang: 0 }) === null,
    policy: pol(null) === PD && pol("x") === PD && pol({ afterHours: 0, maxAheadDays: 90 }) === canon({ afterHours: 0, maxAheadDays: 90 }) && pol({ afterHours: 73 }) === PD && pol({ afterHours: 1.5 }) === PD && pol({ maxAheadDays: 0 }) === PD,
    pure: canon(pure("otAmount", inp)) === canon(pure("otAmount", inp)) && canon(inp) === before,
  };
  chk("S2.6", Object.values(r).every(Boolean), "floors 8750/7716/7500/6500/null · policy · pure", short(r));
}

// ═════════════════════════ DB ═════════════════════════
const { P, coreHash } = await qc4Env(SUITE);
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `${SLUG_PREFIX}${stamp}`;
const tag = tagOf(stamp);
const fx = makeFixtures(P, coreHash, SLUG);
let crashed = "";
async function sweepTenantTables(): Promise<void> {
  const tabs = ((await fx.rawRows(`SELECT DISTINCT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'`)) ?? []).map((r: Any) => String(r.t));
  for (let pass = 0; pass < 3; pass++) for (const tid of fx.tenants) for (const t of tabs) if (t !== "Tenant") await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => 0);
}
async function tenantRowsLeft(): Promise<string[]> {
  const tabs = ((await fx.rawRows(`SELECT DISTINCT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'`)) ?? []).map((r: Any) => String(r.t));
  const out: string[] = [];
  for (const tid of fx.tenants) for (const t of tabs) {
    const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
    if (r && Number(r[0]?.n ?? 0)) out.push(`${t}=${r[0].n}`);
  }
  return out;
}
// holder: holds advisory `key`, starts fn, once fn waits runs during(tx) and commits
async function hold<X>(key: string, during: (tx: Any) => Promise<unknown>, fn: () => Promise<X>) {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: () => void = () => {};
  const heldP = new Promise<void>((r) => (held = r));
  let holderErr = "";
  const holder = P.$transaction(async (tx: Any) => {
    await tx.$queryRawUnsafe(`SELECT count(pg_advisory_xact_lock(hashtextextended($1::text, 0)))::int AS n`, key);
    held();
    await gate;
    await during(tx);
  }, { maxWait: 10_000, timeout: 60_000 }).catch((e: unknown) => ((holderErr = errText(e)), held()));
  await heldP;
  const p = fn();
  let seen = 0;
  for (let i = 0; i < 50 && !seen; i++) {
    await sleep(100);
    seen = Number((await fx.rawRows(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`))?.[0]?.n ?? 0);
  }
  release();
  await holder;
  return { res: await p, waited: seen > 0, holderErr };
}

try {
  const sysMod: Any = await import("@/lib/modules/system/service");
  const PAY: Any = await import("@/lib/modules/hr/payroll");
  const JG: Any = await import("@/lib/modules/hr/judge");
  const CONS: Any = ((await import("@/lib/outbox-consumers")) as Any).consumers ?? {};
  const TA = await fx.newTenant("-a", `QC H2.9 ${tag} A`);
  const TB = await fx.newTenant("-b", `QC H2.9 ${tag} B`);
  const u1 = await fx.newUnit(TA, `สาขาหนึ่ง ${tag}`, "u1");
  const u2 = await fx.newUnit(TA, `สาขาสอง ${tag}`, "u2");
  const sys = async (t: string, n: string) => (await sysMod.createSystem(t, "HR", n)).id as string;
  const [sA, sP, sB] = [await sys(TA, "HR A"), await sys(TA, "HR P"), await sys(TB, "HR B")];
  const cA = { tenantId: TA, systemId: sA }, cP = { tenantId: TA, systemId: sP }, cB = { tenantId: TB, systemId: sB };
  const U: Record<string, Who> = {};
  for (const [k, role, ua, perm, t] of [
    ["owner", "OWNER", [], {}, TA], ["mgrAll", "MANAGER", [], {}, TA], ["mgrU1", "MANAGER", [u1], {}, TA], ["mgrU2", "MANAGER", [u2], {}, TA],
    ["apprU1", "STAFF", [u1], { "hr.payadjust.approve": true }, TA], ["reqU1", "STAFF", [u1], { "hr.payadjust.request": true }, TA], ["pay", "STAFF", [], { "hr.payroll.read": true }, TA],
    ["plain", "STAFF", [], {}, TA], ["self", "STAFF", [], {}, TA], ["selfM", "MANAGER", [u1], {}, TA], ["selfE", "STAFF", [], {}, TA], ["other", "OWNER", [], {}, TB],
  ] as [string, Who["role"], string[], Record<string, boolean>, string][]) U[k] = await fx.mkUser(t, k.toLowerCase(), `QC ${k} ${tag}`, role, ua, perm);
  const v = (k: string) => vOf(U[k]!);
  const me = (s: string, n: string, o: Record<string, unknown> = {}) => fx.mkEmp(TA, s, `${n} ${tag}`, { startDate: "2030-01-01", unitId: u1, ...o });
  const E = {
    e1: await me(sA, "หนึ่ง", { linkedUserId: U.self!.id }), e2: await me(sA, "สอง"), e3: await me(sA, "สาม", { unitId: u2 }), eM: await me(sA, "หัวหน้า", { linkedUserId: U.selfM!.id }),
    eE: await me(sA, "ออก", { linkedUserId: U.selfE!.id, endDate: "2031-07-09", status: "ENDED", active: false }), eN: await me(sA, "ไม่มีเงินเดือน"), eW: await me(sA, "สัปดาห์"),
    eP: await me(sP, "พี"), eO: await fx.mkEmp(TB, sB, `อื่น ${tag}`, { startDate: "2030-01-01" }),
  };
  const prof = async (c: Any, employeeId: string, x: Record<string, unknown>) => PAY.setSalaryProfile(c, { employeeId, baseSalarySatang: 0, ...x });
  await prof(cA, E.e1, { baseSalarySatang: 1_400_000, payType: "MONTHLY" });
  await prof(cA, E.e2, { payType: "DAILY", dailyRateSatang: 40_000 });
  await prof(cA, E.e3, { payType: "HOURLY", hourlyRateSatang: 5_000 });
  await prof(cA, E.eM, { baseSalarySatang: 1_234_500, payType: "MONTHLY" });
  await prof(cA, E.eE, { baseSalarySatang: 1_600_000, payType: "MONTHLY" });
  await prof(cP, E.eP, { baseSalarySatang: 1_600_000, payType: "MONTHLY" });
  const D1 = "2031-07-07", D2 = "2031-07-08", D3 = "2031-07-09", D4 = "2031-07-10", D5 = "2031-07-11", D6 = "2031-07-12";
  const shA = (await P.hrShift.create({ data: { tenantId: TA, systemId: sA, name: `กะ ${tag}`, startMin: 600, endMin: 1200, crossesMidnight: false, graceMin: 15 } })).id as string;
  const shP = (await P.hrShift.create({ data: { tenantId: TA, systemId: sP, name: `กะพี ${tag}`, startMin: 600, endMin: 1200, crossesMidnight: false, graceMin: 15 } })).id as string;
  const ENT: Record<string, string> = {};
  const ent = async (s: string, emp: string, day: string, unitId: string) => (ENT[`${emp}:${day}`] = (await P.hrRosterEntry.create({ data: { tenantId: TA, systemId: s, employeeId: emp, date: dbDate(day), shiftId: s === sA ? shA : shP, unitId, startMin: 600, endMin: 1200, breakMin: 0, crossesMidnight: false, published: true, publishedAt: new Date("2031-06-01T00:00:00Z"), source: "MANUAL" } })).id as string);
  for (const d of [D1, D2, D3, D4, D5]) await ent(sA, E.e1, d, u1);
  await ent(sA, E.e2, D1, u1);
  await ent(sA, E.e3, D2, u2);
  for (const d of [D1, D2]) await ent(sA, E.eM, d, u1);
  await ent(sA, E.eN, D1, u1);
  for (const d of [D1, D2, D3]) await ent(sP, E.eP, d, u1);
  await P.hrHoliday.create({ data: { tenantId: TA, systemId: sA, unitId: null, date: dbDate(D3), name: `วันหยุดทดสอบ ${tag}`, kind: "PUBLIC", shopOpen: true } });
  const att = async (s: string, emp: string, kind: string, day: string, hm: string) => (await P.hrAttendance.create({ data: { tenantId: TA, systemId: s, employeeId: emp, kind, at: bk(day, hm), rosterEntryId: ENT[`${emp}:${day}`] ?? null, source: "KIOSK" } })).id as string;
  const inOut = async (s: string, emp: string, day: string, a: string, b: string) => ({ in: await att(s, emp, "IN", day, a), out: await att(s, emp, "OUT", day, b) });
  const ot = (id: string) => P.hrOtRequest.findFirst({ where: { id } });
  const adj = async (id: string) => (await P.hrPayAdjustment.findMany({ where: { tenantId: TA, sourceType: "OT_REQUEST", sourceRef: { startsWith: `${id}:` } }, orderBy: { sourceRef: "asc" } })) as Any[];
  const adjStr = (rows: Any[]) => rows.map((x) => `${x.sourceRef?.split(":")[1]}/${x.kind}/${x.status}/${x.amountSatang}/${x.periodKey}/${x.runId ? "bound" : "free"}`).join(" ");
  const sigma = (rows: Any[]) => rows.filter((x) => x.status === "APPROVED").reduce((a, x) => a + (x.kind === "OT" ? x.amountSatang : -x.amountSatang), 0);
  const req = (c: Any, who: string, input: Record<string, unknown>, now: Date) => call("requestOt", c, v(who), input, { now });
  const dec = (c: Any, who: string, id: string, st: string, now = bk("2031-07-14", "13:00")) => call("decideOtRequest", c, v(who), id, st, { now });
  const settle = (now = bk("2031-07-14", "13:00")) => call("settleOtRequests", { tenantId: TA, now });
  const otCount = async () => (await fx.rawRows(`SELECT count(*)::int AS n FROM "HrOtRequest" WHERE "tenantId" = $1`, TA))?.[0]?.n ?? -1;

  // ═══ S3 requests ═══
  console.log("── S3 requests ──");
  const F1r = await req(cA, "self", { date: D1, start: "20:00", end: "22:00", reason: "ปิดร้านช้า" }, bk(D1, "09:00"));
  const F1 = String(F1r?.id ?? "∅");
  const F2r = await req(cA, "mgrU1", { employeeId: E.e2, date: D6, start: "09:00", end: "19:00" }, bk(D6, "20:00"));
  const F2 = String(F2r?.id ?? "∅");
  {
    const [a, b] = [await ot(F1), await ot(F2)];
    const r = {
      f1: F1r?.ok === true && F1r.timing === "BEFORE" && a?.status === "PENDING" && a?.minutes === 120 && a?.timing === "BEFORE" && a?.requestedByUserId === U.self!.id && a?.employeeId === E.e1 && dbDate(D1).getTime() === a?.date?.getTime?.(),
      f2: F2r?.ok === true && F2r.timing === "AFTER" && b?.status === "PENDING" && b?.minutes === 600 && b?.requestedByUserId === U.mgrU1!.id && b?.employeeId === E.e2,
    };
    chk("S3.1", r.f1 && r.f2, "F1 BEFORE 120 · F2 AFTER 600", `${short(r)} F1=${sh(F1r)} F2=${sh(F2r)}`);
  }
  {
    const n0 = await otCount();
    const got: [string, Any, string][] = [
      ["noEmp", await req(cA, "plain", { date: D2, start: "20:00", end: "21:00" }, bk(D2, "09:00")), T.noEmp],
      ["perm-self", await req(cA, "self", { employeeId: E.e2, date: D2, start: "20:00", end: "21:00" }, bk(D2, "09:00")), T.noPermRequest],
      ["perm-plain", await req(cA, "plain", { employeeId: E.e2, date: D2, start: "20:00", end: "21:00" }, bk(D2, "09:00")), T.noPermRequest],
      ["perm-u2", await req(cA, "reqU1", { employeeId: E.e3, date: D2, start: "20:00", end: "21:00" }, bk(D2, "09:00")), T.noPermRequest],
      ["range", await req(cA, "self", { date: D2, start: "25:00", end: "26:00" }, bk(D2, "09:00")), T.range],
      ["short", await req(cA, "self", { date: D2, start: "20:00", end: "20:10" }, bk(D2, "09:00")), T.tooShort],
      ["long", await req(cA, "self", { date: D2, start: "04:00", end: "20:30" }, bk(D2, "01:00")), T.tooLong],
      ["late", await req(cA, "self", { date: D1, start: "21:00", end: "21:30" }, bk(D2, "21:31")), T.late24],
      ["far", await req(cA, "self", { date: "2031-08-05", start: "20:00", end: "21:00" }, bk("2031-07-01", "09:00")), T.tooFar31],
      ["outEmp", await req(cA, "owner", { employeeId: E.eE, date: D4, start: "20:00", end: "21:00" }, bk(D4, "09:00")), T.outOfEmployment],
      ["ended", await req(cA, "selfE", { date: D2, start: "20:00", end: "21:00" }, bk(D2, "09:00")), T.ended],
    ];
    const bad = got.filter(([, r, t]) => !said(r, t)).map(([k, r]) => `${k}=${sh(r)}`);
    const n2 = await otCount();
    chk("S3.2", !bad.length && n0 === n2, "11 literal refusals · rows unchanged", `${bad.slice(0, 3).join(" · ") || "texts ok"} rows ${n0}→${n2}`);
  }
  {
    const a = await req(cA, "self", { date: D2, start: "20:00", end: "21:00" }, bk(D2, "09:00"));
    const b = await req(cA, "self", { date: D2, start: "20:30", end: "21:30" }, bk(D2, "09:05"));
    const cx = await call("cancelOtRequest", cA, v("mgrU2"), String(a?.id ?? "∅"));
    const c = await call("cancelOtRequest", cA, v("self"), String(a?.id ?? "∅"));
    const d = await req(cA, "self", { date: D2, start: "20:30", end: "21:30" }, bk(D2, "09:10"));
    const dOff = await req(cA, "mgrU1", { employeeId: E.e2, date: D6, start: "19:30", end: "20:00" }, bk(D6, "20:10"));
    const st = (await ot(String(a?.id ?? "∅")))?.status;
    const ok = a?.ok === true && said(b, T.overlap) && said(cx, T.cancelNo) && c?.ok === true && st === "CANCELLED" && d?.ok === true && said(dOff, T.dayOffOne);
    chk("S3.3", ok, "overlap · cancelNo · CANCELLED · re-request ok · dayOffOne", `a=${sh(a)} b=${sh(b)} cx=${sh(cx)} c=${sh(c)} st=${st} d=${sh(d)} off=${sh(dOff)}`);
  }
  {
    const w1 = await req(cA, "owner", { employeeId: E.eW, date: D1, start: "04:00", end: "20:00" }, bk(D1, "03:00"));
    const w2 = await req(cA, "owner", { employeeId: E.eW, date: D2, start: "04:00", end: "20:00" }, bk(D1, "03:00"));
    const w3 = await req(cA, "owner", { employeeId: E.eW, date: D3, start: "04:00", end: "09:00" }, bk(D1, "03:00"));
    chk("S3.4", w1?.warnWeek === false && w2?.warnWeek === false && w3?.ok === true && w3?.warnWeek === true, "false · false · true", `${sh(w1)} | ${sh(w2)} | ${sh(w3)}`);
  }

  // ═══ more requests (all filed before the work or ≤ 24 h after) ═══
  const idOf = (r: Any) => String(r?.id ?? "∅");
  const F3 = idOf(await req(cA, "self", { date: D3, start: "20:00", end: "21:30" }, bk(D3, "10:00")));
  const F4 = idOf(await req(cA, "owner", { employeeId: E.e3, date: D2, start: "20:00", end: "21:15" }, bk(D2, "21:30")));
  const F5 = idOf(await req(cA, "self", { date: D4, start: "20:00", end: "22:00" }, bk(D4, "09:00")));
  const RC1 = idOf(await req(cA, "self", { date: D5, start: "20:00", end: "21:00" }, bk(D5, "09:00")));
  const F6 = idOf(await req(cA, "selfM", { date: D1, start: "20:00", end: "21:45" }, bk(D1, "12:00")));
  const RC4 = idOf(await req(cA, "owner", { employeeId: E.eM, date: D2, start: "20:00", end: "21:30" }, bk(D2, "09:00")));
  const FN = idOf(await req(cA, "owner", { employeeId: E.eN, date: D1, start: "20:00", end: "21:00" }, bk(D1, "09:00")));
  const P1 = idOf(await req(cP, "owner", { employeeId: E.eP, date: D1, start: "20:00", end: "22:00" }, bk(D1, "09:00")));
  const P2 = idOf(await req(cP, "owner", { employeeId: E.eP, date: D2, start: "20:00", end: "21:00" }, bk(D2, "09:00")));
  const P3 = idOf(await req(cP, "owner", { employeeId: E.eP, date: D3, start: "20:00", end: "22:00" }, bk(D3, "09:00")));

  // ═══ S4 decide / settle ═══
  console.log("── S4 decide/settle ──");
  {
    const r = await dec(cA, "mgrU1", F1, "APPROVED", bk(D1, "12:00"));
    const rows = await adj(F1);
    const row = await ot(F1);
    chk("S4.1", r?.ok === true && r.status === "APPROVED" && r.settled === false && rows.length === 0 && row?.status === "APPROVED" && row?.decidedById === U.mgrU1!.id && !row?.settledAt, "APPROVED · settled false · 0 rows", `${sh(r)} rows=${rows.length} st=${row?.status}`);
  }
  const selfDec = await dec(cA, "selfM", F6, "APPROVED", bk(D1, "13:00"));
  // events (the work actually happened)
  await inOut(sA, E.e1, D1, "09:55", "22:04");
  await inOut(sA, E.e1, D3, "09:55", "21:30");
  await inOut(sA, E.e1, D5, "09:55", "21:00");
  await inOut(sA, E.e2, D6, "09:00", "19:00");
  await inOut(sA, E.e3, D2, "09:55", "21:20");
  const eMd1 = await inOut(sA, E.eM, D1, "10:00", "21:45");
  const eMd2 = await inOut(sA, E.eM, D2, "10:00", "21:30");
  await inOut(sA, E.eN, D1, "09:55", "21:00");
  await inOut(sP, E.eP, D1, "09:55", "22:00");
  await inOut(sP, E.eP, D2, "09:55", "21:00");
  const ePd3 = await inOut(sP, E.eP, D3, "09:55", "21:00");
  const jobRes = await JG.runAttendanceJobs({ now: bk("2031-07-14", "12:00"), tenantId: TA }).catch((e: unknown) => ({ __err: errText(e) }));
  console.log(`  ℹ attendance job: ${short(jobRes, 100)}`);
  const dayRow = async (emp: string, day: string) => (await fx.rawRows(`SELECT * FROM "HrAttendanceDay" WHERE "employeeId" = $1 AND "date" = $2::date`, emp, day))?.[0] ?? null;
  // stale: eM D1 OUT 21:45 → 22:15 after finalisation
  await P.hrAttendance.delete({ where: { id: eMd1.out } });
  await att(sA, E.eM, "OUT", D1, "22:15");
  {
    const rs = await Promise.all([settle(), settle(), settle()]);
    const rows = await adj(F1);
    chk("S6.2", rows.length === 1, "1 row", `${rows.length} rows · ${short(rs.map(sh), 120)}`);
    const x = rows[0] ?? {};
    const r0 = await ot(F1);
    const r = {
      row: x.kind === "OT" && x.sourceType === "OT_REQUEST" && x.sourceRef === `${F1}:1` && x.status === "APPROVED" && x.amountSatang === 17500 && x.periodKey === "2031-07" && x.runId === null && x.requestedById === U.self!.id && x.decidedById === U.mgrU1!.id && x.employeeId === E.e1,
      req: r0?.paidMinutes === 120 && r0?.amountSatang === 17500 && r0?.settleGen === 1 && !!r0?.settledAt && r0?.multiplierBp === 15000 && canon(r0?.segmentsJson) === canon([{ cls: "OT_WORKDAY", minutes: 120, multiplierBp: 15000, amountSatang: 17500 }]),
    };
    chk("S4.2", r.row && r.req, "17500 · 2031-07 · gen 1", `${short(r)} ${adjStr(rows)} paid=${r0?.paidMinutes}`);
  }
  {
    const fe = await dec(cA, "mgrU1", F2, "APPROVED");
    const d2 = await dec(cA, "owner", F2, "APPROVED");
    const d3 = await dec(cA, "apprU1", F3, "APPROVED");
    const nf = await dec(cA, "mgrU1", F4, "APPROVED");
    const d4 = await dec(cA, "mgrU2", F4, "APPROVED");
    const [a2, a3, a4] = [await adj(F2), await adj(F3), await adj(F4)];
    const r = {
      f2: d2?.settled === true && adjStr(a2) === "1/OT/APPROVED/110000/2031-07/free" && canon((await ot(F2))?.segmentsJson) === canon([{ cls: "HOLIDAY_WORK", minutes: 480, multiplierBp: 20000, amountSatang: 80000 }, { cls: "OT_HOLIDAY", minutes: 120, multiplierBp: 30000, amountSatang: 30000 }]),
      f3: d3?.settled === true && adjStr(a3) === "1/OT/APPROVED/26250/2031-07/free" && (await ot(F3))?.multiplierBp === 30000,
      f4: d4?.settled === true && adjStr(a4) === "1/OT/APPROVED/9375/2031-07/free" && (await ot(F4))?.paidMinutes === 75,
    };
    chk("S4.3", Object.values(r).every(Boolean), "110000 · 26250 · 9375", `${short(r)} F2=${adjStr(a2)} F3=${adjStr(a3)} F4=${adjStr(a4)}`);
    const pay = await dec(cA, "pay", RC1, "APPROVED");
    const pl = await dec(cA, "plain", RC1, "APPROVED");
    const ok = said(selfDec, T.self) && said(fe, T.fourEyes) && said(nf, T.notFound) && said(pay, T.notFound) && said(pl, T.notFound) && (await ot(RC1))?.status === "PENDING";
    chk("S4.4", ok, "self · fourEyes · notFound ×3", `self=${sh(selfDec)} fe=${sh(fe)} nf=${sh(nf)} pay=${sh(pay)} plain=${sh(pl)}`);
  }
  {
    const d5 = await dec(cA, "owner", F5, "APPROVED");
    const dn = await dec(cA, "apprU1", FN, "APPROVED");
    const [r5, rn] = [await ot(F5), await ot(FN)];
    const ok = d5?.settled === true && r5?.paidMinutes === 0 && r5?.amountSatang === 0 && !!r5?.settledAt && (await adj(F5)).length === 0 && dn?.ok === true && dn.settled === false && rn?.settleCode === "NO_RATE" && !rn?.settledAt && (await adj(FN)).length === 0;
    chk("S4.5", ok, "F5 paid 0 · FN NO_RATE", `F5=${sh(d5)} paid=${r5?.paidMinutes} FN=${sh(dn)} code=${rn?.settleCode}`);
  }
  {
    const d6 = await dec(cA, "owner", F6, "APPROVED");
    const w = await ot(F6);
    const waited = d6?.ok === true && d6.settled === false && w?.settleCode === "STALE" && (await adj(F6)).length === 0;
    const day = await dayRow(E.eM, D1);
    const rc = await JG.recomputeAttendanceDay(cA, v("owner"), { dayId: day?.id, reason: "แก้เวลาออก" }, { now: bk("2031-07-14", "13:10") }).catch((e: unknown) => ({ __err: errText(e) }));
    await settle(bk("2031-07-14", "13:20"));
    const rows = await adj(F6);
    const after = await ot(F6);
    chk("S4.6", waited && adjStr(rows) === "1/OT/APPROVED/13502/2031-07/free" && after?.paidMinutes === 105, "STALE wait → 13502", `wait=${waited} code=${w?.settleCode} recompute=${short(rc, 60)} rows=${adjStr(rows)}`);
  }
  {
    const before = (await P.hrPayAdjustment.count({ where: { tenantId: TA, sourceType: "OT_REQUEST" } })) as number;
    await settle(bk("2031-07-14", "14:00"));
    await settle(bk("2031-07-14", "15:00"));
    const again = await dec(cA, "owner", F1, "APPROVED");
    const after = (await P.hrPayAdjustment.count({ where: { tenantId: TA, sourceType: "OT_REQUEST" } })) as number;
    chk("S4.7", before === after && before > 0 && said(again, T.decided), "no new row · decided", `${before}→${after} again=${sh(again)}`);
  }

  // ═══ S6 races ═══
  console.log("── S6 races ──");
  {
    const rs = await Promise.all([dec(cA, "owner", RC1, "APPROVED"), dec(cA, "mgrAll", RC1, "APPROVED")]);
    const oks = rs.filter((r) => r?.ok === true).length;
    const rows = await adj(RC1);
    chk("S6.1", oks === 1 && rs.some((r) => said(r, T.decided)) && adjStr(rows) === "1/OT/APPROVED/8750/2031-07/free", "1 ok · 1 decided · 8750", `${rs.map(sh).join(" | ")} rows=${adjStr(rows)}`);
  }
  {
    const day = await dayRow(E.eM, D2);
    const h = await hold(`hr:judge:${day?.id}`, async (tx) => {
      await tx.hrAttendance.delete({ where: { id: eMd2.out } });
      const o = await tx.hrAttendance.create({ data: { tenantId: TA, systemId: sA, employeeId: E.eM, kind: "OUT", at: bk(D2, "20:30"), rosterEntryId: ENT[`${E.eM}:${D2}`], source: "KIOSK" } });
      await tx.$executeRawUnsafe(`UPDATE "HrAttendanceDay" SET "otMin" = 30, "workedMin" = 630, "outAttendanceId" = $2, "version" = "version" + 1, "recomputedAt" = now(), "recomputeReason" = 'qc' WHERE "id" = $1`, day?.id, o.id);
    }, () => dec(cA, "apprU1", RC4, "APPROVED"));
    const rows = await adj(RC4);
    chk("S6.4", h.waited && !h.holderErr && h.res?.ok === true && adjStr(rows) === "1/OT/APPROVED/3858/2031-07/free" && (await ot(RC4))?.paidMinutes === 30, "waited · 30 min · 3858", `waited=${h.waited} holder=${h.holderErr} res=${sh(h.res)} rows=${adjStr(rows)}`);
  }

  // ═══ S5 periods · re-settle · revoke (system P: MONTHLY only) ═══
  console.log("── S5 periods/revoke ──");
  {
    await dec(cP, "mgrAll", P1, "APPROVED");
    await dec(cP, "mgrAll", P3, "APPROVED");
    const run = await PAY.createPayrollRun(cP, { periodKey: "2031-07", payDate: bk("2031-07-31", "12:00") }).catch((e: unknown) => ({ __err: errText(e) }));
    const [a1, a3] = [await adj(P1), await adj(P3)];
    const rr = run?.id ? await P.hrPayrollRun.findFirst({ where: { id: run.id } }) : null;
    const ok = !!run?.id && a1.length === 1 && a3.length === 1 && a1[0].runId === run.id && a3[0].runId === run.id && a1[0].amountSatang === 20000 && a3[0].amountSatang === 10000 && rr?.totalAddSatang === 30000;
    chk("S5.1", ok, "bound 20000 + 10000 · totalAdd 30000", `run=${short(run, 40)} P1=${adjStr(a1)} P3=${adjStr(a3)} add=${rr?.totalAddSatang}`);
    // P3: OUT 21:00 → 21:30, recompute (run DRAFT ⇒ allowed), settle ⇒ +5000 into 2031-08
    await P.hrAttendance.delete({ where: { id: ePd3.out } });
    await att(sP, E.eP, "OUT", D3, "21:30");
    const day = await dayRow(E.eP, D3);
    const rc = await JG.recomputeAttendanceDay(cP, v("owner"), { dayId: day?.id, reason: "แก้เวลาออก" }, { now: bk("2031-07-15", "10:00") }).catch((e: unknown) => ({ __err: errText(e) }));
    await settle(bk("2031-07-15", "11:00"));
    const b3 = await adj(P3);
    const r3 = await ot(P3);
    chk("S5.2", adjStr(b3) === "1/OT/APPROVED/10000/2031-07/bound 2/OT/APPROVED/5000/2031-08/free" && sigma(b3) === 15000 && r3?.amountSatang === 15000 && r3?.paidMinutes === 90, "gen1 bound 10000 · gen2 +5000 2031-08 · Σ 15000", `rc=${short(rc, 50)} ${adjStr(b3)} Σ=${sigma(b3)}`);
    if (run?.id) await P.$executeRawUnsafe(`UPDATE "HrPayrollRun" SET "status" = 'APPROVED' WHERE "id" = $1`, run.id);
    const nr = await call("revokeOtRequest", cP, v("owner"), P1, { reason: "x" }, { now: bk("2031-07-16", "10:00") });
    const rv = await call("revokeOtRequest", cP, v("owner"), P1, { reason: "บันทึกผิดวัน" }, { now: bk("2031-07-16", "10:00") });
    const b1 = await adj(P1);
    chk("S5.3", said(nr, T.revokeReason) && rv?.ok === true && (await ot(P1))?.status === "CANCELLED" && adjStr(b1) === "1/OT/APPROVED/20000/2031-07/bound 2/DEDUCTION/APPROVED/20000/2031-08/free" && sigma(b1) === 0, "CANCELLED · DEDUCTION 20000 2031-08 · Σ 0", `short=${sh(nr)} rv=${sh(rv)} ${adjStr(b1)} Σ=${sigma(b1)}`);
    // S6.3: approve P2 while the 2031-08 run is being created under its lock
    const h = await hold(`hr:payroll:run:${sP}:2031-08`, (tx) => tx.hrPayrollRun.create({ data: { tenantId: TA, systemId: sP, periodKey: "2031-08", payDate: bk("2031-08-31", "12:00"), status: "DRAFT" } }), () => dec(cP, "mgrAll", P2, "APPROVED", bk("2031-07-16", "11:00")));
    let res2 = h.res;
    if (res2?.ok !== true && (await ot(P2))?.status === "PENDING") res2 = await dec(cP, "mgrAll", P2, "APPROVED", bk("2031-07-16", "11:05"));
    const b2 = await adj(P2);
    chk("S6.3", h.waited && !h.holderErr && adjStr(b2) === "1/OT/APPROVED/10000/2031-09/free", "waited · 2031-09", `waited=${h.waited} holder=${h.holderErr} first=${sh(h.res)} final=${sh(res2)} rows=${adjStr(b2)}`);
    const stray = (await P.hrPayAdjustment.findMany({ where: { tenantId: TA, systemId: sP, sourceType: "OT_REQUEST", periodKey: "2031-07", runId: null }, select: { id: true } })) as Any[];
    chk("S5.5", stray.length === 0 && b2.length === 1 && b2.every((x) => x.periodKey !== "2031-08"), "none unbound in 2031-07 (APPROVED run) · P2 not 2031-08", `stray=${stray.length} P2=${adjStr(b2)}`);
  }
  {
    const rv = await call("revokeOtRequest", cA, v("owner"), F3, { reason: "ไม่ได้ทำจริง" }, { now: bk("2031-07-16", "12:00") });
    const b = await adj(F3);
    chk("S5.4", rv?.ok === true && (await ot(F3))?.status === "CANCELLED" && adjStr(b) === "1/OT/REJECTED/26250/2031-07/free" && sigma(b) === 0, "row REJECTED · no new row · Σ 0", `${sh(rv)} ${adjStr(b)}`);
  }

  // ═══ S7 privacy / scope ═══
  console.log("── S7 privacy/scope ──");
  {
    const keysOf = (r: Any) => (r?.ok === true && Array.isArray(r.items) && r.items[0] ? Object.keys(r.items[0]).sort().join(",") : `∅ ${sh(r)}`);
    const range = { from: D1, to: D6 };
    const [lm, lo, lp, lpl] = [await call("otRequestList", cA, v("mgrU1"), range), await call("otRequestList", cA, v("owner"), range), await call("otRequestList", cA, v("pay"), range), await call("otRequestList", cA, v("plain"), range)];
    const f1p = lp?.items?.find?.((x: Any) => x.id === F1);
    const noMoney = JSON.stringify(lm ?? {}).includes("17500") === false && JSON.stringify(lm ?? {}).includes("Satang") === false;
    chk("S7.1", keysOf(lm) === BASE_KEYS && noMoney && keysOf(lo) === PAY_KEYS && keysOf(lp) === PAY_KEYS && f1p?.amountSatang === 17500 && said(lpl, T.listNo), "manager base · owner/pay + money · plain listNo", `mgr=${keysOf(lm).slice(0, 60)} owner=${keysOf(lo).slice(0, 40)} pay17500=${f1p?.amountSatang} plain=${sh(lpl)}`);
    const mine = await call("myOtRequests", cA, v("self"));
    const nobody = await call("myOtRequests", cA, v("plain"));
    const emps = new Set((mine?.items ?? []).map((x: Any) => x.employeeId));
    const f1m = mine?.items?.find?.((x: Any) => x.id === F1);
    chk("S7.2", mine?.ok === true && emps.size === 1 && emps.has(E.e1) && f1m?.amountSatang === 17500 && said(nobody, T.noEmp) && (typeof OT.myOtRequests !== "function" || OT.myOtRequests.length <= 3), "own rows only · amount · noEmp", `mine=${sh(mine)} emps=${emps.size} plain=${sh(nobody)}`);
    const pend = idOf(await req(cA, "self", { date: D4, start: "06:00", end: "07:00" }, bk(D4, "05:00")));
    const x1 = await dec(cB, "other", pend, "APPROVED");
    const x2 = await dec(cP, "owner", pend, "APPROVED");
    const x3 = await call("revokeOtRequest", cB, v("other"), F1, { reason: "ข้ามร้าน" }, { now: bk("2031-07-16", "12:00") });
    const lb = await call("otRequestList", cB, v("other"), {});
    const leak = JSON.stringify(lb ?? {}).includes(E.e1) || JSON.stringify(lb ?? {}).includes(F1);
    chk("S7.3", said(x1, T.notFound) && said(x2, T.notFound) && said(x3, T.notFound) && (await ot(pend))?.status === "PENDING" && (await ot(F1))?.status === "APPROVED" && lb?.ok === true && !leak, "notFound ×3 · untouched · no leak", `${sh(x1)} | ${sh(x2)} | ${sh(x3)} leak=${leak}`);
  }

  // ═══ S8 event + consumer ═══
  console.log("── S8 event ──");
  {
    const ev = (id: string, st: string) => P.outboxEvent.findFirst({ where: { tenantId: TA, type: "hr.ot.decided", idempotencyKey: `hr.ot.decided#${id}#${st}` } });
    const [e1, e3] = [await ev(F1, "APPROVED"), await ev(F3, "CANCELLED")];
    const pk = (e: Any) => (e ? Object.keys(e.payload ?? {}).sort().join(",") : "∅");
    const r = { e1: pk(e1) === "employeeId,otRequestId,status,systemId" && e1?.payload?.otRequestId === F1 && e1?.payload?.status === "APPROVED" && e1?.systemId === sA, e3: pk(e3) === "employeeId,otRequestId,status,systemId" && e3?.payload?.status === "CANCELLED" };
    chk("S8.1", r.e1 && r.e3, "APPROVED + CANCELLED events, 4 keys", `${short(r)} e1=${pk(e1)} e3=${pk(e3)}`);
    const fn = CONS["hr.ot.decided"];
    const run = async (e: Any) => (e && typeof fn === "function" ? fn(e).catch((x: unknown) => errText(x)) : "∅");
    await Promise.all([run(e1), run(e1)]);
    await run(e1);
    const ns = (await P.appNotification.findMany({ where: { tenantId: TA, recipientUserId: U.self!.id, title: T.nTitleA } })) as Any[];
    const body = ns[0]?.body ?? "";
    chk("S8.2", ns.length === 1 && /^คำขอ OT วันที่ /.test(body) && !/฿|175|17500|17,500/.test(body), "1 notification · no money", `n=${ns.length} body=${short(body, 60)}`);
  }

  // ═══ S9 writer #18 + policy ═══
  console.log("── S9 writer/policy ──");
  {
    const set = async (val: unknown) => {
      try {
        await PAY.setSalaryProfile(cA, { employeeId: E.e1, baseSalarySatang: 1_400_000, payType: "MONTHLY", ...(val === "∅" ? {} : { otHourlyRateSatang: val }) });
        return "ok";
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };
    const rate = async () => ((await P.hrSalaryProfile.findFirst({ where: { employeeId: E.e1 } })) as Any)?.otHourlyRateSatang ?? null;
    const a = await set(10_000);
    const ra = await rate();
    const b = await set(8_749);
    const c0 = await set(0);
    const c1 = await set(1.5);
    const d = await set("∅");
    const rd2 = await rate();
    const e = await set(null);
    const re = await rate();
    chk("S9.1", a === "ok" && ra === 10_000 && b === T.rateBelowLaw && c0 === T.rateBad && c1 === T.rateBad && d === "ok" && rd2 === 10_000 && e === "ok" && re === null, "10000 · below · bad · keep · clear", `a=${a} ra=${ra} b=${short(b, 40)} c0=${short(c0, 30)} c1=${short(c1, 30)} keep=${rd2} clear=${re}`);
  }
  {
    const s0 = await call("saveOtPolicy", cA, v("owner"), { afterHours: 0, maxAheadDays: 31 });
    const late = await req(cA, "self", { date: D5, start: "06:00", end: "07:00" }, bk(D5, "07:01"));
    const bad = await call("saveOtPolicy", cA, v("owner"), { afterHours: 73, maxAheadDays: 31 });
    const s1 = await call("saveOtPolicy", cA, v("owner"), { afterHours: 24, maxAheadDays: 31 });
    const g = await call("getOtPolicy", cA);
    chk("S9.2", s0?.ok === true && said(late, T.late0) && said(bad, T.sAfter) && s1?.ok === true && canon(g) === canon({ afterHours: 24, maxAheadDays: 31 }), "late0 · sAfter · restored", `${sh(s0)} late=${sh(late)} bad=${sh(bad)} get=${short(g, 50)}`);
  }

  // ═══ X frozen controls ═══
  const TD = await fx.newTenant("-d", `QC H2.9 ${tag} D`);
  const fr = await frozenControls(P, fx, TD, TB, U.other!, tag, async () => "ok");
  chk("X1", ...fr.digests);
  chk("X2", ...fr.clock);
  chk("X3", ...fr.privacy);
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  const nf = await fitnessNoEnv().catch((e: unknown) => ({ ok: false, note: errText(e) }));
  chk("X12.1", nf.ok, "exit 0", nf.note);
  try {
    await sweepTenantTables();
    await cleanupFx(P, fx, SLUG);
    const res = await residueOf(P, fx, SLUG, SLUG_PREFIX);
    const left = await tenantRowsLeft();
    chk("Z1", res.length === 0 && left.length === 0, "none", [...res, ...left].join(",") || "none");
  } catch (e) {
    chk("Z1", false, "none", `cleanup error ${errText(e)}`);
  }
  await P.$disconnect().catch(() => {});
}
process.exit(REG.finish({ forced: FORCE, crashed, missing }));
