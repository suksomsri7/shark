// QC — HR V2 · H4.1 — leave/absence → booking windows: real `hr.staffWindows()` behind the SVC B.1 seam (debt X-HR.1) ·
//      published roster shift = bookable window of the staff (C-2 extended to the roster) · leave (full/half/hours) removes/shrinks it ·
//      duty reassignment hint for a leave (screen 05 "กระทบ: … ขาด 1 คน → ระบบเสนอ …") + one notification per approved leave.
// Brief: ledger/hr-briefs/hr-brief-H4.1.md (DRAFT · Q1–Q14 defaults in force) · base session/hr 6c614c04c · branch wip/hr-h4.1
// ⚠️ Oracle under change control (controller owns it) — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 Expected values are LITERALS written in this file (minutes, ids of fixtures, Thai texts) — never computed with the code under test.
// CONTRACT (brief R1–R12 · ORACLE-EDIT if it must differ):
//   hr/availability-rules.ts (pure · no DB/clock): dayWindows({ day, unitId, entries[{date, unitId, startMin, endMin, crossesMidnight}],
//     leaves[{fromDate, toDate, status, halfDay "AM"|"PM"|null, hours}] }) → [{startMin, endMin}] sorted, merged, clipped to [0,1440]
//   hr/availability.ts: staffWindows(StaffWindowsInput) → StaffWindowsRow[] (signature of SVC B.1 unchanged; re-exported by hr/index.ts) ·
//     leaveDutyHints(ctx{tenantId,systemId}, viewer{role,unitAccess,permissions,userId}, {leaveId}) → {ok:true, items} | {ok:false, reason} ·
//     leaveDutyNotify({tenantId, systemId, leaveId}) (called by the `hr.leave.decided` consumer) · DUTY_HINT_TEXT {hintNo, notifyTitle, notifyBody}
// SKIP while hr/availability.ts is absent (exit 0) · QC_FORCE=1 / --force-run runs anyway · --list prints the ids.
// Own tenants `qc-hr-h41-<tag>-*`, dates 2031-03 (Mon 10 … Sun 16), rows by id, swept in finally (Z1). No "today".
// Run (lane DB): bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h4.1.mts
import { type Any, type Def, rd, short, errText, stripComments, sha, PAYROLL_RULES_FILE, PAYROLL_RULES_SHA, baseRef, changedVsBase, diffHunks, makeRegistry, qc4Env, fitnessNoEnv, importsOf, flat, jsonOf, loadOpt, modState, tagOf, makeFixtures, cleanupFx, residueOf, underRosterLock, vOf, canon, keysDeep, testidsOf, inventoryParity, msgParity, tokensOnly, dbDate, type Who } from "./qc-hr-lib.mjs";

const SUITE = "qc-hr-h4.1";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const F = {
  av: "src/lib/modules/hr/availability.ts",
  rules: "src/lib/modules/hr/availability-rules.ts",
  index: "src/lib/modules/hr/index.ts",
  cons: "src/lib/outbox-consumers.ts",
  ui: "src/lib/modules/hr/ui.tsx",
  page: "src/app/app/sys/[id]/hr/leave/page.tsx",
  th: "src/messages/th/common.json",
  en: "src/messages/en/common.json",
};
const FROZEN = [
  "src/lib/modules/hr/rules.ts", "src/lib/modules/hr/roster.ts", "src/lib/modules/hr/roster-rules.ts", "src/lib/modules/hr/swap.ts",
  "src/lib/modules/hr/swap-rules.ts", "src/lib/modules/hr/time-rules.ts", "src/lib/modules/hr/leave.ts", "src/lib/modules/hr/leave-rules.ts",
  "src/lib/modules/hr/service.ts", "src/lib/modules/hr/payroll.ts", "src/lib/modules/hr/payroll-rules.ts", "src/lib/modules/hr/privacy-shared.ts",
  "src/lib/modules/hr/pos-seam.ts", "src/lib/modules/booking", "src/lib/modules/approval", "src/lib/approval-effects.ts", "prisma",
  "scripts/seed-hr-qc.mts", "scripts/hr-qc-env.mts", "scripts/qc-hr-leave-booking.mts", "scripts/qc-booking-hours-hr.mts", "scripts/qc-svc-b.1.mts",
];
const HINT_NO = "ไม่พบใบลานี้ หรือคุณไม่มีสิทธิ์ดูผลกระทบต่อกะ";
const N_TITLE = "มีกะที่ต้องหาคนแทน";
const N_BODY_1 = "ใบลาที่อนุมัติแล้วทำให้กะ 1 กะยังไม่มีคนแทน — เปิดหน้าการลาเพื่อดูคนที่ว่าง";
const C = "CRITICAL", M = "MAJOR";
const D = (id: string, g: string, s: "CRITICAL" | "MAJOR" | "MINOR", b: "RED" | "GREEN", t: string): Def => [`H4.1-${id}`, g, s, b, t] as const;
const CHECKS: Def[] = [
  D("S1.1", "R1", C, "RED", "[static] hr/index.ts: staffWindows = re-export from ./availability (no function body) · StaffWindowsInput/Row field lists unchanged · no db import"),
  D("S1.2", "R2", C, "RED", "[static] availability-rules.ts pure: only `import type` · no prisma/db · no Date.now/new Date(/Math.random/async/fetch/process."),
  D("S1.3", "R9", M, "RED", "[static] availability.ts: no import of another module (booking/pos/crm/…) · writes = appNotification.createMany + audit only · lock key `hr-leave-hint:`"),
  D("S1.4", "R1", C, "GREEN", "[static] frozen files unchanged vs base (rules/roster/swap/leave/service/payroll/privacy-shared/pos-seam · booking/** · approval/** · prisma/** · seed · regression oracles)"),
  D("S1.5", "C.4", C, "GREEN", "[static] payroll-rules.ts sha frozen"),
  D("S1.6", "R10", M, "RED", "[static] outbox-consumers.ts: hr.leave.decided handler calls leaveDutyNotify inside withAutomation · one marked `HR H4.1` hunk · ≤1 line removed"),
  D("S1.7", "R12", M, "RED", "[static] UI: testids hr-leave-impact + hr-leave-impact-candidate in hr ui/page · inventory rows (wo H4.1) · hr.leaveImpact th=en {title, uncovered, covered, candidate, noCandidate} · tokens only"),
  D("S2.1", "R3", C, "RED", "[pure] dayWindows: shift = window · PENDING/REJECTED/CANCELLED no effect · APPROVED full day ⇒ [] · leave range D−1..D+1 ⇒ [] · bad day ⇒ []"),
  D("S2.2", "R4", C, "RED", "[pure] half-day split at the day's span midpoint: 540–1080 AM ⇒ 810–1080 · PM ⇒ 540–810 · split 540–720+1020–1260 AM ⇒ 1020–1260 · PM ⇒ 540–720"),
  D("S2.3", "R5", C, "RED", "[pure] overnight 1320→360: D ⇒ 1320–1440 · D+1 ⇒ 0–360 · leave belongs to the start day (D−1 AM ⇒ 120–360 · D−1 PM ⇒ 0–120 · leave on D only ⇒ tail kept) · both ⇒ 0–360,1320–1440"),
  D("S2.4", "R3", M, "RED", "[pure] other-unit entry excluded · unit null included · touching windows merged · hours leave ⇒ whole start day removed · span for half-day uses every unit"),
  D("S3.1", "R3", C, "RED", "[db] staffWindows: published shift = window [540,1080] · breaks [] (E1 pending day · E15 on a shop holiday)"),
  D("S3.2", "R6", C, "RED", "[db] roster-managed day off (published entry elsewhere in the ISO week) ⇒ row with windows [] (E1 on 13th · E2 on 12th)"),
  D("S3.3", "R6", M, "GREEN", "[db] employee with no published entry in that week ⇒ no row (booking falls back) (E8)"),
  D("S3.4", "R3", C, "RED", "[db] never-published entry ignored: E16 (published 10th, unpublished 12th) ⇒ row [] on 12th"),
  D("S3.5", "R3", C, "RED", "[db] PENDING leave keeps the window (E1 11th + 12th = [540,1080])"),
  D("S3.6", "R4", C, "RED", "[db] approved half-day AM ⇒ [810,1080] (E11) · PM ⇒ [540,810] (E12)"),
  D("S3.7", "R5", C, "RED", "[db] overnight E9: 12th ⇒ [1320,1440] · 13th ⇒ [0,360]"),
  D("S3.8", "R3", M, "RED", "[db] split shift E10 ⇒ [540,720],[1020,1260]"),
  D("S3.9", "R7", C, "RED", "[db] ENDED (E17) and inactive (E18) with a published entry ⇒ row with windows []"),
  D("S3.10", "R8", C, "RED", "[db] branch: entry in u2 ⇒ E20 row [] under u3 and [540,1080] under u2 · unit-null entry (E21) visible under u3"),
  D("S3.11", "R8", C, "GREEN", "[db] other tenant ids / inactive HR system / bad date / empty ids ⇒ []"),
  D("S3.12", "R2", M, "RED", "[db] rows in input order, duplicates once, keys exactly employeeId/windows/breaks"),
  D("S3.13", "R6", C, "RED", "[db] approved give-away swap (H2.3) moves the window: E13 [540,1080]→[] · E14 []→[540,1080]"),
  D("S4.1", "R3", C, "RED", "[db] approved full leave (E1 11th–12th) ⇒ rows with windows [] both days"),
  D("S4.2", "R3", C, "RED", "[db] revoked leave (APPROVED→REJECTED) ⇒ window [540,1080] restored"),
  D("S4.3", "C-2", C, "GREEN", "[db] approved leave ⇒ booking profile onLeave + windows [] · slots of staff A = 0 (C-2 unchanged)"),
  D("S5.1", "R11", C, "RED", "[db] booking staffDayProfiles (hoursSource HR_SHIFT→UNIT_HOURS): A 12th HR_SHIFT [540,1080] · A 13th HR_SHIFT [] · C(E2) 12th HR_SHIFT []"),
  D("S5.2", "R11", M, "GREEN", "[db] booking profile of unrostered staff B(E8) = UNIT_HOURS [480,1320] (fallback as today)"),
  D("S5.3", "R11", C, "RED", "[db] after revoke: booking profile A 12th HR_SHIFT [540,1080] onLeave false"),
  D("S6.1", "R9", C, "RED", "[db] leaveDutyHints(PENDING E1): 2 items, literal entries/others/candidates (weekMin asc, name, id)"),
  D("S6.2", "R9", C, "RED", "[db] leaveDutyHints(APPROVED) = same items · after revoke ⇒ ok, items []"),
  D("S6.3", "C.2", C, "RED", "[db] viewer matrix: owner · manager all · manager u1 · STAFF hr.leave.decide u1 ⇒ ok · manager u2 · payroll · requester · plain · self · other tenant · unknown id ⇒ hintNo (same bytes)"),
  D("S6.4", "C.1", C, "RED", "[db] hint privacy: keys exactly item{entryId date unitId startMin endMin crossesMidnight part others candidates} cand{employeeId name weekMin weekMinAfter} · no reason/type/policy"),
  D("S7.1", "R10", C, "RED", "[db] hr.leave.decided(APPROVED) consumer ⇒ AppNotification to exactly owner, mgrAll, mgrU1, dec1 · title/body literal · 1 audit hr.leave.duty_hint"),
  D("S7.2", "R10", M, "RED", "[db] replay of the APPROVED event + the REJECTED (revoke) event ⇒ no further notification (count stays 4 · audit 1)"),
  D("S7.3", "R13", C, "GREEN", "[db] existing appointments never cancelled: every appointment of the tenant still CONFIRMED after approve, consumer, revoke"),
  D("X1.1", "R13", C, "GREEN", "[race] approve waits on the roster key while a booking is made for that day ⇒ both commit · appointment CONFIRMED + flagged by appointmentsHitByLeave"),
  D("X1.2", "R13", C, "RED", "[race] after that race staffWindows(E1, 12th) = row [] (the booking did not reopen the window)"),
  D("X1.3", "R10", C, "RED", "[race] 2 consumers ∥ direct leaveDutyNotify on one leave ⇒ 4 notifications · 1 audit"),
  D("X12.1", "X12", M, "GREEN", "[run] fitness + fitness-hr without env ⇒ exit 0"),
  D("Z1", "-", C, "GREEN", "residue: qc-hr-h41-* tenants, users, every tenantId table = 0"),
];
const REG = makeRegistry(SUITE, "H4.1-", CHECKS);
const chk = REG.chk;
if (ARGV.includes("--list")) {
  REG.printList();
  process.exit(0);
}

// ═════════════════════════ helpers ═════════════════════════
const code = (p: string) => stripComments(rd(p));
const w = (s: number, e: number) => ({ startMin: s, endMin: e });
const row = (employeeId: string, windows: [number, number][]) => ({ employeeId, windows: windows.map(([s, e]) => w(s, e)), breaks: [] as unknown[] });
const tryRun = async (f: () => unknown): Promise<Any> => {
  try {
    return await f();
  } catch (e) {
    return { __throw: errText(e) };
  }
};
const missing: string[] = [];
const base = baseRef("QC_H41_BASE");
const AV0 = await loadOpt(F.av, "@/lib/modules/hr/availability");
const AR0 = await loadOpt(F.rules, "@/lib/modules/hr/availability-rules");
if (!AV0 && !FORCE) REG.skipExit([`${F.av} absent — H4.1 not built (QC_FORCE=1 to run RED)`]);
const AV: Any = AV0 && !AV0.__err ? AV0 : {};
const AR: Any = AR0 && !AR0.__err ? AR0 : {};
if (!AV0 || AV0.__err) missing.push(modState(AV0, F.av));
if (!AR0 || AR0.__err) missing.push(modState(AR0, F.rules));
const absent = (m: Any, fn: string, file: string) => (typeof m[fn] === "function" ? "" : `∅ ${fn} (${file})`);

// ═════════════════════════ S1 statics ═════════════════════════
console.log("── S1 statics ──");
{
  const src = rd(F.index);
  const c = stripComments(src);
  const r = {
    reexport: /export\s*\{[^}]*\bstaffWindows\b[^}]*\}\s*from\s*["']\.\/availability["']/.test(c),
    noBody: !/function\s+staffWindows\s*\(/.test(c),
    types: /StaffWindowsInput/.test(c) && /StaffWindowsRow/.test(c),
    fields: [code(F.index), code(F.av)].some((t) => /tenantId:\s*string;\s*unitId:\s*string;\s*date:\s*string;\s*employeeIds:\s*string\[\]/.test(t) && /windows:\s*\{\s*startMin:\s*number;\s*endMin:\s*number\s*\}\[\];\s*breaks:\s*\{\s*startMin:\s*number;\s*endMin:\s*number\s*\}\[\]/.test(t)),
    noDb: !/@\/lib\/core\/db|new PrismaClient/.test(c),
  };
  chk("S1.1", Object.values(r).every(Boolean), "re-export · no body · types kept · no db", `failed: ${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "-"}`);
}
{
  const s = code(F.rules);
  const imps = importsOf(rd(F.rules));
  const r = { file: !!s, typeOnly: imps.every((i) => i.type), noDb: !/prisma|tenantDb/.test(s), noClock: !/Date\.now|new Date\(|Math\.random|\basync\b|fetch\(|process\./.test(s), fn: /export\s+function\s+dayWindows\b/.test(s) };
  chk("S1.2", Object.values(r).every(Boolean), "pure dayWindows", `failed: ${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "-"}`);
}
{
  const s = code(F.av);
  const imps = importsOf(rd(F.av)).map((i) => i.spec);
  const other = imps.filter((p) => /^@\/lib\/modules\/(?!hr\b)/.test(p));
  const writes = [...s.matchAll(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g)].map((m) => m[0]);
  const r = { file: !!s, noOtherModule: other.length === 0, writesOnlyNotify: writes.every((x) => x === ".createMany(") && /appNotification\.createMany\(/.test(s), lock: /hr-leave-hint:/.test(s), noRaw: !/\$executeRaw/.test(s) };
  chk("S1.3", Object.values(r).every(Boolean), "boundary · writes · lock", `failed: ${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "-"} ${other.join(",")} ${writes.join(",")}`);
}
chk("S1.4", changedVsBase(base, FROZEN) === "unchanged", "unchanged", `${changedVsBase(base, FROZEN)} (base ${base.slice(0, 9)})`);
chk("S1.5", sha(rd(PAYROLL_RULES_FILE)) === PAYROLL_RULES_SHA, PAYROLL_RULES_SHA.slice(0, 12), sha(rd(PAYROLL_RULES_FILE)).slice(0, 12));
{
  const s = code(F.cons);
  const m = /["']hr\.leave\.decided["']\s*:\s*withAutomation\(([\s\S]{0,600}?)\)\s*,/.exec(s);
  const hunks = diffHunks(base, F.cons) ?? [];
  const removed = hunks.reduce((n, h) => n + h.removed.length, 0);
  const marked = rd(F.cons).includes("HR H4.1");
  const r = { handler: !!m && /leaveDutyNotify/.test(m[1]), marked, removedLe1: removed <= 1, changed: hunks.length > 0 };
  chk("S1.6", Object.values(r).every(Boolean), "consumer → leaveDutyNotify · marked hunk", `failed: ${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "-"} removed=${removed}`);
}
{
  const src = `${rd(F.ui)}\n${rd(F.page)}`;
  const ids = testidsOf(src, "hr-leave-impact");
  const inv = inventoryParity("/hr/leave", new Set([...ids].filter((i) => i.startsWith("hr-leave-impact"))), "H4.1", SUITE);
  const th = flat(jsonOf(F.th)?.hr?.leaveImpact ?? {});
  const en = flat(jsonOf(F.en)?.hr?.leaveImpact ?? {});
  const mp = msgParity(th, en, ["title", "uncovered", "covered", "candidate", "noCandidate"]);
  const tk = tokensOnly(stripComments(src));
  const r = { ids: ids.has("hr-leave-impact") && [...ids].some((i) => i.startsWith("hr-leave-impact-candidate")), inv: inv.rows > 0 && inv.codeNoRow.length === 0 && inv.meta, ...mp, tokens: Object.values(tk).every(Boolean) };
  chk("S1.7", Object.values(r).every(Boolean), "testids · inventory · messages · tokens", `failed: ${Object.entries(r).filter(([, v]) => !v).map(([k]) => k).join(",") || "-"} ids=${[...ids].join(",") || "∅"}`);
}

// ═════════════════════════ S2 pure vectors (literal) ═════════════════════════
console.log("── S2 pure dayWindows ──");
{
  const f = AR.dayWindows;
  const E = (date: string, s: number, e: number, x = false, unitId: string | null = "u3") => ({ date, unitId, startMin: s, endMin: e, crossesMidnight: x });
  const L = (fromDate: string, toDate: string, status = "APPROVED", halfDay: string | null = null, hours: string | null = null) => ({ fromDate, toDate, status, halfDay, hours });
  const run = (day: string, entries: Any[], leaves: Any[] = [], unitId: string | null = "u3") => {
    if (typeof f !== "function") return "∅ dayWindows";
    try {
      return canon(f({ day, unitId, entries, leaves }));
    } catch (e) {
      return `THROW ${errText(e).slice(0, 60)}`;
    }
  };
  const want = (xs: [number, number][]) => canon(xs.map(([s, e]) => w(s, e)));
  const D0 = "2031-03-12", Dm = "2031-03-11", Dp = "2031-03-13";
  const one = [E(D0, 540, 1080)];
  type V = [string, string, string];
  const groups: Record<string, V[]> = {
    "S2.1": [
      ["shift", run(D0, one), want([[540, 1080]])],
      ["pending", run(D0, one, [L(D0, D0, "PENDING")]), want([[540, 1080]])],
      ["rejected", run(D0, one, [L(D0, D0, "REJECTED")]), want([[540, 1080]])],
      ["cancelled", run(D0, one, [L(D0, D0, "CANCELLED")]), want([[540, 1080]])],
      ["approved", run(D0, one, [L(D0, D0)]), want([])],
      ["range", run(D0, one, [L(Dm, Dp)]), want([])],
      ["other day leave", run(D0, one, [L(Dp, Dp)]), want([[540, 1080]])],
      ["bad day", run("2031-02-30", [E("2031-02-30", 540, 1080)]), want([])],
    ],
    "S2.2": [
      ["AM", run(D0, one, [L(D0, D0, "APPROVED", "AM")]), want([[810, 1080]])],
      ["PM", run(D0, one, [L(D0, D0, "APPROVED", "PM")]), want([[540, 810]])],
      ["AM pending", run(D0, one, [L(D0, D0, "PENDING", "AM")]), want([[540, 1080]])],
      ["split AM", run(D0, [E(D0, 540, 720), E(D0, 1020, 1260)], [L(D0, D0, "APPROVED", "AM")]), want([[1020, 1260]])],
      ["split PM", run(D0, [E(D0, 540, 720), E(D0, 1020, 1260)], [L(D0, D0, "APPROVED", "PM")]), want([[540, 720]])],
      ["split", run(D0, [E(D0, 1020, 1260), E(D0, 540, 720)]), want([[540, 720], [1020, 1260]])],
    ],
    "S2.3": [
      ["night D", run(D0, [E(D0, 1320, 360, true)]), want([[1320, 1440]])],
      ["night tail", run(Dp, [E(D0, 1320, 360, true)]), want([[0, 360]])],
      ["tail AM", run(Dp, [E(D0, 1320, 360, true)], [L(D0, D0, "APPROVED", "AM")]), want([[120, 360]])],
      ["tail PM", run(Dp, [E(D0, 1320, 360, true)], [L(D0, D0, "APPROVED", "PM")]), want([[0, 120]])],
      ["night AM on D", run(D0, [E(D0, 1320, 360, true)], [L(D0, D0, "APPROVED", "AM")]), want([])],
      ["night PM on D", run(D0, [E(D0, 1320, 360, true)], [L(D0, D0, "APPROVED", "PM")]), want([[1320, 1440]])],
      ["leave on D keeps D−1 tail", run(Dp, [E(D0, 1320, 360, true)], [L(Dp, Dp)]), want([[0, 360]])],
      ["leave on D−1 drops tail", run(Dp, [E(D0, 1320, 360, true)], [L(D0, D0)]), want([])],
      ["both", run(Dp, [E(D0, 1320, 360, true), E(Dp, 1320, 360, true)]), want([[0, 360], [1320, 1440]])],
    ],
    "S2.4": [
      ["other unit", run(D0, [E(D0, 540, 1080, false, "u2")]), want([])],
      ["unit null", run(D0, [E(D0, 540, 1080, false, null)]), want([[540, 1080]])],
      ["merge", run(D0, [E(D0, 540, 720), E(D0, 720, 900)]), want([[540, 900]])],
      ["hours", run(D0, one, [L(D0, D0, "APPROVED", null, "2.0")]), want([])],
      ["span all units AM", run(D0, [E(D0, 540, 720), E(D0, 1020, 1260, false, "u2")], [L(D0, D0, "APPROVED", "AM")]), want([])],
      ["span all units PM", run(D0, [E(D0, 540, 720), E(D0, 1020, 1260, false, "u2")], [L(D0, D0, "APPROVED", "PM")]), want([[540, 720]])],
    ],
  };
  for (const [id, vs] of Object.entries(groups)) {
    const bad = vs.filter(([, got, exp]) => got !== exp);
    chk(id, bad.length === 0, `${vs.length} literal vectors`, bad.length ? bad.slice(0, 3).map(([n, got, exp]) => `${n}: got ${short(got, 50)} want ${exp}`).join(" | ") : "all");
  }
}

// ═════════════════════════ DB ═════════════════════════
const { P, coreHash } = await qc4Env(SUITE);
const tag = tagOf(String(Date.now()));
const SLUG = `qc-hr-h41-${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
let crashed = "";
const D12 = "2031-03-12", D11 = "2031-03-11", D13 = "2031-03-13", D10 = "2031-03-10";

async function sweepTenantTables(): Promise<void> {
  const tabs = ((await fx.rawRows(`SELECT DISTINCT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'`)) ?? []).map((r: Any) => String(r.t));
  for (let pass = 0; pass < 3; pass++) for (const tid of fx.tenants) for (const t of tabs) if (t !== "Tenant") await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => 0);
}
async function tenantRowsLeft(): Promise<string[]> {
  const tabs = ((await fx.rawRows(`SELECT DISTINCT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'`)) ?? []).map((r: Any) => String(r.t));
  const out: string[] = [];
  for (const tid of fx.tenants) for (const t of tabs) {
    const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
    const n = r ? Number(r[0]?.n ?? 0) : 0;
    if (n) out.push(`${t}=${n}`);
  }
  return out;
}

try {
  const HRF: Any = await import("@/lib/modules/hr");
  const hr: Any = await import("@/lib/modules/hr/service");
  const swap: Any = await import("@/lib/modules/hr/swap");
  const bk: Any = await import("@/lib/modules/booking/service");
  const settings: Any = await import("@/lib/core/settings/service");
  const CONS: Any = ((await import("@/lib/outbox-consumers")) as Any).consumers ?? {};

  // ── tenants / units / system ──
  const TA = await fx.newTenant("-a", `QC H4.1 ${tag} A`);
  const TB = await fx.newTenant("-b", `QC H4.1 ${tag} B`);
  const TC = await fx.newTenant("-c", `QC H4.1 ${tag} C`);
  const u1 = (await P.businessUnit.create({ data: { tenantId: TA, type: "BOOKING", name: `ร้านหนึ่ง ${tag}`, slug: `${SLUG}-u1` } })).id as string;
  const u2 = await fx.newUnit(TA, `สาขาสอง ${tag}`, "u2");
  const u3 = await fx.newUnit(TA, `สาขาสาม ${tag}`, "u3");
  const sA = (await P.appSystem.create({ data: { tenantId: TA, type: "HR", name: "ทีมงาน" } })).id as string;
  const sB = (await P.appSystem.create({ data: { tenantId: TB, type: "HR", name: "ทีมงาน" } })).id as string;
  const sC = (await P.appSystem.create({ data: { tenantId: TC, type: "HR", name: "ทีมงานปิด", active: false } })).id as string;
  const ctxA = { tenantId: TA, systemId: sA };
  // ── users (viewer matrix C.2) ──
  const U: Record<string, Who> = {
    owner: await fx.mkUser(TA, "owner", "เจ้าของ", "OWNER", [], {}),
    mgrAll: await fx.mkUser(TA, "mgrall", "ผู้จัดการทุกสาขา", "MANAGER", [], {}),
    mgrU1: await fx.mkUser(TA, "mgru1", "ผู้จัดการหนึ่ง", "MANAGER", [u1], {}),
    mgrU2: await fx.mkUser(TA, "mgru2", "ผู้จัดการสอง", "MANAGER", [u2], {}),
    dec1: await fx.mkUser(TA, "dec1", "หัวหน้ากะ", "STAFF", [u1], { "hr.leave.decide": true }),
    pay: await fx.mkUser(TA, "pay", "ฝ่ายเงินเดือน", "STAFF", [], { "hr.payroll.read": true }),
    req: await fx.mkUser(TA, "req", "พนักงานยื่นลา", "STAFF", [u1], { "hr.leave.request": true }),
    plain: await fx.mkUser(TA, "plain", "สมาชิกธรรมดา", "STAFF", [], {}),
    self: await fx.mkUser(TA, "self", "พนักงานเอ", "STAFF", [u1], { "hr.leave.request": true }),
    u13: await fx.mkUser(TA, "u13", "พนักงานสิบสาม", "STAFF", [u3], { "hr.leave.request": true }),
    u14: await fx.mkUser(TA, "u14", "พนักงานสิบสี่", "STAFF", [u3], { "hr.leave.request": true }),
    otherOwner: await fx.mkUser(TB, "oth", "เจ้าของร้านอื่น", "OWNER", [], {}),
  };
  // ── employees ──
  const emp = (name: string, unitId: string, o: Any = {}) => fx.mkEmp(TA, sA, name, { startDate: "2029-01-01", unitId, ...o });
  const E: Record<string, string> = {};
  E.e1 = await emp("เอ", u1, { linkedUserId: U.self.id });
  E.e2 = await emp("บี", u1);
  E.e3 = await emp("ซี", u1);
  E.e4 = await emp("ดี", u1);
  E.e5 = await emp("อี", u1, { status: "ENDED", active: false });
  E.e6 = await emp("เอฟ", u2);
  E.e7 = await emp("จี", u2);
  E.e8 = await emp("เอช", u1);
  for (const [k, n] of [["e9", "ไอ"], ["e10", "เจ"], ["e11", "เค"], ["e12", "แอล"], ["e15", "โอ"], ["e16", "พี"], ["e20", "ที"], ["e21", "ยู"]] as const) E[k] = await emp(n, u3);
  E.e13 = await emp("เอ็ม", u3, { linkedUserId: U.u13.id });
  E.e14 = await emp("เอ็น", u3, { linkedUserId: U.u14.id });
  E.e17 = await emp("คิว", u3, { status: "ENDED" });
  E.e18 = await emp("อาร์", u3, { active: false });
  const eB = await fx.mkEmp(TB, sB, "ร้านบี", { startDate: "2029-01-01" });
  const eC = await fx.mkEmp(TC, sC, "ร้านซี", { startDate: "2029-01-01" });
  await P.hrEmployeeUnit.create({ data: { tenantId: TA, systemId: sA, employeeId: E.e7, unitId: u1, fromDate: dbDate("2031-03-01"), toDate: dbDate("2031-03-31") } });
  // ── shifts + published entries ──
  const shift = async (sys: string, tid: string, name: string, s: number, e: number, br: number, x = false) => (await P.hrShift.create({ data: { tenantId: tid, systemId: sys, name, startMin: s, endMin: e, breakMin: br, crossesMidnight: x } })).id as string;
  const S = { m: await shift(sA, TA, "เช้า", 540, 1080, 60), n: await shift(sA, TA, "ดึก", 1320, 360, 0, true), s1: await shift(sA, TA, "แยกเช้า", 540, 720, 0), s2: await shift(sA, TA, "แยกเย็น", 1020, 1260, 0), a: await shift(sA, TA, "บ่าย", 780, 1260, 0) };
  const pub = new Date("2031-03-01T00:00:00Z");
  const ENT: Record<string, string> = {};
  const entry = async (key: string, tid: string, sys: string, employeeId: string, date: string, shiftId: string, unitId: string | null, t: [number, number, number, boolean], published = true) =>
    (ENT[key] = (await P.hrRosterEntry.create({ data: { tenantId: tid, systemId: sys, employeeId, date: dbDate(date), shiftId, unitId, startMin: t[0], endMin: t[1], breakMin: t[2], crossesMidnight: t[3], published, publishedAt: published ? pub : null, source: "MANUAL" } })).id);
  const TM: [number, number, number, boolean] = [540, 1080, 60, false];
  await entry("e1d11", TA, sA, E.e1, D11, S.m, u1, TM);
  await entry("e1d12", TA, sA, E.e1, D12, S.m, u1, TM);
  await entry("e2d10", TA, sA, E.e2, D10, S.m, u1, TM);
  await entry("e2d11", TA, sA, E.e2, D11, S.m, u1, TM);
  await entry("e3d11", TA, sA, E.e3, D11, S.m, u1, TM);
  await entry("e3d12", TA, sA, E.e3, D12, S.a, u1, [780, 1260, 0, false]);
  await entry("e4d12", TA, sA, E.e4, D12, S.m, u1, TM);
  await entry("e5d12", TA, sA, E.e5, D12, S.m, u1, TM);
  await entry("e6d12", TA, sA, E.e6, D12, S.m, u2, TM);
  await entry("e7d10", TA, sA, E.e7, D10, S.m, u1, TM);
  await entry("e9d12", TA, sA, E.e9, D12, S.n, u3, [1320, 360, 0, true]);
  await entry("e10a", TA, sA, E.e10, D12, S.s1, u3, [540, 720, 0, false]);
  await entry("e10b", TA, sA, E.e10, D12, S.s2, u3, [1020, 1260, 0, false]);
  await entry("e11d12", TA, sA, E.e11, D12, S.m, u3, TM);
  await entry("e12d12", TA, sA, E.e12, D12, S.m, u3, TM);
  await entry("e13d12", TA, sA, E.e13, D12, S.m, u3, TM);
  await entry("e14d10", TA, sA, E.e14, D10, S.a, u3, [780, 1260, 0, false]);
  await entry("e15d12", TA, sA, E.e15, D12, S.m, u3, TM);
  await entry("e16d10", TA, sA, E.e16, D10, S.m, u3, TM);
  await entry("e16d12", TA, sA, E.e16, D12, S.a, u3, [780, 1260, 0, false], false);
  await entry("e17d12", TA, sA, E.e17, D12, S.m, u3, TM);
  await entry("e18d12", TA, sA, E.e18, D12, S.m, u3, TM);
  await entry("e20d10", TA, sA, E.e20, D10, S.m, u3, TM);
  await entry("e20d12", TA, sA, E.e20, D12, S.m, u2, TM);
  await entry("e21d12", TA, sA, E.e21, D12, S.m, null, TM);
  const shB = await shift(sB, TB, "เช้า", 540, 1080, 60);
  const shC = await shift(sC, TC, "เช้า", 540, 1080, 60);
  await entry("eB", TB, sB, eB, D12, shB, null, TM);
  await entry("eC", TC, sC, eC, D12, shC, null, TM);
  await P.hrHoliday.create({ data: { tenantId: TA, systemId: sA, unitId: u3, date: dbDate(D12), name: "วันหยุดร้าน", kind: "SHOP", shopOpen: false } });
  const pol = (await P.hrLeavePolicy.create({ data: { tenantId: TA, systemId: sA, category: "PERSONAL", name: "ลากิจทดสอบ", quotaDays: null, allowHalfDay: true, allowHours: true } })).id as string;
  // ── booking (u1) ──
  const svcB = (await P.bookingService.create({ data: { tenantId: TA, unitId: u1, name: "ตัดผม", durationMin: 60, priceSatang: 0 } })).id as string;
  await P.bookingHours.createMany({ data: Array.from({ length: 7 }, (_, wd) => ({ tenantId: TA, unitId: u1, weekday: wd, openMin: 480, closeMin: 1320, closed: false })) });
  const stA = (await P.bookingStaff.create({ data: { tenantId: TA, unitId: u1, name: "ช่างเอ", employeeId: E.e1 } })).id as string;
  const stB = (await P.bookingStaff.create({ data: { tenantId: TA, unitId: u1, name: "ช่างเอช", employeeId: E.e8 } })).id as string;
  const stC = (await P.bookingStaff.create({ data: { tenantId: TA, unitId: u1, name: "ช่างบี", employeeId: E.e2 } })).id as string;
  const setR = await tryRun(() => settings.setSettings({ ...vOf(U.owner), unitAccess: ["*"] }, { tenantId: TA }, [stA, stB, stC].map((id) => ({ key: "booking.staff.hoursSource", scope: "STAFF", scopeId: id, value: ["HR_SHIFT", "UNIT_HOURS"] }))));
  if (!setR?.ok) console.log(`  ⚠ setSettings hoursSource: ${short(setR, 160)}`);
  const prof = async (day: string) => {
    const ps = (await tryRun(() => bk.staffDayProfiles({ tenantId: TA, unitId: u1 }, day))) as Any;
    const by = (id: string) => (Array.isArray(ps) ? ps.find((p: Any) => p.staffId === id) : null);
    return { by, raw: ps };
  };
  const pv = (p: Any) => (p ? canon({ source: p.source, windows: p.windows, onLeave: p.onLeave }) : "∅");
  const pw = (source: string, xs: [number, number][], onLeave = false) => canon({ source, windows: xs.map(([s, e]) => w(s, e)), onLeave });

  const swOf = async (tenantId: string, unitId: string, date: string, ids: string[]) => {
    const r = await tryRun(() => HRF.staffWindows({ tenantId, unitId, date, employeeIds: ids }));
    return r?.__throw ? `THROW ${r.__throw}` : canon(r);
  };
  const sw = (unitId: string, date: string, ids: string[]) => swOf(TA, unitId, date, ids);
  const eq = (id: string, got: string, want: unknown) => chk(id, got === canon(want), canon(want), got);
  const multi = (id: string, parts: [string, string, unknown][]) => {
    const bad = parts.filter(([, got, want]) => got !== canon(want));
    chk(id, bad.length === 0, `${parts.length} literal cases`, bad.length ? bad.map(([n, got, want]) => `${n}: got ${short(got, 70)} want ${canon(want)}`).join(" | ") : "all");
  };

  // ── leaves (setup): E4 full 12th approved · E11 AM · E12 PM ──
  const reqLeave = async (employeeId: string, from: string, to: string, extra: Any = {}) => (await hr.requestLeave(ctxA, { employeeId, type: "PERSONAL", fromDate: from, toDate: to, policyId: pol, ...extra })).id as string;
  const L4 = await reqLeave(E.e4, D12, D12);
  await hr.decideLeave(ctxA, L4, "APPROVED", U.owner.id);
  const L11 = await reqLeave(E.e11, D12, D12, { halfDay: "AM" });
  await hr.decideLeave(ctxA, L11, "APPROVED", U.owner.id);
  const L12 = await reqLeave(E.e12, D12, D12, { halfDay: "PM" });
  await hr.decideLeave(ctxA, L12, "APPROVED", U.owner.id);
  const L1 = await reqLeave(E.e1, D11, D12, { reason: "งานแต่งพี่สาวที่เชียงใหม่", actorUserId: U.self.id });

  // ═══ S3 staffWindows ═══
  console.log("── S3 staffWindows ──");
  multi("S3.1", [["E1 12th pending", await sw(u1, D12, [E.e1]), [row(E.e1, [[540, 1080]])]], ["E15 holiday", await sw(u3, D12, [E.e15]), [row(E.e15, [[540, 1080]])]]]);
  multi("S3.2", [["E1 13th", await sw(u1, D13, [E.e1]), [row(E.e1, [])]], ["E2 12th", await sw(u1, D12, [E.e2]), [row(E.e2, [])]]]);
  eq("S3.3", await sw(u1, D12, [E.e8]), []);
  eq("S3.4", await sw(u3, D12, [E.e16]), [row(E.e16, [])]);
  multi("S3.5", [["11th", await sw(u1, D11, [E.e1]), [row(E.e1, [[540, 1080]])]], ["12th", await sw(u1, D12, [E.e1]), [row(E.e1, [[540, 1080]])]]]);
  multi("S3.6", [["AM", await sw(u3, D12, [E.e11]), [row(E.e11, [[810, 1080]])]], ["PM", await sw(u3, D12, [E.e12]), [row(E.e12, [[540, 810]])]]]);
  multi("S3.7", [["12th", await sw(u3, D12, [E.e9]), [row(E.e9, [[1320, 1440]])]], ["13th", await sw(u3, D13, [E.e9]), [row(E.e9, [[0, 360]])]]]);
  eq("S3.8", await sw(u3, D12, [E.e10]), [row(E.e10, [[540, 720], [1020, 1260]])]);
  eq("S3.9", await sw(u3, D12, [E.e17, E.e18]), [row(E.e17, []), row(E.e18, [])]);
  multi("S3.10", [["u3", await sw(u3, D12, [E.e20]), [row(E.e20, [])]], ["u2", await sw(u2, D12, [E.e20]), [row(E.e20, [[540, 1080]])]], ["null unit", await sw(u3, D12, [E.e21]), [row(E.e21, [[540, 1080]])]]]);
  multi("S3.11", [
    ["TA ids in TB", await swOf(TB, u3, D12, [E.e10]), []],
    ["TB ids in TA", await sw(u3, D12, [eB]), []],
    ["inactive system", await swOf(TC, u3, D12, [eC]), []],
    ["bad date", await sw(u3, "2031-02-30", [E.e10]), []],
    ["empty ids", await sw(u3, D12, []), []],
  ]);
  {
    const got = await sw(u3, D12, [E.e11, E.e10, E.e11]);
    const raw = (await tryRun(() => HRF.staffWindows({ tenantId: TA, unitId: u3, date: D12, employeeIds: [E.e11] }))) as Any;
    const keysOk = Array.isArray(raw) && raw.length === 1 && Object.keys(raw[0]).sort().join(",") === "breaks,employeeId,windows";
    chk("S3.12", got === canon([row(E.e11, [[810, 1080]]), row(E.e10, [[540, 720], [1020, 1260]])]) && keysOk, "E11 then E10 · once · exact keys", `${short(got, 120)} keys=${keysOk}`);
  }
  {
    const before = await sw(u3, D12, [E.e13, E.e14]);
    const rq = await tryRun(() => swap.requestSwap(ctxA, vOf(U.u13), { fromEntryId: ENT.e13d12, targetEmployeeId: E.e14 }));
    const rp = rq?.ok ? await tryRun(() => swap.respondSwap(ctxA, vOf(U.u14), rq.id, { accept: true })) : null;
    const dc = rq?.ok ? await tryRun(() => swap.decideSwap(ctxA, vOf(U.owner), rq.id, { decision: "APPROVED" })) : null;
    const after = await sw(u3, D12, [E.e13, E.e14]);
    const okB = before === canon([row(E.e13, [[540, 1080]]), row(E.e14, [])]);
    const okA = after === canon([row(E.e13, []), row(E.e14, [[540, 1080]])]);
    chk("S3.13", okB && okA && dc?.status === "APPROVED", "before E13 [540,1080] E14 [] · swap APPROVED · after E13 [] E14 [540,1080]", `before ${short(before, 90)} · swap ${short(rq, 40)}/${short(rp, 30)}/${short(dc?.status ?? dc, 30)} · after ${short(after, 90)}`);
  }

  // ═══ S5 booking profiles (pending) ═══
  console.log("── S5 booking profiles ──");
  const p12 = await prof(D12);
  const p13 = await prof(D13);
  multi("S5.1", [["A 12th", pv(p12.by(stA)), JSON.parse(pw("HR_SHIFT", [[540, 1080]]))], ["A 13th", pv(p13.by(stA)), JSON.parse(pw("HR_SHIFT", []))], ["C 12th", pv(p12.by(stC)), JSON.parse(pw("HR_SHIFT", []))]]);
  eq("S5.2", pv(p12.by(stB)), JSON.parse(pw("UNIT_HOURS", [[480, 1320]])));

  // ═══ S6 hints (pending) ═══
  console.log("── S6 duty hints ──");
  const hintFn = absent(AV, "leaveDutyHints", F.av);
  const hint = async (who: Who | null, leaveId: string, ctx: Any = ctxA) => (hintFn ? { __absent: hintFn } : await tryRun(() => AV.leaveDutyHints(ctx, who ? vOf(who) : null, { leaveId })));
  const cand = (e: string, name: string, weekMin: number) => ({ employeeId: e, name, weekMin, weekMinAfter: weekMin + 480 });
  const ITEMS = [
    { entryId: ENT.e1d11, date: D11, unitId: u1, startMin: 540, endMin: 1080, crossesMidnight: false, part: "FULL", others: 2, candidates: [cand(E.e4, "ดี", 0), cand(E.e8, "เอช", 0), cand(E.e7, "จี", 480)] },
    { entryId: ENT.e1d12, date: D12, unitId: u1, startMin: 540, endMin: 1080, crossesMidnight: false, part: "FULL", others: 0, candidates: [cand(E.e8, "เอช", 0), cand(E.e7, "จี", 480), cand(E.e2, "บี", 960)] },
  ];
  const hPend = await hint(U.owner, L1);
  chk("S6.1", canon(hPend) === canon({ ok: true, items: ITEMS }), canon({ ok: true, items: ITEMS }).slice(0, 160), short(hPend, 400));
  {
    const ok = ["owner", "mgrAll", "mgrU1", "dec1"];
    const no = ["mgrU2", "pay", "req", "plain", "self"];
    const bad: string[] = [];
    for (const k of ok) {
      const r = await hint(U[k], L1);
      if (!(r?.ok === true && Array.isArray(r.items) && r.items.length === 2)) bad.push(`${k}=${short(r, 60)}`);
    }
    const noR = [...(await Promise.all(no.map((k) => hint(U[k], L1)))), await hint(U.otherOwner, L1, { tenantId: TB, systemId: sB }), await hint(U.owner, "cnotarealleaveidqqqqqqqqq")];
    noR.forEach((r, i) => {
      if (canon(r) !== canon({ ok: false, reason: HINT_NO })) bad.push(`${[...no, "otherTenant", "unknownId"][i]}=${short(r, 60)}`);
    });
    chk("S6.3", bad.length === 0, "4 ok · 7 identical hintNo", bad.join(" | ") || "all");
  }
  {
    const ks = keysDeep(hPend);
    const allowed = new Set(["ok", "items", "entryId", "date", "unitId", "startMin", "endMin", "crossesMidnight", "part", "others", "candidates", "employeeId", "name", "weekMin", "weekMinAfter"]);
    const extra = [...ks].filter((k) => !allowed.has(k));
    const txt = JSON.stringify(hPend ?? {});
    const leak = ["งานแต่ง", "PERSONAL", "ลากิจทดสอบ"].filter((s) => txt.includes(s));
    chk("S6.4", hPend?.ok === true && extra.length === 0 && leak.length === 0, "exact keys · no reason/type/policy", `ok=${hPend?.ok} extra=${extra.join(",") || "-"} leak=${leak.join(",") || "-"} ${short(hPend, 60)}`);
  }

  // ═══ X1 race: approve L1 waits on the roster key while a booking is made ═══
  console.log("── X1 race ──");
  let apptId = "";
  const race = await underRosterLock(P, sA, { employeeId: E.e1, date: D11 }, () => tryRun(() => hr.decideLeave(ctxA, L1, "APPROVED", U.owner.id)), {
    whileWaiting: async () => {
      const r = await bk.createAppointment({ tenantId: TA, unitId: u1, serviceId: svcB, staffId: stA, dateStr: D12, startMin: 660, customerName: "ลูกค้าเดิม", customerPhone: "0800000041", idempotencyKey: `${SLUG}-a1` });
      apptId = r?.ok ? r.id : `refused:${short(r, 80)}`;
    },
  });
  {
    const l = await P.hrLeave.findUnique({ where: { id: L1 }, select: { status: true } });
    const ap = apptId.startsWith("c") ? await P.appointment.findUnique({ where: { id: apptId }, include: { staff: true } }) : null;
    const hit = ap ? await bk.appointmentsHitByLeave(TA, [ap]) : new Set();
    chk("X1.1", race.waited && !race.res?.__throw && l?.status === "APPROVED" && ap?.status === "CONFIRMED" && hit.has(apptId), "waited · APPROVED · appointment CONFIRMED + flagged", `waited=${race.waited} res=${short(race.res, 60)} leave=${l?.status} appt=${ap?.status ?? apptId} flagged=${hit.has(apptId)} ${race.holderErr}${race.sideErr}`);
  }
  eq("X1.2", await sw(u1, D12, [E.e1]), [row(E.e1, [])]);
  multi("S4.1", [["11th", await sw(u1, D11, [E.e1]), [row(E.e1, [])]], ["12th", await sw(u1, D12, [E.e1]), [row(E.e1, [])]]]);
  {
    const p = (await prof(D12)).by(stA);
    const slots = await tryRun(() => bk.getAvailableSlots(TA, u1, svcB, stA, D12));
    chk("S4.3", p?.onLeave === true && canon(p?.windows) === canon([]) && Array.isArray(slots) && slots.length === 0, "onLeave · [] · 0 slots", `${pv(p)} slots=${Array.isArray(slots) ? slots.length : short(slots, 40)}`);
  }
  {
    const r = await hint(U.mgrU1, L1);
    chk("S6.2", canon(r) === canon({ ok: true, items: ITEMS }), "APPROVED = same items", short(r, 200));
  }

  // ═══ S7 notify via the hr.leave.decided consumer ═══
  console.log("── S7 notify ──");
  const evOf = async (leaveId: string, status: string) => P.outboxEvent.findFirst({ where: { tenantId: TA, type: "hr.leave.decided", idempotencyKey: `hr.leave.decided#${leaveId}#${status}` } });
  const notes = async () => P.appNotification.findMany({ where: { tenantId: TA, title: N_TITLE }, select: { recipientUserId: true, body: true } });
  const audits = async (leaveId: string) => P.auditLog.count({ where: { tenantId: TA, action: "hr.leave.duty_hint", targetId: leaveId } });
  const consume = async (ev: Any) => (ev && typeof CONS["hr.leave.decided"] === "function" ? tryRun(() => CONS["hr.leave.decided"](ev)) : "∅ event/consumer");
  const ev1 = await evOf(L1, "APPROVED");
  const notifyFn = absent(AV, "leaveDutyNotify", F.av);
  await Promise.all([consume(ev1), consume(ev1), notifyFn ? Promise.resolve() : tryRun(() => AV.leaveDutyNotify({ tenantId: TA, systemId: sA, leaveId: L1 }))]);
  {
    const ns = await notes();
    chk("X1.3", ns.length === 4 && (await audits(L1)) === 1, "4 notifications · 1 audit", `notes=${ns.length} audits=${await audits(L1)} ev=${!!ev1} ${notifyFn}`);
  }
  await consume(ev1);
  {
    const ns = await notes();
    const rc = ns.map((n: Any) => n.recipientUserId).sort().join(",");
    const want = [U.owner.id, U.mgrAll.id, U.mgrU1.id, U.dec1.id].sort().join(",");
    chk("S7.1", rc === want && ns.every((n: Any) => n.body === N_BODY_1) && (await audits(L1)) === 1, `recipients owner,mgrAll,mgrU1,dec1 · body "${N_BODY_1}"`, `n=${ns.length} recipientsOk=${rc === want} bodies=${short([...new Set(ns.map((n: Any) => n.body))], 120)} audits=${await audits(L1)}`);
  }
  // ═══ revoke ═══
  const rv = await tryRun(() => hr.decideLeave(ctxA, L1, "REJECTED", U.owner.id, { from: "APPROVED" }));
  multi("S4.2", [["11th", await sw(u1, D11, [E.e1]), [row(E.e1, [[540, 1080]])]], ["12th", await sw(u1, D12, [E.e1]), [row(E.e1, [[540, 1080]])]]]);
  eq("S5.3", pv((await prof(D12)).by(stA)), JSON.parse(pw("HR_SHIFT", [[540, 1080]])));
  {
    const r = await hint(U.owner, L1);
    const ok62 = canon(r) === canon({ ok: true, items: [] });
    if (!ok62) console.log(`  · S6.2 (revoked) ${short(r, 120)} · revoke=${short(rv, 60)}`);
    const prev = REG.results.get("H4.1-S6.2");
    if (prev) chk("S6.2", prev.ok && ok62, "APPROVED = same items · revoked ⇒ []", `${prev.ok ? "approved ok" : prev.actual.slice(0, 80)} · revoked ${short(r, 80)}`);
  }
  await consume(await evOf(L1, "REJECTED"));
  await consume(ev1);
  {
    const ns = await notes();
    chk("S7.2", ns.length === 4 && (await audits(L1)) === 1, "count stays 4 · 1 audit", `notes=${ns.length} audits=${await audits(L1)}`);
  }
  {
    const all = await P.appointment.findMany({ where: { tenantId: TA }, select: { id: true, status: true } });
    chk("S7.3", all.length === 1 && all.every((a: Any) => a.status === "CONFIRMED"), "1 appointment · CONFIRMED", short(all, 120));
  }
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  const nf = await fitnessNoEnv().catch((e: unknown) => ({ ok: false, note: errText(e) }));
  chk("X12.1", nf.ok, "exit 0 both", nf.note);
  try {
    await sweepTenantTables();
    await cleanupFx(P, fx, SLUG);
    const res = await residueOf(P, fx, SLUG, "qc-hr-h41-");
    const left = await tenantRowsLeft();
    chk("Z1", res.length === 0 && left.length === 0, "none", [...res, ...left].join(",") || "none");
  } catch (e) {
    chk("Z1", false, "none", `cleanup error ${errText(e)}`);
  }
  await P.$disconnect().catch(() => {});
}
process.exit(REG.finish({ forced: FORCE, crashed, missing }));
