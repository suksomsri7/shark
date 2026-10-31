// QC — SVC B.15 · คู่รัก/กลุ่ม (1 การจอง = หลายงาน · groupId) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.15.md (§3 สัญญา · §4 กติกาด่านกลุ่ม · §5 ล็อก · §8 ค่าเริ่มที่ผู้เขียนข้อสอบเลือก) · ledger/SVC-MASTER-PLAN.md แถว B.15
//        ledger/DESIGN-BOOKING-QUEUE.md R7 · §4.4 · ภาคผนวก ก #15 #33–37 · ใบ B.13 §3–§5 (+ /root/svc-runs/fix/b13.md Q1–Q19) · ใบ B.8 §3 · ใบ B.3/B.4/B.7
//
// กลุ่มข้อ:
//   T   สัญญา: group.ts มี export ครบ · คีย์ booking.service.staffCount (#15 มีแล้ว · ค่าเริ่ม 1)
//   PL  ตัววางคิว pure + groupId: เริ่มพร้อมกันเมื่อคนหนึ่งช้า · ดึงเร็วเฉพาะมาครบ · ห้องของกลุ่มนับต่อแถว (ตัวควบคุม) · คนที่ถูกปล่อยไม่ถ่วงคนที่มา
//   FZ  fuzz (ค่าเริ่ม 2 000 ชุด): กลุ่มขนาด 1 = ไม่ส่ง groupId ทุกไบต์ · เริ่มพร้อมกัน + ความจุ + หมอไม่ซ้อน · deterministic · PERF (p95 < 50 ms เกณฑ์ B.2)
//   S   bookGroup/findGroupSlots: ได้ครบหรือไม่ได้เลย (หมอ · ห้องที่เหลือที่เดียว) · ห้องเดียวไม่แยก · ใครก็ได้ไม่ซ้ำ · ขนาด/ข้อมูลผิด · ยิงซ้ำ · staffCount 2 · ด่านเดียว (หาเวลา = จอง) · X1
//   CX  ยกเลิกทั้งกลุ่ม (อะตอมมิก · ซ้ำ = ไม่ยิงซ้ำ · มีคนกำลังทำ ⇒ ไม่แตะใคร · X1 · ร้านยกเลิกรายคน)
//   RS  เลื่อนทั้งกลุ่ม (ไม่นับตัวเอง · หมอ/ห้องชน ⇒ ไม่ขยับใคร · เลื่อนรายคน ⇒ GROUP · ลูกค้าเลื่อนผ่านหัวกลุ่ม)
//   CI  มาไม่พร้อมกัน (เช็กอินรายคน · กลุ่มยังถือห้อง · เช็กอินเบอร์ = ทั้งกลุ่ม) · DB-1 ตัววางคิวเลื่อนกลุ่มพร้อมกัน ⇒ ฐานนับช่วงถือนิยามเดียวกัน
//   D   มัดจำรวม (ยอด = Σ ต่อแถวทุกสตางค์ · จ่ายครั้งเดียว · ใบรับต่อแถว · หมดเวลา = ทั้งกลุ่ม · คืน/ริบ Σ floor ต่อแถว · GL สมดุล)
//   X   ยิงพร้อมกัน 5 โพรเซส (≥10 คำขอ/ฉาก): กลุ่ม×10 ⇒ 1 · กลุ่ม∥เดี่ยว ⇒ ไม่มีครึ่งกลุ่ม · เลื่อน∥จอง · ยกเลิก×10 · ยืนยันมัดจำ∥หมดเวลา · deadlock ของฐาน = 0
//   X8  PDPA: payload outbox ของร้านทดสอบไม่มีชื่อ/เบอร์ · SF ไฟล์ (accept-time) · G regression · Z ล้าง
//
// เวลา: วันอนาคตคงที่ (วันไทย +5…+30) + `now` ฉีดเข้า (ทางที่รับ now) · ร้านทดสอบ slug `qc-svc-b15-*` ลบใน finally (+ กวาดค้างตอนเริ่ม)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.15.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน · QC_B15_FUZZ_N=<n> เปลี่ยนจำนวน fuzz — รับใบใช้ค่าเริ่ม)
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { svcQcHostMark } from "./svc-qc-hosts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.15";
const BASE_SHA = "698cd1e4"; // tip session/svc ตอนเขียนข้อสอบ (B.13 merge)
const F = {
  group: "src/lib/modules/booking/group.ts",
  service: "src/lib/modules/booking/service.ts",
  line: "src/lib/modules/booking/queue-line.ts",
  online: "src/lib/modules/booking/online.ts",
  deposit: "src/lib/modules/booking/deposit.ts",
  planner: "src/lib/modules/booking/planner.ts",
  run: "src/lib/modules/booking/planner-run.ts",
  res: "src/lib/modules/booking/resources.ts",
  index: "src/lib/modules/booking/index.ts",
};
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B15_NO_REGRESSION === "1";
const FUZZ_N = Math.max(50, Number(process.env.QC_B15_FUZZ_N ?? 2000) || 2000);

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  let hn = "";
  try { hn = new URL(process.env[n] ?? "").hostname; } catch { /* ว่าง ⇒ หยุดด้านล่าง */ }
  if (!hn.startsWith(svcQcHostMark())) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน qc-svc (${svcQcHostMark()}) — หยุด`); process.exit(4); }
}
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }
if (process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type BookingChannel = "ONLINE" | "LINE" | "STAFF" | "PHONE";
type MemberIn = { serviceId: string; staffId: string | null };
type GroupBookInput = { members: MemberIn[]; dateStr: string; startMin: number; channel: BookingChannel; customerName: string; customerPhone: string; note?: string; idempotencyKey?: string; partyId?: string };
type GroupBookResult =
  | { ok: true; groupId: string; ids: string[]; staffIds: string[]; status: "PENDING" | "CONFIRMED"; holdUntil: Date | null; depositSatang: number }
  | { ok: false; code: string; reason: string };
type GroupSlot = { startMin: number; hhmm: string; staffIds: string[] };
type DepInfo = { state: string; requiredSatang: number; paidSatang: number; usedSatang: number; forfeitedSatang: number; refundedSatang: number; refundDueSatang: number };
type GroupMember = { appointmentId: string; staffId: string; serviceId: string; status: string; startAt: Date; resourceIds: string[]; leader: boolean; deposit: DepInfo | null };
type GroupDeposit = { requiredSatang: number; paidSatang: number; usedSatang: number; forfeitedSatang: number; refundedSatang: number; refundDueSatang: number };
type GroupView = { groupId: string; unitId: string; members: GroupMember[]; deposit: GroupDeposit };
type GroupOpResult = { ok: true; ids: string[] } | { ok: false; code: string; reason: string };
type GroupApi = {
  bookGroup?: (ctx: Ctx, i: GroupBookInput) => Promise<GroupBookResult>;
  findGroupSlots?: (ctx: Ctx, q: { members: MemberIn[]; dateStr: string; channel: BookingChannel }, opts?: { now?: Date; excludeGroupId?: string }) => Promise<GroupSlot[]>;
  groupOf?: (ctx: Ctx, idOrGroupId: string) => Promise<GroupView | null>;
  cancelGroup?: (ctx: Ctx, groupId: string, opts?: { now?: Date; note?: string }) => Promise<GroupOpResult>;
  rescheduleGroup?: (ctx: Ctx, groupId: string, to: { dateStr: string; startMin: number }, opts?: { now?: Date }) => Promise<GroupOpResult>;
};
// ของ B.3/B.4/B.7/B.8/B.13 (มีแล้ว)
type BookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: BookingChannel; customerName: string; customerPhone: string; note?: string; idempotencyKey?: string };
type BookResult = { ok: true; id: string; staffId: string; status: "PENDING" | "CONFIRMED"; holdUntil: Date | null; groupId?: string } | { ok: false; code: string; reason: string };
type BookingApi = {
  bookAppointment: (ctx: Ctx, i: BookInput) => Promise<BookResult>;
  rescheduleBySelf: (ctx: Ctx, id: string, to: { dateStr: string; startMin: number; staffId: string | null }, opts?: { now?: Date }) => Promise<{ ok: true; startAt: Date } | { ok: false; code: string; reason: string }>;
  expireDepositHolds: (now: Date) => Promise<{ expired: number }>;
};
type JobResult = { ok: true } | { ok: false; code: string; reason: string };
type CheckInRes = { ok: true; appointmentId: string; ticketId: string; asWalkIn: boolean } | { ok: false; code: string; reason: string };
type LineApi = {
  checkIn: (ctx: Ctx, by: { appointmentId: string } | { phone: string }, opts: { via: "STAFF" | "PHONE"; now?: Date }) => Promise<CheckInRes>;
  rescheduleByShop: (ctx: Ctx, id: string, to: { dateStr: string; startMin: number; staffId?: string }, opts?: { now?: Date }) => Promise<JobResult>;
  cancelByShop: (ctx: Ctx, id: string, opts?: { now?: Date; note?: string }) => Promise<JobResult>;
};
type RunApi = { runPlanner: (ctx: { tenantId: string; unitId: string }, opts?: { now?: Date }) => Promise<{ ran: boolean; planned: number }> };
type ShopCtx = { tenantId: string; actorUserId: string };
type DepositApi = {
  loadDepositPay: (token: unknown, opts?: { now?: Date; ip?: string }) => Promise<{ ok: true; pay: { state: string; amountSatang: number; holdUntilMs: number | null } } | { ok: false; code: string }>;
  confirmDepositByShop: (ctx: ShopCtx, input: { unitId: string; appointmentId: string; payType?: "PROMPTPAY" | "TRANSFER" | "CASH" }) => Promise<{ ok: boolean; code?: string; reason?: string; duplicated?: boolean }>;
  refundDepositByShop: (ctx: ShopCtx, input: { unitId: string; appointmentId: string; reason: string }) => Promise<{ ok: boolean; code?: string; reason?: string }>;
};
type OnlineApi = {
  manageLinkFor: (ctx: Ctx, appointmentId: string) => Promise<string | null>;
  cancelOnline: (token: unknown, opts?: { now?: Date; ip?: string; acceptForfeit?: boolean; acceptForfeitSatang?: number }) => Promise<{ ok: true } | { ok: false; code: string; reason: string }>;
  lateForfeitSatangOf: (ctx: Ctx, appointmentId: string) => Promise<number>;
};
type SetRes = { ok: boolean; code?: string; issues?: unknown };
type SettingDefLite = { key: string; chain: readonly string[]; labelTh: string; defaults: Record<string, unknown> };
type SettingsApi = {
  setSettings: (actor: Actor, ctx: { tenantId: string }, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<SetRes>;
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<SetRes>;
  getDef: (key: string) => SettingDefLite | undefined;
};
type SysApi = { createSystem: (t: string, kind: string, name: string) => Promise<{ id: string }>; linkUnit: (t: string, systemId: string, unitId: string) => Promise<unknown> };
type AccApi = { saveSettings: (t: string, systemId: string, s: Record<string, unknown>) => Promise<unknown> };
type GlApi = { ensureAccounting: (i: { tenantId: string; systemId: string }) => Promise<unknown> };
type ConsApi = { consumers?: Record<string, (e: { id: string; tenantId: string; type: string; payload: unknown; unitId: string | null; systemId: null }) => Promise<void>> };

// ── ตัววางคิว (B.2 + B.13 + ส่วนขยาย B.15 §3.6) ──
type PlanSettings = {
  queueOrder: "SINGLE_LINE" | "APPOINTMENT_FIRST"; backfill: boolean; safetyBeforeBookingMin: number; graceMin: number; noShowAfterMin: number;
  lateAction: "RELEASE" | "HOLD"; priorityEnabled: boolean; walkInMaxWaitMin: number; overrunExtendMin: number; minBreakMin: number; maxJobsPerDay: number | null;
};
type PlanStaff = { id: string; name: string; sortOrder: number; windows: { startAt: number; endAt: number }[]; services: { serviceId: string; durationMin?: number }[] | null };
type PlanService = { id: string; name: string; durationMin: number; bufferAfterMin: number; resourceKinds?: string[] };
type PlanResource = { id: string; kind: string; name: string; sortOrder: number; capacity: number; cleanupMin: number; blocks: { startAt: number; endAt: number }[] };
type PlanJob = {
  id: string; label: string; kind: "BOOKED" | "WALKIN"; status: string; serviceId: string; durationMin?: number; assignMode: "SPECIFIC" | "ANY"; staffId: string | null;
  startAt: number | null; issuedAt: number; checkedInAt: number | null; startedAt: number | null; priority: boolean; resourceIds?: string[]; groupId?: string;
};
type PlanInput = { now: number; settings: PlanSettings; staff: PlanStaff[]; services: PlanService[]; jobs: PlanJob[]; resources?: PlanResource[] };
type PlannedJob = { jobId: string; kind: "BOOKED" | "WALKIN"; staffId: string | null; startAt: number | null; endAt: number | null; state: string; reason: string; resourceIds: string[]; resourceShort: boolean };
type Plan = { now: number; jobs: PlannedJob[]; line: string[] };
type PlannerApi = { planDay: (i: PlanInput) => Plan };

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 260) ?? String(v); } catch { return String(v); } };
const ok = (cond: boolean, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => { if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`); };
const record = (id: string, name: string, res: Res, why: string, sev: Sev) => {
  cks.push({ id, res, sev, why });
  const icon = res === "PASS" ? "✅" : res === "FAIL" ? "❌" : "⏭️ ";
  console.log(`  ${icon} [${id}] ${name}${res !== "PASS" && why ? ` — ${res === "SKIP" ? "SKIP: " : ""}${why}` : ""}`);
};
const st = async (id: string, name: string, fn: () => unknown | Promise<unknown>, sev: Sev = "CRITICAL") => {
  try { await fn(); record(id, name, "PASS", "", sev); } catch (e) { record(id, name, "FAIL", errMsg(e), sev); }
};
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => record(id, name, "SKIP", why, sev);
const tryImport = async <T,>(spec: string): Promise<{ mod: T | null; err: string }> => {
  try { return { mod: (await import(spec)) as T, err: "" }; } catch (e) { return { mod: null, err: errMsg(e) }; }
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MIN = 60_000;
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * MIN; };
const at = (ds: string, min: number): Date => new Date(bkkMs(ds, min));
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const HM = (ms: number | null | undefined): string => (ms == null ? "null" : new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const src = (rel: string) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

// ═══════════════ โหลดโมดูล (spec ไม่ใช่ literal — ไฟล์ของใบยังไม่มีได้) ═══════════════
const loadIf = async <T,>(rel: string, spec: string) => (existsSync(join(ROOT, rel)) ? tryImport<T>(spec) : { mod: null as T | null, err: `ยังไม่มีไฟล์ «${rel}»` });
const groupLoad = await loadIf<GroupApi>(F.group, "@/lib/modules/booking/group");
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const lineLoad = await tryImport<LineApi>("@/lib/modules/booking/queue-line");
const runLoad = await tryImport<RunApi>("@/lib/modules/booking/planner-run");
const plannerLoad = await tryImport<PlannerApi>("@/lib/modules/booking/planner");
const depLoad = await tryImport<DepositApi>("@/lib/modules/booking/deposit");
const onlineLoad = await tryImport<OnlineApi>("@/lib/modules/booking/online");
const fnOf = <Fn,>(load: { mod: unknown; err: string }, name: string, rel: string): Fn => {
  const f = (load.mod as Record<string, unknown> | null)?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as Fn;
};
const GR = {
  book: () => fnOf<NonNullable<GroupApi["bookGroup"]>>(groupLoad, "bookGroup", F.group),
  slots: () => fnOf<NonNullable<GroupApi["findGroupSlots"]>>(groupLoad, "findGroupSlots", F.group),
  of: () => fnOf<NonNullable<GroupApi["groupOf"]>>(groupLoad, "groupOf", F.group),
  cancel: () => fnOf<NonNullable<GroupApi["cancelGroup"]>>(groupLoad, "cancelGroup", F.group),
  resched: () => fnOf<NonNullable<GroupApi["rescheduleGroup"]>>(groupLoad, "rescheduleGroup", F.group),
};
const must = <T,>(l: { mod: T | null; err: string }, what: string): T => { if (!l.mod) throw new AssertFail(`โหลด ${what} ไม่ได้ (${l.err})`); return l.mod; };
const BK = () => must(bookingLoad, "booking/service");
const LN = () => must(lineLoad, "queue-line");
const RN = () => must(runLoad, "planner-run");
const PLN = () => must(plannerLoad, "planner");
const DEP = () => must(depLoad, "booking/deposit");
const ON = () => must(onlineLoad, "booking/online");

// ═══════════════ โหมดลูกโพรเซส (ยิงพร้อมกัน) ═══════════════
type CallSpec =
  | { fn: "group"; ctx: Ctx; input: GroupBookInput }
  | { fn: "book"; ctx: Ctx; input: BookInput }
  | { fn: "resGroup"; ctx: Ctx; groupId: string; dateStr: string; startMin: number }
  | { fn: "cancelGroup"; ctx: Ctx; groupId: string }
  | { fn: "confirm"; shop: ShopCtx; unitId: string; appointmentId: string }
  | { fn: "expire"; nowMs: number };
type CallOut = { fn: CallSpec["fn"]; ok: boolean; code: string | null; id: string | null; threw: string | null };
type ChildSpec = { run: string; idx: number; scenarios: { key: string; calls: CallSpec[] }[] };
type Scenario = { key: string; perChild: CallSpec[][] };
const RUN = Date.now().toString(36);
const goFile = (run: string, key: string) => `/tmp/svc-b15-go-${run}-${key}`;
async function runCall(c: CallSpec): Promise<CallOut> {
  const o: CallOut = { fn: c.fn, ok: false, code: null, id: null, threw: null };
  try {
    if (c.fn === "group") { const r = await GR.book()(c.ctx, c.input); return r.ok ? { ...o, ok: true, id: r.groupId } : { ...o, code: r.code }; }
    if (c.fn === "book") { const r = await BK().bookAppointment(c.ctx, c.input); return r.ok ? { ...o, ok: true, id: r.id } : { ...o, code: r.code }; }
    if (c.fn === "resGroup") { const r = await GR.resched()(c.ctx, c.groupId, { dateStr: c.dateStr, startMin: c.startMin }); return r.ok ? { ...o, ok: true, id: c.groupId } : { ...o, id: c.groupId, code: r.code }; }
    if (c.fn === "cancelGroup") { const r = await GR.cancel()(c.ctx, c.groupId); return r.ok ? { ...o, ok: true, id: c.groupId } : { ...o, id: c.groupId, code: r.code }; }
    if (c.fn === "confirm") { const r = await DEP().confirmDepositByShop(c.shop, { unitId: c.unitId, appointmentId: c.appointmentId }); return r.ok ? { ...o, ok: true, id: c.appointmentId } : { ...o, code: r.code ?? "FAIL" }; }
    const r = await BK().expireDepositHolds(new Date(c.nowMs));
    return { ...o, ok: true, code: String(r.expired) };
  } catch (e) {
    return { ...o, threw: errMsg(e).slice(0, 160) };
  }
}
if (process.env.QC_B15_CHILD) {
  const spec = JSON.parse(process.env.QC_B15_CHILD) as ChildSpec;
  try {
    const dbm = (await import("@/lib/core/db")) as unknown as { prisma: { $queryRawUnsafe: (q: string) => Promise<unknown>; $disconnect: () => Promise<void> } };
    await dbm.prisma.$queryRawUnsafe("SELECT 1");
    for (const sc of spec.scenarios) {
      console.log(`READY ${sc.key}`);
      const t0 = Date.now();
      while (!existsSync(goFile(spec.run, sc.key))) { if (Date.now() - t0 > 300_000) { console.log("ABORT"); process.exit(5); } await sleep(10); }
      const outs = await Promise.all(sc.calls.map(runCall));
      console.log(`RES ${sc.key} ${JSON.stringify(outs)}`);
    }
    await dbm.prisma.$disconnect();
    process.exit(0);
  } catch (e) { console.log(`CHILD_ERR ${errMsg(e)}`); process.exit(3); }
}

const settingsLoad = await tryImport<SettingsApi>("@/lib/core/settings");
const sysLoad = await tryImport<SysApi>("@/lib/modules/system/service");
const accLoad = await tryImport<AccApi>("@/lib/modules/account/service");
const glLoad = await tryImport<GlApi>("@/lib/modules/account/gl");
const consLoad = await tryImport<ConsApi>("@/lib/outbox-consumers");
const SETTINGS = () => must(settingsLoad, "core/settings");

// ═════════════════════════════════════════════════════════════════════════════
// ภาค 1 · PURE — ตัววางคิว + groupId (ไม่ต่อฐาน)
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── T: สัญญา ──");
await st("T-1", `«${F.group}» มี export bookGroup · findGroupSlots · groupOf · cancelGroup · rescheduleGroup (ฟังก์ชัน)`, () => {
  ok(!!groupLoad.mod, groupLoad.err);
  for (const k of ["bookGroup", "findGroupSlots", "groupOf", "cancelGroup", "rescheduleGroup"]) ok(typeof (groupLoad.mod as Record<string, unknown>)[k] === "function", `ไม่มี export ${k}`);
});
await st("T-2", "ตัวควบคุม (ต้องเขียวก่อน/หลังใบ): คีย์ #15 booking.service.staffCount มีอยู่แล้ว · ชั้น SERVICE · ป้ายไทย · ค่าเริ่ม 1 ทุกแม่แบบ + _fallback (ร้านเดิมไม่เป็นกลุ่ม) — ใบนี้ไม่เพิ่มคีย์", () => {
  const d = SETTINGS().getDef("booking.service.staffCount");
  ok(!!d, "ไม่มีคีย์ booking.service.staffCount");
  ok(d!.chain.includes("SERVICE"), `chain ${fmt(d!.chain)}`);
  ok(/[฀-๿]/.test(d!.labelTh), `labelTh ${d!.labelTh}`);
  for (const k of ["BARBER", "SPA", "CLINIC"]) eq(d!.defaults[k], 1, `ค่าเริ่ม ${k}`);
  ok(d!.defaults._fallback === undefined || d!.defaults._fallback === 1, `_fallback ${fmt(d!.defaults._fallback)}`);
}, "MAJOR");

// ── ตัวช่วยตัววางคิว (แบบ B.13) ──
const DAY0 = Date.UTC(2026, 9, 31) - 7 * 60 * MIN; // ส. 31 ต.ค. 2569 00:00 ไทย
const T = (hm: string): number => { const [h, m] = hm.split(":").map(Number); return DAY0 + (h * 60 + m) * MIN; };
const SET0: PlanSettings = { queueOrder: "SINGLE_LINE", backfill: true, safetyBeforeBookingMin: 0, graceMin: 15, noShowAfterMin: 30, lateAction: "RELEASE", priorityEnabled: false, walkInMaxWaitMin: 600, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null };
const stf = (id: string, sortOrder: number, from = "10:00", to = "21:00"): PlanStaff => ({ id, name: `หมอ${id}`, sortOrder, windows: [{ startAt: T(from), endAt: T(to) }], services: null });
const sv = (id: string, durationMin: number, kinds?: string[], bufferAfterMin = 0): PlanService => ({ id, name: id, durationMin, bufferAfterMin, ...(kinds ? { resourceKinds: kinds } : {}) });
const rs = (id: string, kind: string, sortOrder: number, cleanupMin: number, capacity = 1): PlanResource => ({ id, kind, name: id, sortOrder, capacity, cleanupMin, blocks: [] });
const booked = (id: string, serviceId: string, staffId: string, start: string, resourceIds?: string[], o: Partial<PlanJob> = {}): PlanJob => ({
  id, label: id, kind: "BOOKED", status: "CONFIRMED", serviceId, assignMode: "SPECIFIC", staffId, startAt: T(start), issuedAt: T("08:00"), checkedInAt: null, startedAt: null, priority: false,
  ...(resourceIds ? { resourceIds } : {}), ...o,
});
const inService = (id: string, serviceId: string, staffId: string, started: string, o: Partial<PlanJob> = {}): PlanJob => ({
  id, label: id, kind: "BOOKED", status: "IN_SERVICE", serviceId, assignMode: "SPECIFIC", staffId, startAt: T(started), issuedAt: T("08:00"), checkedInAt: T(started), startedAt: T(started), priority: false, ...o,
});
const walk = (id: string, serviceId: string, issued: string): PlanJob => ({
  id, label: id, kind: "WALKIN", status: "QUEUED", serviceId, assignMode: "ANY", staffId: null, startAt: null, issuedAt: T(issued), checkedInAt: T(issued), startedAt: null, priority: false,
});
const inp = (now: string, staff: PlanStaff[], services: PlanService[], jobs: PlanJob[], resources?: PlanResource[], settings: Partial<PlanSettings> = {}): PlanInput => ({
  now: T(now), settings: { ...SET0, ...settings }, staff, services, jobs, ...(resources ? { resources } : {}),
});
const pj = (p: Plan, id: string): PlannedJob => { const x = p.jobs.find((j) => j.jobId === id); if (!x) throw new AssertFail(`ไม่มี ${id} ในผล`); return x; };
const pv = (j: PlannedJob) => ({ start: HM(j.startAt), state: j.state, res: j.resourceIds });
const stripGroups = (i: PlanInput): PlanInput => ({ ...i, jobs: i.jobs.map(({ groupId: _g, ...j }) => { void _g; return j; }) });

console.log("\n── PL: ตัววางคิว pure + groupId ──");
const CPL60 = sv("CPL60", 60, ["COUPLE_ROOM"]);
const PLAIN60 = sv("PLAIN60", 60);
const VIP = rs("vip", "COUPLE_ROOM", 1, 0, 2);
const sceneG1 = (withGroup: boolean) => inp("14:20", [stf("S1", 1), stf("S2", 2)], [CPL60, PLAIN60], [
  inService("IS", "PLAIN60", "S1", "13:50"),
  booked("M1", "CPL60", "S1", "14:30", ["vip"], withGroup ? { groupId: "G" } : {}),
  booked("M2", "CPL60", "S2", "14:30", ["vip"], withGroup ? { groupId: "G" } : {}),
], [VIP]);
await st("PL-G0", "ตัวควบคุม (ต้องเขียวก่อน/หลังใบ): ฉากเดียวกันแต่ไม่มี groupId ⇒ ผล B.13 (M1 ช้าเพราะหมอ S1 ทำงานถึง 14:50 · M2 ตรงเวลา 14:30)", () => {
  const p = PLN().planDay(sceneG1(false));
  eq([pv(pj(p, "M1")).start, pv(pj(p, "M2")).start], ["14:50", "14:30"], "เวลา");
});
await st("PL-G1", "§3.6 เริ่มพร้อมกัน: สมาชิก M1 ช้า (หมอ S1 ทำงานถึง 14:50) ⇒ ทั้งกลุ่ม 14:50 · SCHEDULED · ห้องคู่ vip ทั้งคู่", () => {
  const p = PLN().planDay(sceneG1(true));
  eq([pv(pj(p, "M1")), pv(pj(p, "M2"))], [{ start: "14:50", state: "SCHEDULED", res: ["vip"] }, { start: "14:50", state: "SCHEDULED", res: ["vip"] }], "กลุ่ม");
});
await st("PL-G2", "§3.6 APPOINTMENT_FIRST: สมาชิกมาก่อน 1 คน (เช็กอิน 14:00) ⇒ ไม่ถูกดึงเร็ว (คง 14:30 พร้อมกลุ่ม) · มาครบทั้งคู่ ⇒ ดึงเร็วพร้อมกัน 14:05", () => {
  const svc = [CPL60];
  const one = inp("14:05", [stf("S1", 1), stf("S2", 2)], svc, [
    booked("M1", "CPL60", "S1", "14:30", ["vip"], { groupId: "G", status: "ARRIVED", checkedInAt: T("14:00") }),
    booked("M2", "CPL60", "S2", "14:30", ["vip"], { groupId: "G" }),
  ], [VIP], { queueOrder: "APPOINTMENT_FIRST" });
  const p1 = PLN().planDay(one);
  eq([pv(pj(p1, "M1")).start, pv(pj(p1, "M2")).start], ["14:30", "14:30"], "มาคนเดียว");
  const both = { ...one, jobs: one.jobs.map((j) => ({ ...j, status: "ARRIVED", checkedInAt: T("14:00") })) };
  const p2 = PLN().planDay(both);
  eq([pv(pj(p2, "M1")).start, pv(pj(p2, "M2")).start], ["14:05", "14:05"], "มาครบ");
});
await st("PL-G3", "ตัวควบคุม: ห้องของกลุ่มนับต่อแถว (B.13) — ห้องคู่จุ 2 · กลุ่ม 15:00–16:00 · walk-in ห้องคู่ 60 ⇒ 16:00 (ไม่ลงทับช่วงกลุ่ม)", () => {
  const i = inp("14:20", [stf("S1", 1), stf("S2", 2), stf("S3", 3)], [sv("VIP60", 60, ["COUPLE_ROOM"])], [
    booked("M1", "VIP60", "S1", "15:00", ["vip"], { groupId: "G" }), booked("M2", "VIP60", "S2", "15:00", ["vip"], { groupId: "G" }), walk("W1", "VIP60", "14:10"),
  ], [VIP]);
  const w = pj(PLN().planDay(i), "W1");
  eq([HM(w.startAt), w.resourceIds], ["16:00", ["vip"]], "W1");
});
await st("PL-G4", "§3.6 คนที่ถูกปล่อยไม่ถ่วงคนที่มา: M1 ไม่มา (เลยผ่อนผัน ⇒ RELEASED_LATE) · M2 มาแล้ว ⇒ SCHEDULED เริ่มไม่ช้ากว่า now", () => {
  const i = inp("14:50", [stf("S1", 1), stf("S2", 2)], [CPL60], [
    booked("M1", "CPL60", "S1", "14:30", ["vip"], { groupId: "G" }),
    booked("M2", "CPL60", "S2", "14:30", ["vip"], { groupId: "G", status: "ARRIVED", checkedInAt: T("14:25") }),
  ], [VIP]);
  const p = PLN().planDay(i);
  const m2 = pj(p, "M2");
  eq([pj(p, "M1").state, m2.state], ["RELEASED_LATE", "SCHEDULED"], "สถานะ");
  ok(m2.startAt !== null && m2.startAt <= T("14:50"), `M2 เริ่ม ${HM(m2.startAt)} (รอ M1 ที่ถูกปล่อย)`);
}, "MAJOR");

// ── fuzz ──
type Rng = () => number;
const mulberry32 = (a: number): Rng => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <V,>(r: Rng, xs: readonly V[]): V => xs[Math.floor(r() * xs.length)];
const shuffle = <V,>(r: Rng, xs: readonly V[]): V[] => { const c = [...xs]; for (let k = c.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [c[k], c[m]] = [c[m], c[k]]; } return c; };
const deepFreeze = <V,>(o: V): V => { if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v); } return o; };
type Occ = { s: number; e: number };
const overlaps = (a: Occ, b: Occ) => a.s < b.e && b.s < a.e;
const capOk = (cap: number, used: Occ[], adds: Occ[]): boolean => {
  const all = [...used, ...adds];
  return all.every((x) => all.filter((u) => u.s <= x.s && u.e > x.s).length <= cap);
};
/** ร้านนวดสุ่ม: กลุ่ม 2–3 คน (หมอคนละคน · ห้องคู่ชิ้นเดียว) + นัดเดี่ยว + งานกำลังทำที่ลากยาว (ทำให้สมาชิกช้า) + walk-in */
function genG(r: Rng, o: { singletonGroups?: boolean } = {}): PlanInput {
  const now = T("11:00");
  const staffN = ri(r, 3, 8);
  const staff: PlanStaff[] = Array.from({ length: staffN }, (_, k) => ({ id: `s${k}`, name: `s${k}`, sortOrder: ri(r, 1, 3), windows: [{ startAt: T("10:00"), endAt: T("21:00") }], services: null }));
  const services: PlanService[] = [
    { id: "cpl", name: "cpl", durationMin: 60, bufferAfterMin: pick(r, [0, 0, 5]), resourceKinds: ["COUPLE_ROOM"] },
    { id: "cpl90", name: "cpl90", durationMin: 90, bufferAfterMin: 0, resourceKinds: ["COUPLE_ROOM"] },
    { id: "plain", name: "plain", durationMin: 45, bufferAfterMin: 0 },
  ];
  const resources: PlanResource[] = Array.from({ length: ri(r, 1, 3) }, (_, k) => ({ id: `room${k}`, kind: "COUPLE_ROOM", name: `room${k}`, sortOrder: ri(r, 1, 3), capacity: pick(r, [2, 2, 3]), cleanupMin: pick(r, [0, 10, 15]), blocks: [] }));
  const svcOf = (id: string) => services.find((s) => s.id === id)!;
  const busy = new Map<string, Occ[]>(staff.map((s) => [s.id, []]));
  const used = new Map<string, Occ[]>(resources.map((x) => [x.id, []]));
  const jobs: PlanJob[] = [];
  let n = 0;
  for (const s of staff) {
    if (r() < 0.45) {
      const started = now - ri(r, 10, 80) * MIN;
      const dur = ri(r, 30, 150);
      jobs.push({ id: `I${n++}`, label: "i", kind: "BOOKED", status: "IN_SERVICE", serviceId: "plain", durationMin: dur, assignMode: "SPECIFIC", staffId: s.id, startAt: started, issuedAt: now - 86_400_000, checkedInAt: started, startedAt: started, priority: false });
    }
  }
  const tryBook = (m: number, gid: string | undefined) => {
    const t = now + ri(r, 0, 24) * 15 * MIN;
    const svc = svcOf(pick(r, ["cpl", "cpl90"]));
    const span: Occ = { s: t, e: t + (svc.durationMin + svc.bufferAfterMin) * MIN };
    const free = shuffle(r, staff).filter((s) => busy.get(s.id)!.every((b) => !overlaps(b, span))).slice(0, m);
    if (free.length < m) return;
    const room = resources.find((x) => capOk(x.capacity, used.get(x.id)!, Array.from({ length: m }, () => ({ s: t, e: t + (svc.durationMin + x.cleanupMin) * MIN }))));
    if (!room) return;
    for (const s of free) {
      busy.get(s.id)!.push(span);
      used.get(room.id)!.push({ s: t, e: t + (svc.durationMin + room.cleanupMin) * MIN });
      const arrived = t - now <= 30 * MIN && r() < 0.4;
      const gidHere = o.singletonGroups ? `solo${n}` : gid;
      jobs.push({ id: `B${n++}`, label: "b", kind: "BOOKED", status: arrived ? "ARRIVED" : "CONFIRMED", serviceId: svc.id, assignMode: "SPECIFIC", staffId: s.id, startAt: t, issuedAt: now - 86_400_000,
        checkedInAt: arrived ? now - 5 * MIN : null, startedAt: null, priority: false, resourceIds: [room.id], ...(gidHere ? { groupId: gidHere } : {}) });
    }
  };
  const groups = ri(r, 1, 6);
  for (let g = 0; g < groups; g++) tryBook(pick(r, [2, 2, 3]), `G${g}`);
  for (let k = ri(r, 0, 4); k > 0; k--) tryBook(1, undefined);
  for (let w = ri(r, 0, 4); w > 0; w--) jobs.push({ id: `W${n++}`, label: "w", kind: "WALKIN", status: "QUEUED", serviceId: pick(r, ["plain", "cpl"]), assignMode: "ANY", staffId: null, startAt: null, issuedAt: now - ri(r, 0, 40) * MIN, checkedInAt: now - ri(r, 0, 40) * MIN, startedAt: null, priority: false });
  return { now, settings: { ...SET0, queueOrder: pick(r, ["SINGLE_LINE", "APPOINTMENT_FIRST"] as const), backfill: r() < 0.7 }, staff, services, jobs: shuffle(r, jobs), resources };
}
const resOf = (i: PlanInput, id: string) => (i.resources ?? []).find((x) => x.id === id);
const propRun = async (id: string, name: string, gen: (r: Rng) => PlanInput, check: (i: PlanInput, p: Plan, r: Rng) => string | null, sev: Sev = "CRITICAL") => {
  await st(id, `${name} (${FUZZ_N} ชุด · seed คงที่)`, () => {
    for (let k = 0; k < FUZZ_N; k++) {
      const r = mulberry32(20261115 + k * 7919 + id.length * 31);
      const i = gen(r);
      const msg = check(i, PLN().planDay(i), r);
      if (msg) throw new AssertFail(`ชุดที่ ${k}: ${msg}`);
    }
  }, sev);
};
console.log("\n── FZ: fuzz ตัววางคิว + กลุ่ม ──");
await propRun("FZ-G0", "ตัวควบคุม _fallback: ทุกงานมี groupId ไม่ซ้ำกัน (กลุ่มขนาด 1) ⇒ ผลเท่ากับไม่ส่ง groupId ทุกไบต์", (r) => genG(r, { singletonGroups: true }), (i) =>
  isDeepStrictEqual(PLN().planDay(i), PLN().planDay(stripGroups(i))) ? null : "ผลต่างเมื่อมี groupId ขนาด 1");
await propRun("FZ-G1", "§3.6 สมาชิกที่ SCHEDULED ของกลุ่มเดียวกัน (ไม่ใช่มาสายเข้าแถว · ไม่ resourceShort) เริ่มเวลาเดียวกัน · ห้องไม่เกินความจุ ณ จุดใด · หมอไม่ซ้อน", genG, (i, p) => {
  const byGroup = new Map<string, PlannedJob[]>();
  for (const j of p.jobs) {
    const job = i.jobs.find((x) => x.id === j.jobId)!;
    if (!job.groupId || job.kind !== "BOOKED" || job.status === "IN_SERVICE") continue;
    if (j.state !== "SCHEDULED" || j.reason === "LATE_ARRIVAL_AS_WALKIN" || j.resourceShort) continue;
    byGroup.set(job.groupId, [...(byGroup.get(job.groupId) ?? []), j]);
  }
  for (const [g, xs] of byGroup) if (new Set(xs.map((x) => x.startAt)).size > 1) return `กลุ่ม ${g} เริ่มไม่พร้อมกัน ${fmt(xs.map((x) => `${x.jobId}@${HM(x.startAt)}`))}`;
  const occ = new Map<string, Occ[]>();
  for (const j of p.jobs) {
    if (!(j.state === "SCHEDULED" || j.state === "IN_SERVICE") || j.startAt == null || j.endAt == null || j.resourceShort) continue;
    for (const id of j.resourceIds ?? []) { const rr = resOf(i, id); if (rr) occ.set(id, [...(occ.get(id) ?? []), { s: j.startAt, e: j.endAt + rr.cleanupMin * MIN }]); }
  }
  for (const [id, xs] of occ) { const rr = resOf(i, id)!; for (const x of xs) if (xs.filter((u) => u.s <= x.s && u.e > x.s).length > rr.capacity) return `${id} เกินความจุ ${rr.capacity} ที่ ${HM(x.s)}`; }
  const by = new Map<string, PlannedJob[]>();
  for (const j of p.jobs) if ((j.state === "SCHEDULED" || j.state === "IN_SERVICE") && j.staffId && j.reason !== "STAFF_UNAVAILABLE") by.set(j.staffId, [...(by.get(j.staffId) ?? []), j]);
  for (const [s, xs] of by) { xs.sort((a, b) => a.startAt! - b.startAt!); for (let k = 1; k < xs.length; k++) if (xs[k].startAt! < xs[k - 1].endAt!) return `หมอ ${s}: ${xs[k - 1].jobId} ซ้อน ${xs[k].jobId}`; }
  return null;
});
await propRun("FZ-G2", "deterministic + ไม่ขึ้นกับลำดับ jobs/resources + ไม่แก้ input (deep-freeze) เมื่อมีกลุ่ม", genG, (i, p, r) => {
  const p2 = PLN().planDay(deepFreeze(structuredClone({ ...i, jobs: shuffle(r, i.jobs), resources: shuffle(r, i.resources ?? []) })));
  const norm = (x: Plan) => JSON.stringify({ line: x.line, jobs: [...x.jobs].sort((a, b) => a.jobId.localeCompare(b.jobId)) });
  return norm(p) === norm(p2) ? null : "ผลต่างเมื่อสลับลำดับ/freeze";
}, "MAJOR");
await st("PERF", "12 หมอ · กลุ่มคู่ 60 กลุ่ม (นัด 120) · walk-in 40 · ห้องคู่ 6 ห้อง ⇒ p95 < 50 ms (200 รอบหลังอุ่น 20 · เกณฑ์ B.2)", () => {
  const mk = (shiftMin: number): PlanInput => {
    const staff = Array.from({ length: 12 }, (_, k) => stf(`s${k}`, k + 1, "09:00", "23:30"));
    const resources = Array.from({ length: 6 }, (_, k) => rs(`room${k}`, "COUPLE_ROOM", k + 1, 15, 2));
    const jobs: PlanJob[] = [];
    for (let slot = 0; slot < 10; slot++) for (let p = 0; p < 6; p++) {
      const t = T("09:00") + (slot * 75 + shiftMin) * MIN;
      for (const m of [0, 1]) jobs.push({ id: `g${slot}_${p}_${m}`, label: "b", kind: "BOOKED", status: "CONFIRMED", serviceId: "cpl", assignMode: "SPECIFIC", staffId: `s${2 * p + m}`, startAt: t, issuedAt: T("08:00"), checkedInAt: null, startedAt: null, priority: false, resourceIds: [`room${p}`], groupId: `G${slot}_${p}` });
    }
    jobs.push(inService("IS", "plain", "s0", "08:40", { durationMin: 45 }));
    for (let w = 0; w < 40; w++) jobs.push({ ...walk(`w${w}`, w % 3 ? "plain" : "cpl", "09:00"), issuedAt: T("09:00") + w * MIN });
    return { now: T("09:10") + shiftMin * MIN, settings: SET0, staff, services: [sv("cpl", 60, ["COUPLE_ROOM"]), sv("plain", 45)], jobs, resources };
  };
  const inputs = Array.from({ length: 10 }, (_, k) => mk(k * 5));
  const nB = inputs[0].jobs.filter((j) => j.kind === "BOOKED" && j.groupId).length;
  for (let k = 0; k < 20; k++) PLN().planDay(inputs[k % inputs.length]);
  const ts: number[] = [];
  for (let k = 0; k < 200; k++) { const t0 = performance.now(); PLN().planDay(inputs[k % inputs.length]); ts.push(performance.now() - t0); }
  ts.sort((a, b) => a - b);
  const p95 = ts[Math.floor(ts.length * 0.95) - 1], p50 = ts[Math.floor(ts.length * 0.5)], worst = ts[ts.length - 1];
  console.log(`   ⏱  perf B.15: p50 ${p50.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms · สูงสุด ${worst.toFixed(2)} ms · นัดในกลุ่ม ${nB}`);
  ok(nB === 120, `ชุดทดสอบไม่ถึงเกณฑ์ (นัดในกลุ่ม ${nB})`);
  ok(p95 < 50, `p95 ${p95.toFixed(2)} ms`);
}, "MAJOR");

// ═════════════════════════════════════════════════════════════════════════════
// ภาค 2 · ฐานข้อมูล
// ═════════════════════════════════════════════════════════════════════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <R extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<R>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb15_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: Record<string, unknown>): Promise<void> {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const SLUG = "qc-svc-b15-";
const USER_MAIL = "qc-svc-b15-";
const IP_MARK = `svcb15-${RUN}`;
const TOKENS_USED = new Set<string>();
async function cleanup(idsToDel: string[]) {
  if (!idsToDel.length) return;
  const tables = (await q<{ table_name: string }>(`SELECT DISTINCT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`)).map((r) => r.table_name);
  let pending = tables;
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) { try { await pool.query(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [idsToDel]); } catch { failed.push(t); } }
    pending = failed;
  }
  if (pending.length) console.log(`  ⚠️ ลบไม่ได้: ${pending.join(", ")}`);
  try { await pool.query(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [idsToDel]); } catch (e) { console.log(`  ⚠️ ลบ Tenant: ${errMsg(e)}`); }
}
async function cleanupGlobal() {
  try {
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]);
    if ((await cols("ChatRateBucket")).length) {
      await pool.query(`DELETE FROM "ChatRateBucket" WHERE key LIKE '%svcb15-%'`);
      const keys = [...TOKENS_USED].map((t) => `bq:manage:tk:${sha256hex(t).slice(0, 32)}`);
      if (keys.length) await pool.query(`DELETE FROM "ChatRateBucket" WHERE key = ANY($1::text[])`, [keys]);
    }
  } catch (e) { console.log(`  ⚠️ ลบผู้ใช้/ถัง rate: ${errMsg(e)}`); }
}

const TODAY = bkkToday();
const DD = (k: number) => addDays(TODAY, 5 + k);
const TID = (k: string) => `svcb15_${k}_${RUN}`;
const ids = {
  tA: TID("tA"), tB: TID("tB"), owner: TID("owner"),
  uG: TID("uG"), uP: TID("uP"), uD: TID("uD"), uE: TID("uE"), uA2: TID("uA2"), uB: TID("uB"),
  uX1: TID("uX1"), uX2: TID("uX2"), uX3: TID("uX3"), uX4: TID("uX4"),
  VIP: TID("VIP"), CPL: TID("CPL"), OIL: TID("OIL"), PLAIN: TID("PLAIN"), vip1: TID("vip1"), rA: TID("rA"), rB: TID("rB"),
  CUT: TID("CUT"),
  OIL_D: TID("OIL_D"), ARO_D: TID("ARO_D"), CPL_D: TID("CPL_D"), CPL_E: TID("CPL_E"),
  A2SVC: TID("A2SVC"), BSVC: TID("BSVC"), a2s: TID("a2s"), bs: TID("bs"),
};
const gS = Array.from({ length: 6 }, (_, i) => TID(`g${i + 1}`));
const pS = Array.from({ length: 3 }, (_, i) => TID(`p${i + 1}`));
const dS = Array.from({ length: 6 }, (_, i) => TID(`d${i + 1}`));
const eS = Array.from({ length: 4 }, (_, i) => TID(`e${i + 1}`));
const XU = [ids.uX1, ids.uX2, ids.uX3, ids.uX4];
const xStaff = (u: string) => Array.from({ length: 20 }, (_, i) => `${u}_s${i + 1}`);
const xSvc = (u: string) => `${u}_VIP`;
const xRoom = (u: string) => `${u}_vip`;
const dvRooms = [TID("dv1"), TID("dv2"), TID("dv3")];
const SLUGS: Record<string, string> = {};
const cG: Ctx = { tenantId: ids.tA, unitId: ids.uG };
const cP: Ctx = { tenantId: ids.tA, unitId: ids.uP };
const cD: Ctx = { tenantId: ids.tA, unitId: ids.uD };
const cE: Ctx = { tenantId: ids.tA, unitId: ids.uE };
const cA2: Ctx = { tenantId: ids.tA, unitId: ids.uA2 };
const cBx = (unitId: string): Ctx => ({ tenantId: ids.tB, unitId });
const cX = (u: string): Ctx => ({ tenantId: ids.tA, unitId: u });
const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
const SHOP: ShopCtx = { tenantId: ids.tA, actorUserId: ids.owner };
const DEP_OIL = 18_001; // 90,005 × 20% (bp 2000) = 18,001.0
const DEP_ARO = 24_001; // 120,003 × 20% = 24,000.6 ⇒ ปัดครึ่งขึ้น 24,001
const DEP_PAIR = DEP_OIL + DEP_ARO; // 42,002
const FORFEIT_PAIR = Math.floor(DEP_OIL * 50 / 100) + Math.floor(DEP_ARO * 50 / 100); // 9,000 + 12,000 = 21,000 (≠ floor(42,002/2) = 21,001)
let phoneN = 0;
const NAMES: string[] = [];
const PHONES: string[] = [];
const newPhone = () => { const p = `08${String(71_500_000 + ++phoneN).slice(-8)}`; PHONES.push(p); return p; };
const newName = () => { const n = `ลูกค้ากลุ่มคิวซี ${RUN}-${phoneN + 1}`; NAMES.push(n); return n; };
let ipSeq = 0;
const newIp = () => `${IP_MARK}-${++ipSeq}`;
const gin = (members: MemberIn[], ds: string, min: number, channel: BookingChannel = "STAFF", o: Partial<GroupBookInput> = {}): GroupBookInput =>
  ({ members, dateStr: ds, startMin: min, channel, customerName: newName(), customerPhone: newPhone(), idempotencyKey: rid("gidem"), ...o });
const bk = (o: Partial<BookInput> & { serviceId: string; staffId: string | null; dateStr: string; startMin: number }): BookInput =>
  ({ channel: "STAFF", customerName: newName(), customerPhone: newPhone(), idempotencyKey: rid("idem"), ...o });
const okGroup = (r: GroupBookResult, what: string): Extract<GroupBookResult, { ok: true }> => { if (!r.ok) throw new AssertFail(`${what}: ล้ม ${r.code} ${r.reason}`); return r; };
const bookOk = async (ctx: Ctx, serviceId: string, staffId: string | null, ds: string, min: number, what: string): Promise<string> => {
  const r = await BK().bookAppointment(ctx, bk({ serviceId, staffId, dateStr: ds, startMin: min }));
  if (!r.ok) throw new AssertFail(`${what}: จอง ${ds} ${hhmm(min)} ล้ม ${r.code} ${r.reason}`);
  return r.id;
};
type ApRow = { id: string; status: string; staffId: string; serviceId: string; startAt: Date; endAt: Date; resourceId: string | null; plannedStartAt: Date | null; startedAt: Date | null; groupId: string | null;
  depositSatang: number; depositPaidAt: Date | null; depositSaleId: string | null; cancelReason: string | null; manageTokenHash: string | null; priceSatang: number; customerName: string; customerPhone: string; kind: string; channel: string | null;
  policySnapshot: { job?: { durationMin?: number; bufferMin?: number; resourceIds?: unknown } } | null };
const AP_SQL = `SELECT id, status::text AS status, "staffId", "serviceId", "startAt", "endAt", "resourceId", "plannedStartAt", "startedAt", "groupId", "depositSatang", "depositPaidAt", "depositSaleId", "cancelReason", "manageTokenHash", "priceSatang", "customerName", "customerPhone", kind, channel, "policySnapshot" FROM "Appointment"`;
const apRow = async (id: string): Promise<ApRow> => { const [r] = await q<ApRow>(`${AP_SQL} WHERE id = $1`, [id]); if (!r) throw new AssertFail(`ไม่พบนัด ${id}`); return r; };
const apRows = async (idsIn: string[]): Promise<ApRow[]> => Promise.all(idsIn.map(apRow));
const groupRows = async (gid: string): Promise<ApRow[]> => q<ApRow>(`${AP_SQL} WHERE "groupId" = $1 ORDER BY "createdAt", id`, [gid]);
const unitRows = async (unitId: string, ds: string): Promise<ApRow[]> => q<ApRow>(`${AP_SQL} WHERE "unitId" = $1 AND "startAt" >= $2 AND "startAt" < $3 ORDER BY "startAt", id`, [unitId, at(ds, 0), at(ds, 24 * 60)]);
const resIdsOf = (a: ApRow): string[] => {
  const j = a.policySnapshot?.job?.resourceIds;
  if (Array.isArray(j) && j.every((x) => typeof x === "string")) return j as string[];
  return a.resourceId ? [a.resourceId] : [];
};
const tms = (d: Date | null | undefined): number | null => (d ? new Date(d).getTime() : null);
/** ตัวตรวจในฐาน (B.13 §4.6 ตามมติ Q1/Q2 — นิยามเดียวกับ b.13 resViolations): ต่อแถวถือช่อง ⇒ ช่วงถือ [เริ่ม, เริ่ม+นาที+cleanup) · เกินความจุ = ละเมิด */
async function resViolations(unitId: string): Promise<string[]> {
  const res = await q<{ id: string; capacity: number; cleanupMin: number }>(`SELECT id, capacity, "cleanupMin" FROM "SvcResource" WHERE "unitId" = $1`, [unitId]);
  const rows = await q<ApRow & { bufferMin: number }>(`SELECT a.id, a.status::text AS status, a."startAt", a."endAt", a."resourceId", a."plannedStartAt", a."startedAt", a."policySnapshot", s."bufferMin"
    FROM "Appointment" a JOIN "BookingService" s ON s.id = a."serviceId" WHERE a."unitId" = $1 AND a.status::text NOT IN ('CANCELLED','NO_SHOW','DONE')`, [unitId]);
  const occ = new Map<string, Occ[]>(res.map((r) => [r.id, []]));
  const bad: string[] = [];
  for (const a of rows) {
    const s0 = a.startAt.getTime();
    const durMs = typeof a.policySnapshot?.job?.durationMin === "number" ? a.policySnapshot.job.durationMin * MIN : a.endAt.getTime() - s0 - (a.policySnapshot?.job?.bufferMin ?? a.bufferMin) * MIN;
    const s = a.status === "IN_SERVICE" ? (a.startedAt ?? a.plannedStartAt ?? a.startAt).getTime() : (a.plannedStartAt ?? a.startAt).getTime();
    for (const id of resIdsOf(a)) {
      const r = res.find((x) => x.id === id);
      if (!r) { bad.push(`${a.id.slice(-6)} ถือทรัพยากรที่ไม่ใช่ของหน่วย ${id}`); continue; }
      occ.get(id)!.push({ s, e: s + durMs + r.cleanupMin * MIN });
    }
  }
  for (const r of res) {
    const xs = occ.get(r.id)!;
    for (const x of xs) { const n = xs.filter((u) => u.s <= x.s && u.e > x.s).length; if (n > r.capacity) { bad.push(`${r.id.slice(-8)} ซ้อน ${n} > ความจุ ${r.capacity} ที่ ${HM(x.s)}`); break; } }
  }
  return bad;
}
const staffOverlap = async (unitId: string): Promise<string[]> => {
  const rows = await q<{ staffId: string; s: Date; e: Date }>(`SELECT "staffId", "startAt" AS s, "endAt" AS e FROM "Appointment" WHERE "unitId" = $1 AND status::text NOT IN ('CANCELLED','NO_SHOW','DONE') ORDER BY "staffId", "startAt"`, [unitId]);
  const bad: string[] = [];
  for (let i = 1; i < rows.length; i++) if (rows[i].staffId === rows[i - 1].staffId && rows[i].s.getTime() < rows[i - 1].e.getTime()) bad.push(`${rows[i].staffId.slice(-6)} ${HM(rows[i].s.getTime())}`);
  return bad;
};
const setS = async (tenantId: string, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => {
  const r = await SETTINGS().setSettings(OWNER, { tenantId }, changes);
  ok(r.ok, `setSettings ${fmt(changes.map((c) => `${c.key}@${c.scope}`))}: ${r.code} ${fmt(r.issues)}`);
};
// ── เงิน ──
const receiptsOf = async (apptIds: string[]): Promise<{ id: string; status: string; grand: number; key: string }[]> =>
  q(`SELECT s.id, s.status::text AS status, s."grandTotalSatang"::int AS grand, s."idempotencyKey" AS key FROM "PosSale" s WHERE s."sourceModule" = 'POS_DEPOSIT' AND s."tenantId" = $1 AND (${apptIds.map((_, i) => `s."idempotencyKey" LIKE $${i + 2}`).join(" OR ") || "false"}) ORDER BY s."createdAt"`,
    [ids.tA, ...apptIds.map((x) => `booking-deposit-${x}%`)]);
const depositsOf = async (receiptIds: string[]): Promise<{ amount: number; used: number; refunded: number; status: string }[]> =>
  receiptIds.length ? q(`SELECT "amountSatang"::int AS amount, "usedSatang"::int AS used, "refundedSatang"::int AS refunded, status::text AS status FROM "PosDeposit" WHERE "receiptSaleId" = ANY($1::text[])`, [receiptIds]) : [];
const refundsOf = async (receiptIds: string[]): Promise<{ id: string; grand: number }[]> =>
  receiptIds.length ? q(`SELECT id, "grandTotalSatang"::int AS grand FROM "PosSale" WHERE "docType" = 'REFUND' AND "refSaleId" = ANY($1::text[]) AND status::text <> 'VOIDED'`, [receiptIds]) : [];
const forfeitBillsOf = async (apptIds: string[]): Promise<{ id: string; grand: number }[]> =>
  q(`SELECT id, "grandTotalSatang"::int AS grand FROM "PosSale" WHERE "sourceModule" = 'BOOKING' AND "sourceId" = ANY($1::text[]) AND "idempotencyKey" LIKE 'dep-forfeit:%' AND status::text = 'PAID'`, [apptIds]);
type JLine = { code: string; debit: number; credit: number; entry: string };
const jv = async (saleIds: string[]): Promise<JLine[]> => (saleIds.length ? q<JLine>(`SELECT a.code, l.debit::bigint AS debit, l.credit::bigint AS credit, e.id AS entry FROM "AccountJournalEntry" e JOIN "AccountJournalLine" l ON l."entryId" = e.id JOIN "AccountLedger" a ON a.id = l."accountId" WHERE e."refType" = 'PosSale' AND e."refId" = ANY($1::text[])`, [saleIds]) : []);
const netCr = (ls: JLine[], pred: (c: string) => boolean) => ls.filter((l) => pred(String(l.code))).reduce((t, l) => t + Number(l.credit) - Number(l.debit), 0);
const balanced = (ls: JLine[]) => { const by = new Map<string, number>(); for (const l of ls) by.set(l.entry, (by.get(l.entry) ?? 0) + Number(l.debit) - Number(l.credit)); return [...by.values()].every((v) => v === 0); };
const tokenOf = async (ctx: Ctx, leaderId: string): Promise<string> => {
  const url = await ON().manageLinkFor(ctx, leaderId);
  ok(typeof url === "string" && url.startsWith("/bq/m/"), `manageLinkFor หัวกลุ่ม ${fmt(url)}`);
  const t = (url as string).slice("/bq/m/".length);
  TOKENS_USED.add(t);
  return t;
};
async function pump(rounds = 30): Promise<string[]> {
  const errs: string[] = [];
  const consumers = must(consLoad, "outbox-consumers").consumers ?? {};
  for (let i = 0; i < rounds; i++) {
    const rows = await q<{ id: string; tenantId: string; type: string; payload: unknown; unitId: string | null }>(`SELECT id, "tenantId", type, payload, "unitId" FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND status = 'PENDING' ORDER BY "createdAt", id LIMIT 200`, [[ids.tA, ids.tB]]);
    if (!rows.length) return errs;
    for (const row of rows) {
      const claim = await pool.query(`UPDATE "OutboxEvent" SET "availableAt" = now() + interval '2 minutes' WHERE id = $1 AND status = 'PENDING' RETURNING id`, [row.id]);
      if (!claim.rowCount) continue;
      const h = consumers[row.type];
      if (typeof h === "function") { try { await h({ id: row.id, tenantId: row.tenantId, type: row.type, payload: row.payload, unitId: row.unitId, systemId: null }); } catch (e) { errs.push(`${row.type}: ${errMsg(e).slice(0, 100)}`); } }
      await pool.query(`UPDATE "OutboxEvent" SET status = 'DONE', "processedAt" = now() WHERE id = $1 AND status = 'PENDING'`, [row.id]);
    }
  }
  return errs;
}
const evCount = async (type: string, apptId: string) => Number((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND type = $2 AND payload->>'appointmentId' = $3`, [ids.tA, type, apptId]))[0].n);
const deadlocks = async (): Promise<number> => Number((await q<{ n: number }>(`SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? 0);

const goFiles: string[] = [];
let setupOk = false;
let tplOk = false;
const need = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");
const needTpl = () => { need(); ok(tplOk, "ตั้งแม่แบบ/ค่าตั้งไม่สำเร็จ (T-3)"); };
const ALL_TENANTS = [ids.tA, ids.tB];
const D = { S1: DD(0), S3: DD(1), S4: DD(2), S5: DD(3), S7: DD(4), S9: DD(5), CX: DD(6), RS: DD(7), CI: DD(8), DB: DD(9), D1: DD(10), D7: DD(11), D8: DD(12), X: DD(13), X5: DD(14) };
console.log(`\n(วันนี้ไทย ${TODAY} · วันทดสอบ ${D.S1} … ${D.X5} · ฐาน ${svcQcHostMark()})`);

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupGlobal();

  // ── สร้างข้อมูล ──
  try {
    for (const [id, n] of [[ids.tA, "a"], [ids.tB, "b"]] as const) { SLUGS[id] = `${SLUG}${n}-${RUN}`; await insertRow("Tenant", { id, name: `QC B15 ร้าน ${n}`, slug: SLUGS[id], updatedAt: new Date() }); }
    const units: [string, string, string][] = [[ids.uG, ids.tA, "g"], [ids.uP, ids.tA, "p"], [ids.uD, ids.tA, "d"], [ids.uE, ids.tA, "e"], [ids.uA2, ids.tA, "a2"], [ids.uB, ids.tB, "b"], ...XU.map((u, i) => [u, ids.tA, `x${i + 1}`] as [string, string, string])];
    for (const [id, t, n] of units) {
      SLUGS[id] = `b15-${n}-${RUN}`;
      await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `สาขา ${n}`, slug: SLUGS[id], updatedAt: new Date() });
      for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: 600, closeMin: 1200, closed: false, updatedAt: new Date() });
    }
    const svc = (id: string, t: string, u: string, name: string, durationMin: number, priceSatang = 150_000) =>
      insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin, priceSatang, bufferMin: 0, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    let ord = 0;
    const staff = (id: string, t: string, u: string, name: string, sortOrder: number) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    const res = (id: string, t: string, u: string, name: string, kind: string, sortOrder: number, cleanupMin: number, capacity = 1) =>
      insertRow("SvcResource", { id, tenantId: t, unitId: u, kind, name, capacity, cleanupMin, active: true, sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    // uG — ร้านนวดหลัก
    await svc(ids.VIP, ids.tA, ids.uG, "ห้องคู่ 60 (ต่อคน)", 60); await svc(ids.CPL, ids.tA, ids.uG, "คู่รัก 60", 60);
    await svc(ids.OIL, ids.tA, ids.uG, "น้ำมัน 60", 60); await svc(ids.PLAIN, ids.tA, ids.uG, "นวดคอ 60 (ไม่ใช้ห้อง)", 60);
    for (const [i, id] of gS.entries()) await staff(id, ids.tA, ids.uG, `หมอ ${i + 1}`, i + 1);
    await res(ids.vip1, ids.tA, ids.uG, "ห้องคู่ VIP", "COUPLE_ROOM", 1, 15, 2);
    await res(ids.rA, ids.tA, ids.uG, "ห้องน้ำมัน A", "ROOM", 2, 15); await res(ids.rB, ids.tA, ids.uG, "ห้องน้ำมัน B", "ROOM", 3, 15);
    // uP — กลุ่มไม่ใช้ห้อง (เพื่อนมาตัดผมพร้อมกัน)
    for (const [i, id] of pS.entries()) await staff(id, ids.tA, ids.uP, `ช่าง ${i + 1}`, i + 1);
    await svc(ids.CUT, ids.tA, ids.uP, "ตัดผม 45", 45);
    // uD — มัดจำ (POS + บัญชี) · ราคาเศษสตางค์
    for (const [i, id] of dS.entries()) await staff(id, ids.tA, ids.uD, `หมอดี ${i + 1}`, i + 1);
    await svc(ids.OIL_D, ids.tA, ids.uD, "น้ำมัน 60", 60, 90_005); await svc(ids.ARO_D, ids.tA, ids.uD, "อโรมา 90", 90, 120_003); await svc(ids.CPL_D, ids.tA, ids.uD, "คู่รัก 60", 60, 90_005);
    for (const [i, id] of dvRooms.entries()) await res(id, ids.tA, ids.uD, `ห้องคู่ ${i + 1}`, "COUPLE_ROOM", i + 1, 0, 2);
    // uE — หมดเวลาถือช่อง 1 นาที
    for (const [i, id] of eS.entries()) await staff(id, ids.tA, ids.uE, `หมออี ${i + 1}`, i + 1);
    await svc(ids.CPL_E, ids.tA, ids.uE, "คู่รัก 60", 60, 90_005); await res(TID("ev1"), ids.tA, ids.uE, "ห้องคู่ E", "COUPLE_ROOM", 1, 0, 2);
    // X1
    await svc(ids.A2SVC, ids.tA, ids.uA2, "บริการ A2", 60); await staff(ids.a2s, ids.tA, ids.uA2, "หมอ A2", 1);
    await svc(ids.BSVC, ids.tB, ids.uB, "บริการ B", 60); await staff(ids.bs, ids.tB, ids.uB, "หมอ B", 1);
    // X — หน่วยแข่ง (20 หมอ · ห้องคู่เดียวจุ 2)
    for (const u of XU) {
      for (const [i, id] of xStaff(u).entries()) await staff(id, ids.tA, u, `หมอแข่ง ${i + 1}`, i + 1);
      await svc(xSvc(u), ids.tA, u, "ห้องคู่แข่ง 60", 60);
      await res(xRoom(u), ids.tA, u, "ห้องคู่เดียว", "COUPLE_ROOM", 1, 15, 2);
    }
    await insertRow("User", { id: ids.owner, email: `${USER_MAIL}owner-${RUN}@qc.invalid`, name: "QC B15 owner", updatedAt: new Date() });
    for (const t of ALL_TENANTS) await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    // POS + บัญชี (จด VAT) ของร้าน A ⇒ ใบรับมัดจำ + GL (แบบ b.8)
    const SYS = must(sysLoad, "system/service");
    const posSys = await SYS.createSystem(ids.tA, "POS", "ขาย QC B15");
    for (const u of [ids.uD, ids.uE]) await SYS.linkUnit(ids.tA, posSys.id, u);
    const acc = await SYS.createSystem(ids.tA, "ACCOUNT", "บัญชี QC B15");
    await must(accLoad, "account/service").saveSettings(ids.tA, acc.id, { orgName: "QC B15 จำกัด", taxId: "0105561177639", vatRegistered: true });
    await must(glLoad, "account/gl").ensureAccounting({ tenantId: ids.tA, systemId: acc.id });
    await insertRow("AccountSystemLink", { id: rid("asl"), tenantId: ids.tA, systemId: acc.id, linkedKind: "POS", linkedId: posSys.id });
    await insertRow("PaymentProfile", { id: rid("pp"), tenantId: ids.tA, promptpayId: "0812345678", displayName: "QC B15 Shop A", updatedAt: new Date() });
    setupOk = true;
  } catch (e) { console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`); }

  // ═══════════════ T-3 แม่แบบ + ค่าตั้ง (ตัวควบคุม) ═══════════════
  await st("T-3", "ตัวควบคุม: แม่แบบ SPA ทุกสาขา · ทับชั้นสาขา (พัก 0 · เผื่อ 0 · ออนไลน์ 100% · จองล่วงหน้า 60 วัน · ไม่จำกัดเบอร์ · ไม่ต้องยืนยัน) · ประกาศชนิดห้อง · staffCount 2 (คู่รัก) · มัดจำ 20% + ริบ 50% + ยกเลิกช้าแบบ FORFEIT ที่ uD/uE", async () => {
    need();
    const all = [ids.uG, ids.uP, ids.uD, ids.uE, ids.uA2, ...XU];
    for (const u of all) {
      const a = await SETTINGS().applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: u, domain: "booking", templateKey: "SPA", overwrite: "RESET_ALL" });
      ok(a.ok, `applyTemplate SPA ${u}: ${a.code} ${fmt(a.issues)}`);
    }
    const b = await SETTINGS().applyTemplate(OWNER, { tenantId: ids.tB }, { unitId: ids.uB, domain: "booking", templateKey: "SPA", overwrite: "RESET_ALL" });
    ok(b.ok, `applyTemplate SPA uB: ${b.code}`);
    await setS(ids.tA, all.flatMap((u) => [
      { key: "booking.staff.minBreakMin", scope: "UNIT", scopeId: u, value: 0 },
      { key: "booking.queue.safetyMin", scope: "UNIT", scopeId: u, value: 0 },
      { key: "booking.staff.maxJobsPerDay", scope: "UNIT", scopeId: u, value: null },
      { key: "booking.queue.walkInCloseWaitMin", scope: "UNIT", scopeId: u, value: 600 },
      { key: "booking.booking.onlineSharePct", scope: "UNIT", scopeId: u, value: 100 },
      { key: "booking.booking.horizonDays", scope: "UNIT", scopeId: u, value: 60 },
      { key: "booking.booking.maxOpenPerPhone", scope: "UNIT", scopeId: u, value: null },
      { key: "booking.booking.requireConfirm", scope: "UNIT", scopeId: u, value: false },
    ]));
    await setS(ids.tA, [ids.uD, ids.uE].flatMap((u) => [
      { key: "booking.deposit.method", scope: "UNIT", scopeId: u, value: "PROMPTPAY_SLIP" },
      { key: "booking.deposit.amount", scope: "UNIT", scopeId: u, value: { mode: "PERCENT", bp: 2000, minDurationMin: null } },
      { key: "booking.deposit.payWithinMin", scope: "UNIT", scopeId: u, value: u === ids.uE ? 1 : 1440 },
      { key: "booking.deposit.forfeitPct", scope: "UNIT", scopeId: u, value: 50 },
      { key: "booking.late.lateCancelMode", scope: "UNIT", scopeId: u, value: "FORFEIT" },
      { key: "booking.late.freeChangeBeforeMin", scope: "UNIT", scopeId: u, value: 180 },
    ]));
    const K = "booking.service.resourceKinds";
    await setS(ids.tA, [
      ...[ids.VIP, ids.CPL, ids.OIL_D, ids.ARO_D, ids.CPL_D, ids.CPL_E, ...XU.map(xSvc)].map((sid) => ({ key: K, scope: "SERVICE", scopeId: sid, value: ["COUPLE_ROOM"] })),
      { key: K, scope: "SERVICE", scopeId: ids.OIL, value: ["ROOM"] },
      ...[ids.CPL, ids.CPL_D, ids.CPL_E].map((sid) => ({ key: "booking.service.staffCount", scope: "SERVICE", scopeId: sid, value: 2 })),
    ]);
    tplOk = true;
  });

  // ═══════════════ S จองกลุ่ม ═══════════════
  console.log("\n── S: bookGroup · findGroupSlots · staffCount ──");
  let s1Gid = "";
  await st("S-1", "bookGroup STAFF [ห้องคู่ หมอ 1, ห้องคู่ หมอ 2] 14:00 ⇒ 2 แถว groupId เดียวกัน (= ผลคืน) · เริ่มพร้อมกัน · หมอตามที่ขอ · ห้องคู่ชิ้นเดียวกัน · CONFIRMED · ชื่อ/เบอร์/ราคาต่อแถว · ids/staffIds เรียงตามสมาชิก", async () => {
    needTpl();
    const i = gin([{ serviceId: ids.VIP, staffId: gS[0] }, { serviceId: ids.VIP, staffId: gS[1] }], D.S1, 840);
    const r = okGroup(await GR.book()(cG, i), "จองกลุ่ม");
    s1Gid = r.groupId;
    eq([r.ids.length, r.staffIds, r.status, r.depositSatang], [2, [gS[0], gS[1]], "CONFIRMED", 0], "ผลคืน");
    const rows = await apRows(r.ids);
    eq(rows.map((a) => [a.groupId, tms(a.startAt), a.staffId, resIdsOf(a), a.status, a.kind, a.customerName, a.customerPhone, a.priceSatang]),
      [[r.groupId, bkkMs(D.S1, 840), gS[0], [ids.vip1], "CONFIRMED", "BOOKED", i.customerName, i.customerPhone, 150_000], [r.groupId, bkkMs(D.S1, 840), gS[1], [ids.vip1], "CONFIRMED", "BOOKED", i.customerName, i.customerPhone, 150_000]], "แถว");
    eq((await groupRows(r.groupId)).length, 2, "แถวของ groupId");
    eq(await resViolations(ids.uG), [], "ห้องล้น");
  });
  await st("S-2", "ใครก็ได้ ×2 (16:00) ⇒ หมอไม่ซ้ำกันตามลำดับ (หมอ 1, หมอ 2) · ห้องคู่เดียวกัน", async () => {
    needTpl();
    const r = okGroup(await GR.book()(cG, gin([{ serviceId: ids.VIP, staffId: null }, { serviceId: ids.VIP, staffId: null }], D.S1, 960)), "ใครก็ได้");
    eq(r.staffIds, [gS[0], gS[1]], "หมอ");
    eq((await apRows(r.ids)).map(resIdsOf), [[ids.vip1], [ids.vip1]], "ห้อง");
  });
  await st("S-3", "ได้ครบหรือไม่ได้เลย (หมอ): หมอ 2 มีนัด 14:00 ⇒ กลุ่ม [หมอ 1, หมอ 2] 14:00 ล้ม FULL · ไม่มีแถวกลุ่มใดถูกสร้าง (นัดของวันนั้น = 1)", async () => {
    needTpl();
    await bookOk(cG, ids.PLAIN, gS[1], D.S3, 840, "นัดหมอ 2");
    const r = await GR.book()(cG, gin([{ serviceId: ids.VIP, staffId: gS[0] }, { serviceId: ids.VIP, staffId: gS[1] }], D.S3, 840));
    eq([r.ok, r.ok ? null : r.code], [false, "FULL"], "ผล");
    const rows = await unitRows(ids.uG, D.S3);
    eq([rows.length, rows.filter((a) => a.groupId).length], [1, 0], "แถวของวัน");
  });
  await st("S-4", "ได้ครบหรือไม่ได้เลย (ห้องที่เหลือที่เดียว): ห้องคู่มีเดี่ยว 14:00 (ถือถึง 15:15 รวมเก็บ 15) ⇒ กลุ่ม 14:00 / 15:00 ล้ม FULL ไม่มีแถวกลุ่ม · 15:15 (พอดีขอบ) ได้", async () => {
    needTpl();
    await bookOk(cG, ids.VIP, gS[2], D.S4, 840, "เดี่ยวห้องคู่");
    for (const m of [840, 900]) {
      const r = await GR.book()(cG, gin([{ serviceId: ids.VIP, staffId: gS[0] }, { serviceId: ids.VIP, staffId: gS[1] }], D.S4, m));
      eq([r.ok, r.ok ? null : r.code], [false, "FULL"], `กลุ่ม ${hhmm(m)}`);
    }
    eq((await unitRows(ids.uG, D.S4)).filter((a) => a.groupId).length, 0, "แถวกลุ่มหลังล้ม");
    okGroup(await GR.book()(cG, gin([{ serviceId: ids.VIP, staffId: gS[0] }, { serviceId: ids.VIP, staffId: gS[1] }], D.S4, 915)), "กลุ่ม 15:15");
    eq(await resViolations(ids.uG), [], "ห้องล้น");
  });
  await st("S-5", "§4 ข้อ 2 \"ห้องเดียว\" (ruling R3): ห้องน้ำมัน A/B จุห้องละ 1 ⇒ กลุ่มน้ำมัน 2 คน ล้ม FULL (ไม่แยกไปคนละห้อง) · ตัวควบคุม: จองเดี่ยว 2 ครั้งได้ห้อง A และ B", async () => {
    needTpl();
    const r = await GR.book()(cG, gin([{ serviceId: ids.OIL, staffId: gS[0] }, { serviceId: ids.OIL, staffId: gS[1] }], D.S5, 600));
    eq([r.ok, r.ok ? null : r.code], [false, "FULL"], "กลุ่มน้ำมัน");
    eq((await unitRows(ids.uG, D.S5)).length, 0, "แถวหลังล้ม");
    const a = await apRow(await bookOk(cG, ids.OIL, gS[0], D.S5, 600, "เดี่ยว 1"));
    const b = await apRow(await bookOk(cG, ids.OIL, gS[1], D.S5, 600, "เดี่ยว 2"));
    eq([resIdsOf(a), resIdsOf(b)], [[ids.rA], [ids.rB]], "ตัวควบคุมเดี่ยว");
  }, "MAJOR");
  await st("S-6", "ข้อมูลผิด: สมาชิก 1 คน / 11 คน / ไม่ใช่ array ⇒ GROUP_SIZE · หมอระบุตัวซ้ำ ⇒ BAD_INPUT · บริการ/หมอของหน่วยอื่น ⇒ NOT_FOUND · ไม่มีแถวถูกสร้าง", async () => {
    needTpl();
    const before = (await unitRows(ids.uG, D.S5)).length;
    const one: MemberIn = { serviceId: ids.VIP, staffId: null };
    for (const [members, code] of [[[one], "GROUP_SIZE"], [Array.from({ length: 11 }, () => one), "GROUP_SIZE"], ["x" as unknown as MemberIn[], "GROUP_SIZE"],
      [[{ serviceId: ids.VIP, staffId: gS[3] }, { serviceId: ids.VIP, staffId: gS[3] }], "BAD_INPUT"],
      [[{ serviceId: ids.A2SVC, staffId: null }, one], "NOT_FOUND"], [[{ serviceId: ids.VIP, staffId: ids.a2s }, one], "NOT_FOUND"]] as [MemberIn[], string][]) {
      const r = await GR.book()(cG, gin(members, D.S5, 960));
      eq([r.ok, r.ok ? null : r.code], [false, code], `members ${fmt(members).slice(0, 80)}`);
    }
    eq((await unitRows(ids.uG, D.S5)).length, before, "แถวของวัน");
  }, "MAJOR");
  await st("S-7", "ยิงซ้ำ key เดิม ⇒ กลุ่มเดิม (groupId/ids เดิม) · แถวกลุ่ม 2 แถวเท่าเดิม", async () => {
    needTpl();
    const i = gin([{ serviceId: ids.VIP, staffId: null }, { serviceId: ids.VIP, staffId: null }], D.S7, 600);
    const a = okGroup(await GR.book()(cG, i), "ครั้งแรก");
    const b = okGroup(await GR.book()(cG, i), "ครั้งที่สอง");
    eq([b.groupId, b.ids], [a.groupId, a.ids], "ผลซ้ำ");
    eq((await groupRows(a.groupId)).length, 2, "แถวกลุ่ม");
  });
  await st("S-8", "§3.2 bookAppointment บริการคู่รัก (staffCount 2 · ระบุหมอ 1) ⇒ ok + groupId · 2 แถว (หมอ 1 + หมอว่างคนแรก = หมอ 2) · ห้องคู่เดียวกัน · เวลาเดียวกัน", async () => {
    needTpl();
    const r = await BK().bookAppointment(cG, bk({ serviceId: ids.CPL, staffId: gS[0], dateStr: D.S7, startMin: 840 }));
    ok(r.ok, `จอง ${fmt(r)}`);
    const gid = r.ok ? r.groupId : undefined;
    ok(typeof gid === "string" && !!gid, `ไม่มี groupId ในผล ${fmt(r)}`);
    const rows = await groupRows(gid as string);
    eq(rows.map((a) => [a.staffId, tms(a.startAt), resIdsOf(a)]), [[gS[0], bkkMs(D.S7, 840), [ids.vip1]], [gS[1], bkkMs(D.S7, 840), [ids.vip1]]], "แถว");
    eq(r.ok ? r.id : null, rows[0].id, "id ผลคืน = หัวกลุ่ม");
  });
  await st("S-9", "ด่านเดียว (หาเวลา = จอง): ห้องคู่มีเดี่ยว 12:00 ⇒ findGroupSlots มี 10:45 · 13:15 · ไม่มี 11:00 · 11:15 · 12:00 · 13:00 · จอง 11:00 ⇒ FULL · จอง 10:45 ⇒ ได้ แล้ว 10:45 หายจากรายการ", async () => {
    needTpl();
    await bookOk(cG, ids.VIP, gS[2], D.S9, 720, "เดี่ยวห้องคู่ 12:00");
    const mem: MemberIn[] = [{ serviceId: ids.VIP, staffId: null }, { serviceId: ids.VIP, staffId: null }];
    const L = new Set((await GR.slots()(cG, { members: mem, dateStr: D.S9, channel: "STAFF" })).map((x) => x.startMin));
    const got = (m: number) => L.has(m);
    eq([645, 795, 660, 675, 720, 780].map(got), [true, true, false, false, false, false], "ช่อง 10:45 13:15 | 11:00 11:15 12:00 13:00");
    const f = await GR.book()(cG, gin(mem, D.S9, 660));
    eq([f.ok, f.ok ? null : f.code], [false, "FULL"], "จอง 11:00");
    okGroup(await GR.book()(cG, gin(mem, D.S9, 645)), "จอง 10:45");
    ok(!(await GR.slots()(cG, { members: mem, dateStr: D.S9, channel: "STAFF" })).some((x) => x.startMin === 645), "10:45 ยังอยู่หลังจองเต็มห้อง");
    eq(await resViolations(ids.uG), [], "ห้องล้น");
  });
  await st("S-10", "X1: ctx ร้านอื่น (บริการ/หมอของร้าน A) ⇒ NOT_FOUND ไม่มีแถว · ctx หน่วยอื่นร้านเดียวกัน ⇒ NOT_FOUND · groupOf ข้ามร้าน/หน่วย ⇒ null · ร้านเดียวกันหน่วยถูก ⇒ เห็นกลุ่ม 2 คน", async () => {
    needTpl();
    ok(!!s1Gid, "ไม่มีกลุ่มจาก S-1");
    const mem: MemberIn[] = [{ serviceId: ids.VIP, staffId: null }, { serviceId: ids.VIP, staffId: null }];
    for (const c of [cBx(ids.uG), cBx(ids.uB), cA2]) {
      const r = await GR.book()(c, gin(mem, D.S5, 1020));
      eq([r.ok, r.ok ? null : r.code], [false, "NOT_FOUND"], `ctx ${c.tenantId.slice(-10)}/${c.unitId.slice(-10)}`);
    }
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1`, [ids.tB]))[0].n, 0, "แถวร้าน B");
    for (const c of [cBx(ids.uB), cBx(ids.uG), cA2]) eq(await GR.of()(c, s1Gid), null, `groupOf ข้าม ${c.unitId.slice(-10)}`);
    const v = await GR.of()(cG, s1Gid);
    eq([v?.groupId, v?.members.length, v?.members.filter((m) => m.leader).length], [s1Gid, 2, 1], "groupOf");
  });
  await st("S-11", "กลุ่มไม่ใช้ห้อง (ตัดผมพร้อมกัน 2 คน) ⇒ ได้ · resourceIds [] · _fallback: จองเดี่ยวบริการ staffCount 1 ⇒ ผลไม่มีคีย์ groupId · แถว groupId null", async () => {
    needTpl();
    const r = okGroup(await GR.book()(cP, gin([{ serviceId: ids.CUT, staffId: null }, { serviceId: ids.CUT, staffId: null }], D.S1, 600)), "กลุ่มตัดผม");
    eq((await apRows(r.ids)).map((a) => [a.staffId, resIdsOf(a)]), [[pS[0], []], [pS[1], []]], "แถว");
    const s = await BK().bookAppointment(cP, bk({ serviceId: ids.CUT, staffId: pS[2], dateStr: D.S1, startMin: 600 }));
    ok(s.ok && !("groupId" in s), `เดี่ยว ${fmt(s)}`);
    eq((await apRow((s as { id: string }).id)).groupId, null, "groupId เดี่ยว");
  }, "MAJOR");

  // ═══════════════ CX ยกเลิก ═══════════════
  console.log("\n── CX: ยกเลิกทั้งกลุ่ม ──");
  let cxB: Extract<GroupBookResult, { ok: true }> | null = null;
  await st("CX-1", "cancelGroup ⇒ ทุกสมาชิก CANCELLED (SHOP) · booking.cancelled ต่อสมาชิก 1 ครั้ง · ห้องว่าง ⇒ จองกลุ่มเวลาเดิมได้", async () => {
    needTpl();
    const mem: MemberIn[] = [{ serviceId: ids.VIP, staffId: gS[0] }, { serviceId: ids.VIP, staffId: gS[1] }];
    const g = okGroup(await GR.book()(cG, gin(mem, D.CX, 840)), "จอง");
    const c = await GR.cancel()(cG, g.groupId);
    ok(c.ok, `cancelGroup ${fmt(c)}`);
    eq((await apRows(g.ids)).map((a) => [a.status, a.cancelReason]), [["CANCELLED", "SHOP"], ["CANCELLED", "SHOP"]], "แถว");
    eq(await Promise.all(g.ids.map((id) => evCount("booking.cancelled", id))), [1, 1], "event");
    const again = await GR.cancel()(cG, g.groupId);
    ok(again.ok, `ยกเลิกซ้ำ ${fmt(again)}`);
    eq(await Promise.all(g.ids.map((id) => evCount("booking.cancelled", id))), [1, 1], "event หลังยกเลิกซ้ำ");
    okGroup(await GR.book()(cG, gin(mem, D.CX, 840)), "จองใหม่เวลาเดิม");
  });
  await st("CX-2", "อะตอมมิก: สมาชิกหนึ่งกำลังทำ (IN_SERVICE) ⇒ cancelGroup BAD_STATE · ไม่มีใครถูกยกเลิก", async () => {
    needTpl();
    cxB = okGroup(await GR.book()(cG, gin([{ serviceId: ids.VIP, staffId: gS[2] }, { serviceId: ids.VIP, staffId: gS[3] }], D.CX, 1020)), "จอง");
    await pool.query(`UPDATE "Appointment" SET status = 'IN_SERVICE', "startedAt" = "startAt", "checkedInAt" = "startAt" WHERE id = $1`, [cxB.ids[1]]);
    try {
      const c = await GR.cancel()(cG, cxB.groupId);
      eq([c.ok, c.ok ? null : c.code], [false, "BAD_STATE"], "cancelGroup");
      eq((await apRows(cxB.ids)).map((a) => a.status), ["CONFIRMED", "IN_SERVICE"], "แถว");
    } finally {
      await pool.query(`UPDATE "Appointment" SET status = 'CONFIRMED', "startedAt" = NULL, "checkedInAt" = NULL WHERE id = $1`, [cxB.ids[1]]);
    }
  });
  await st("CX-3", "X1: cancelGroup/rescheduleGroup ด้วย ctx ร้านอื่น · หน่วยอื่น · groupId ที่ไม่มี ⇒ NOT_FOUND ข้อความเดียวกันทุกกรณี · แถวไม่เปลี่ยน", async () => {
    needTpl();
    ok(!!cxB, "ไม่มีกลุ่มจาก CX-2");
    const g = cxB!;
    const outs = [await GR.cancel()(cBx(ids.uG), g.groupId), await GR.cancel()(cA2, g.groupId), await GR.cancel()(cG, `${g.groupId}x`),
      await GR.resched()(cBx(ids.uG), g.groupId, { dateStr: D.CX, startMin: 600 }), await GR.resched()(cA2, g.groupId, { dateStr: D.CX, startMin: 600 })];
    eq(outs.map((o) => (o.ok ? "OK" : o.code)), ["NOT_FOUND", "NOT_FOUND", "NOT_FOUND", "NOT_FOUND", "NOT_FOUND"], "รหัส");
    eq(new Set(outs.map((o) => (o.ok ? "" : o.reason))).size, 1, "ข้อความต่างกัน (ต้องเดียวกัน)");
    eq((await apRows(g.ids)).map((a) => [a.status, tms(a.startAt)]), [["CONFIRMED", bkkMs(D.CX, 1020)], ["CONFIRMED", bkkMs(D.CX, 1020)]], "แถว");
  });
  await st("CX-4", "§3.2 ร้านยกเลิกรายคน (cancelByShop สมาชิก 2) ⇒ เฉพาะคนนั้น CANCELLED · สมาชิก 1 CONFIRMED · groupId คงอยู่ · groupOf เห็น 2 คน", async () => {
    needTpl();
    ok(!!cxB, "ไม่มีกลุ่มจาก CX-2");
    const r = await LN().cancelByShop(cG, cxB!.ids[1], { note: "ป่วย" });
    ok(r.ok, `cancelByShop ${fmt(r)}`);
    eq((await apRows(cxB!.ids)).map((a) => [a.status, a.groupId]), [["CONFIRMED", cxB!.groupId], ["CANCELLED", cxB!.groupId]], "แถว");
    eq((await GR.of()(cG, cxB!.ids[0]))?.members.length, 2, "groupOf จาก id สมาชิก");
  }, "MAJOR");

  // ═══════════════ RS เลื่อน ═══════════════
  console.log("\n── RS: เลื่อนทั้งกลุ่ม ──");
  let rsG: Extract<GroupBookResult, { ok: true }> | null = null;
  const rsStarts = async () => (await apRows(rsG!.ids)).map((a) => HM(tms(a.startAt)));
  await st("RS-1", "rescheduleGroup 10:00 → 12:00 ⇒ ทุกคน 12:00 · หมอเดิม · ห้องคู่เดิม · endAt ตามนาที", async () => {
    needTpl();
    rsG = okGroup(await GR.book()(cG, gin([{ serviceId: ids.VIP, staffId: gS[0] }, { serviceId: ids.VIP, staffId: gS[1] }], D.RS, 600)), "จอง");
    const r = await GR.resched()(cG, rsG.groupId, { dateStr: D.RS, startMin: 720 });
    ok(r.ok, `เลื่อน ${fmt(r)}`);
    eq((await apRows(rsG.ids)).map((a) => [HM(tms(a.startAt)), HM(tms(a.endAt)), a.staffId, resIdsOf(a)]), [["12:00", "13:00", gS[0], [ids.vip1]], ["12:00", "13:00", gS[1], [ids.vip1]]], "แถว");
  });
  await st("RS-2", "ไม่นับตัวเอง: เลื่อน 12:00 → 12:15 (ทับช่วงเดิมของกลุ่ม) ⇒ ได้", async () => {
    needTpl(); ok(!!rsG, "ไม่มีกลุ่ม");
    const r = await GR.resched()(cG, rsG!.groupId, { dateStr: D.RS, startMin: 735 });
    ok(r.ok, `เลื่อน ${fmt(r)}`);
    eq(await rsStarts(), ["12:15", "12:15"], "เวลา");
  });
  await st("RS-3", "อะตอมมิก: หมอ 2 มีนัด 15:00 ⇒ เลื่อนไป 15:00 ล้ม (ไม่ ok) · ห้องคู่มีเดี่ยว 17:00 ⇒ เลื่อนไป 17:00 ล้ม FULL · ทุกแถวคง 12:15", async () => {
    needTpl(); ok(!!rsG, "ไม่มีกลุ่ม");
    await bookOk(cG, ids.PLAIN, gS[1], D.RS, 900, "นัดหมอ 2 15:00");
    await bookOk(cG, ids.VIP, gS[3], D.RS, 1020, "เดี่ยวห้องคู่ 17:00");
    const a = await GR.resched()(cG, rsG!.groupId, { dateStr: D.RS, startMin: 900 });
    ok(!a.ok, "เลื่อนไปช่องที่หมอ 2 ไม่ว่างได้");
    const b = await GR.resched()(cG, rsG!.groupId, { dateStr: D.RS, startMin: 1020 });
    eq([b.ok, b.ok ? null : b.code], [false, "FULL"], "เลื่อนไปช่องห้องเหลือที่เดียว");
    eq(await rsStarts(), ["12:15", "12:15"], "เวลา");
    eq(await resViolations(ids.uG), [], "ห้องล้น");
  });
  await st("RS-4", "§3.3 rescheduleByShop สมาชิกคนเดียวเปลี่ยนเวลา ⇒ GROUP · แถวไม่เปลี่ยน (ruling G9)", async () => {
    needTpl(); ok(!!rsG, "ไม่มีกลุ่ม");
    const r = await LN().rescheduleByShop(cG, rsG!.ids[0], { dateStr: D.RS, startMin: 780 });
    eq([r.ok, r.ok ? null : r.code], [false, "GROUP"], "rescheduleByShop");
    eq(await rsStarts(), ["12:15", "12:15"], "เวลา");
  }, "MAJOR");
  await st("RS-5", "§3.2 ลูกค้าเลื่อนผ่านหัวกลุ่ม (rescheduleBySelf · หมอเดิม) ⇒ ทั้งกลุ่มไป 14:00 · สมาชิกที่ไม่ใช่หัวกลุ่ม ⇒ NOT_FOUND", async () => {
    needTpl(); ok(!!rsG, "ไม่มีกลุ่ม");
    const r = await BK().rescheduleBySelf(cG, rsG!.ids[0], { dateStr: D.RS, startMin: 840, staffId: gS[0] });
    ok(r.ok, `rescheduleBySelf ${fmt(r)}`);
    eq(await rsStarts(), ["14:00", "14:00"], "เวลา");
    const m = await BK().rescheduleBySelf(cG, rsG!.ids[1], { dateStr: D.RS, startMin: 600, staffId: null });
    eq([m.ok, m.ok ? null : m.code], [false, "NOT_FOUND"], "สมาชิกไม่ใช่หัวกลุ่ม");
    eq(await rsStarts(), ["14:00", "14:00"], "เวลาหลังลองเลื่อนสมาชิก");
  }, "MAJOR");
  await st("RS-6", "หลังเลื่อนทุกแบบ: ห้องไม่ล้น · หมอไม่ซ้อน (หน่วยหลัก)", async () => {
    needTpl();
    eq(await resViolations(ids.uG), [], "ห้องล้น");
    eq(await staffOverlap(ids.uG), [], "หมอซ้อน");
  });

  // ═══════════════ CI มาไม่พร้อมกัน · DB-1 ═══════════════
  console.log("\n── CI: มาไม่พร้อมกัน · ตัววางคิว/ฐานนิยามเดียว ──");
  let ciG: Extract<GroupBookResult, { ok: true }> | null = null;
  let ciPhone = "";
  const ciNow = (min: number) => at(D.CI, min);
  await st("CI-1", "เช็กอินจอร้านรายคน (สมาชิก 1 · 13:50) ⇒ สมาชิก 1 ARRIVED · สมาชิก 2 ยัง CONFIRMED", async () => {
    needTpl();
    const i = gin([{ serviceId: ids.VIP, staffId: gS[0] }, { serviceId: ids.VIP, staffId: gS[1] }], D.CI, 840);
    ciPhone = i.customerPhone;
    ciG = okGroup(await GR.book()(cG, i), "จอง");
    const r = await LN().checkIn(cG, { appointmentId: ciG.ids[0] }, { via: "STAFF", now: ciNow(830) });
    ok(r.ok, `checkIn ${fmt(r)}`);
    eq((await apRows(ciG.ids)).map((a) => a.status), ["ARRIVED", "CONFIRMED"], "สถานะ");
  });
  await st("CI-2", "มาไม่ครบ กลุ่มยังถือห้องทั้ง 2 ที่: จองเดี่ยวห้องคู่ 14:00 (หมอ 3) ⇒ FULL · ห้องไม่ล้น", async () => {
    needTpl(); ok(!!ciG, "ไม่มีกลุ่ม");
    const r = await BK().bookAppointment(cG, bk({ serviceId: ids.VIP, staffId: gS[2], dateStr: D.CI, startMin: 840 }));
    eq([r.ok, r.ok ? null : r.code], [false, "FULL"], "เดี่ยว");
    eq(await resViolations(ids.uG), [], "ห้องล้น");
  });
  await st("CI-3", "§3.3 เช็กอินด้วยเบอร์ของกลุ่ม (13:52) ⇒ ok (ไม่ใช่ AMBIGUOUS) · สมาชิกที่ยังไม่มาเช็กอินด้วย ⇒ ทั้งคู่ ARRIVED (ruling G7)", async () => {
    needTpl(); ok(!!ciG, "ไม่มีกลุ่ม");
    const r = await LN().checkIn(cG, { phone: ciPhone }, { via: "PHONE", now: ciNow(832) });
    ok(r.ok, `checkIn เบอร์ ${fmt(r)}`);
    eq((await apRows(ciG!.ids)).map((a) => a.status), ["ARRIVED", "ARRIVED"], "สถานะ");
  }, "MAJOR");
  await st("DB-1", "ตัววางคิว/ฐานนิยามเดียว: หมอ 1 ทำงานเลยถึง 14:10 · กลุ่ม 14:00 ⇒ runPlanner วางทั้งกลุ่ม plannedStartAt 14:10 · ห้องถือถึง 15:25 ⇒ จองเดี่ยวห้องคู่ 15:15 FULL · ห้องไม่ล้น", async () => {
    needTpl();
    const prev = await bookOk(cG, ids.PLAIN, gS[0], D.DB, 780, "นัดหมอ 1 13:00");
    const g = okGroup(await GR.book()(cG, gin([{ serviceId: ids.VIP, staffId: gS[0] }, { serviceId: ids.VIP, staffId: gS[1] }], D.DB, 840)), "จองกลุ่ม");
    await pool.query(`UPDATE "Appointment" SET status = 'IN_SERVICE', "checkedInAt" = $2, "startedAt" = $2 WHERE id = $1`, [prev, at(D.DB, 790)]);
    const rr = await RN().runPlanner(cG, { now: at(D.DB, 810) });
    ok(rr.ran, `runPlanner ไม่ทำงาน ${fmt(rr)}`);
    eq((await apRows(g.ids)).map((a) => HM(tms(a.plannedStartAt))), ["14:10", "14:10"], "plannedStartAt");
    const r = await BK().bookAppointment(cG, bk({ serviceId: ids.VIP, staffId: gS[2], dateStr: D.DB, startMin: 915 }));
    eq([r.ok, r.ok ? null : r.code], [false, "FULL"], "เดี่ยว 15:15");
    eq(await resViolations(ids.uG), [], "ห้องล้น");
  });

  // ═══════════════ D มัดจำรวม ═══════════════
  console.log("\n── D: มัดจำรวม (เงินตรงทุกสตางค์ · GL) ──");
  let d1: Extract<GroupBookResult, { ok: true }> | null = null;
  let d1Token = "";
  const pairMembers: MemberIn[] = [{ serviceId: ids.OIL_D, staffId: null }, { serviceId: ids.ARO_D, staffId: null }];
  await st("D-1", `ONLINE [น้ำมัน 90,005 · อโรมา 120,003] × 20% ⇒ PENDING ถือช่อง · มัดจำรวม ${DEP_PAIR} (Σ ต่อแถวตรงทุกสตางค์) · ผลคืน depositSatang = Σ`, async () => {
    needTpl();
    d1 = okGroup(await GR.book()(cD, gin(pairMembers, D.D1, 840, "ONLINE")), "จอง");
    eq([d1.status, d1.holdUntil !== null, d1.depositSatang], ["PENDING", true, DEP_PAIR], "ผลคืน");
    const rows = await apRows(d1.ids);
    eq([rows.reduce((t, a) => t + a.depositSatang, 0), rows.map((a) => a.status)], [DEP_PAIR, ["PENDING", "PENDING"]], "แถว");
  });
  await st("D-1b", `ruling G5: ยอดต่อแถวตามบริการของแถว [${DEP_OIL}, ${DEP_ARO}] · ลิงก์จัดการนัดเฉพาะหัวกลุ่ม (manageTokenHash ของสมาชิกอื่น null)`, async () => {
    needTpl(); ok(!!d1, "ไม่มีกลุ่ม D-1");
    const rows = await apRows(d1!.ids);
    eq(rows.map((a) => [a.depositSatang, a.manageTokenHash !== null]), [[DEP_OIL, true], [DEP_ARO, false]], "แถว");
  }, "MAJOR");
  await st("D-2", `จ่ายครั้งเดียว: loadDepositPay(ลิงก์หัวกลุ่ม) ⇒ AWAITING ยอด ${DEP_PAIR} · groupOf.deposit required ${DEP_PAIR} paid 0`, async () => {
    needTpl(); ok(!!d1, "ไม่มีกลุ่ม D-1");
    d1Token = await tokenOf(cD, d1!.ids[0]);
    const p = await DEP().loadDepositPay(d1Token, { ip: newIp() });
    ok(p.ok, `loadDepositPay ${fmt(p)}`);
    if (p.ok) eq([p.pay.state, p.pay.amountSatang], ["AWAITING", DEP_PAIR], "หน้าจ่าย");
    const v = await GR.of()(cD, d1!.groupId);
    eq([v?.deposit.requiredSatang, v?.deposit.paidSatang], [DEP_PAIR, 0], "groupOf.deposit");
  });
  const moneyOf = async (memberIds: string[]) => {
    const rc = (await receiptsOf(memberIds)).filter((x) => x.status !== "VOIDED");
    const dep = await depositsOf(rc.map((x) => x.id));
    return { rc, dep, paid: dep.reduce((t, d) => t + d.amount, 0), refunded: dep.reduce((t, d) => t + d.refunded, 0) };
  };
  await st("D-3", `ร้านยืนยันรับมัดจำที่หัวกลุ่ม ⇒ ทุกแถวจ่ายแล้ว + CONFIRMED · ใบรับรวม ${DEP_PAIR} · PosDeposit Σ ${DEP_PAIR} · GL: Cr 2110+2200 = ${DEP_PAIR} · Dr เงิน ${DEP_PAIR} · สมดุล`, async () => {
    needTpl(); ok(!!d1, "ไม่มีกลุ่ม D-1");
    const r = await DEP().confirmDepositByShop(SHOP, { unitId: ids.uD, appointmentId: d1!.ids[0] });
    ok(r.ok, `confirm ${fmt(r)}`);
    const rows = await apRows(d1!.ids);
    eq(rows.map((a) => [a.status, a.depositPaidAt !== null]), [["CONFIRMED", true], ["CONFIRMED", true]], "แถว");
    const m = await moneyOf(d1!.ids);
    eq([m.rc.reduce((t, x) => t + x.grand, 0), m.paid], [DEP_PAIR, DEP_PAIR], "ใบรับ/PosDeposit");
    const l = await jv(m.rc.map((x) => x.id));
    eq([netCr(l, (c) => c === "2110" || c === "2200"), -netCr(l, (c) => c.startsWith("1")), balanced(l)], [DEP_PAIR, DEP_PAIR, true], "GL");
    const v = await GR.of()(cD, d1!.groupId);
    eq(v?.deposit.paidSatang, DEP_PAIR, "groupOf.deposit.paid");
  });
  await st("D-4", "ยืนยันซ้ำ ⇒ ok · ใบรับ/ยอดไม่เพิ่ม (X4 ทางเดียว)", async () => {
    needTpl(); ok(!!d1, "ไม่มีกลุ่ม D-1");
    const before = await moneyOf(d1!.ids);
    const r = await DEP().confirmDepositByShop(SHOP, { unitId: ids.uD, appointmentId: d1!.ids[0] });
    ok(r.ok, `confirm ซ้ำ ${fmt(r)}`);
    const after = await moneyOf(d1!.ids);
    eq([after.rc.length, after.paid], [before.rc.length, before.paid], "ใบรับ");
  });
  await st("D-5", "หมดเวลาถือช่อง: คู่รัก ONLINE (staffCount 2) ที่ uE ไม่จ่าย ⇒ expireDepositHolds ครั้งเดียว ⇒ ทั้งคู่ CANCELLED DEPOSIT_TIMEOUT (ไม่มีครึ่งกลุ่ม)", async () => {
    needTpl();
    const r = await BK().bookAppointment(cE, bk({ serviceId: ids.CPL_E, staffId: null, dateStr: D.D1, startMin: 840, channel: "ONLINE" }));
    ok(r.ok && typeof r.groupId === "string", `จองคู่รัก ${fmt(r)}`);
    const gid = (r as { groupId: string }).groupId;
    await BK().expireDepositHolds(new Date(Date.now() + 3 * MIN));
    eq((await groupRows(gid)).map((a) => [a.status, a.cancelReason]), [["CANCELLED", "DEPOSIT_TIMEOUT"], ["CANCELLED", "DEPOSIT_TIMEOUT"]], "แถว");
  });
  await st("D-6", `ร้านยกเลิกกลุ่มที่จ่ายแล้ว ⇒ ค้างคืน Σ ${DEP_PAIR} · คืนที่หัวกลุ่ม ⇒ ทุกแถวคืนครบ (refunded Σ ${DEP_PAIR}) · GL 2110/2200/เงิน สุทธิ 0 · สมดุล`, async () => {
    needTpl(); ok(!!d1, "ไม่มีกลุ่ม D-1");
    const c = await GR.cancel()(cD, d1!.groupId);
    ok(c.ok, `cancelGroup ${fmt(c)}`);
    await pump();
    const v = await GR.of()(cD, d1!.groupId);
    eq(v?.deposit.refundDueSatang, DEP_PAIR, "groupOf.deposit.refundDue");
    const r = await DEP().refundDepositByShop(SHOP, { unitId: ids.uD, appointmentId: d1!.ids[0], reason: "ร้านยกเลิกกลุ่ม QC" });
    ok(r.ok, `refund ${fmt(r)}`);
    await pump();
    const m = await moneyOf(d1!.ids);
    eq(m.refunded, DEP_PAIR, "PosDeposit refunded Σ");
    const rf = await refundsOf(m.rc.map((x) => x.id));
    const l = await jv([...m.rc.map((x) => x.id), ...rf.map((x) => x.id)]);
    eq([netCr(l, (x) => x === "2110"), netCr(l, (x) => x === "2200"), netCr(l, (x) => x.startsWith("1")), balanced(l)], [0, 0, 0, true], "GL");
  });
  await st("D-7", `ยกเลิกช้า (ลิงก์หัวกลุ่ม · ริบ 50%) ⇒ ยอดที่ร้านเก็บ = Σ floor ต่อแถว ${FORFEIT_PAIR} (ไม่ใช่ ${Math.floor(DEP_PAIR / 2)}) · ทุกแถว CANCELLED CUSTOMER_LATE · บิลริบ Σ ${FORFEIT_PAIR} · ค้างคืน ${DEP_PAIR - FORFEIT_PAIR} · GL สมดุล · รายได้+VAT = ${FORFEIT_PAIR}`, async () => {
    needTpl();
    const g = okGroup(await GR.book()(cD, gin(pairMembers, D.D7, 840, "ONLINE")), "จอง");
    const pay = await DEP().confirmDepositByShop(SHOP, { unitId: ids.uD, appointmentId: g.ids[0] });
    ok(pay.ok, `confirm ${fmt(pay)}`);
    const quote = await ON().lateForfeitSatangOf(cD, g.ids[0]);
    eq(quote, FORFEIT_PAIR, "ยอดยกเลิกช้าที่บอกลูกค้า");
    const tok = await tokenOf(cD, g.ids[0]);
    const r = await ON().cancelOnline(tok, { now: at(D.D7, 780), ip: newIp(), acceptForfeit: true, acceptForfeitSatang: FORFEIT_PAIR });
    ok(r.ok, `cancelOnline ${fmt(r)}`);
    await pump();
    eq((await apRows(g.ids)).map((a) => [a.status, a.cancelReason]), [["CANCELLED", "CUSTOMER_LATE"], ["CANCELLED", "CUSTOMER_LATE"]], "แถว");
    const fb = await forfeitBillsOf(g.ids);
    eq(fb.reduce((t, x) => t + x.grand, 0), FORFEIT_PAIR, "บิลริบ Σ");
    const v = await GR.of()(cD, g.groupId);
    eq([v?.deposit.forfeitedSatang, v?.deposit.refundDueSatang], [FORFEIT_PAIR, DEP_PAIR - FORFEIT_PAIR], "groupOf.deposit");
    const m = await moneyOf(g.ids);
    const l = await jv([...m.rc.map((x) => x.id), ...fb.map((x) => x.id)]);
    const lf = await jv(fb.map((x) => x.id));
    eq([balanced(l), netCr(lf, (c) => c.startsWith("4") || c === "2200")], [true, FORFEIT_PAIR], "GL");
  });
  await st("D-8", `คู่รักผ่าน bookAppointment ONLINE (staffCount 2) ⇒ groupId · 2 แถว · มัดจำรวม ${DEP_OIL * 2} · หน้าจ่ายหัวกลุ่มยอดเดียวกัน`, async () => {
    needTpl();
    const r = await BK().bookAppointment(cD, bk({ serviceId: ids.CPL_D, staffId: null, dateStr: D.D8, startMin: 840, channel: "ONLINE" }));
    ok(r.ok && typeof r.groupId === "string", `จอง ${fmt(r)}`);
    const rows = await groupRows((r as { groupId: string }).groupId);
    eq([rows.length, rows.reduce((t, a) => t + a.depositSatang, 0), rows.map((a) => a.status)], [2, DEP_OIL * 2, ["PENDING", "PENDING"]], "แถว");
    const p = await DEP().loadDepositPay(await tokenOf(cD, (r as { id: string }).id), { ip: newIp() });
    ok(p.ok && p.pay.amountSatang === DEP_OIL * 2, `หน้าจ่าย ${fmt(p)}`);
  });

  // ═══════════════ X ยิงพร้อมกัน ═══════════════
  console.log("\n── X: ยิงพร้อมกัน 5 โพรเซส ──");
  const N_CHILD = 5;
  const dl0 = await deadlocks().catch(() => -1);
  const scenarios: Scenario[] = [];
  const outsOf = new Map<string, CallOut[]>();
  // X-1 กลุ่ม ×10 ห้องคู่เดียว
  const xmem = (u: string): MemberIn[] => [{ serviceId: xSvc(u), staffId: null }, { serviceId: xSvc(u), staffId: null }];
  scenarios.push({ key: "x1", perChild: Array.from({ length: N_CHILD }, () => Array.from({ length: 2 }, () => ({ fn: "group" as const, ctx: cX(ids.uX1), input: gin(xmem(ids.uX1), D.X, 840) }))) });
  // X-2 กลุ่ม ×5 ∥ เดี่ยว ×5
  scenarios.push({ key: "x2", perChild: Array.from({ length: N_CHILD }, (_, k) => [
    { fn: "group" as const, ctx: cX(ids.uX2), input: gin(xmem(ids.uX2), D.X, 840) },
    { fn: "book" as const, ctx: cX(ids.uX2), input: bk({ serviceId: xSvc(ids.uX2), staffId: xStaff(ids.uX2)[10 + k], dateStr: D.X, startMin: 840 }) },
  ]) });
  // X-3 เลื่อนกลุ่ม ×5 ∥ เดี่ยว ×5 ไป 18:00 (ตั้งกลุ่มก่อน)
  const x3Groups: Extract<GroupBookResult, { ok: true }>[] = [];
  let x3Ready = false;
  if (tplOk && groupLoad.mod) {
    try {
      for (let k = 0; k < 5; k++) {
        const s = xStaff(ids.uX3);
        x3Groups.push(okGroup(await GR.book()(cX(ids.uX3), gin([{ serviceId: xSvc(ids.uX3), staffId: s[2 * k] }, { serviceId: xSvc(ids.uX3), staffId: s[2 * k + 1] }], D.X, 600 + k * 75)), `ตั้งกลุ่ม X-3 #${k}`));
      }
      x3Ready = true;
    } catch (e) { console.log(`  ⚠️ ตั้งฉาก X-3 ไม่สำเร็จ: ${errMsg(e)}`); }
  }
  if (x3Ready) scenarios.push({ key: "x3", perChild: Array.from({ length: N_CHILD }, (_, k) => [
    { fn: "resGroup" as const, ctx: cX(ids.uX3), groupId: x3Groups[k].groupId, dateStr: D.X, startMin: 1080 },
    { fn: "book" as const, ctx: cX(ids.uX3), input: bk({ serviceId: xSvc(ids.uX3), staffId: xStaff(ids.uX3)[10 + k], dateStr: D.X, startMin: 1080 }) },
  ]) });
  // X-4 ยกเลิกกลุ่ม ×10
  let x4: Extract<GroupBookResult, { ok: true }> | null = null;
  if (tplOk && groupLoad.mod) { try { x4 = okGroup(await GR.book()(cX(ids.uX4), gin(xmem(ids.uX4), D.X, 840)), "ตั้งกลุ่ม X-4"); } catch (e) { console.log(`  ⚠️ ตั้งฉาก X-4 ไม่สำเร็จ: ${errMsg(e)}`); } }
  if (x4) scenarios.push({ key: "x4", perChild: Array.from({ length: N_CHILD }, () => Array.from({ length: 2 }, () => ({ fn: "cancelGroup" as const, ctx: cX(ids.uX4), groupId: x4!.groupId }))) });
  // X-5 ยืนยันมัดจำ ×5 ∥ หมดเวลา ×5 (uE · ถือช่อง 1 นาที)
  let x5: { id: string; groupId: string } | null = null;
  if (tplOk && groupLoad.mod) {
    try {
      const r = await BK().bookAppointment(cE, bk({ serviceId: ids.CPL_E, staffId: null, dateStr: D.X5, startMin: 840, channel: "ONLINE" }));
      if (r.ok && typeof r.groupId === "string") x5 = { id: r.id, groupId: r.groupId };
      else console.log(`  ⚠️ ตั้งฉาก X-5 ไม่สำเร็จ: ${fmt(r)}`);
    } catch (e) { console.log(`  ⚠️ ตั้งฉาก X-5 ไม่สำเร็จ: ${errMsg(e)}`); }
  }
  if (x5) scenarios.push({ key: "x5", perChild: Array.from({ length: N_CHILD }, () => [
    { fn: "confirm" as const, shop: SHOP, unitId: ids.uE, appointmentId: x5!.id },
    { fn: "expire" as const, nowMs: Date.now() + 3 * MIN },
  ]) });
  let harnessErr = "";
  if (tplOk && groupLoad.mod) {
    try { for (const [k, v] of await runHarness(scenarios, N_CHILD)) outsOf.set(k, v); } catch (e) { harnessErr = errMsg(e); console.log(`  ⚠️ ชุดยิงพร้อมกัน: ${harnessErr}`); }
  }
  const outs = (k: string): CallOut[] => { const o = outsOf.get(k); if (!o) throw new AssertFail(harnessErr || (groupLoad.mod ? `ไม่มีผลฉาก ${k}` : groupLoad.err)); return o; };
  const noThrow = (o: CallOut[]) => { const t = o.filter((x) => x.threw); ok(t.length === 0, `throw ${t.length}: ${t[0]?.threw}`); };
  await st("X-1", "กลุ่ม ×10 (5 โพรเซส) ห้องคู่เดียวจุ 2 ⇒ ได้ 1 กลุ่มพอดี · แถวของวัน 2 แถว groupId เดียว · ห้องไม่ล้น · ไม่ throw", async () => {
    needTpl();
    const o = outs("x1"); noThrow(o);
    eq(o.filter((x) => x.ok).length, 1, "กลุ่มที่ได้");
    const rows = (await unitRows(ids.uX1, D.X)).filter((a) => a.status !== "CANCELLED");
    eq([rows.length, new Set(rows.map((a) => a.groupId)).size], [2, 1], "แถว");
    eq(await resViolations(ids.uX1), [], "ห้องล้น");
  });
  await st("X-2", "กลุ่ม ×5 ∥ เดี่ยว ×5 ห้องคู่จุ 2 ⇒ {1 กลุ่ม + เดี่ยว 0} หรือ {กลุ่ม 0 + เดี่ยว ≤ 2} · ไม่มีครึ่งกลุ่ม (ทุก groupId ในฐาน = 2 แถว) · ห้องไม่ล้น", async () => {
    needTpl();
    const o = outs("x2"); noThrow(o);
    const g = o.filter((x) => x.fn === "group" && x.ok).length, s = o.filter((x) => x.fn === "book" && x.ok).length;
    ok((g === 1 && s === 0) || (g === 0 && s <= 2 && s >= 1), `กลุ่ม ${g} · เดี่ยว ${s}`);
    const rows = (await unitRows(ids.uX2, D.X)).filter((a) => a.status !== "CANCELLED");
    const byG = new Map<string, number>();
    for (const a of rows) if (a.groupId) byG.set(a.groupId, (byG.get(a.groupId) ?? 0) + 1);
    ok([...byG.values()].every((n) => n === 2), `ครึ่งกลุ่ม ${fmt([...byG.values()])}`);
    eq(await resViolations(ids.uX2), [], "ห้องล้น");
  });
  await st("X-3", "เลื่อนกลุ่ม ×5 ∥ จองเดี่ยว ×5 ไปช่อง 18:00 ห้องคู่จุ 2 ⇒ ที่ 18:00 มี {1 กลุ่ม} หรือ {เดี่ยว ≤ 2} · กลุ่มที่ไม่ได้อยู่เวลาเดิมครบทั้งคู่ · ทุกกลุ่มเริ่มพร้อมกัน · ห้องไม่ล้น", async () => {
    needTpl(); ok(x3Ready, "ตั้งฉากไม่สำเร็จ");
    const o = outs("x3"); noThrow(o);
    const moved = o.filter((x) => x.fn === "resGroup" && x.ok).length, s = o.filter((x) => x.fn === "book" && x.ok).length;
    ok((moved === 1 && s === 0) || (moved === 0 && s >= 1 && s <= 2), `เลื่อนได้ ${moved} · เดี่ยว ${s}`);
    for (const [k, g] of x3Groups.entries()) {
      const rows = await apRows(g.ids);
      const starts = new Set(rows.map((a) => tms(a.startAt)));
      eq(starts.size, 1, `กลุ่ม #${k} เริ่มไม่พร้อมกัน`);
      const t = [...starts][0];
      ok(t === bkkMs(D.X, 1080) || t === bkkMs(D.X, 600 + k * 75), `กลุ่ม #${k} อยู่ที่ ${HM(t)}`);
    }
    eq(await resViolations(ids.uX3), [], "ห้องล้น");
  });
  await st("X-4", "cancelGroup ×10 กลุ่มเดียว ⇒ ไม่ throw · ทุกทาง ok (ครั้งหลัง = idempotent) · ทั้งคู่ CANCELLED · booking.cancelled ต่อสมาชิก 1 ครั้ง", async () => {
    needTpl(); ok(!!x4, "ตั้งฉากไม่สำเร็จ");
    const o = outs("x4"); noThrow(o);
    ok(o.every((x) => x.ok || x.code === "BUSY"), `รหัส ${fmt(o.map((x) => x.code))}`);
    ok(o.some((x) => x.ok), "ไม่มีทางใด ok");
    eq((await apRows(x4!.ids)).map((a) => a.status), ["CANCELLED", "CANCELLED"], "แถว");
    eq(await Promise.all(x4!.ids.map((id) => evCount("booking.cancelled", id))), [1, 1], "event");
  });
  await st("X-5", "ยืนยันมัดจำหัวกลุ่ม ×5 ∥ expireDepositHolds ×5 ⇒ ทั้งกลุ่มจ่าย+CONFIRMED (ใบรับ Σ = ยอดรวม) หรือ ทั้งกลุ่ม CANCELLED DEPOSIT_TIMEOUT (เงินค้างสุทธิ 0) · สถานะไม่ผสม · ใบรับต่อแถว ≤ 1", async () => {
    needTpl(); ok(!!x5, "ตั้งฉากไม่สำเร็จ");
    const o = outs("x5"); noThrow(o);
    const rows = await groupRows(x5!.groupId);
    const sts = new Set(rows.map((a) => a.status));
    eq(sts.size, 1, `สถานะผสม ${fmt(rows.map((a) => a.status))}`);
    const total = rows.reduce((t, a) => t + a.depositSatang, 0);
    const m = await moneyOf(rows.map((a) => a.id));
    for (const a of rows) ok((await receiptsOf([a.id])).filter((x) => x.status !== "VOIDED").length <= 1, `ใบรับซ้ำของ ${a.id.slice(-6)}`);
    if (sts.has("CONFIRMED")) eq([rows.every((a) => a.depositPaidAt !== null), m.paid - m.refunded], [true, total], "จ่ายครบ");
    else { eq([...sts], ["CANCELLED"], "สถานะ"); eq(m.paid - m.refunded, 0, "เงินค้างหลังปล่อยช่อง"); }
  });
  await st("X-9", "deadlock ของฐาน (pg_stat_database.deadlocks) ไม่เพิ่มระหว่างฉากยิงพร้อมกันทั้งหมด", async () => {
    needTpl(); ok(outsOf.size > 0, harnessErr || "ไม่มีผลฉากยิงพร้อมกัน");
    const dl1 = await deadlocks();
    ok(dl0 >= 0, "อ่าน pg_stat_database ไม่ได้");
    eq(dl1 - dl0, 0, "deadlock ที่เพิ่ม");
  });

  // ═══════════════ X8 PDPA ═══════════════
  await st("X8-1", "PDPA: payload ของ outbox ร้านทดสอบทุกแถวไม่มีชื่อ/เบอร์ลูกค้า (รวม event ของสมาชิกกลุ่ม) · มี event ของกลุ่มอย่างน้อย 1 แถว", async () => {
    needTpl();
    const rows = await q<{ type: string; p: string }>(`SELECT type, payload::text AS p FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[])`, [ALL_TENANTS]);
    ok(rows.length > 0, "ไม่มี event เลย");
    const leak = rows.filter((r) => NAMES.some((n) => r.p.includes(n)) || PHONES.some((p) => r.p.includes(p) || r.p.includes(p.slice(1))));
    ok(leak.length === 0, `PII หลุด ${leak.length} แถว (${leak[0]?.type})`);
  });
} catch (e) {
  record("CRASH", "จบกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  // ═══════════════ Z ล้างข้อมูล ═══════════════
  console.log("\n── Z: ล้างข้อมูล ──");
  for (const f of goFiles) { try { unlinkSync(f); } catch { /* ไม่เป็นไร */ } }
  try { await cleanup(ALL_TENANTS); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  await cleanupGlobal();
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b15-*` 0 · นัด/บัตร/ทรัพยากร/ค่าตั้ง/ใบขาย/มัดจำ/บัญชี/outbox/audit ของร้านทดสอบ 0 · ผู้ใช้ทดสอบ 0 · ไฟล์สัญญาณของรอบนี้ 0", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "QueueTicket", "SvcResource", "SettingValue", "PosSale", "PosDeposit", "AccountJournalEntry", "AuditLog", "OutboxEvent", "BookingStaff"]) {
      if (!(await cols(t)).length) continue;
      eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [ALL_TENANTS]))[0].n, 0, t);
    }
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]))[0].n, 0, "user");
    eq(goFiles.filter((f) => existsSync(f)).length, 0, "ไฟล์สัญญาณ");
  }, "MAJOR");
  await pool.end();
}

// ═══════════════ สายยิงพร้อมกัน (parent) ═══════════════
async function runHarness(scs: Scenario[], n: number): Promise<Map<string, CallOut[]>> {
  const out = new Map<string, CallOut[]>();
  const ready = new Map<string, Set<number>>();
  const res = new Map<string, Map<number, CallOut[]>>();
  const dead = new Set<number>();
  const errs: string[] = [];
  const kids = Array.from({ length: n }, (_, idx) => {
    const spec: ChildSpec = { run: RUN, idx, scenarios: scs.map((s) => ({ key: s.key, calls: s.perChild[idx] ?? [] })) };
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, QC_B15_CHILD: JSON.stringify(spec) }, stdio: ["ignore", "pipe", "pipe"] });
    createInterface({ input: ch.stdout }).on("line", (l) => {
      const m = /^(READY|RES) (\S+)(?: (.*))?$/.exec(l);
      if (m?.[1] === "READY") { if (!ready.has(m[2])) ready.set(m[2], new Set()); ready.get(m[2])!.add(idx); }
      else if (m?.[1] === "RES") { if (!res.has(m[2])) res.set(m[2], new Map()); res.get(m[2])!.set(idx, JSON.parse(m[3] ?? "[]") as CallOut[]); }
      else if (l.startsWith("CHILD_ERR")) errs.push(`#${idx} ${l}`);
    });
    let tail = "";
    ch.stderr.on("data", (b: Buffer) => { tail = (tail + b.toString()).slice(-400); });
    ch.on("exit", (code) => { dead.add(idx); if (code !== 0) errs.push(`#${idx} exit ${code} ${tail.split("\n").filter(Boolean).slice(-1)[0] ?? ""}`); });
    return ch;
  });
  const waitFor = async (cond: () => boolean, ms: number) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) return false; await sleep(20); } return true; };
  try {
    for (const [si, sc] of scs.entries()) {
      const alive = () => [...Array(n).keys()].filter((i) => !dead.has(i));
      const allReady = await waitFor(() => alive().every((i) => ready.get(sc.key)?.has(i)) && alive().length > 0, si === 0 ? 240_000 : 90_000);
      if (!allReady || alive().length < n) throw new Error(`ลูกโพรเซสไม่พร้อมที่ ${sc.key} (พร้อม ${ready.get(sc.key)?.size ?? 0}/${n}) ${errs.slice(0, 2).join(" · ")}`);
      const f = goFile(RUN, sc.key);
      writeFileSync(f, "go");
      goFiles.push(f);
      await waitFor(() => [...Array(n).keys()].every((i) => res.get(sc.key)?.has(i) || dead.has(i)), 180_000);
      out.set(sc.key, [...Array(n).keys()].flatMap((i) => res.get(sc.key)?.get(i) ?? []));
    }
  } finally {
    await waitFor(() => dead.size === n, 30_000);
    for (const k of kids) if (k.exitCode === null) k.kill("SIGKILL");
  }
  return out;
}

// ═══════════════ SF. ไฟล์ · สัญญาโค้ด ═══════════════
console.log("\n── SF: ไฟล์ · สัญญาโค้ด ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim().replace(/^"|"$/g, ""));
const OWN = new Set<string>([F.group, F.service, F.line, F.online, F.deposit, F.planner, F.run, F.res, F.index]);
{
  const ch = dirty(["src", "prisma"]);
  if (ch.length === 0) skip("SF-1", "แตะเฉพาะไฟล์ของใบ (ใบสั่ง §1 · planner-*.ts ได้)", "ไม่มีไฟล์ src/prisma ค้างใน working tree — ข้อนี้ตรวจตอนรับใบ (ผู้คุมตรวจ diff ก่อน merge)", "MAJOR");
  else await st("SF-1", "แตะเฉพาะไฟล์ของใบ (ใบสั่ง §1 · planner-*.ts ได้) · มี group.ts", () => {
    const out = ch.filter((p) => !OWN.has(p) && !/^src\/lib\/modules\/booking\/planner-[a-z0-9-]+\.ts$/.test(p));
    ok(out.length === 0, `แตะนอกขอบเขต: ${out.slice(0, 6).join(" · ")}`);
    ok(existsSync(join(ROOT, F.group)), "ไม่มี group.ts");
  }, "MAJOR");
}
await st("SF-2", `ไม่มี migration/แก้ schema (ruling R1): prisma/ ไม่ถูกแตะทั้ง working tree และ commit หลัง ${BASE_SHA} · 3 ทะเบียน event ไม่เปลี่ยน (ไม่มี event ใหม่)`, () => {
  const changed = new Set([...dirty(["prisma"]), ...git(["diff", "--name-only", `${BASE_SHA}`, "HEAD", "--", "prisma"]).split("\n").filter(Boolean)]);
  ok(changed.size === 0, `prisma ถูกแตะ: ${[...changed].slice(0, 4).join(" · ")}`);
  const reg = ["src/lib/outbox-consumers.ts", "src/lib/automation/labels.ts", "src/lib/webhooks/labels.ts"];
  const regCh = new Set([...dirty(reg), ...git(["diff", "--name-only", `${BASE_SHA}`, "HEAD", "--", ...reg]).split("\n").filter(Boolean)]);
  ok(regCh.size === 0, `ทะเบียน event ถูกแตะ: ${[...regCh].join(" · ")}`);
}, "MAJOR");
await st("SF-3", "group.ts: ไม่มี any · ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/.getDate) · ไม่มี Math.random · ไม่มีตัวกันในหน่วยความจำ (Map/Set ระดับโมดูลที่ชื่อ lock/busy/inflight)", () => {
  const s = stripComments(src(F.group));
  ok(s.length > 0, `ยังไม่มีไฟล์ «${F.group}»`);
  ok(!/:\s*any\b|as any\b|<any>/.test(s), "มี any");
  ok(!/\.(getDay|getHours|getDate|getMinutes)\s*\(/.test(s), "มีเวลาเครื่องดิบ");
  ok(!/Math\.random/.test(s), "มี Math.random");
  ok(!/^(?:const|let)\s+\w*(?:lock|busy|inflight|pending)\w*\s*=\s*new\s+(?:Map|Set)/im.test(s), "มีตัวกันในหน่วยความจำ");
}, "MAJOR");

// ═══════════════ G. regression ═══════════════
console.log("\n── G: regression (b.2 · b.13 · b.8 · b.3 · b.4 · b.5 · b.7 · smoke) ──");
const judgeSvc = (allowSkip: (id: string) => boolean, allowFail: (id: string) => boolean = () => false) => (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed?: string[]; skipped?: string[] };
  return (j.failed ?? []).every(allowFail) && (j.skipped ?? []).every(allowSkip);
};
// ข้อ "ไฟล์ของใบ/ไฟล์ที่ห้ามแตะ" ของชุดเก่า = accept-time ของใบนั้น — แดงได้ระหว่างไฟล์ B.15 ยังไม่ commit (ใบสั่ง §7)
const REG: { s: string; args?: string[]; env?: Record<string, string>; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-svc-b.2", judge: (out) => { const l = out.split("\n").reverse().find((x) => x.startsWith("JSON_SUMMARY ")); return !!l && (JSON.parse(l.slice(13)) as { findings: string[] }).findings.length === 0; }, note: "93/93 รวม PERF p95 < 50 ms" },
  { s: "qc-svc-b.13", args: ["--no-regression"], judge: judgeSvc((x) => /^(G|Q)-/.test(x) || x === "V-1" || x === "SF-1", (x) => x === "SF-1"), note: "ไม่มี FAIL ยกเว้น SF-1 · SKIP เฉพาะ G/Q/V-1/SF-1" },
  { s: "qc-svc-b.8", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|V|Q|G)-/.test(x) || x === "S-1", (x) => ["S-1", "S-2", "S-4"].includes(x)), note: "ไม่มี FAIL ยกเว้น S-1/S-2/S-4 · SKIP เฉพาะ H/V/Q/G/S-1" },
  { s: "qc-svc-b.3", env: { SVC_B3_NO_REGRESSION: "1" }, judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => x === "ST-1" || x === "ST-4"), note: "ไม่มี FAIL ยกเว้น ST-1/ST-4 · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.4", args: ["--no-regression"], judge: judgeSvc((x) => x.startsWith("G-") || x === "ST-1", (x) => ["ST-1", "ST-3", "ST-4"].includes(x)), note: "ไม่มี FAIL ยกเว้น ST-1/ST-3/ST-4 · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.5", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|E|V|Q|G)-/.test(x) || x === "S-1", (x) => x === "S-1" || x === "S-2"), note: "ไม่มี FAIL ยกเว้น S-1/S-2 · SKIP เฉพาะ H/E/V/Q/G/S-1" },
  { s: "qc-svc-b.7", args: ["--no-regression"], judge: judgeSvc((x) => /^(H|V|Q|G)-/.test(x) || x === "S-1", (x) => ["S-1", "S-2", "S-3"].includes(x)), note: "ไม่มี FAIL ยกเว้น S-1/S-2/S-3 · SKIP เฉพาะ H/V/Q/G/S-1" },
  { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof groupLoad.mod?.bookGroup === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (group.bookGroup) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B15_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`, ...(g.args ?? [])], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b15-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error|perf/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
const groups: Record<string, number> = {};
for (const c of cks) { const g = c.id.replace(/-.*$/, ""); groups[g] = (groups[g] ?? 0) + 1; }
console.log(`\n===== QC SVC B.15 · คู่รัก/กลุ่ม =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""} · กลุ่ม ${fmt(groups)}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ที่ยอมได้ระหว่างทำ: G-* เมื่อ --no-regression · SF-1 หลัง merge — ผู้คุมรันซ้ำครบก่อนรับ)
process.exit(failed.length > 0 ? 1 : 0);
