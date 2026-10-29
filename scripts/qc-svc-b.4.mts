// QC — SVC B.4 · เช็กอิน · walk-in · บัตร P/A · สาย/ไม่มา · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.4.md (§3 สัญญา · §6 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว B.4
//        ledger/DESIGN-BOOKING-QUEUE.md §4.1 §4.2 R4 BQ-4 · ภาคผนวก ก #27–32 #38–46 · CC §1.6 §6.1 §7 · ใบ B.2 §3 · ใบ B.3 §3 §6 ข้อ 9 §7
//
// กลุ่มข้อ:
//   T   แม่แบบ/ค่าตั้ง · F ข้อมูลนัดตั้งต้น (ผ่าน bookAppointment ของ B.3)
//   C0  ตัวควบคุม: snapshot ของ B.3 · planDay ให้ตัวเลขตามฉาก (ค่าคาดของหมวด L) · หน่วย QUEUE เดิมออกบัตรได้
//   K   เช็กอิน 3 ทาง (QR token · LINE/id · เบอร์) + รหัสล้ม + X1/X7 + บัตร P ผูก ref ถูก
//   W   walk-in: แถว WALKIN/QUEUED + บัตร A · ถือช่องจริง · ปิดรับ · เลขบัตรรายวัน
//   J   เรียก/เริ่ม/เสร็จ · ทางเดิม setAppointmentStatus · ยกเลิก/เลื่อนฝั่งร้าน · บัตรเดินตามงาน · X1
//   L   ตัวจัดคิว (เข้ม): สาย 10 ⇒ LATE + ช่องไป walk-in · มาภายใน 30 ⇒ เข้าแถวแบบ walk-in · 30 ⇒ NO_SHOW ครั้งเดียว ·
//       snapshot ชนะค่าตั้งใหม่ (2 ทิศ) · HOLD ไม่ปล่อยช่อง · ร้านเดิมไม่ถูกแตะ · แถวไม่มี snapshot · สิ้นวัน · PENDING · X1 ของ tick
//   D   หนี้ B.3: buffer ของนัดเดิมจาก snapshot (policySnapshot.job)
//   Q   คิวบนหน่วย BOOKING (CC §6.1) + หน่วย QUEUE เดิม (resetDaily/expireSkipped/housekeeping/ETA)
//   EV  event 8 ตัว 3 ทะเบียน + payload ไม่มี PII · MJ minute-job
//   X   ยิงพร้อมกันจาก 5 โพรเซสแยก — X-0 ตัวควบคุม · เช็กอิน 10 ทาง · walk-in 10 ทาง · tick ซ้อน 2 โพรเซส ×3 · เช็กอิน ∥ ไม่มา · walk-in ∥ จอง STAFF
//   TZ  เช็กอินในโพรเซส TZ −11 / +14 · XS ไม่แตะร้านอื่นบนฐาน QC · Z ล้างข้อมูล · ST ไฟล์ · G regression
//
// เวลา: ทุกฉากใช้วันอนาคตคงที่ (วันไทย +5…+41) + `now` ฉีดเข้า (ไม่เปราะตามเวลาที่รัน — บทเรียน B-4 ของ B.3)
// ร้านทดสอบ slug `qc-svc-b4-*` · ลบใน finally (+ กวาดค้างตอนเริ่ม) · tick/housekeeping ส่ง tenantIds เสมอ (ห้ามแตะ seed)
// ORACLE-EDIT 29 ต.ค. (review): +X-6 X-7 W-7 W-8 L-13 L-14 TZ-3 TZ-4 Q-5 K-6 · รหัส BUSY/CLASH · policySnapshot.job.manualHold/.priority — /root/svc-runs/fix/b4.md J1–J6
// ORACLE-EDIT 29 ต.ค. (builder · ผู้คุมอนุมัติ): W-2 เรียกที่ 10:00 (เดิม 10:01 · planDay ดึง walk-in ที่ยังไม่เริ่มมาที่ now) · Q-2b เรียก expireSkipped ก่อน resetDaily (resetDaily เดิมยกเลิก SKIPPED ด้วย)
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.4.mts [--no-regression]
//      (ห้าม timeout ครอบ · `--no-regression` = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน · iso.sh ทิ้ง env จึงใช้อาร์กิวเมนต์)
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.4";
const LINE_REL = "src/lib/modules/booking/queue-line.ts";
const RUN_REL = "src/lib/modules/booking/planner-run.ts";
const SERVICE_REL = "src/lib/modules/booking/service.ts";
const INDEX_REL = "src/lib/modules/booking/index.ts";
const QUEUE_REL = "src/lib/modules/queue/service.ts";
const MJ_REL = "src/lib/platform/minute-jobs.ts";
const OUTBOX_REL = "src/lib/outbox-consumers.ts";
const AUTO_REL = "src/lib/automation/labels.ts";
const WH_REL = "src/lib/webhooks/labels.ts";
const PLANNER_REL = "src/lib/modules/booking/planner.ts";
const PS_REL = "src/lib/modules/booking/plan-settings.ts";
const JOB_TICK = "booking.line.tick";
const JOB_HK = "queue.housekeeping";
const NO_REG = process.argv.includes("--no-regression") || process.env.SVC_B4_NO_REGRESSION === "1";

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc (ep-mute-scene) ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type Ctx = { tenantId: string; unitId: string; actorUserId?: string };
type CheckInBy = { appointmentId: string } | { token: string } | { phone: string };
type CheckInVia = "QR" | "LINE" | "PHONE" | "STAFF";
type CheckInFail = "NOT_FOUND" | "NOT_TODAY" | "TOO_LATE" | "NOT_CONFIRMED" | "BAD_STATE" | "AMBIGUOUS" | "NOT_SINGLE_LINE" | "BAD_INPUT"
  | "BUSY"; // ORACLE-EDIT 29 ต.ค. (review) J1
type CheckInResult =
  | { ok: true; appointmentId: string; ticketId: string; ticketNumber: string; already: boolean; asWalkIn: boolean }
  | { ok: false; code: CheckInFail; reason: string; candidates?: { appointmentId: string; startAt: Date; staffId: string }[] };
type WalkInChannel = "KIOSK" | "STAFF" | "REMOTE";
type WalkInInput = { serviceId: string; staffId: string | null; channel: WalkInChannel; customerName?: string; customerPhone?: string; priority?: boolean };
type WalkInFail = "NOT_FOUND" | "NOT_SINGLE_LINE" | "WALKIN_DISABLED" | "WALKIN_CLOSED" | "BAD_INPUT"
  | "BUSY"; // ORACLE-EDIT 29 ต.ค. (review) J1
type WalkInResult =
  | { ok: true; appointmentId: string; ticketId: string; ticketNumber: string; staffId: string | null; plannedStartAt: Date | null; waitMin: number | null }
  | { ok: false; code: WalkInFail; reason: string };
type JobFail = "NOT_FOUND" | "BAD_STATE" | "LOST_RACE"
  | "BUSY" | "CLASH"; // ORACLE-EDIT 29 ต.ค. (review) J1 J3
type JobResult = { ok: true } | { ok: false; code: JobFail; reason: string };
type RescheduleFail = JobFail | "FULL" | "PAST" | "BAD_INPUT" | "ON_LEAVE" | "NOT_QUALIFIED";
type RescheduleResult = { ok: true } | { ok: false; code: RescheduleFail; reason: string };
type NowOpt = { now?: Date };
type LineApi = {
  checkInToken?: (ctx: Ctx, appointmentId: string) => Promise<string | null>;
  checkIn?: (ctx: Ctx, by: CheckInBy, opts: { via: CheckInVia; now?: Date }) => Promise<CheckInResult>;
  createWalkIn?: (ctx: Ctx, i: WalkInInput, opts?: NowOpt) => Promise<WalkInResult>;
  callJob?: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  startJob?: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  completeJob?: (ctx: Ctx, id: string, opts?: NowOpt) => Promise<JobResult>;
  cancelByShop?: (ctx: Ctx, id: string, opts?: NowOpt & { note?: string }) => Promise<JobResult>;
  rescheduleByShop?: (ctx: Ctx, id: string, to: { dateStr: string; startMin: number; staffId?: string }, opts?: NowOpt) => Promise<RescheduleResult>;
};
type TickResult = { late: number; noShow: number; endOfDay: number; units: number };
type RunApi = {
  runPlanner?: (ctx: { tenantId: string; unitId: string }, opts?: NowOpt) => Promise<{ ran: boolean; planned: number }>;
  runLineTick?: (now: Date, opts?: { tenantIds?: string[] }) => Promise<TickResult>;
};
type QueueApi = {
  issueTicket: (i: { tenantId: string; unitId: string; typeId?: string; typeCode?: string; channel: "KIOSK" | "ONLINE" | "STAFF" | "BOOKING"; actorType?: "STAFF" | "CUSTOMER" | "SYSTEM" }) =>
    Promise<{ ok: true; ticket: { id: string; number: string; publicToken: string } } | { ok: false; reason: string; code: string }>;
  resetDaily: (ctx: { tenantId: string; unitId: string }, now?: Date) => Promise<{ cancelled: number }>;
  expireSkipped: (ctx: { tenantId: string; unitId: string }, now?: Date) => Promise<{ expired: number }>;
  runQueueHousekeeping?: (now: Date, opts?: { tenantIds?: string[] }) => Promise<{ cancelled: number; expired: number }>;
  resolveQueueUnit: (tenantSlug: string, unitSlug: string) => Promise<{ tenant: { id: string }; unit: { id: string } } | null>;
  getTicketStatus: (unitId: string, publicToken: string) => Promise<{ ticket: { id: string }; position: number; estimateMin: number | null } | null>;
};
// ของ B.3 (มีแล้ว)
type BookingChannel = "ONLINE" | "LINE" | "STAFF" | "PHONE";
type BookInput = { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: BookingChannel; customerName: string; customerPhone: string; note?: string; idempotencyKey?: string };
type BookResult = { ok: true; id: string; staffId: string; status: "PENDING" | "CONFIRMED"; holdUntil: Date | null } | { ok: false; code: string; reason: string };
type CreateInput = { tenantId: string; unitId: string; serviceId: string; staffId: string; dateStr: string; startMin: number; customerName: string; customerPhone: string; source?: "STAFF" | "ONLINE" };
type Slot = { startMin: number; hhmm: string; staffId: string };
type BookingApi = {
  bookAppointment: (ctx: Ctx, i: BookInput) => Promise<BookResult>;
  findSlots: (ctx: Ctx, q: { serviceId: string; staffId: string | null; dateStr: string; channel: BookingChannel }) => Promise<Slot[]>;
  createAppointment: (i: CreateInput) => Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
  setAppointmentStatus: (tenantId: string, unitId: string, id: string, status: "PENDING" | "CONFIRMED" | "ARRIVED" | "DONE" | "NO_SHOW" | "CANCELLED") => Promise<{ ok: boolean; reason?: string }>;
  recordDeposit: (ctx: Ctx, appointmentId: string) => Promise<{ ok: boolean; reason?: string; saleId?: string }>; // ORACLE-EDIT 29 ต.ค. (review)
};
type PlanSettings = {
  queueOrder: "SINGLE_LINE" | "APPOINTMENT_FIRST"; backfill: boolean; safetyBeforeBookingMin: number; graceMin: number; noShowAfterMin: number;
  lateAction: "RELEASE" | "HOLD"; priorityEnabled: boolean; walkInMaxWaitMin: number; overrunExtendMin: number; minBreakMin: number; maxJobsPerDay: number | null;
};
type PlanJob = {
  id: string; label: string; kind: "BOOKED" | "WALKIN"; status: string; serviceId: string; durationMin?: number; assignMode: "SPECIFIC" | "ANY"; staffId: string | null;
  startAt: number | null; issuedAt: number; checkedInAt: number | null; startedAt: number | null; priority: boolean;
  policy?: { graceMin?: number; noShowAfterMin?: number; lateAction?: "RELEASE" | "HOLD" };
};
type PlannerApi = {
  planDay: (i: { now: number; settings: PlanSettings; staff: { id: string; name: string; sortOrder: number; windows: { startAt: number; endAt: number }[]; services: null }[]; services: { id: string; name: string; durationMin: number; bufferAfterMin: number }[]; jobs: PlanJob[] }) =>
    { jobs: { jobId: string; staffId: string | null; startAt: number | null; state: string; reason: string }[] };
};
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type SetRes = { ok: boolean; code?: string; issues?: unknown };
type SettingsApi = {
  setSettings: (actor: Actor, ctx: { tenantId: string }, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<SetRes>;
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<SetRes>;
};
type MjApi = { getMinuteJobStatus?: (names?: string[]) => Promise<{ name: string; everyMinutes: number | null }[]> };
type LabelDef = { value: string; label: string };

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 240) ?? String(v); } catch { return String(v); } };
const ok = (cond: boolean, why: string): void => { if (!cond) throw new AssertFail(why); };
const eq = (act: unknown, exp: unknown, what: string): void => {
  if (!isDeepStrictEqual(act, exp)) throw new AssertFail(`${what}: ได้ ${fmt(act)} ต้องเป็น ${fmt(exp)}`);
};
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
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * 60_000; };
const at = (ds: string, min: number): Date => new Date(bkkMs(ds, min));
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const tms = (d: Date | null | undefined): number | null => (d ? new Date(d).getTime() : null);
const eqAt = (act: Date | null | undefined, ds: string, min: number, what: string) => eq(tms(act), bkkMs(ds, min), `${what} (ต้องเป็น ${ds} ${hhmm(min)})`);

// ═══════════════ โหลดโมดูล ═══════════════
const loadIf = async <T,>(rel: string, spec: string) => (existsSync(join(ROOT, rel)) ? tryImport<T>(spec) : { mod: null as T | null, err: `ยังไม่มีไฟล์ «${rel}»` });
const lineLoad = await loadIf<LineApi>(LINE_REL, "@/lib/modules/booking/queue-line");
const runLoad = await loadIf<RunApi>(RUN_REL, "@/lib/modules/booking/planner-run");
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const queueLoad = await tryImport<QueueApi>("@/lib/modules/queue/service");
const fnOf = <F,>(load: { mod: unknown; err: string }, name: string, rel: string): F => {
  const f = (load.mod as Record<string, unknown> | null)?.[name];
  if (typeof f !== "function") throw new AssertFail(load.mod ? `«${rel}» ยังไม่มี export ${name}` : `โหลด «${rel}» ไม่ได้: ${load.err}`);
  return f as F;
};
const LN = {
  token: () => fnOf<NonNullable<LineApi["checkInToken"]>>(lineLoad, "checkInToken", LINE_REL),
  checkIn: () => fnOf<NonNullable<LineApi["checkIn"]>>(lineLoad, "checkIn", LINE_REL),
  walkIn: () => fnOf<NonNullable<LineApi["createWalkIn"]>>(lineLoad, "createWalkIn", LINE_REL),
  call: () => fnOf<NonNullable<LineApi["callJob"]>>(lineLoad, "callJob", LINE_REL),
  start: () => fnOf<NonNullable<LineApi["startJob"]>>(lineLoad, "startJob", LINE_REL),
  complete: () => fnOf<NonNullable<LineApi["completeJob"]>>(lineLoad, "completeJob", LINE_REL),
  cancel: () => fnOf<NonNullable<LineApi["cancelByShop"]>>(lineLoad, "cancelByShop", LINE_REL),
  resched: () => fnOf<NonNullable<LineApi["rescheduleByShop"]>>(lineLoad, "rescheduleByShop", LINE_REL),
};
const RN = {
  plan: () => fnOf<NonNullable<RunApi["runPlanner"]>>(runLoad, "runPlanner", RUN_REL),
  tick: () => fnOf<NonNullable<RunApi["runLineTick"]>>(runLoad, "runLineTick", RUN_REL),
};
const BK = (): BookingApi => { if (!bookingLoad.mod) throw new AssertFail(`โหลด booking/service ไม่ได้ (${bookingLoad.err})`); return bookingLoad.mod; };
const QU = (): QueueApi => { if (!queueLoad.mod) throw new AssertFail(`โหลด queue/service ไม่ได้ (${queueLoad.err})`); return queueLoad.mod; };

// ═══════════════ โหมดลูกโพรเซส (ยิงพร้อมกัน · TZ probe) ═══════════════
type CallSpec =
  | { fn: "create"; input: CreateInput }
  | { fn: "book"; ctx: Ctx; input: BookInput }
  | { fn: "checkIn"; ctx: Ctx; by: CheckInBy; via: CheckInVia; now: string }
  | { fn: "walkIn"; ctx: Ctx; input: WalkInInput; now: string }
  | { fn: "tick"; now: string; tenantIds: string[] }
  | { fn: "planLoop"; ctx: Ctx; now: string; times: number }; // ORACLE-EDIT 29 ต.ค. (review) X-6
type CallOut = { fn: CallSpec["fn"]; ok: boolean; code: string | null; id: string | null; ticketId: string | null; ticketNumber: string | null; staffId: string | null; already: boolean | null; late: number | null; noShow: number | null; threw: string | null; deadlock?: boolean };
type ChildSpec = { run: string; idx: number; scenarios: { key: string; calls: CallSpec[] }[] };
type Scenario = { key: string; perChild: CallSpec[][] };
const goFile = (run: string, key: string) => `/tmp/svc-b4-go-${run}-${key}`;
const blank = (fn: CallSpec["fn"]): CallOut => ({ fn, ok: false, code: null, id: null, ticketId: null, ticketNumber: null, staffId: null, already: null, late: null, noShow: null, threw: null });
async function runCall(c: CallSpec): Promise<CallOut> {
  const o = blank(c.fn);
  try {
    if (c.fn === "create") {
      const r = await BK().createAppointment(c.input);
      return { ...o, ok: r.ok, code: r.ok ? null : "LEGACY", id: r.ok ? r.id : null, staffId: r.ok ? c.input.staffId : null };
    }
    if (c.fn === "book") {
      const r = await BK().bookAppointment(c.ctx, c.input);
      return r.ok ? { ...o, ok: true, id: r.id, staffId: r.staffId } : { ...o, code: r.code };
    }
    if (c.fn === "checkIn") {
      const r = await LN.checkIn()(c.ctx, c.by, { via: c.via, now: new Date(c.now) });
      const ref = "appointmentId" in c.by ? c.by.appointmentId : null;
      return r.ok ? { ...o, ok: true, id: r.appointmentId, ticketId: r.ticketId, ticketNumber: r.ticketNumber, already: r.already } : { ...o, id: ref, code: r.code };
    }
    if (c.fn === "walkIn") {
      const r = await LN.walkIn()(c.ctx, c.input, { now: new Date(c.now) });
      return r.ok ? { ...o, ok: true, id: r.appointmentId, ticketId: r.ticketId, ticketNumber: r.ticketNumber, staffId: r.staffId } : { ...o, code: r.code };
    }
    if (c.fn === "planLoop") { // ORACLE-EDIT 29 ต.ค. (review) X-6: runPlanner วนซ้ำ (ด้านตัววางคิวของวงรอ)
      for (let k = 0; k < c.times; k++) await RN.plan()(c.ctx, { now: new Date(c.now) });
      return { ...o, ok: true };
    }
    const r = await RN.tick()(new Date(c.now), { tenantIds: c.tenantIds });
    return { ...o, ok: true, late: r.late, noShow: r.noShow };
  } catch (e) {
    const m = errMsg(e);
    return { ...o, threw: m.slice(0, 160), deadlock: /40P01|deadlock/i.test(m) };
  }
}
if (process.env.QC_B4_CHILD) {
  const spec = JSON.parse(process.env.QC_B4_CHILD) as ChildSpec;
  try {
    const dbm = (await import("@/lib/core/db")) as unknown as { prisma: { $queryRawUnsafe: (q: string) => Promise<unknown>; $disconnect: () => Promise<void> } };
    await dbm.prisma.$queryRawUnsafe("SELECT 1"); // อุ่น pool ก่อนบอกพร้อม
    for (const sc of spec.scenarios) {
      console.log(`READY ${sc.key}`);
      const t0 = Date.now();
      while (!existsSync(goFile(spec.run, sc.key))) { if (Date.now() - t0 > 300_000) { console.log("ABORT"); process.exit(5); } await sleep(10); }
      const outs = await Promise.all(sc.calls.map(runCall));
      console.log(`RES ${sc.key} ${JSON.stringify(outs)}`);
    }
    await dbm.prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.log(`CHILD_ERR ${errMsg(e)}`);
    process.exit(3);
  }
}
if (process.env.QC_B4_PROBE) {
  try {
    const calls = JSON.parse(process.env.QC_B4_PROBE) as CallSpec[];
    const outs: CallOut[] = [];
    for (const c of calls) outs.push(await runCall(c));
    console.log(`PROBE_JSON=${JSON.stringify(outs)}`);
    process.exit(0);
  } catch (e) { console.error(`PROBE_ERR ${errMsg(e)}`); process.exit(3); }
}

const settingsLoad = await tryImport<SettingsApi>("@/lib/core/settings");
const SETTINGS = (): SettingsApi => { if (!settingsLoad.mod) throw new AssertFail(`โหลด core/settings ไม่ได้ (${settingsLoad.err})`); return settingsLoad.mod; };
const plannerLoad = await tryImport<PlannerApi>("@/lib/modules/booking/planner");

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb4_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
async function insertRow(table: string, vals: Record<string, unknown>): Promise<void> {
  const v: Record<string, unknown> = { ...vals };
  for (const c of await cols(table)) {
    if (c.column_name in v || c.is_nullable === "YES" || c.column_default !== null) continue;
    const t = c.data_type;
    v[c.column_name] = c.column_name === "id" ? rid("id") : t === "text" || t.startsWith("character") ? "qc" : ["integer", "bigint", "numeric", "double precision"].includes(t) ? 0
      : t === "boolean" ? false : t === "jsonb" || t === "json" ? "{}" : t.startsWith("timestamp") ? new Date() : t === "date" ? "2031-01-01" : t === "ARRAY" ? [] : null;
  }
  const keys = Object.keys(v);
  await pool.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => v[k]));
}
const SLUG = "qc-svc-b4-";
const USER_MAIL = "qc-svc-b4-";
const tenantIds: string[] = [];
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
async function cleanupUsers() {
  try {
    await pool.query(`DELETE FROM "Membership" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE $1)`, [`${USER_MAIL}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]);
  } catch (e) { console.log(`  ⚠️ ลบ user: ${errMsg(e)}`); }
}

const RUN = Date.now().toString(36);
const RUN_START = new Date();
const TODAY = bkkToday();
const dd = (k: number) => addDays(TODAY, 5 + k);
const D = {
  K: dd(0), K2: dd(1), W: dd(2), J: dd(3), Dd: dd(4), X0: dd(5), X1: dd(6), X2: dd(7), X5: dd(8), TZ: dd(9),
  L1: dd(10), Snap: dd(13), Hold: dd(16), Leg: dd(19), Null: dd(22), Eod: dd(25), Eod2: dd(26), X3: dd(29), X4: dd(30), B: dd(36),
  // ORACLE-EDIT 29 ต.ค. (review)
  K6: dd(37), X7: dd(37), W7: dd(38), W8: dd(38), Q5: dd(38), TZ3a: dd(39), TZ3b: dd(40), TZ4a: dd(41), TZ4b: dd(42), L13: dd(50), L14: dd(53),
};
const T = (k: string) => `svcb4_${k}_${RUN}`;
const ids = {
  tA: T("tA"), tL: T("tL"), tT1: T("tT1"), tT2: T("tT2"), tT3: T("tT3"), tT4: T("tT4"), tB: T("tB"), owner: T("owner"),
  // tA
  uL: T("uL"), uRace: T("uRace"), uLegA: T("uLegA"), uD: T("uD"), uQ: T("uQ"),
  a1: T("a1"), a2: T("a2"), g1: T("g1"), d1: T("d1"),
  LS60: T("LS60"), LS30: T("LS30"), LS90: T("LS90"), LSNW: T("LSNW"), R60: T("R60"), G60: T("G60"), D30: T("D30"),
  qType: T("qType"), qCounter: T("qCounter"),
  // tL
  uL1: T("uL1"), uSnap: T("uSnap"), uHold: T("uHold"), uLeg: T("uLeg"), uEod: T("uEod"),
  s1: T("s1"), p1: T("p1"), h1: T("h1"), e1: T("e1"), o1: T("o1"),
  L60: T("L60"), P60: T("P60"), H60: T("H60"), E60: T("E60"), O60: T("O60"),
  // tT*
  uT1: T("uT1"), uT2: T("uT2"), uT3: T("uT3"), uX4: T("uX4"), TK1: T("TK1"), TK2: T("TK2"), TK3: T("TK3"), X4S: T("X4S"),
  // tB
  uB: T("uB"), b1: T("b1"), B60: T("B60"),
  // ORACLE-EDIT 29 ต.ค. (review)
  tX6: T("tX6"), uX6: T("uX6"), X6S: T("X6S"),
  uX7: T("uX7"), x7a: T("x7a"), x7b: T("x7b"), X730: T("X730"),
  uW7: T("uW7"), w7: T("w7"), W7S: T("W7S"), uW8: T("uW8"), w8: T("w8"), W8S: T("W8S"),
  uQ5: T("uQ5"), q5: T("q5"), Q5S: T("Q5S"),
  uTZ3: T("uTZ3"), z3: T("z3"), Z3S: T("Z3S"), uTZ3b: T("uTZ3b"), z3b: T("z3b"), Z3bS: T("Z3bS"), uTZ4: T("uTZ4"), z4: T("z4"), Z4S: T("Z4S"),
  uL13: T("uL13"), n13: T("n13"), N13S: T("N13S"), uL14: T("uL14"), m14: T("m14"), M14S: T("M14S"),
};
const X6STAFF = Array.from({ length: 8 }, (_, i) => T(`x6s${i + 1}`)); // ORACLE-EDIT 29 ต.ค. (review)
const RACE = Array.from({ length: 5 }, (_, i) => T(`r${i + 1}`));
const TICKSTAFF = [1, 2, 3].map((r) => Array.from({ length: 6 }, (_, i) => T(`t${r}s${i + 1}`)));
const X4STAFF = Array.from({ length: 5 }, (_, i) => T(`x4s${i + 1}`));
const SLUGS: Record<string, string> = {};
const cL: Ctx = { tenantId: ids.tA, unitId: ids.uL };
const cRace: Ctx = { tenantId: ids.tA, unitId: ids.uRace };
const cLegA: Ctx = { tenantId: ids.tA, unitId: ids.uLegA };
const cD: Ctx = { tenantId: ids.tA, unitId: ids.uD };
const cQ: Ctx = { tenantId: ids.tA, unitId: ids.uQ };
const cL1: Ctx = { tenantId: ids.tL, unitId: ids.uL1 };
const cSnap: Ctx = { tenantId: ids.tL, unitId: ids.uSnap };
const cHold: Ctx = { tenantId: ids.tL, unitId: ids.uHold };
const cLeg: Ctx = { tenantId: ids.tL, unitId: ids.uLeg };
const cEod: Ctx = { tenantId: ids.tL, unitId: ids.uEod };
const cT = [{ tenantId: ids.tT1, unitId: ids.uT1 }, { tenantId: ids.tT2, unitId: ids.uT2 }, { tenantId: ids.tT3, unitId: ids.uT3 }] as Ctx[];
const cX4: Ctx = { tenantId: ids.tT4, unitId: ids.uX4 };
const cB: Ctx = { tenantId: ids.tB, unitId: ids.uB };
const TK_SVC = [ids.TK1, ids.TK2, ids.TK3];
const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
const ALL_TENANTS = [ids.tA, ids.tL, ids.tT1, ids.tT2, ids.tT3, ids.tT4, ids.tB, ids.tX6];
// ORACLE-EDIT 29 ต.ค. (review)
const cX6: Ctx = { tenantId: ids.tX6, unitId: ids.uX6 };
const cX7: Ctx = { tenantId: ids.tA, unitId: ids.uX7 };
const cW7: Ctx = { tenantId: ids.tA, unitId: ids.uW7 };
const cW8: Ctx = { tenantId: ids.tA, unitId: ids.uW8 };
const cQ5: Ctx = { tenantId: ids.tA, unitId: ids.uQ5 };
const cTZ3: Ctx = { tenantId: ids.tA, unitId: ids.uTZ3 };
const cTZ3b: Ctx = { tenantId: ids.tA, unitId: ids.uTZ3b };
const cTZ4: Ctx = { tenantId: ids.tA, unitId: ids.uTZ4 };
const cL13: Ctx = { tenantId: ids.tL, unitId: ids.uL13 };
const cL14: Ctx = { tenantId: ids.tL, unitId: ids.uL14 };
let phoneN = 0;
const newPhone = () => `08${String(40_000_000 + ++phoneN).slice(-8)}`;
const CUST = "ลูกค้า QC B4";
const PII_PHONES: string[] = [];
const bk = (o: Partial<BookInput> & { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: BookingChannel }): BookInput => {
  const input: BookInput = { customerName: CUST, customerPhone: newPhone(), idempotencyKey: rid("idem"), ...o };
  PII_PHONES.push(input.customerPhone);
  return input;
};
/** นัดผ่าน bookAppointment (B.3) ช่อง STAFF ⇒ CONFIRMED + policySnapshot ของสาขา ณ ตอนจอง */
const bookStaff = async (ctx: Ctx, serviceId: string, staffId: string, ds: string, startMin: number, phone?: string): Promise<string> => {
  const r = await BK().bookAppointment(ctx, bk({ serviceId, staffId, dateStr: ds, startMin, channel: "STAFF", ...(phone ? { customerPhone: phone } : {}) }));
  if (!r.ok) throw new AssertFail(`จองตั้งต้น ${ds} ${hhmm(startMin)} ล้ม ${r.code} ${r.reason}`);
  return r.id;
};
type ApRow = {
  id: string; status: string; kind: string; assignMode: string; channel: string | null; source: string; staffId: string; startAt: Date; endAt: Date;
  checkedInAt: Date | null; startedAt: Date | null; doneAt: Date | null; lateAt: Date | null; plannedStartAt: Date | null; plannedStaffId: string | null;
  queueTicketId: string | null; cancelReason: string | null; customerPhone: string; rescheduleCount: number; updatedAt: Date;
  policySnapshot: { values?: Record<string, unknown>; job?: { durationMin?: number; bufferMin?: number; manualHold?: boolean; priority?: boolean } } | null;
};
const apRow = async (id: string): Promise<ApRow> => {
  const [r] = await q<ApRow>(`SELECT id, status::text AS status, kind, "assignMode", channel, source, "staffId", "startAt", "endAt", "checkedInAt", "startedAt", "doneAt", "lateAt",
    "plannedStartAt", "plannedStaffId", "queueTicketId", "cancelReason", "customerPhone", "rescheduleCount", "updatedAt", "policySnapshot" FROM "Appointment" WHERE id = $1`, [id]);
  if (!r) throw new AssertFail(`ไม่พบนัด ${id}`);
  return r;
};
type TkRow = {
  id: string; status: string; number: string; refType: string | null; refId: string | null; channel: string; businessDate: string; unitId: string; tenantId: string;
  etaAt: Date | null; callCount: number; calledAt: Date | null; servedAt: Date | null; doneAt: Date | null; cancelReason: string | null;
  contactName: string | null; contactPhone: string | null; publicToken: string; code: string; prefix: string; isSystem: boolean;
};
const TK_SQL = `SELECT t.id, t.status::text AS status, t.number, t."refType", t."refId", t.channel::text AS channel, t."businessDate", t."unitId", t."tenantId", t."etaAt", t."callCount",
  t."calledAt", t."servedAt", t."doneAt", t."cancelReason", t."contactName", t."contactPhone", t."publicToken", y.code, y.prefix, y."isSystem"
  FROM "QueueTicket" t JOIN "QueueType" y ON y.id = t."typeId"`;
const tkRow = async (id: string | null): Promise<TkRow> => {
  ok(!!id, "ไม่มี ticketId");
  const [r] = await q<TkRow>(`${TK_SQL} WHERE t.id = $1`, [id]);
  if (!r) throw new AssertFail(`ไม่พบบัตร ${id}`);
  return r;
};
const ticketsOf = async (apptId: string) => q<TkRow>(`${TK_SQL} WHERE t."refType" = 'APPOINTMENT' AND t."refId" = $1 ORDER BY t."createdAt"`, [apptId]);
const obCount = async (type: string, apptId: string) =>
  (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type = $2 AND payload->>'appointmentId' = $3`, [ALL_TENANTS, type, apptId]))[0].n;
const setS = async (tenantId: string, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => {
  const r = await SETTINGS().setSettings(OWNER, { tenantId }, changes);
  ok(r.ok, `setSettings ${fmt(changes.map((c) => `${c.key}@${c.scope}=${fmt(c.value)}`))}: ${r.code} ${fmt(r.issues)}`);
};
const okCI = (r: CheckInResult, what: string): Extract<CheckInResult, { ok: true }> => { if (!r.ok) throw new AssertFail(`${what}: ล้ม ${r.code} ${r.reason}`); return r; };
const okWI = (r: WalkInResult, what: string): Extract<WalkInResult, { ok: true }> => { if (!r.ok) throw new AssertFail(`${what}: ล้ม ${r.code} ${r.reason}`); return r; };
const okJob = (r: JobResult | RescheduleResult, what: string) => { if (!r.ok) throw new AssertFail(`${what}: ล้ม ${r.code} ${r.reason}`); };
const failCode = (r: { ok: boolean; code?: string; reason?: string }, code: string, what: string): string => {
  if (r.ok) throw new AssertFail(`${what}: ต้องล้ม ${code} แต่สำเร็จ`);
  eq(r.code, code, `${what} code`);
  ok(typeof r.reason === "string" && r.reason.trim().length > 0, `${what}: reason ว่าง`);
  return r.reason as string;
};
const tick = (ds: string, min: number, tenants: string[]) => RN.tick()(at(ds, min), { tenantIds: tenants });
// ORACLE-EDIT 29 ต.ค. (review): แถวถือช่อง (ไม่ใช่ CANCELLED/NO_SHOW/DONE) ของช่างที่ช่วงซ้อนกันในฐาน · ช่วงเวลาใดก็ได้ (ข้ามเที่ยงคืน)
const overlapIn = async (staffId: string, fromMs: number, toMs: number): Promise<string[]> => {
  const rows = await q<{ id: string; s: Date; e: Date }>(`SELECT id, "startAt" AS s, "endAt" AS e FROM "Appointment" WHERE "staffId" = $1 AND "startAt" < $3 AND "endAt" > $2 AND status NOT IN ('CANCELLED','NO_SHOW','DONE') ORDER BY "startAt", id`, [staffId, new Date(fromMs), new Date(toMs)]);
  const bad: string[] = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (rows[j].s.getTime() < rows[i].e.getTime() && rows[i].s.getTime() < rows[j].e.getTime()) bad.push(`${hhmm(((rows[i].s.getTime() / 60_000 + 420) % 1440 + 1440) % 1440)}×${hhmm(((rows[j].s.getTime() / 60_000 + 420) % 1440 + 1440) % 1440)}`);
  return bad;
};
const bookFull = async (ctx: Ctx, serviceId: string, staffId: string, ds: string, min: number) => {
  const r = await BK().bookAppointment(ctx, bk({ serviceId, staffId, dateStr: ds, startMin: min, channel: "STAFF" }));
  return r.ok ? "OK" : r.code;
};

const goFiles: string[] = [];
let setupOk = false;
let tplOk = false;
let fxOk = false;
const fx: Record<string, string> = {};
const state: Record<string, string> = {};
console.log(`\n(วันนี้ไทย ${TODAY} · วันทดสอบ ${D.K} … ${D.B})`);

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();

  // ── สร้างข้อมูล ──
  try {
    tenantIds.push(...ALL_TENANTS);
    for (const [id, n] of [[ids.tA, "a"], [ids.tL, "l"], [ids.tT1, "t1"], [ids.tT2, "t2"], [ids.tT3, "t3"], [ids.tT4, "t4"], [ids.tB, "b"], [ids.tX6, "x6"]] as const) {
      SLUGS[id] = `${SLUG}${n}-${RUN}`;
      await insertRow("Tenant", { id, name: `QC B4 ร้าน ${n}`, slug: SLUGS[id], updatedAt: new Date() });
    }
    const units: [string, string, string, string][] = [
      [ids.uL, ids.tA, "BOOKING", "line"], [ids.uRace, ids.tA, "BOOKING", "race"], [ids.uLegA, ids.tA, "BOOKING", "lega"], [ids.uD, ids.tA, "BOOKING", "debt"], [ids.uQ, ids.tA, "QUEUE", "q"],
      [ids.uL1, ids.tL, "BOOKING", "l1"], [ids.uSnap, ids.tL, "BOOKING", "snap"], [ids.uHold, ids.tL, "BOOKING", "hold"], [ids.uLeg, ids.tL, "BOOKING", "leg"], [ids.uEod, ids.tL, "BOOKING", "eod"],
      [ids.uT1, ids.tT1, "BOOKING", "t1"], [ids.uT2, ids.tT2, "BOOKING", "t2"], [ids.uT3, ids.tT3, "BOOKING", "t3"], [ids.uX4, ids.tT4, "BOOKING", "x4"], [ids.uB, ids.tB, "BOOKING", "b"],
      // ORACLE-EDIT 29 ต.ค. (review)
      [ids.uX6, ids.tX6, "BOOKING", "x6"], [ids.uX7, ids.tA, "BOOKING", "x7"], [ids.uW7, ids.tA, "BOOKING", "w7"], [ids.uW8, ids.tA, "BOOKING", "w8"], [ids.uQ5, ids.tA, "BOOKING", "q5"],
      [ids.uTZ3, ids.tA, "BOOKING", "tz3"], [ids.uTZ3b, ids.tA, "BOOKING", "tz3b"], [ids.uTZ4, ids.tA, "BOOKING", "tz4"], [ids.uL13, ids.tL, "BOOKING", "l13"], [ids.uL14, ids.tL, "BOOKING", "l14"],
    ];
    const H24 = new Set([ids.uTZ3, ids.uTZ3b, ids.uTZ4]); // ORACLE-EDIT 29 ต.ค. (review) TZ-3/TZ-4: เปิด 00:00–24:00
    for (const [id, t, type, n] of units) {
      SLUGS[id] = `b4-${n}-${RUN}`;
      await insertRow("BusinessUnit", { id, tenantId: t, type, name: `สาขา ${n}`, slug: SLUGS[id], updatedAt: new Date() });
      if (type === "BOOKING") for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: id, weekday: w, openMin: H24.has(id) ? 0 : 600, closeMin: H24.has(id) ? 1440 : 1200, closed: false, updatedAt: new Date() });
    }
    const svc = async (id: string, t: string, u: string, name: string, durationMin: number, bufferMin: number) =>
      insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin, priceSatang: 30000, bufferMin, depositSatang: 0, bookable: true, sortOrder: 0, updatedAt: new Date() });
    await svc(ids.LS60, ids.tA, ids.uL, "ตัดผมชาย", 60, 0);
    await svc(ids.LS30, ids.tA, ids.uL, "สระไดร์", 30, 15);
    await svc(ids.LS90, ids.tA, ids.uL, "ทำสี (90)", 90, 0);
    await svc(ids.LSNW, ids.tA, ids.uL, "แต่งหนวด (ไม่รับ walk-in)", 30, 0);
    await svc(ids.R60, ids.tA, ids.uRace, "ตัดผมแข่ง", 60, 0);
    await svc(ids.G60, ids.tA, ids.uLegA, "ตัดผมร้านเดิม", 60, 0);
    await svc(ids.D30, ids.tA, ids.uD, "สระ (buffer 15)", 30, 15);
    await svc(ids.L60, ids.tL, ids.uL1, "ตัดผม L1", 60, 0);
    await svc(ids.P60, ids.tL, ids.uSnap, "ตัดผม snap", 60, 0);
    await svc(ids.H60, ids.tL, ids.uHold, "ตัดผม hold", 60, 0);
    await svc(ids.E60, ids.tL, ids.uLeg, "ตัดผม leg", 60, 0);
    await svc(ids.O60, ids.tL, ids.uEod, "ตัดผม eod", 60, 0);
    await svc(ids.TK1, ids.tT1, ids.uT1, "ตัดผม t1", 60, 0);
    await svc(ids.TK2, ids.tT2, ids.uT2, "ตัดผม t2", 60, 0);
    await svc(ids.TK3, ids.tT3, ids.uT3, "ตัดผม t3", 60, 0);
    await svc(ids.X4S, ids.tT4, ids.uX4, "ตัดผม x4", 60, 0);
    await svc(ids.B60, ids.tB, ids.uB, "ตัดผม B", 60, 0);
    // ORACLE-EDIT 29 ต.ค. (review)
    for (const [id, t, u, d] of [[ids.X6S, ids.tX6, ids.uX6, 60], [ids.X730, ids.tA, ids.uX7, 30], [ids.W7S, ids.tA, ids.uW7, 60], [ids.W8S, ids.tA, ids.uW8, 60], [ids.Q5S, ids.tA, ids.uQ5, 60],
      [ids.Z3S, ids.tA, ids.uTZ3, 60], [ids.Z3bS, ids.tA, ids.uTZ3b, 60], [ids.Z4S, ids.tA, ids.uTZ4, 60], [ids.N13S, ids.tL, ids.uL13, 60], [ids.M14S, ids.tL, ids.uL14, 60]] as const) await svc(id, t, u, `บริการ ${u.slice(6, 12)}`, d, 0);
    await q(`UPDATE "BookingService" SET "depositSatang" = 5000 WHERE id = $1`, [ids.N13S]);
    let ord = 0;
    const staff = async (id: string, t: string, u: string, name: string, sortOrder: number) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder, createdAt: new Date(Date.now() - 600_000 + ++ord * 1000), updatedAt: new Date() });
    await staff(ids.a1, ids.tA, ids.uL, "ช่างเอ", 1);
    await staff(ids.a2, ids.tA, ids.uL, "ช่างบี", 2);
    for (const [i, id] of RACE.entries()) await staff(id, ids.tA, ids.uRace, `ช่างแข่ง ${i + 1}`, i + 1);
    await staff(ids.g1, ids.tA, ids.uLegA, "ช่างร้านเดิม", 1);
    await staff(ids.d1, ids.tA, ids.uD, "ช่างดี (พัก 10)", 1);
    await staff(ids.s1, ids.tL, ids.uL1, "ช่างเอส", 1);
    await staff(ids.p1, ids.tL, ids.uSnap, "ช่างพี", 1);
    await staff(ids.h1, ids.tL, ids.uHold, "ช่างเอช", 1);
    await staff(ids.e1, ids.tL, ids.uLeg, "ช่างอี", 1);
    await staff(ids.o1, ids.tL, ids.uEod, "ช่างโอ", 1);
    for (const [r, list] of TICKSTAFF.entries()) for (const [i, id] of list.entries()) await staff(id, cT[r].tenantId, cT[r].unitId, `ช่างทิก ${r + 1}.${i + 1}`, i + 1);
    for (const [i, id] of X4STAFF.entries()) await staff(id, ids.tT4, ids.uX4, `ช่าง x4 ${i + 1}`, i + 1);
    await staff(ids.b1, ids.tB, ids.uB, "ช่างร้าน B", 1);
    // ORACLE-EDIT 29 ต.ค. (review)
    for (const [i, id] of X6STAFF.entries()) await staff(id, ids.tX6, ids.uX6, `ช่าง x6 ${i + 1}`, i + 1);
    await staff(ids.x7a, ids.tA, ids.uX7, "ช่าง x7 ศูนย์", 1);
    await staff(ids.x7b, ids.tA, ids.uX7, "ช่าง x7 หนึ่ง", 2);
    for (const [id, t, u] of [[ids.w7, ids.tA, ids.uW7], [ids.w8, ids.tA, ids.uW8], [ids.q5, ids.tA, ids.uQ5], [ids.z3, ids.tA, ids.uTZ3], [ids.z3b, ids.tA, ids.uTZ3b], [ids.z4, ids.tA, ids.uTZ4], [ids.n13, ids.tL, ids.uL13], [ids.m14, ids.tL, ids.uL14]] as const) await staff(id, t, u, `ช่าง ${u.slice(6, 12)}`, 1);
    // หน่วย QUEUE เดิม (ร้าน A)
    await insertRow("QueueType", { id: ids.qType, tenantId: ids.tA, unitId: ids.uQ, code: "GEN", name: "ทั่วไป", prefix: "Q", updatedAt: new Date() });
    await insertRow("QueueCounter", { id: ids.qCounter, tenantId: ids.tA, unitId: ids.uQ, code: "1", name: "ช่อง 1", status: "OPEN", updatedAt: new Date() });
    await insertRow("User", { id: ids.owner, email: `${USER_MAIL}owner-${RUN}@qc.invalid`, name: "QC B4 owner", updatedAt: new Date() });
    for (const t of ALL_TENANTS) await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: t, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    setupOk = true;
  } catch (e) {
    console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`);
  }
  const need = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");

  console.log("\n── T: แม่แบบ/ค่าตั้ง ──");
  const BARBER_UNITS: [string, string][] = [
    [ids.tA, ids.uL], [ids.tA, ids.uRace], [ids.tA, ids.uD], [ids.tL, ids.uL1], [ids.tL, ids.uSnap], [ids.tL, ids.uHold], [ids.tL, ids.uEod],
    [ids.tT1, ids.uT1], [ids.tT2, ids.uT2], [ids.tT3, ids.uT3], [ids.tT4, ids.uX4], [ids.tB, ids.uB],
    // ORACLE-EDIT 29 ต.ค. (review)
    [ids.tX6, ids.uX6], [ids.tA, ids.uX7], [ids.tA, ids.uW7], [ids.tA, ids.uW8], [ids.tA, ids.uQ5], [ids.tA, ids.uTZ3], [ids.tA, ids.uTZ3b], [ids.tA, ids.uTZ4], [ids.tL, ids.uL13], [ids.tL, ids.uL14],
  ];
  await st("T-0", "applyTemplate BARBER (22 สาขา · แถวเดียว/ผ่อนผัน 10/ไม่มา 30/ปล่อยช่อง) + ทับ: พักขั้นต่ำช่างดี 10 · LSNW ไม่รับ walk-in · uHold หลังผ่อนผัน = รอต่อ · uLegA/uLeg ไม่เลือกแม่แบบ (ร้านเดิม)", async () => {
    need();
    for (const [t, u] of BARBER_UNITS) {
      const a = await SETTINGS().applyTemplate(OWNER, { tenantId: t }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
      ok(a.ok, `applyTemplate ${u}: ${a.code} ${fmt(a.issues)}`);
    }
    await setS(ids.tA, [
      { key: "booking.staff.minBreakMin", scope: "STAFF", scopeId: ids.d1, value: 10 },
      { key: "booking.service.walkIn", scope: "SERVICE", scopeId: ids.LSNW, value: { enabled: false, closeAtOrAboveMin: null } },
    ]);
    await setS(ids.tL, [{ key: "booking.late.afterGrace", scope: "UNIT", scopeId: ids.uHold, value: "WAIT_NOTIFY_COUNTER" }]);
    tplOk = true;
  });
  const needTpl = () => { need(); ok(tplOk, "ตั้งแม่แบบ/ค่าตั้งไม่สำเร็จ (T-0)"); };
  // ORACLE-EDIT 29 ต.ค. (review)
  let t1Ok = false;
  await st("T-1", "ค่าตั้ง/ข้อมูลเพิ่ม (review): uW8 กลุ่มได้คิวก่อน + ตัวอักษรบัตร B · uL13 มัดจำรายบริการ + ผูกระบบ POS/บัญชี (ทางริบมัดจำจริง)", async () => {
    needTpl();
    await setS(ids.tA, [
      { key: "booking.queue.prefixes", scope: "UNIT", scopeId: ids.uW8, value: { walkIn: "A", appointment: "P", priority: "B" } },
      { key: "booking.queue.priorityGroups", scope: "UNIT", scopeId: ids.uW8, value: ["ELDERLY"] },
    ]);
    await setS(ids.tL, [{ key: "booking.deposit.amount", scope: "UNIT", scopeId: ids.uL13, value: { mode: "PER_SERVICE" } }]);
    const sys = (await import("@/lib/modules/system/service")) as unknown as { createSystem: (t: string, type: string, name: string) => Promise<{ id: string }>; linkUnit: (t: string, s: string, u: string) => Promise<unknown> };
    const acc = (await import("@/lib/modules/account/service")) as unknown as { saveSettings: (t: string, s: string, v: unknown) => Promise<unknown> };
    const gl = (await import("@/lib/modules/account/gl")) as unknown as { ensureAccounting: (i: { tenantId: string; systemId: string }) => Promise<unknown> };
    const posSys = await sys.createSystem(ids.tL, "POS", "ขาย QC B4");
    await sys.linkUnit(ids.tL, posSys.id, ids.uL13);
    const accSys = await sys.createSystem(ids.tL, "ACCOUNT", "บัญชี QC B4");
    await acc.saveSettings(ids.tL, accSys.id, { orgName: "QC B4 จำกัด", taxId: "0105561177639", vatRegistered: true });
    await gl.ensureAccounting({ tenantId: ids.tL, systemId: accSys.id });
    await insertRow("AccountSystemLink", { id: rid("asl"), tenantId: ids.tL, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id });
    t1Ok = true;
  }, "MAJOR");
  const needT1 = () => { needTpl(); ok(t1Ok, "ค่าตั้ง/ข้อมูลเพิ่มไม่สำเร็จ (T-1)"); };

  await st("F-0", "นัดตั้งต้นทุกฉาก (bookAppointment ช่อง STAFF ของ B.3 ⇒ CONFIRMED + snapshot) + แถวดิบ PENDING/CANCELLED/LATE/ไม่มี snapshot", async () => {
    needTpl();
    // K (uL · วัน K)
    fx.K1 = await bookStaff(cL, ids.LS60, ids.a1, D.K, 600, "0812345678");
    fx.K2 = await bookStaff(cL, ids.LS60, ids.a2, D.K, 600, "0823456789");
    fx.K3 = await bookStaff(cL, ids.LS60, ids.a1, D.K, 780, "0823456789");
    fx.K4 = await bookStaff(cL, ids.LS60, ids.a2, D.K, 840);
    fx.K5 = await bookStaff(cL, ids.LS60, ids.a1, D.K, 900);
    fx.K6 = await bookStaff(cL, ids.LS60, ids.a1, D.K2, 600);
    fx.K7 = await bookStaff(cL, ids.LS60, ids.a2, D.K, 960);
    fx.K8 = await bookStaff(cL, ids.LS60, ids.a2, D.K, 690, "0834567890");
    fx.KLeg = await bookStaff(cLegA, ids.G60, ids.g1, D.K, 600);
    fx.KB = await bookStaff(cB, ids.B60, ids.b1, D.K, 600);
    fx.KRace = await bookStaff(cRace, ids.R60, RACE[0], D.K, 600);
    await q(`UPDATE "Appointment" SET status = 'PENDING' WHERE id = $1`, [fx.K4]);
    await q(`UPDATE "Appointment" SET status = 'CANCELLED' WHERE id = $1`, [fx.K5]);
    // J (uL · วัน J)
    fx.J1 = await bookStaff(cL, ids.LS60, ids.a1, D.J, 600);
    fx.J2 = await bookStaff(cL, ids.LS60, ids.a2, D.J, 660);
    fx.J3 = await bookStaff(cL, ids.LS60, ids.a1, D.J, 720);
    fx.J4 = await bookStaff(cL, ids.LS60, ids.a2, D.J, 780);
    fx.J5 = await bookStaff(cL, ids.LS60, ids.a1, D.J, 840);
    fx.J6 = await bookStaff(cL, ids.LS60, ids.a1, D.J, 900);
    fx.J7 = await bookStaff(cL, ids.LS60, ids.a2, D.J, 900);
    fx.J8 = await bookStaff(cL, ids.LS60, ids.a2, D.J, 1020);
    await q(`UPDATE "Appointment" SET status = 'LATE', "lateAt" = $2 WHERE id = $1`, [fx.J8, at(D.J, 1030)]);
    // L (ร้าน L)
    fx.AP = await bookStaff(cL1, ids.L60, ids.s1, D.L1, 600, "0861230001");
    fx.AP2 = await bookStaff(cL1, ids.L60, ids.s1, D.L1, 780);
    fx.AP3 = await bookStaff(cL1, ids.L60, ids.s1, D.L1, 900);
    await q(`UPDATE "Appointment" SET status = 'PENDING' WHERE id = $1`, [fx.AP3]);
    fx.A1 = await bookStaff(cSnap, ids.P60, ids.p1, D.Snap, 600);
    fx.H = await bookStaff(cHold, ids.H60, ids.h1, D.Hold, 600);
    fx.E = await bookStaff(cLeg, ids.E60, ids.e1, D.Leg, 600);
    fx.NUL = rid("ap");
    await insertRow("Appointment", {
      id: fx.NUL, tenantId: ids.tL, unitId: ids.uL1, staffId: ids.s1, serviceId: ids.L60, startAt: at(D.Null, 600), endAt: at(D.Null, 660), status: "CONFIRMED",
      source: "STAFF", channel: "STAFF", customerName: "นัดรุ่นแรก", customerPhone: "0800000000", kind: "BOOKED", updatedAt: new Date(),
    });
    fx.EB = await bookStaff(cEod, ids.O60, ids.o1, D.Eod, 1080);
    fx.BX = await bookStaff(cB, ids.B60, ids.b1, D.B, 600);
    // X
    fx.XA = await bookStaff(cRace, ids.R60, RACE[0], D.X1, 600, "0871112222");
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) fx[`T${r}_${i}`] = await bookStaff(cT[r], TK_SVC[r], TICKSTAFF[r][i], D.X3, i < 3 ? 600 : 620);
    for (let i = 0; i < 5; i++) fx[`X4_${i}`] = await bookStaff(cX4, ids.X4S, X4STAFF[i], D.X4, 600);
    // TZ (นอกเวลาร้านได้ — ช่อง STAFF)
    fx.Z1 = await bookStaff(cL, ids.LS30, ids.a1, D.TZ, 390);
    fx.Z2 = await bookStaff(cL, ids.LS30, ids.a2, D.TZ, 1380);
    fxOk = true;
  });
  const needFx = () => { needTpl(); ok(fxOk, "นัดตั้งต้นไม่ครบ (F-0)"); };

  // ═══════════════ C0 ตัวควบคุม ═══════════════
  console.log("\n── C0: ตัวควบคุม (ต้องเขียวตั้งแต่ก่อนมีงาน) ──");
  await st("C0-1", "นัดตั้งต้นมี snapshot ของ BARBER (ผ่อนผัน 10 · ไม่มา 30 · RELEASE_REQUEUE) · uHold = WAIT_NOTIFY_COUNTER · ร้านเดิม noShow null · แถวรุ่นแรกไม่มี snapshot", async () => {
    needFx();
    const v = (await apRow(fx.AP)).policySnapshot?.values ?? {};
    eq([v["booking.late.graceMin"], v["booking.late.noShowAfterMin"], v["booking.late.afterGrace"]], [10, 30, "RELEASE_REQUEUE"], "snapshot AP");
    eq((await apRow(fx.H)).policySnapshot?.values?.["booking.late.afterGrace"], "WAIT_NOTIFY_COUNTER", "snapshot H");
    eq((await apRow(fx.E)).policySnapshot?.values?.["booking.late.noShowAfterMin"], null, "snapshot ร้านเดิม");
    eq((await apRow(fx.NUL)).policySnapshot, null, "แถวรุ่นแรก");
  }, "MAJOR");
  // ค่าคาดของหมวด L (นาทีของวัน) — พิสูจน์ด้วย planDay จริงใน C0-2 ⇒ หมวด L ทดสอบ "ตัวห่อ" ไม่ใช่ตัววางคิว
  const EXP = { walkInAt0955: 660, walkInAt1009: 669, walkInAt1010: 610, lateArrivalAt1020: 672, holdWalkInAt1010: 670 };
  await st("C0-2", `planDay (B.2) ฉาก L: walk-in 09:55 ⇒ ${hhmm(EXP.walkInAt0955)} · 10:09 ⇒ ${hhmm(EXP.walkInAt1009)} · 10:10 นัดปล่อยช่อง ⇒ walk-in ${hhmm(EXP.walkInAt1010)} · มาสาย 10:20 ⇒ ${hhmm(EXP.lateArrivalAt1020)} (LATE_ARRIVAL_AS_WALKIN) · HOLD ⇒ ${hhmm(EXP.holdWalkInAt1010)}`, () => {
    const planDay = plannerLoad.mod?.planDay;
    ok(typeof planDay === "function", `โหลด planner ไม่ได้ ${plannerLoad.err}`);
    const DS = "2031-03-04";
    const settings: PlanSettings = { queueOrder: "SINGLE_LINE", backfill: true, safetyBeforeBookingMin: 5, graceMin: 10, noShowAfterMin: 30, lateAction: "RELEASE", priorityEnabled: false, walkInMaxWaitMin: 120, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null };
    const staffL = [{ id: "s1", name: "s1", sortOrder: 1, windows: [{ startAt: bkkMs(DS, 600), endAt: bkkMs(DS, 1200) }], services: null }];
    const services = [{ id: "S", name: "S", durationMin: 60, bufferAfterMin: 0 }];
    const ap = (o: Partial<PlanJob>): PlanJob => ({ id: "ap", label: "ap", kind: "BOOKED", status: "CONFIRMED", serviceId: "S", assignMode: "SPECIFIC", staffId: "s1", startAt: bkkMs(DS, 600), issuedAt: bkkMs(DS, 0), checkedInAt: null, startedAt: null, priority: false, policy: { graceMin: 10, noShowAfterMin: 30, lateAction: "RELEASE" }, ...o });
    const wi = (o: Partial<PlanJob>): PlanJob => ({ id: "wi", label: "wi", kind: "WALKIN", status: "QUEUED", serviceId: "S", assignMode: "ANY", staffId: null, startAt: null, issuedAt: bkkMs(DS, 595), checkedInAt: bkkMs(DS, 595), startedAt: null, priority: false, ...o });
    const run = (now: number, jobs: PlanJob[]) => planDay!({ now: bkkMs(DS, now), settings, staff: staffL, services, jobs }).jobs;
    const get = (js: ReturnType<typeof run>, id: string) => js.find((j) => j.jobId === id)!;
    eq(get(run(595, [ap({}), wi({})]), "wi").startAt, bkkMs(DS, EXP.walkInAt0955), "09:55 walk-in");
    eq(get(run(609, [ap({}), wi({})]), "wi").startAt, bkkMs(DS, EXP.walkInAt1009), "10:09 walk-in");
    const p10 = run(610, [ap({ status: "LATE" }), wi({})]);
    eq([get(p10, "ap").state, get(p10, "wi").startAt, get(p10, "wi").staffId], ["RELEASED_LATE", bkkMs(DS, EXP.walkInAt1010), "s1"], "10:10");
    const p20 = run(620, [ap({ status: "ARRIVED", checkedInAt: bkkMs(DS, 620) }), wi({ status: "IN_SERVICE", staffId: "s1", startedAt: bkkMs(DS, 612) })]);
    eq([get(p20, "ap").startAt, get(p20, "ap").reason], [bkkMs(DS, EXP.lateArrivalAt1020), "LATE_ARRIVAL_AS_WALKIN"], "มาสาย 10:20");
    const ph = run(610, [ap({ status: "LATE", policy: { graceMin: 10, noShowAfterMin: 30, lateAction: "HOLD" } }), wi({})]);
    eq(get(ph, "wi").startAt, bkkMs(DS, EXP.holdWalkInAt1010), "HOLD 10:10");
  }, "MAJOR");
  await st("C0-3", "หน่วย QUEUE เดิม: issueTicket ⇒ Q001 · resolveQueueUnit(QUEUE) ได้หน่วย (ทางเดิมไม่พัง)", async () => {
    need();
    const r = await QU().issueTicket({ tenantId: ids.tA, unitId: ids.uQ, typeId: ids.qType, channel: "STAFF", actorType: "STAFF" });
    ok(r.ok, `issueTicket ${fmt(r)}`);
    if (r.ok) { eq(r.ticket.number, "Q001", "เลขบัตร"); state.q1 = r.ticket.id; }
    const u = await QU().resolveQueueUnit(SLUGS[ids.tA], SLUGS[ids.uQ]);
    eq(u?.unit.id, ids.uQ, "resolveQueueUnit QUEUE");
  }, "MAJOR");

  // ═══════════════ K เช็กอิน ═══════════════
  console.log("\n── K: เช็กอิน 3 ทาง (ใบสั่ง §3.2) ──");
  const nK = (min: number) => at(D.K, min);
  await st("K-1", "QR: checkInToken → checkIn({token}, QR, 09:50) ⇒ ok P001 · already false · asWalkIn false · นัด ARRIVED checkedInAt=now queueTicketId · บัตร APPOINTMENT/P/isSystem · ref ถูก · channel BOOKING · businessDate = วันนัด · ไม่มีชื่อ/เบอร์ · booking.checked_in 1", async () => {
    needFx();
    const tok = await LN.token()(cL, fx.K1);
    ok(typeof tok === "string" && tok.length >= 32, `token ${fmt(tok)}`);
    const r = okCI(await LN.checkIn()(cL, { token: tok! }, { via: "QR", now: nK(590) }), "เช็กอิน QR");
    eq([r.appointmentId, r.ticketNumber, r.already, r.asWalkIn], [fx.K1, "P001", false, false], "ผล");
    state.K1t = r.ticketId;
    const a = await apRow(fx.K1);
    eq([a.status, a.queueTicketId], ["ARRIVED", r.ticketId], "นัด");
    eqAt(a.checkedInAt, D.K, 590, "checkedInAt");
    const t = await tkRow(r.ticketId);
    eq([t.status, t.refType, t.refId, t.channel, t.businessDate, t.unitId, t.code, t.prefix, t.isSystem, t.contactName, t.contactPhone],
      ["WAITING", "APPOINTMENT", fx.K1, "BOOKING", D.K, ids.uL, "APPOINTMENT", "P", true, null, null], "บัตร P");
    eq(await obCount("booking.checked_in", fx.K1), 1, "event booking.checked_in");
  });
  await st("K-2", "ซ้ำทาง LINE (appointmentId) ⇒ ok already:true ticketId เดิม · บัตรของนัด 1 ใบ · event ยัง 1", async () => {
    needFx();
    const r = okCI(await LN.checkIn()(cL, { appointmentId: fx.K1 }, { via: "LINE", now: nK(592) }), "ซ้ำ");
    eq([r.already, r.ticketId], [true, state.K1t], "ซ้ำ");
    eq((await ticketsOf(fx.K1)).length, 1, "บัตรของนัด");
    eq(await obCount("booking.checked_in", fx.K1), 1, "event");
  });
  await st("K-3", "เบอร์: +66 82-345-6789 มี 2 นัดวันนี้ ⇒ AMBIGUOUS + candidates {K2,K3} ไม่มีชื่อ/เบอร์ · 083 456 7890 ⇒ ok K8 P002 · เบอร์ไม่รู้จัก ⇒ NOT_FOUND", async () => {
    needFx();
    const amb = await LN.checkIn()(cL, { phone: "+66 82-345-6789" }, { via: "PHONE", now: nK(595) });
    failCode(amb, "AMBIGUOUS", "สองนัด");
    const cands = amb.ok ? [] : (amb.candidates ?? []);
    eq(cands.map((c) => c.appointmentId).sort(), [fx.K2, fx.K3].sort(), "candidates");
    const js = JSON.stringify(cands);
    ok(!/0823456789|823456789|ลูกค้า|customerName|customerPhone/.test(js), `candidates มี PII: ${js.slice(0, 160)}`);
    eq((await apRow(fx.K2)).status, "CONFIRMED", "K2 ไม่เปลี่ยน");
    const r = okCI(await LN.checkIn()(cL, { phone: "083 456 7890" }, { via: "PHONE", now: nK(596) }), "เบอร์ K8");
    eq([r.appointmentId, r.ticketNumber], [fx.K8, "P002"], "K8");
    failCode(await LN.checkIn()(cL, { phone: "0899999999" }, { via: "PHONE", now: nK(597) }), "NOT_FOUND", "เบอร์ไม่รู้จัก");
  });
  await st("K-4", "รหัสล้ม: PENDING ⇒ NOT_CONFIRMED · CANCELLED ⇒ BAD_STATE · นัดวันอื่น ⇒ NOT_TODAY · 16:30 (ครบไม่มา 30) ⇒ TOO_LATE แถวไม่เปลี่ยน · 16:29 ⇒ ok asWalkIn:true · ร้านเดิม ⇒ NOT_SINGLE_LINE", async () => {
    needFx();
    failCode(await LN.checkIn()(cL, { appointmentId: fx.K4 }, { via: "STAFF", now: nK(830) }), "NOT_CONFIRMED", "PENDING");
    failCode(await LN.checkIn()(cL, { appointmentId: fx.K5 }, { via: "STAFF", now: nK(890) }), "BAD_STATE", "CANCELLED");
    failCode(await LN.checkIn()(cL, { appointmentId: fx.K6 }, { via: "STAFF", now: nK(590) }), "NOT_TODAY", "วันอื่น");
    failCode(await LN.checkIn()(cL, { appointmentId: fx.K7 }, { via: "STAFF", now: nK(990) }), "TOO_LATE", "16:30");
    const k7 = await apRow(fx.K7);
    eq([k7.status, k7.queueTicketId, k7.checkedInAt], ["CONFIRMED", null, null], "K7 หลัง TOO_LATE");
    const r = okCI(await LN.checkIn()(cL, { appointmentId: fx.K7 }, { via: "STAFF", now: nK(989) }), "16:29");
    eq([r.asWalkIn, r.already], [true, false], "มาสายภายใน 30");
    failCode(await LN.checkIn()(cLegA, { appointmentId: fx.KLeg }, { via: "STAFF", now: nK(590) }), "NOT_SINGLE_LINE", "ร้านเดิม");
    eq((await apRow(fx.K4)).status, "PENDING", "K4");
    eq((await ticketsOf(fx.K4)).length + (await ticketsOf(fx.K5)).length + (await ticketsOf(fx.K6)).length + (await ticketsOf(fx.KLeg)).length, 0, "ไม่มีบัตรของรายการที่ล้ม");
  });
  await st("K-5", "X1/X7: token ร้าน B · token สาขาอื่นร้านเดียวกัน · token มั่ว ⇒ NOT_FOUND reason เดียวกันทุกกรณี · checkInToken ข้ามขอบเขต ⇒ null · id ร้าน B ⇒ NOT_FOUND · แถวต่างร้านไม่เปลี่ยน ไม่มีบัตร", async () => {
    needFx();
    const tokB = await LN.token()(cB, fx.KB);
    const tokR = await LN.token()(cRace, fx.KRace);
    ok(typeof tokB === "string" && typeof tokR === "string", "ออก token ในขอบเขตตัวเองไม่ได้");
    eq(await LN.token()(cL, fx.KB), null, "checkInToken ข้ามร้าน");
    eq(await LN.token()(cL, fx.KRace), null, "checkInToken ข้ามสาขา");
    const reasons = [
      failCode(await LN.checkIn()(cL, { token: tokB! }, { via: "QR", now: nK(590) }), "NOT_FOUND", "token ร้าน B"),
      failCode(await LN.checkIn()(cL, { token: tokR! }, { via: "QR", now: nK(590) }), "NOT_FOUND", "token สาขาอื่น"),
      failCode(await LN.checkIn()(cL, { token: "eyJ2IjoxfQ.bad" }, { via: "QR", now: nK(590) }), "NOT_FOUND", "token มั่ว"),
      failCode(await LN.checkIn()(cL, { appointmentId: fx.KB }, { via: "LINE", now: nK(590) }), "NOT_FOUND", "id ร้าน B"),
    ];
    eq(new Set(reasons).size, 1, `reason ต่างกัน (X7): ${fmt(reasons)}`);
    for (const id of [fx.KB, fx.KRace]) { eq((await apRow(id)).status, "CONFIRMED", `แถว ${id}`); eq((await ticketsOf(id)).length, 0, `บัตร ${id}`); }
  });

  // ORACLE-EDIT 29 ต.ค. (review) J6
  await st("K-6", "นัด ARRIVED จากจอเดิม (setAppointmentStatus · ไม่มีบัตร) ⇒ checkIn ออกบัตรให้ ok already:true · queueTicketId ตั้ง · บัตร P WAITING 1 ใบ · callJob ได้", async () => {
    needFx();
    const id = await bookStaff(cL, ids.LS60, ids.a1, D.K6, 600);
    const s0 = await BK().setAppointmentStatus(ids.tA, ids.uL, id, "ARRIVED");
    ok(s0.ok, `ARRIVED จากจอเดิม ${fmt(s0)}`);
    eq((await apRow(id)).queueTicketId, null, "ตัวควบคุม: ARRIVED จากจอเดิมยังไม่มีบัตร");
    const r = okCI(await LN.checkIn()(cL, { appointmentId: id }, { via: "STAFF", now: at(D.K6, 595) }), "เช็กอิน");
    eq(r.already, true, "already");
    const a = await apRow(id);
    eq([a.status, a.queueTicketId], ["ARRIVED", r.ticketId], "แถว");
    const t = await tkRow(r.ticketId);
    eq([t.status, t.refId, t.code], ["WAITING", id, "APPOINTMENT"], "บัตร");
    eq((await ticketsOf(id)).length, 1, "บัตรของนัด");
    okJob(await LN.call()(cL, id, { now: at(D.K6, 600) }), "เรียก");
  }, "MAJOR");

  // ═══════════════ W walk-in ═══════════════
  console.log("\n── W: walk-in + บัตร A (ใบสั่ง §3.2) ──");
  const nW = (min: number) => at(D.W, min);
  await st("W-1", "createWalkIn ANY KIOSK 10:00 ⇒ ok A001 · แถว WALKIN/QUEUED/KIOSK/ANY · staffId = ช่างที่วาง · startAt=plannedStartAt=10:00 · endAt 11:00 · checkedInAt=now · บัตร WALKIN/A ref ถูก ไม่มีชื่อ/เบอร์ · booking.created 1 · snapshot.job {60,0}", async () => {
    needFx();
    const r = okWI(await LN.walkIn()(cL, { serviceId: ids.LS60, staffId: null, channel: "KIOSK" }, { now: nW(600) }), "walk-in");
    eq(r.ticketNumber, "A001", "เลขบัตร");
    ok(r.staffId === ids.a1 || r.staffId === ids.a2, `staffId ${r.staffId}`);
    eq(tms(r.plannedStartAt), bkkMs(D.W, 600), "plannedStartAt");
    state.W1 = r.appointmentId; state.W1t = r.ticketId; state.W1s = r.staffId!;
    const a = await apRow(r.appointmentId);
    eq([a.kind, a.status, a.channel, a.assignMode, a.staffId, a.queueTicketId, a.plannedStaffId], ["WALKIN", "QUEUED", "KIOSK", "ANY", r.staffId, r.ticketId, r.staffId], "แถว");
    eqAt(a.startAt, D.W, 600, "startAt"); eqAt(a.endAt, D.W, 660, "endAt"); eqAt(a.checkedInAt, D.W, 600, "checkedInAt"); eqAt(a.plannedStartAt, D.W, 600, "plannedStartAt");
    eq(a.policySnapshot?.job, { durationMin: 60, bufferMin: 0 }, "policySnapshot.job");
    const t = await tkRow(r.ticketId);
    eq([t.status, t.refType, t.refId, t.channel, t.code, t.prefix, t.isSystem, t.businessDate, t.contactPhone, t.contactName], ["WAITING", "APPOINTMENT", r.appointmentId, "KIOSK", "WALKIN", "A", true, D.W, null, null], "บัตร A");
    eqAt(t.etaAt, D.W, 600, "etaAt");
    eq(await obCount("booking.created", r.appointmentId), 1, "event booking.created");
  });
  await st("W-2", "ระบุช่าง (SPECIFIC · ช่องทาง STAFF · มีชื่อ/เบอร์) ⇒ staffId = ที่ขอ · วางหลังงานแรก 11:00 · A002 · เบอร์อยู่ที่นัด ไม่อยู่ที่บัตร", async () => {
    needFx();
    ok(!!state.W1s, "ไม่มีผล W-1");
    PII_PHONES.push("0845556666");
    const r = okWI(await LN.walkIn()(cL, { serviceId: ids.LS60, staffId: state.W1s, channel: "STAFF", customerName: "คุณวอล์ค อินทร์", customerPhone: "0845556666" }, { now: nW(600) }), "walk-in ระบุช่าง"); // ORACLE-EDIT 29 ต.ค.: now 10:00 (เดิม 10:01 — planDay ดึง walk-in ที่ยังไม่เริ่มมาที่ now ⇒ W2 ได้ 11:01)
    eq([r.staffId, r.ticketNumber], [state.W1s, "A002"], "ผล");
    eq(tms(r.plannedStartAt), bkkMs(D.W, 660), "plannedStartAt");
    state.W2 = r.appointmentId;
    const a = await apRow(r.appointmentId);
    eq([a.assignMode, a.channel, a.customerPhone], ["SPECIFIC", "STAFF", "0845556666"], "แถว");
    eqAt(a.startAt, D.W, 660, "startAt");
    eq((await tkRow(r.ticketId)).contactPhone, null, "บัตรไม่มีเบอร์");
  });
  await st("W-3", "ล้ม: บริการ 90 นาที (แม่แบบปิด ≥ 90) / ตั้งไม่รับ ⇒ WALKIN_DISABLED · 19:30 งาน 60 ⇒ WALKIN_CLOSED · บริการร้าน B / ช่างสาขาอื่น ⇒ NOT_FOUND · ร้านเดิม ⇒ NOT_SINGLE_LINE · ไม่มีแถว/บัตรเกิด", async () => {
    needFx();
    const cnt = async () => (await q<{ n: number }>(`SELECT (SELECT count(*) FROM "Appointment" WHERE "tenantId" = ANY($1::text[])) + (SELECT count(*) FROM "QueueTicket" WHERE "tenantId" = ANY($1::text[])) AS n`, [ALL_TENANTS]))[0].n;
    const before = await cnt();
    failCode(await LN.walkIn()(cL, { serviceId: ids.LS90, staffId: null, channel: "KIOSK" }, { now: nW(610) }), "WALKIN_DISABLED", "90 นาที");
    failCode(await LN.walkIn()(cL, { serviceId: ids.LSNW, staffId: null, channel: "KIOSK" }, { now: nW(610) }), "WALKIN_DISABLED", "ตั้งไม่รับ");
    failCode(await LN.walkIn()(cL, { serviceId: ids.LS60, staffId: null, channel: "KIOSK" }, { now: nW(1170) }), "WALKIN_CLOSED", "19:30");
    failCode(await LN.walkIn()(cL, { serviceId: ids.B60, staffId: null, channel: "KIOSK" }, { now: nW(610) }), "NOT_FOUND", "บริการร้าน B");
    failCode(await LN.walkIn()(cL, { serviceId: ids.LS60, staffId: ids.g1, channel: "KIOSK" }, { now: nW(610) }), "NOT_FOUND", "ช่างสาขาอื่น");
    failCode(await LN.walkIn()(cLegA, { serviceId: ids.G60, staffId: null, channel: "KIOSK" }, { now: nW(610) }), "NOT_SINGLE_LINE", "ร้านเดิม");
    eq(Number(await cnt()), Number(before), "จำนวนแถว+บัตร");
  });
  await st("W-4", "walk-in ถือช่องจริง (B.3 §6 ข้อ 9): findSlots STAFF ของช่างนั้นไม่มี 10:00/11:00 · จอง STAFF ทับ 10:00 ⇒ FULL · ช่างอีกคนยังว่าง 10:00 (ตัวควบคุม)", async () => {
    needFx();
    ok(!!state.W1s, "ไม่มีผล W-1");
    const other = state.W1s === ids.a1 ? ids.a2 : ids.a1;
    const mine = (await BK().findSlots(cL, { serviceId: ids.LS60, staffId: state.W1s, dateStr: D.W, channel: "STAFF" })).map((s) => s.startMin);
    ok(!mine.includes(600) && !mine.includes(660), `ช่องยังโผล่ ${fmt(mine.slice(0, 8))}`);
    ok((await BK().findSlots(cL, { serviceId: ids.LS60, staffId: other, dateStr: D.W, channel: "STAFF" })).some((s) => s.startMin === 600), "ช่างอีกคนไม่ว่าง 10:00");
    const r = await BK().bookAppointment(cL, bk({ serviceId: ids.LS60, staffId: state.W1s, dateStr: D.W, startMin: 600, channel: "STAFF" }));
    eq(r.ok ? "OK" : r.code, "FULL", "จองทับ walk-in");
  });
  await st("W-5", "startJob walk-in 10:05 ⇒ IN_SERVICE startedAt · startAt 10:05 endAt 11:05 · บัตร SERVING · walk-in ถัดไปของช่างเดียวกันเลื่อนเป็น 11:05 (runPlanner หลังเหตุการณ์)", async () => {
    needFx();
    ok(!!state.W1 && !!state.W2, "ไม่มีผล W-1/W-2");
    okJob(await LN.start()(cL, state.W1, { now: nW(605) }), "เริ่ม");
    const a = await apRow(state.W1);
    eq(a.status, "IN_SERVICE", "สถานะ");
    eqAt(a.startedAt, D.W, 605, "startedAt"); eqAt(a.startAt, D.W, 605, "startAt"); eqAt(a.endAt, D.W, 665, "endAt");
    eq((await tkRow(state.W1t)).status, "SERVING", "บัตร");
    const b = await apRow(state.W2);
    eqAt(b.plannedStartAt, D.W, 665, "W2 plannedStartAt"); eqAt(b.startAt, D.W, 665, "W2 startAt");
  });
  await st("W-6", "เลขบัตรนับใหม่ทุกวันไทย: walk-in วันอื่น ⇒ A001", async () => {
    needFx();
    const r = okWI(await LN.walkIn()(cL, { serviceId: ids.LS60, staffId: null, channel: "KIOSK" }, { now: at(D.K2, 540) }), "วันอื่น");
    eq(r.ticketNumber, "A001", "เลข");
  }, "MAJOR");

  // ORACLE-EDIT 29 ต.ค. (review) J3
  await st("W-7", "startJob walk-in ก่อนเวลาแล้วจะชนนัดถัดไป (นัด 10:00 · walk-in วาง 11:00 · กดเริ่ม 09:58) ⇒ CLASH ไม่เขียนอะไร (แถว/บัตรเดิม · ไม่ซ้อน) · ตัวควบคุม: เริ่ม 11:00 ⇒ ok ไม่ซ้อน", async () => {
    needFx();
    await bookStaff(cW7, ids.W7S, ids.w7, D.W7, 600);
    const w = okWI(await LN.walkIn()(cW7, { serviceId: ids.W7S, staffId: null, channel: "KIOSK" }, { now: at(D.W7, 590) }), "walk-in");
    const before = await apRow(w.appointmentId);
    ok((tms(before.startAt) ?? 0) >= bkkMs(D.W7, 660), `ตัวควบคุม: walk-in ต้องวางหลังนัด (${before.startAt?.toISOString()})`);
    failCode(await LN.start()(cW7, w.appointmentId, { now: at(D.W7, 598) }), "CLASH", "เริ่มก่อนเวลา");
    const a = await apRow(w.appointmentId);
    eq([a.status, tms(a.startAt), tms(a.endAt), a.startedAt], ["QUEUED", tms(before.startAt), tms(before.endAt), null], "แถวไม่เปลี่ยน");
    eq((await tkRow(w.ticketId)).status, "WAITING", "บัตร");
    eq(await overlapIn(ids.w7, bkkMs(D.W7, 0), bkkMs(D.W7, 1440)), [], "ซ้อน");
    okJob(await LN.start()(cW7, w.appointmentId, { now: at(D.W7, 660) }), "เริ่ม 11:00");
    eq(await overlapIn(ids.w7, bkkMs(D.W7, 0), bkkMs(D.W7, 1440)), [], "ซ้อนหลังเริ่ม");
  });
  // ORACLE-EDIT 29 ต.ค. (review) J6
  await st("W-8", "สิทธิ์คิวก่อน: N1 เริ่มแล้ว · N2 (ปกติ 10:01) ได้ 11:00 · P (priority 10:02) แซง ⇒ P 11:00 · N2 12:00 · หลัง runPlanner(10:05) ยังเหมือนเดิม · policySnapshot.job.priority = true", async () => {
    needT1();
    const n1 = okWI(await LN.walkIn()(cW8, { serviceId: ids.W8S, staffId: null, channel: "STAFF" }, { now: at(D.W8, 600) }), "N1");
    okJob(await LN.start()(cW8, n1.appointmentId, { now: at(D.W8, 600) }), "เริ่ม N1");
    const n2 = okWI(await LN.walkIn()(cW8, { serviceId: ids.W8S, staffId: null, channel: "STAFF" }, { now: at(D.W8, 601) }), "N2");
    eq(tms(n2.plannedStartAt), bkkMs(D.W8, 660), "ตัวควบคุม: N2 ก่อนมี P");
    const p = okWI(await LN.walkIn()(cW8, { serviceId: ids.W8S, staffId: null, channel: "STAFF", priority: true }, { now: at(D.W8, 602) }), "P");
    eq(tms(p.plannedStartAt), bkkMs(D.W8, 660), "quote P");
    await RN.plan()(cW8, { now: at(D.W8, 605) });
    const ap = await apRow(p.appointmentId);
    const an = await apRow(n2.appointmentId);
    eq(ap.policySnapshot?.job?.priority, true, "policySnapshot.job.priority");
    eqAt(ap.plannedStartAt, D.W8, 660, "P หลัง replan");
    eqAt(an.plannedStartAt, D.W8, 720, "N2 หลัง replan");
  }, "MAJOR");

  // ═══════════════ J งาน ═══════════════
  console.log("\n── J: เรียก/เริ่ม/เสร็จ · ทางเดิม · ยกเลิก/เลื่อนฝั่งร้าน (ใบสั่ง §3.1 §3.2) ──");
  const nJ = (min: number) => at(D.J, min);
  let jReady = false;
  await st("J-0", "เช็กอิน J1 J2 J4 J5 (ทาง STAFF)", async () => {
    needFx();
    for (const [k, m] of [["J1", 595], ["J2", 655], ["J4", 775], ["J5", 835]] as const) state[`${k}t`] = okCI(await LN.checkIn()(cL, { appointmentId: fx[k] }, { via: "STAFF", now: nJ(m) }), k).ticketId;
    jReady = true;
  }, "MAJOR");
  const needJ = () => { needFx(); ok(jReady, "เช็กอินตั้งต้นของหมวด J ล้ม (J-0)"); };
  await st("J-1", "callJob ⇒ บัตร CALLED callCount 1 · นัดยัง ARRIVED · queue.ticket.called 1 · เรียกซ้ำ ⇒ callCount 2 · event 2", async () => {
    needJ();
    okJob(await LN.call()(cL, fx.J1, { now: nJ(600) }), "เรียก");
    let t = await tkRow(state.J1t);
    eq([t.status, t.callCount, t.calledAt !== null], ["CALLED", 1, true], "บัตร");
    eq((await apRow(fx.J1)).status, "ARRIVED", "นัด");
    eq(await obCount("queue.ticket.called", fx.J1), 1, "event");
    okJob(await LN.call()(cL, fx.J1, { now: nJ(601) }), "เรียกซ้ำ");
    t = await tkRow(state.J1t);
    eq([t.status, t.callCount], ["CALLED", 2], "บัตรหลังเรียกซ้ำ");
    eq(await obCount("queue.ticket.called", fx.J1), 2, "event เรียกซ้ำ");
  });
  await st("J-2", "startJob ⇒ IN_SERVICE startedAt=10:02 · บัตร SERVING servedAt · booking.started 1", async () => {
    needJ();
    okJob(await LN.start()(cL, fx.J1, { now: nJ(602) }), "เริ่ม");
    const a = await apRow(fx.J1);
    eq(a.status, "IN_SERVICE", "สถานะ"); eqAt(a.startedAt, D.J, 602, "startedAt");
    const t = await tkRow(state.J1t);
    eq([t.status, t.servedAt !== null], ["SERVING", true], "บัตร");
    eq(await obCount("booking.started", fx.J1), 1, "event");
  });
  await st("J-3", "completeJob ⇒ DONE doneAt · บัตร DONE · booking.completed 1 + queue.ticket.done 1 · ไม่มี queue.served ของบัตรนี้", async () => {
    needJ();
    okJob(await LN.complete()(cL, fx.J1, { now: nJ(660) }), "เสร็จ");
    const a = await apRow(fx.J1);
    eq(a.status, "DONE", "สถานะ"); eqAt(a.doneAt, D.J, 660, "doneAt");
    const t = await tkRow(state.J1t);
    eq([t.status, t.doneAt !== null], ["DONE", true], "บัตร");
    eq([await obCount("booking.completed", fx.J1), await obCount("queue.ticket.done", fx.J1)], [1, 1], "event");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE type = 'queue.served' AND payload->>'ticketId' = $1`, [state.J1t]))[0].n, 0, "queue.served");
  });
  await st("J-4", "BAD_STATE: เสร็จงานที่ยังไม่เริ่ม · เริ่มนัดที่ยังไม่เช็กอิน · เริ่มงานที่ DONE · เรียกนัดที่ไม่มีบัตร — แถวไม่เปลี่ยน", async () => {
    needJ();
    failCode(await LN.complete()(cL, fx.J2, { now: nJ(700) }), "BAD_STATE", "เสร็จ ARRIVED");
    failCode(await LN.start()(cL, fx.J3, { now: nJ(700) }), "BAD_STATE", "เริ่ม CONFIRMED");
    failCode(await LN.start()(cL, fx.J1, { now: nJ(700) }), "BAD_STATE", "เริ่ม DONE");
    failCode(await LN.call()(cL, fx.J3, { now: nJ(700) }), "BAD_STATE", "เรียก CONFIRMED");
    eq([(await apRow(fx.J2)).status, (await apRow(fx.J3)).status, (await apRow(fx.J1)).status], ["ARRIVED", "CONFIRMED", "DONE"], "สถานะ");
  });
  await st("J-5", "ทางเดิม setAppointmentStatus: ARRIVED → CANCELLED ⇒ บัตร CANCELLED · ARRIVED → NO_SHOW ⇒ บัตร NO_SHOW (บัตรเดินตามงาน)", async () => {
    needJ();
    const r1 = await BK().setAppointmentStatus(ids.tA, ids.uL, fx.J2, "CANCELLED");
    ok(r1.ok, `CANCELLED ${fmt(r1)}`);
    eq((await tkRow(state.J2t)).status, "CANCELLED", "บัตร J2");
    const r2 = await BK().setAppointmentStatus(ids.tA, ids.uL, fx.J4, "NO_SHOW");
    ok(r2.ok, `NO_SHOW ${fmt(r2)}`);
    eq((await tkRow(state.J4t)).status, "NO_SHOW", "บัตร J4");
  });
  await st("J-6", "cancelByShop ARRIVED ⇒ CANCELLED cancelReason SHOP · บัตร CANCELLED · booking.cancelled 1 · ซ้ำ ⇒ BAD_STATE (event ยัง 1) · DONE ⇒ BAD_STATE", async () => {
    needJ();
    okJob(await LN.cancel()(cL, fx.J5, { now: nJ(836) }), "ยกเลิก");
    const a = await apRow(fx.J5);
    eq([a.status, a.cancelReason], ["CANCELLED", "SHOP"], "แถว");
    eq((await tkRow(state.J5t)).status, "CANCELLED", "บัตร");
    failCode(await LN.cancel()(cL, fx.J5, { now: nJ(837) }), "BAD_STATE", "ยกเลิกซ้ำ");
    eq(await obCount("booking.cancelled", fx.J5), 1, "event");
    failCode(await LN.cancel()(cL, fx.J1, { now: nJ(837) }), "BAD_STATE", "ยกเลิก DONE");
  });
  await st("J-7", "rescheduleByShop: 15:00→16:00 ⇒ ย้ายช่วง · snapshot ไม่เปลี่ยน · rescheduleCount ไม่นับ · booking.rescheduled 1 · ทับนัดอื่น ⇒ FULL · อดีต ⇒ PAST · DONE ⇒ BAD_STATE · วันที่ผิด ⇒ BAD_INPUT · LATE ⇒ CONFIRMED lateAt null", async () => {
    needJ();
    const before = await apRow(fx.J6);
    okJob(await LN.resched()(cL, fx.J6, { dateStr: D.J, startMin: 960 }, { now: nJ(720) }), "เลื่อน");
    const a = await apRow(fx.J6);
    eqAt(a.startAt, D.J, 960, "startAt"); eqAt(a.endAt, D.J, 1020, "endAt");
    eq([a.staffId, a.status, a.rescheduleCount], [ids.a1, "CONFIRMED", 0], "แถว");
    eq(a.policySnapshot, before.policySnapshot, "policySnapshot");
    eq(await obCount("booking.rescheduled", fx.J6), 1, "event");
    failCode(await LN.resched()(cL, fx.J6, { dateStr: D.J, startMin: 900, staffId: ids.a2 }, { now: nJ(720) }), "FULL", "ทับ J7");
    failCode(await LN.resched()(cL, fx.J6, { dateStr: D.J, startMin: 600 }, { now: nJ(720) }), "PAST", "อดีต");
    failCode(await LN.resched()(cL, fx.J1, { dateStr: D.J, startMin: 1140 }, { now: nJ(720) }), "BAD_STATE", "DONE");
    failCode(await LN.resched()(cL, fx.J6, { dateStr: "2031-02-30", startMin: 600 }, { now: nJ(720) }), "BAD_INPUT", "วันที่ผิด");
    eqAt((await apRow(fx.J6)).startAt, D.J, 960, "J6 ไม่ขยับเมื่อล้ม");
    okJob(await LN.resched()(cL, fx.J8, { dateStr: D.J, startMin: 1080 }, { now: nJ(720) }), "เลื่อน LATE");
    const l = await apRow(fx.J8);
    eq([l.status, l.lateAt], ["CONFIRMED", null], "LATE หลังเลื่อน");
    eqAt(l.startAt, D.J, 1080, "J8 startAt");
  });
  await st("J-8", "X1: ctx ร้าน B เรียก/เริ่ม/เสร็จ/ยกเลิก/เลื่อน นัดร้าน A ⇒ NOT_FOUND ทุกตัว · แถวไม่เปลี่ยน", async () => {
    needJ();
    failCode(await LN.call()(cB, fx.J3, { now: nJ(700) }), "NOT_FOUND", "call");
    failCode(await LN.start()(cB, fx.J3, { now: nJ(700) }), "NOT_FOUND", "start");
    failCode(await LN.complete()(cB, fx.J3, { now: nJ(700) }), "NOT_FOUND", "complete");
    failCode(await LN.cancel()(cB, fx.J3, { now: nJ(700) }), "NOT_FOUND", "cancel");
    failCode(await LN.resched()(cB, fx.J3, { dateStr: D.J, startMin: 1140 }, { now: nJ(700) }), "NOT_FOUND", "resched");
    const a = await apRow(fx.J3);
    eq(a.status, "CONFIRMED", "สถานะ"); eqAt(a.startAt, D.J, 720, "startAt");
  });

  // ═══════════════ L ตัวจัดคิว (เข้ม) ═══════════════
  console.log("\n── L: สาย/ไม่มา + ตัวห่อ planDay (ใบสั่ง §3.3 · เข้ม) ──");
  const nL = (min: number) => at(D.L1, min);
  let lWalk = false;
  await st("L-1", `walk-in 09:55 ขณะมีนัด 10:00 (ช่างคนเดียว) ⇒ วางหลังนัด ${hhmm(EXP.walkInAt0955)} · A001 · etaAt ตรง · นัดได้ plannedStartAt 10:00`, async () => {
    needFx();
    const r = okWI(await LN.walkIn()(cL1, { serviceId: ids.L60, staffId: null, channel: "KIOSK" }, { now: nL(595) }), "walk-in");
    state.LW = r.appointmentId; state.LWt = r.ticketId;
    eq([r.ticketNumber, r.staffId], ["A001", ids.s1], "ผล");
    eq(tms(r.plannedStartAt), bkkMs(D.L1, EXP.walkInAt0955), "plannedStartAt");
    const w = await apRow(r.appointmentId);
    eqAt(w.startAt, D.L1, EXP.walkInAt0955, "walk-in startAt");
    eqAt((await tkRow(r.ticketId)).etaAt, D.L1, EXP.walkInAt0955, "etaAt");
    const a = await apRow(fx.AP);
    eq(a.plannedStaffId, ids.s1, "นัด plannedStaffId"); eqAt(a.plannedStartAt, D.L1, 600, "นัด plannedStartAt");
    lWalk = true;
  });
  const needLW = () => { needFx(); ok(lWalk, "ไม่มี walk-in ของฉาก L (L-1)"); };
  await st("L-2", `tick 10:09 (ผ่อนผันยังไม่ครบ) ⇒ นัดยัง CONFIRMED · lateAt null · ไม่มี booking.late · walk-in ถูกวางใหม่ ${hhmm(EXP.walkInAt1009)} (tick รันตัววางคิว)`, async () => {
    needLW();
    await tick(D.L1, 609, [ids.tL]);
    const a = await apRow(fx.AP);
    eq([a.status, a.lateAt], ["CONFIRMED", null], "นัด");
    eq(await obCount("booking.late", fx.AP), 0, "event");
    eqAt((await apRow(state.LW)).plannedStartAt, D.L1, EXP.walkInAt1009, "walk-in");
  });
  await st("L-3", `สาย 10 ⇒ LATE: tick 10:10 ⇒ LATE lateAt 10:10 · booking.late 1 · นัดไม่มีแผน (ปล่อยช่อง) · walk-in ได้ช่อง ${hhmm(EXP.walkInAt1010)} ช่างเดิม · แถว startAt/endAt + etaAt ตาม`, async () => {
    needLW();
    await tick(D.L1, 610, [ids.tL]);
    const a = await apRow(fx.AP);
    eq([a.status, a.plannedStartAt], ["LATE", null], "นัด");
    eqAt(a.lateAt, D.L1, 610, "lateAt");
    eq(await obCount("booking.late", fx.AP), 1, "event");
    const w = await apRow(state.LW);
    eq([w.status, w.plannedStaffId, w.staffId], ["QUEUED", ids.s1, ids.s1], "walk-in");
    eqAt(w.plannedStartAt, D.L1, EXP.walkInAt1010, "walk-in plannedStartAt");
    eqAt(w.startAt, D.L1, EXP.walkInAt1010, "walk-in startAt"); eqAt(w.endAt, D.L1, EXP.walkInAt1010 + 60, "walk-in endAt");
    eqAt((await tkRow(state.LWt)).etaAt, D.L1, EXP.walkInAt1010, "etaAt");
  });
  await st("L-4", `มาภายใน 30 ⇒ เข้าแถวแบบ walk-in: walk-in เริ่ม 10:12 · ลูกค้านัดเช็กอินด้วยเบอร์ 10:20 ⇒ ok asWalkIn:true P001 · ARRIVED (lateAt คงเดิม) · วางหลัง walk-in ${hhmm(EXP.lateArrivalAt1020)} · etaAt บัตร P ตาม`, async () => {
    needLW();
    okJob(await LN.start()(cL1, state.LW, { now: nL(612) }), "walk-in เริ่ม");
    const r = okCI(await LN.checkIn()(cL1, { phone: "086-123-0001" }, { via: "PHONE", now: nL(620) }), "เช็กอินสาย");
    eq([r.appointmentId, r.asWalkIn, r.already, r.ticketNumber], [fx.AP, true, false, "P001"], "ผล");
    const a = await apRow(fx.AP);
    eq([a.status, a.plannedStaffId], ["ARRIVED", ids.s1], "นัด");
    eqAt(a.lateAt, D.L1, 610, "lateAt คงเดิม"); eqAt(a.checkedInAt, D.L1, 620, "checkedInAt");
    eqAt(a.plannedStartAt, D.L1, EXP.lateArrivalAt1020, "plannedStartAt");
    eqAt((await tkRow(r.ticketId)).etaAt, D.L1, EXP.lateArrivalAt1020, "etaAt P");
    eq([await obCount("booking.checked_in", fx.AP), await obCount("booking.started", state.LW)], [1, 1], "event");
  });
  await st("L-5", "30 ⇒ NO_SHOW ครั้งเดียว: นัด 13:00 · tick 13:29 ⇒ LATE (ยังไม่ NO_SHOW) · 13:30 ⇒ NO_SHOW · 13:31 ซ้ำ ⇒ ไม่นับซ้ำ · booking.no_show 1 · booking.late 1 · เช็กอินหลัง NO_SHOW ⇒ BAD_STATE", async () => {
    needFx();
    await tick(D.L1, 809, [ids.tL]);
    eq((await apRow(fx.AP2)).status, "LATE", "13:29");
    const t1 = await tick(D.L1, 810, [ids.tL]);
    eq((await apRow(fx.AP2)).status, "NO_SHOW", "13:30");
    ok(t1.noShow >= 1, `13:30 noShow ${t1.noShow}`);
    await tick(D.L1, 811, [ids.tL]);
    eq([await obCount("booking.no_show", fx.AP2), await obCount("booking.late", fx.AP2)], [1, 1], "event");
    failCode(await LN.checkIn()(cL1, { appointmentId: fx.AP2 }, { via: "STAFF", now: nL(811) }), "BAD_STATE", "เช็กอินหลังไม่มา");
    eq((await ticketsOf(fx.AP2)).length, 0, "ไม่มีบัตร");
  });
  await st("L-6", "snapshot ชนะค่าตั้งใหม่ 2 ทิศ: นัด A1 (10/30) แล้วสาขาแก้เป็น 20/60 ⇒ 10:10 LATE · 10:30 NO_SHOW · นัด A2 จองตอน 20/60 แล้วแก้เป็น 5/15 ⇒ 11:10 ยัง CONFIRMED · 11:20 LATE · 11:59 ยัง LATE · 12:00 NO_SHOW", async () => {
    needFx();
    await setS(ids.tL, [{ key: "booking.late.graceMin", scope: "UNIT", scopeId: ids.uSnap, value: 20 }, { key: "booking.late.noShowAfterMin", scope: "UNIT", scopeId: ids.uSnap, value: 60 }]);
    const a2 = await bookStaff(cSnap, ids.P60, ids.p1, D.Snap, 660);
    eq([(await apRow(a2)).policySnapshot?.values?.["booking.late.graceMin"], (await apRow(a2)).policySnapshot?.values?.["booking.late.noShowAfterMin"]], [20, 60], "snapshot A2");
    await setS(ids.tL, [{ key: "booking.late.graceMin", scope: "UNIT", scopeId: ids.uSnap, value: 5 }, { key: "booking.late.noShowAfterMin", scope: "UNIT", scopeId: ids.uSnap, value: 15 }]);
    const seq: [number, string, string][] = [[610, fx.A1, "LATE"], [630, fx.A1, "NO_SHOW"], [670, a2, "CONFIRMED"], [680, a2, "LATE"], [719, a2, "LATE"], [720, a2, "NO_SHOW"]];
    for (const [m, id, want] of seq) {
      await tick(D.Snap, m, [ids.tL]);
      eq((await apRow(id)).status, want, `${id === fx.A1 ? "A1" : "A2"} @${hhmm(m)}`);
    }
  });
  await st("L-7", `HOLD (snapshot หลังผ่อนผัน = รอต่อ): tick 10:10 ⇒ LATE แต่ช่องไม่ถูกปล่อย — walk-in วาง ${hhmm(EXP.holdWalkInAt1010)} ไม่ใช่ 10:10 · เช็กอิน 10:20 ⇒ asWalkIn:false`, async () => {
    needFx();
    const w = okWI(await LN.walkIn()(cHold, { serviceId: ids.H60, staffId: null, channel: "KIOSK" }, { now: at(D.Hold, 595) }), "walk-in");
    await tick(D.Hold, 610, [ids.tL]);
    eq((await apRow(fx.H)).status, "LATE", "นัด");
    eqAt((await apRow(w.appointmentId)).plannedStartAt, D.Hold, EXP.holdWalkInAt1010, "walk-in");
    const r = okCI(await LN.checkIn()(cHold, { appointmentId: fx.H }, { via: "STAFF", now: at(D.Hold, 620) }), "เช็กอิน");
    eq(r.asWalkIn, false, "asWalkIn");
  });
  await st("L-8", "ร้านเดิม (_fallback · ไม่เปิดแถวเดียว): tick 12:00 ⇒ นัดยัง CONFIRMED · ไม่มี lateAt/แผน/event · runPlanner ⇒ ran:false · walk-in ⇒ NOT_SINGLE_LINE", async () => {
    needFx();
    await tick(D.Leg, 720, [ids.tL]);
    const e = await apRow(fx.E);
    eq([e.status, e.lateAt, e.plannedStartAt, e.plannedStaffId], ["CONFIRMED", null, null, null], "นัดร้านเดิม");
    eq([await obCount("booking.late", fx.E), await obCount("booking.no_show", fx.E)], [0, 0], "event");
    eq((await RN.plan()(cLeg, { now: at(D.Leg, 720) })).ran, false, "runPlanner");
    failCode(await LN.walkIn()(cLeg, { serviceId: ids.E60, staffId: null, channel: "KIOSK" }, { now: at(D.Leg, 720) }), "NOT_SINGLE_LINE", "walk-in");
  });
  await st("L-9", "แถวไม่มี snapshot (รุ่นแรก) บนสาขาแถวเดียว ⇒ ใช้ค่าปัจจุบัน: 10:10 LATE · 10:30 NO_SHOW", async () => {
    needFx();
    await tick(D.Null, 610, [ids.tL]);
    eq((await apRow(fx.NUL)).status, "LATE", "10:10");
    await tick(D.Null, 630, [ids.tL]);
    eq((await apRow(fx.NUL)).status, "NO_SHOW", "10:30");
  }, "MAJOR");
  await st("L-10", "สิ้นวัน: walk-in QUEUED ค้างจากเมื่อวาน ⇒ tick วันถัดไป CANCELLED END_OF_DAY + บัตร CANCELLED END_OF_DAY · นัดที่เช็กอินแล้ว (ARRIVED) ไม่ถูกแตะ", async () => {
    needFx();
    const ci = okCI(await LN.checkIn()(cEod, { appointmentId: fx.EB }, { via: "STAFF", now: at(D.Eod, 1070) }), "เช็กอิน 17:50");
    const w = okWI(await LN.walkIn()(cEod, { serviceId: ids.O60, staffId: null, channel: "KIOSK" }, { now: at(D.Eod, 1075) }), "walk-in 17:55");
    eq((await apRow(w.appointmentId)).status, "QUEUED", "walk-in ก่อน");
    const r = await tick(D.Eod2, 540, [ids.tL]);
    const a = await apRow(w.appointmentId);
    eq([a.status, a.cancelReason], ["CANCELLED", "END_OF_DAY"], "walk-in");
    const t = await tkRow(w.ticketId);
    eq([t.status, t.cancelReason], ["CANCELLED", "END_OF_DAY"], "บัตร A");
    ok(r.endOfDay >= 1, `endOfDay ${r.endOfDay}`);
    eq((await apRow(fx.EB)).status, "ARRIVED", "นัดที่มาแล้ว");
    eq((await tkRow(ci.ticketId)).status, "WAITING", "บัตร P");
  }, "MAJOR");
  await st("L-11", "X1 ของ tick: นัดร้าน B ครบไม่มา — tick(tenantIds=[ร้าน L]) ⇒ ไม่แตะ · tick([ร้าน B]) ⇒ NO_SHOW", async () => {
    needFx();
    await tick(D.B, 640, [ids.tL]);
    eq((await apRow(fx.BX)).status, "CONFIRMED", "ขอบเขตร้าน L");
    await tick(D.B, 640, [ids.tB]);
    eq((await apRow(fx.BX)).status, "NO_SHOW", "ขอบเขตร้าน B");
  });
  await st("L-12", "PENDING ไม่ถูก tick แตะ (เลยเวลาไม่มาแล้วก็ยัง PENDING)", async () => {
    needFx();
    await tick(D.L1, 940, [ids.tL]);
    eq((await apRow(fx.AP3)).status, "PENDING", "AP3");
  }, "MAJOR");

  // ORACLE-EDIT 29 ต.ค. (review) J4
  await st("L-13", "ร้านถอยคำตัดสินของ tick (manualHold): NO_SHOW (ริบมัดจำ 1 บิล PAID) → ร้านตั้ง CONFIRMED (บิลริบ VOID) ⇒ policySnapshot.job.manualHold · tick 10:31/10:45 ⇒ ยัง CONFIRMED · บิลริบรวม 1 ใบ ไม่มี PAID · booking.no_show 1 · เช็กอิน 10:50 ⇒ ok (ไม่ TOO_LATE) · LATE → CONFIRMED ⇒ tick ไม่ตั้ง LATE ซ้ำ", async () => {
    needT1();
    const id = await bookStaff(cL13, ids.N13S, ids.n13, D.L13, 600);
    const rd = await BK().recordDeposit(cL13, id);
    ok(rd.ok, `ตัวควบคุม: รับมัดจำ ${fmt(rd)}`);
    const bills = async () => q<{ status: string }>(`SELECT status::text AS status FROM "PosSale" WHERE "tenantId" = $1 AND "sourceModule" = 'BOOKING' AND "sourceId" = $2`, [ids.tL, id]);
    await tick(D.L13, 630, [ids.tL]);
    eq((await apRow(id)).status, "NO_SHOW", "ตัวควบคุม: tick 10:30");
    eq((await bills()).filter((b) => b.status === "PAID").length, 1, "ตัวควบคุม: ริบมัดจำครั้งแรก (บิลริบ PAID)");
    const rv = await BK().setAppointmentStatus(ids.tL, ids.uL13, id, "CONFIRMED");
    ok(rv.ok, `ร้านถอย NO_SHOW ${fmt(rv)}`);
    eq((await apRow(id)).policySnapshot?.job?.manualHold, true, "manualHold");
    await tick(D.L13, 631, [ids.tL]);
    await tick(D.L13, 645, [ids.tL]);
    eq((await apRow(id)).status, "CONFIRMED", "หลัง tick 2 รอบ");
    const b = await bills();
    eq([b.length, b.filter((x) => x.status === "PAID").length], [1, 0], "บิลริบ (รวม · PAID)");
    eq(await obCount("booking.no_show", id), 1, "event");
    const c = okCI(await LN.checkIn()(cL13, { appointmentId: id }, { via: "STAFF", now: at(D.L13, 650) }), "เช็กอินหลังถอย");
    eq(c.already, false, "already");
    const id2 = await bookStaff(cL13, ids.N13S, ids.n13, D.L13, 780);
    await tick(D.L13, 790, [ids.tL]);
    eq((await apRow(id2)).status, "LATE", "ตัวควบคุม: LATE");
    const rv2 = await BK().setAppointmentStatus(ids.tL, ids.uL13, id2, "CONFIRMED");
    ok(rv2.ok, `ร้านถอย LATE ${fmt(rv2)}`);
    await tick(D.L13, 792, [ids.tL]);
    eq((await apRow(id2)).status, "CONFIRMED", "LATE ไม่ถูกตั้งซ้ำ");
  });
  // ORACLE-EDIT 29 ต.ค. (review) J5
  await st("L-14", "ช่องที่ถือจริงของงานที่แผนย้ายเวลา: นัด 10:00 สาย (LATE) · walk-in เข้าช่อง 10:12 แล้วเริ่ม · ลูกค้านัดมา 10:20 ⇒ แผน 11:12 ⇒ จอง STAFF 11:15 ⇒ FULL · walk-in เสร็จ 11:25 · เริ่มนัด 11:30 ⇒ จอง 12:15 ⇒ FULL · ตัวควบคุม: จอง 12:30 ⇒ ok", async () => {
    needFx();
    const id = await bookStaff(cL14, ids.M14S, ids.m14, D.L14, 600);
    await tick(D.L14, 610, [ids.tL]);
    eq((await apRow(id)).status, "LATE", "ตัวควบคุม: LATE");
    const w = okWI(await LN.walkIn()(cL14, { serviceId: ids.M14S, staffId: null, channel: "KIOSK" }, { now: at(D.L14, 612) }), "walk-in");
    okJob(await LN.start()(cL14, w.appointmentId, { now: at(D.L14, 612) }), "เริ่ม walk-in");
    const c = okCI(await LN.checkIn()(cL14, { appointmentId: id }, { via: "STAFF", now: at(D.L14, 620) }), "เช็กอินสาย");
    eq(c.asWalkIn, true, "asWalkIn");
    eqAt((await apRow(id)).plannedStartAt, D.L14, 672, "ตัวควบคุม: แผน 11:12");
    eq(await bookFull(cL14, ids.M14S, ids.m14, D.L14, 675), "FULL", "จองทับช่วงที่แผนให้ลูกค้ามาสาย (11:15)");
    okJob(await LN.complete()(cL14, w.appointmentId, { now: at(D.L14, 685) }), "walk-in เสร็จ");
    okJob(await LN.start()(cL14, id, { now: at(D.L14, 690) }), "เริ่มนัด 11:30");
    eq(await bookFull(cL14, ids.M14S, ids.m14, D.L14, 735), "FULL", "จองทับงานที่เริ่มสาย (12:15)");
    eq(await bookFull(cL14, ids.M14S, ids.m14, D.L14, 750), "OK", "ตัวควบคุม: 12:30 ว่าง");
  });

  // ═══════════════ D หนี้ B.3 ═══════════════
  console.log("\n── D: buffer ของนัดเดิมจาก snapshot (หนี้ B.3 → ใบสั่ง §3.4) ──");
  await st("D-1", "นัด 10:00 (30 + buffer 15 · ช่างพัก 10) ⇒ ONLINE เห็น 10:45 (ตัวควบคุม) · แก้ buffer บริการเป็น 0 ⇒ ยังเห็น 10:45 (ใช้ buffer ตอนจองจาก snapshot · ค่าปัจจุบันจะดัน 10:55)", async () => {
    needFx();
    const id = await bookStaff(cD, ids.D30, ids.d1, D.Dd, 600);
    const s0 = (await BK().findSlots(cD, { serviceId: ids.D30, staffId: ids.d1, dateStr: D.Dd, channel: "ONLINE" })).map((s) => s.startMin);
    ok(s0.includes(645), `ตัวควบคุม: ก่อนแก้ต้องเห็น 10:45 ${fmt(s0.slice(0, 6))}`);
    eq((await apRow(id)).policySnapshot?.job, { durationMin: 30, bufferMin: 15 }, "policySnapshot.job");
    await q(`UPDATE "BookingService" SET "bufferMin" = 0 WHERE id = $1`, [ids.D30]);
    const s1 = (await BK().findSlots(cD, { serviceId: ids.D30, staffId: ids.d1, dateStr: D.Dd, channel: "ONLINE" })).map((s) => s.startMin);
    await q(`UPDATE "BookingService" SET "bufferMin" = 15 WHERE id = $1`, [ids.D30]);
    ok(s1.includes(645), `หลังแก้ buffer ช่อง 10:45 หาย (ใช้ค่าปัจจุบัน) ${fmt(s1.slice(0, 6))}`);
  }, "MAJOR");

  // ═══════════════ Q คิวบนหน่วย BOOKING + หน่วย QUEUE เดิม ═══════════════
  console.log("\n── Q: คิวบนหน่วย BOOKING (CC §6.1) + หน่วย QUEUE เดิม (ใบสั่ง §3.5) ──");
  await st("Q-1", "resolveQueueUnit: หน่วย BOOKING แถวเดียว ⇒ ได้หน่วย · BOOKING ร้านเดิม ⇒ null", async () => {
    needTpl();
    eq((await QU().resolveQueueUnit(SLUGS[ids.tA], SLUGS[ids.uL]))?.unit.id ?? null, ids.uL, "BOOKING แถวเดียว");
    eq(await QU().resolveQueueUnit(SLUGS[ids.tA], SLUGS[ids.uLegA]), null, "BOOKING ร้านเดิม");
  }, "MAJOR");
  const issueQ = async () => { const r = await QU().issueTicket({ tenantId: ids.tA, unitId: ids.uQ, typeId: ids.qType, channel: "STAFF", actorType: "STAFF" }); if (!r.ok) throw new AssertFail(`issueTicket ${r.code}`); return r.ticket.id; };
  const tkStatus = async (id: string) => (await tkRow(id)).status;
  const yesterday = addDays(TODAY, -1);
  await st("Q-2a", "ตัวควบคุม (พฤติกรรมเดิม · ไม่ส่ง now): resetDaily ⇒ บัตรวันก่อน CANCELLED · expireSkipped ⇒ SKIPPED เกิน 60 นาที NO_SHOW · บัตรวันนี้ไม่ถูกแตะ", async () => {
    need();
    const [t1, t2, t3] = [await issueQ(), await issueQ(), await issueQ()];
    await q(`UPDATE "QueueTicket" SET "businessDate" = $2 WHERE id = $1`, [t1, yesterday]);
    await q(`UPDATE "QueueTicket" SET status = 'SKIPPED', "skippedAt" = now() - interval '70 minutes' WHERE id = $1`, [t2]);
    await QU().resetDaily(cQ);
    await QU().expireSkipped(cQ);
    eq([await tkStatus(t1), await tkStatus(t2), await tkStatus(t3)], ["CANCELLED", "NO_SHOW", "WAITING"], "สถานะ");
    state.q3 = t3;
  }, "MAJOR");
  await st("Q-2b", "now ฉีดได้: resetDaily(ctx, พรุ่งนี้) ⇒ บัตรวันนี้ CANCELLED · expireSkipped(ctx, +2 ชม.) ⇒ SKIPPED 10 นาทีที่แล้ว NO_SHOW", async () => {
    need();
    const [t4, t5] = [await issueQ(), await issueQ()];
    await q(`UPDATE "QueueTicket" SET status = 'SKIPPED', "skippedAt" = now() - interval '10 minutes' WHERE id = $1`, [t5]);
    // ORACLE-EDIT 29 ต.ค.: expireSkipped ก่อน resetDaily — resetDaily เดิมยกเลิก SKIPPED ของวันอื่นด้วย (Q-2a) ⇒ ลำดับเดิมทำให้ t5 ถูก CANCELLED ก่อนได้ NO_SHOW
    await QU().expireSkipped(cQ, new Date(Date.now() + 2 * 3_600_000));
    await QU().resetDaily(cQ, new Date(Date.now() + 86_400_000));
    eq([await tkStatus(t4), await tkStatus(t5)], ["CANCELLED", "NO_SHOW"], "สถานะ");
  });
  await st("Q-3", "runQueueHousekeeping(พรุ่งนี้): tenantIds=[ร้าน B] ⇒ บัตรร้าน A ไม่ถูกแตะ · [ร้าน A] ⇒ บัตรหน่วย QUEUE CANCELLED แต่บัตร P/A ของจองคิว (refType APPOINTMENT · วันอื่น) ไม่ถูกแตะ", async () => {
    needFx();
    const hk = fnOf<NonNullable<QueueApi["runQueueHousekeeping"]>>(queueLoad, "runQueueHousekeeping", QUEUE_REL);
    const t6 = await issueQ();
    const line = await q<{ id: string; status: string }>(`SELECT id, status::text AS status FROM "QueueTicket" WHERE "tenantId" = $1 AND "refType" = 'APPOINTMENT' ORDER BY id`, [ids.tA]);
    ok(line.length > 0, "ยังไม่มีบัตรของจองคิว (หมวด K/W/J ล้ม)");
    const tomorrow = new Date(Date.now() + 86_400_000);
    await hk(tomorrow, { tenantIds: [ids.tB] });
    eq(await tkStatus(t6), "WAITING", "ขอบเขตร้าน B");
    await hk(tomorrow, { tenantIds: [ids.tA] });
    eq(await tkStatus(t6), "CANCELLED", "หน่วย QUEUE");
    eq(await q<{ id: string; status: string }>(`SELECT id, status::text AS status FROM "QueueTicket" WHERE "tenantId" = $1 AND "refType" = 'APPOINTMENT' ORDER BY id`, [ids.tA]), line, "บัตรของจองคิว");
  });
  await st("Q-4", "getTicketStatus บัตร P ที่มี etaAt ⇒ estimateMin = ceil((etaAt − ตอนนี้)/1 นาที) (±1) — ETA จากตัววางคิว ไม่ใช่สูตรหยาบ", async () => {
    needFx();
    ok(!!state.K1t, "ไม่มีบัตรของ K-1");
    const t = await tkRow(state.K1t);
    ok(t.etaAt !== null, "บัตร P ไม่มี etaAt");
    const r = await QU().getTicketStatus(ids.uL, t.publicToken);
    ok(!!r, "getTicketStatus คืน null");
    const want = Math.max(0, Math.ceil((new Date(t.etaAt!).getTime() - Date.now()) / 60_000));
    ok(r!.estimateMin !== null && Math.abs(r!.estimateMin - want) <= 1, `estimateMin ${r!.estimateMin} ต้อง ≈ ${want}`);
  }, "MAJOR");
  await st("Q-4b", "ตัวควบคุม: บัตรหน่วย QUEUE (ไม่มี etaAt) ⇒ สูตรเดิม ceil((ข้างหน้า+1)/เคาน์เตอร์เปิด × avg)", async () => {
    need();
    ok(!!state.q3, "ไม่มีบัตร Q-2a");
    const t = await tkRow(state.q3);
    if (t.status !== "WAITING") await q(`UPDATE "QueueTicket" SET status = 'WAITING', "cancelledAt" = NULL, "cancelReason" = NULL WHERE id = $1`, [state.q3]);
    const r = await QU().getTicketStatus(ids.uQ, t.publicToken);
    const [{ ahead }] = await q<{ ahead: number }>(`SELECT count(*)::int AS ahead FROM "QueueTicket" x, "QueueTicket" me WHERE me.id = $1 AND x."unitId" = me."unitId" AND x."businessDate" = me."businessDate" AND x.status = 'WAITING'
      AND (x.priority > me.priority OR (x.priority = me.priority AND x."createdAt" < me."createdAt"))`, [state.q3]);
    eq(r?.estimateMin, Math.ceil(((ahead + 1) / 1) * 10), "estimateMin");
  }, "MAJOR");

  // ORACLE-EDIT 29 ต.ค. (review) J6
  await st("Q-5", "สร้าง/ใช้ประเภทบัตรระบบไม่ได้ (prefix A ชนประเภทเดิม · ประเภท APPOINTMENT ถูกซ่อน) ⇒ createWalkIn / checkIn คืน ok:false + เหตุผลไทย (ไม่ throw) · ไม่มีแถว/บัตรเกิด · นัดยัง CONFIRMED", async () => {
    needFx();
    await insertRow("QueueType", { id: rid("qt"), tenantId: ids.tA, unitId: ids.uQ5, code: "GEN", name: "ทั่วไปเดิม", prefix: "A", updatedAt: new Date() });
    await insertRow("QueueType", { id: rid("qt"), tenantId: ids.tA, unitId: ids.uQ5, code: "APPOINTMENT", name: "นัด (ซ่อน)", prefix: "P", isSystem: true, status: "HIDDEN", updatedAt: new Date() });
    const id = await bookStaff(cQ5, ids.Q5S, ids.q5, D.Q5, 600);
    const cnt = async () => (await q<{ n: number }>(`SELECT (SELECT count(*) FROM "Appointment" WHERE "unitId" = $1)::int + (SELECT count(*) FROM "QueueTicket" WHERE "unitId" = $1)::int AS n`, [ids.uQ5]))[0].n;
    const before = await cnt();
    const walk = LN.walkIn();
    const ci0 = LN.checkIn();
    let w: WalkInResult;
    try { w = await walk(cQ5, { serviceId: ids.Q5S, staffId: null, channel: "KIOSK" }, { now: at(D.Q5, 630) }); } catch (e) { throw new AssertFail(`createWalkIn throw: ${errMsg(e)}`); }
    ok(!w.ok && typeof w.reason === "string" && w.reason.length > 0, `createWalkIn ${fmt(w)}`);
    let c: CheckInResult;
    try { c = await ci0(cQ5, { appointmentId: id }, { via: "STAFF", now: at(D.Q5, 595) }); } catch (e) { throw new AssertFail(`checkIn throw: ${errMsg(e)}`); }
    ok(!c.ok && typeof c.reason === "string" && c.reason.length > 0, `checkIn ${fmt(c)}`);
    eq(Number(await cnt()), Number(before), "แถว+บัตร");
    eq((await apRow(id)).status, "CONFIRMED", "นัด");
  }, "MAJOR");

  // ═══════════════ X ยิงพร้อมกันข้ามโพรเซส ═══════════════
  console.log("\n── X: ยิงพร้อมกัน 5 โพรเซส ──");
  const NCHILD = 5;
  let tokXA = "";
  try { tokXA = (await LN.token()(cRace, fx.XA)) ?? ""; } catch { /* ยังไม่มีงาน */ }
  const nowIso = (ds: string, min: number) => at(ds, min).toISOString();
  const ci = (ctx: Ctx, by: CheckInBy, ds: string, min: number, via: CheckInVia = "STAFF"): CallSpec => ({ fn: "checkIn", ctx, by, via, now: nowIso(ds, min) });
  const wiCall = (staffId: string | null, ds: string, min: number): CallSpec => ({ fn: "walkIn", ctx: cRace, input: { serviceId: ids.R60, staffId, channel: "KIOSK" }, now: nowIso(ds, min) });
  const pairs = <T,>(xs: T[]): T[][] => Array.from({ length: NCHILD }, (_, i) => xs.slice(i * 2, i * 2 + 2));
  const xaBy = (i: number): CheckInBy => (i % 3 === 0 ? { token: tokXA || "missing" } : i % 3 === 1 ? { phone: ["087-111-2222", "+66871112222", "087 111 2222"][Math.floor(i / 3) % 3] } : { appointmentId: fx.XA ?? "" });
  const tickCall = (r: number): CallSpec => ({ fn: "tick", now: nowIso(D.X3, 630), tenantIds: [cT[r].tenantId] });
  const scenarios: Scenario[] = [
    { key: "x0", perChild: pairs(Array.from({ length: 10 }, () => ({ fn: "create", input: { tenantId: ids.tA, unitId: ids.uRace, serviceId: ids.R60, staffId: RACE[0], dateStr: D.X0, startMin: 600, customerName: CUST, customerPhone: newPhone(), source: "STAFF" } }) as CallSpec)) },
    { key: "x1", perChild: pairs(Array.from({ length: 10 }, (_, i) => ci(cRace, xaBy(i), D.X1, 590, i % 3 === 0 ? "QR" : i % 3 === 1 ? "PHONE" : "LINE"))) },
    { key: "x2", perChild: pairs(Array.from({ length: 10 }, () => wiCall(null, D.X2, 600))) },
    ...[0, 1, 2].map((r) => ({ key: `x3${r}`, perChild: [[tickCall(r)], [tickCall(r)], [], [], []] })),
    { key: "x4", perChild: [[{ fn: "tick", now: nowIso(D.X4, 630), tenantIds: [ids.tT4] }], [ci(cX4, { appointmentId: fx.X4_0 ?? "" }, D.X4, 629), ci(cX4, { appointmentId: fx.X4_4 ?? "" }, D.X4, 629)],
      [ci(cX4, { appointmentId: fx.X4_1 ?? "" }, D.X4, 629)], [ci(cX4, { appointmentId: fx.X4_2 ?? "" }, D.X4, 629)], [ci(cX4, { appointmentId: fx.X4_3 ?? "" }, D.X4, 629)]] },
    { key: "x5", perChild: RACE.map((sid) => [wiCall(sid, D.X5, 600), { fn: "book", ctx: cRace, input: bk({ serviceId: ids.R60, staffId: sid, dateStr: D.X5, startMin: 600, channel: "STAFF" }) } as CallSpec]) },
  ];
  let results = new Map<string, CallOut[]>();
  let harnessErr = "";
  if (fxOk) {
    try { results = await runHarness(scenarios, NCHILD); } catch (e) { harnessErr = errMsg(e); }
  } else harnessErr = "สร้างข้อมูล/นัดตั้งต้นไม่สำเร็จ";
  const R = (key: string, n: number): CallOut[] => {
    ok(!harnessErr, `สายยิงพร้อมกันล้ม: ${harnessErr}`);
    const r = results.get(key) ?? [];
    ok(r.length === n, `${key}: ได้ผล ${r.length}/${n} (ลูกโพรเซสตาย/หมดเวลา)`);
    return r;
  };
  const noThrow = (r: CallOut[]) => { const t = r.filter((x) => x.threw); ok(t.length === 0, `throw ${t.length} ครั้ง: ${t[0]?.threw}`); };
  const holdingOverlap = async (staffId: string, ds: string): Promise<string[]> => {
    const rows = await q<{ id: string; s: Date; e: Date }>(`SELECT id, "startAt" AS s, "endAt" AS e FROM "Appointment" WHERE "staffId" = $1 AND "startAt" >= $2 AND "startAt" < $3 AND status NOT IN ('CANCELLED','NO_SHOW') ORDER BY "startAt"`, [staffId, at(ds, 0), at(ds, 1440)]);
    const bad: string[] = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].s.getTime() < rows[i - 1].e.getTime()) bad.push(`${rows[i - 1].id}/${rows[i].id}`);
    return bad;
  };
  await st("X-0", "ตัวควบคุม: createAppointment เดิม 10 ทางข้ามโพรเซส ช่องเดียว ⇒ สำเร็จ 1 (สายยิงพร้อมกันทำงาน)", async () => {
    const r = R("x0", 10);
    eq(r.filter((x) => x.ok).length, 1, `สำเร็จ ${fmt(r.map((x) => x.ok ? "ok" : x.code ?? x.threw))}`);
  });
  await st("X-1", "เช็กอินนัดเดียว 10 ทาง (token/เบอร์/id) ข้ามโพรเซส ⇒ ok ทุกคำขอ · ticketId เดียว · already:false ครั้งเดียว · บัตร 1 · event 1 · ARRIVED", async () => {
    const r = R("x1", 10); noThrow(r);
    ok(r.every((x) => x.ok), `ล้ม ${fmt(r.filter((x) => !x.ok).map((x) => x.code))}`);
    eq(new Set(r.map((x) => x.ticketId)).size, 1, "ticketId");
    eq(r.filter((x) => x.already === false).length, 1, "already:false");
    eq((await ticketsOf(fx.XA)).length, 1, "บัตร");
    eq(await obCount("booking.checked_in", fx.XA), 1, "event");
    eq((await apRow(fx.XA)).status, "ARRIVED", "สถานะ");
  });
  await st("X-2", "walk-in 10 ทางพร้อมกัน (5 ช่าง) ⇒ ok 10 · เลข A001–A010 ไม่ซ้ำ · งาน↔บัตร 1:1 · runPlanner แล้ว 5 ที่ 10:00 + 5 ที่ 11:00 · แถวถือช่องไม่ซ้อนต่อช่าง", async () => {
    const r = R("x2", 10); noThrow(r);
    ok(r.every((x) => x.ok), `ล้ม ${fmt(r.filter((x) => !x.ok).map((x) => x.code))}`);
    eq(r.map((x) => x.ticketNumber).sort(), Array.from({ length: 10 }, (_, i) => `A${String(i + 1).padStart(3, "0")}`), "เลขบัตร");
    for (const x of r) {
      const a = await apRow(x.id!);
      eq([a.kind, a.queueTicketId], ["WALKIN", x.ticketId], `แถว ${x.id}`);
      eq((await tkRow(x.ticketId)).refId, x.id, `บัตร ${x.ticketId}`);
    }
    await RN.plan()(cRace, { now: at(D.X2, 600) });
    const starts = (await q<{ m: number }>(`SELECT (EXTRACT(EPOCH FROM "plannedStartAt") * 1000)::bigint AS m FROM "Appointment" WHERE id = ANY($1::text[])`, [r.map((x) => x.id)])).map((x) => Number(x.m)).sort();
    eq(starts, [...Array(5).fill(bkkMs(D.X2, 600)), ...Array(5).fill(bkkMs(D.X2, 660))], "plannedStartAt");
    for (const sid of RACE) eq(await holdingOverlap(sid, D.X2), [], `ซ้อน ${sid}`);
  });
  for (const r of [0, 1, 2]) {
    await st(`X-3${"abc"[r]}`, `X5 รอบ ${r + 1}: tick ซ้อน 2 โพรเซส (10:30) ⇒ ผลรวม noShow 3 + late 3 = แถวที่เปลี่ยนจริง · booking.no_show/late ต่อแถว 1 · lateAt เดียว`, async () => {
      const out = R(`x3${r}`, 2); noThrow(out);
      ok(out.every((x) => x.ok), "tick ล้ม");
      eq([out.reduce((s, x) => s + (x.noShow ?? 0), 0), out.reduce((s, x) => s + (x.late ?? 0), 0)], [3, 3], `ผลรวม ${fmt(out.map((x) => [x.noShow, x.late]))}`);
      for (let i = 0; i < 6; i++) {
        const id = fx[`T${r}_${i}`];
        const a = await apRow(id);
        if (i < 3) { eq(a.status, "NO_SHOW", `นัด 10:00 #${i}`); eq(await obCount("booking.no_show", id), 1, `no_show #${i}`); }
        else { eq(a.status, "LATE", `นัด 10:20 #${i}`); eq(await obCount("booking.late", id), 1, `late #${i}`); eqAt(a.lateAt, D.X3, 630, `lateAt #${i}`); }
      }
    });
  }
  await st("X-4", "เช็กอิน (10:29) ∥ tick ไม่มา (10:30) ข้ามโพรเซส 5 นัด ⇒ ทุกนัดผลเดียว: (ARRIVED + บัตร WAITING + เช็กอิน ok) หรือ (NO_SHOW + ไม่มีบัตร active + เช็กอินล้ม) · noShow ของ tick = จำนวน NO_SHOW", async () => {
    const out = R("x4", 6); noThrow(out);
    const tk = out.find((x) => x.fn === "tick")!;
    let nNo = 0;
    const bad: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = fx[`X4_${i}`];
      const a = await apRow(id);
      const c = out.find((x) => x.fn === "checkIn" && x.id === id);
      const active = (await ticketsOf(id)).filter((t) => ["WAITING", "CALLED", "SERVING"].includes(t.status));
      if (a.status === "ARRIVED") { if (active.length !== 1 || !c?.ok) bad.push(`#${i} ARRIVED บัตร ${active.length} ok ${c?.ok}`); }
      else if (a.status === "NO_SHOW") { nNo++; if (active.length !== 0) bad.push(`#${i} NO_SHOW มีบัตร active`); }
      else bad.push(`#${i} สถานะ ${a.status}`);
    }
    ok(bad.length === 0, bad.join(" · "));
    eq(out.filter((x) => x.fn === "checkIn" && x.ok).length, 5 - nNo, "เช็กอินสำเร็จ = ARRIVED");
    eq(tk.noShow, nNo, "noShow ของ tick");
    console.log(`     (เช็กอินชนะ ${5 - nNo} · ไม่มาชนะ ${nNo})`);
  });
  await st("X-5", "walk-in ระบุช่าง ∥ จอง STAFF ช่างเดียวกัน 10:00 (5 คู่ข้ามโพรเซส) ⇒ walk-in ok ทุกคู่ · ไม่มีแถวถือช่องซ้อน · จองได้ ⇔ walk-in ไม่ได้ 10:00", async () => {
    const out = R("x5", 10); noThrow(out);
    for (const [i, sid] of RACE.entries()) {
      const w = out.find((x) => x.fn === "walkIn" && x.staffId === sid);
      ok(!!w?.ok, `walk-in ช่าง ${i + 1} ล้ม ${fmt(out.filter((x) => x.fn === "walkIn" && !x.ok).map((x) => x.code))}`);
      eq(await holdingOverlap(sid, D.X5), [], `ซ้อน ช่าง ${i + 1}`);
      const booked = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "staffId" = $1 AND kind = 'BOOKED' AND "startAt" = $2 AND status NOT IN ('CANCELLED','NO_SHOW')`, [sid, at(D.X5, 600)]))[0].n;
      const wStart = tms((await apRow(w!.id!)).startAt);
      eq(booked === 1, wStart !== bkkMs(D.X5, 600), `ช่าง ${i + 1}: จอง ${booked} · walk-in ${wStart}`);
    }
  });

  // ORACLE-EDIT 29 ต.ค. (review) J2
  await st("X-7", "นัด 'ใครก็ได้' ที่ตัววางคิวย้ายช่าง (BOOKED_MOVED_STAFF · ยืนยันด้วย planDay จริง) ⇒ ฐานไม่มีแถวถือช่องซ้อน · staffId ในฐาน = ช่างในแผน · จอง STAFF ช่างที่แผนกันไว้ 14:00 ⇒ FULL", async () => {
    needFx();
    const planDay = plannerLoad.mod?.planDay;
    ok(typeof planDay === "function", `โหลด planner ไม่ได้ ${plannerLoad.err}`);
    const DS = "2031-03-04";
    const settings: PlanSettings = { queueOrder: "SINGLE_LINE", backfill: true, safetyBeforeBookingMin: 5, graceMin: 10, noShowAfterMin: 30, lateAction: "RELEASE", priorityEnabled: false, walkInMaxWaitMin: 120, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null };
    const win = [{ startAt: bkkMs(DS, 600), endAt: bkkMs(DS, 1200) }];
    const job = (o: Partial<PlanJob> & { id: string }): PlanJob => ({ label: o.id, kind: "BOOKED", status: "CONFIRMED", serviceId: "S", assignMode: "SPECIFIC", staffId: null, startAt: null, issuedAt: bkkMs(DS, 0), checkedInAt: null, startedAt: null, priority: false, ...o });
    const pj = planDay!({ now: bkkMs(DS, 835), settings, staff: [{ id: "s0", name: "s0", sortOrder: 1, windows: win, services: null }, { id: "s1", name: "s1", sortOrder: 2, windows: win, services: null }],
      services: [{ id: "S", name: "S", durationMin: 30, bufferAfterMin: 0 }],
      jobs: [job({ id: "a0", status: "IN_SERVICE", staffId: "s0", startAt: bkkMs(DS, 780), checkedInAt: bkkMs(DS, 775), startedAt: bkkMs(DS, 820) }),
        job({ id: "a1", status: "IN_SERVICE", staffId: "s1", startAt: bkkMs(DS, 810), checkedInAt: bkkMs(DS, 805), startedAt: bkkMs(DS, 810) }),
        job({ id: "b", assignMode: "ANY", staffId: "s0", startAt: bkkMs(DS, 840) }),
        job({ id: "w", kind: "WALKIN", status: "QUEUED", assignMode: "ANY", issuedAt: bkkMs(DS, 830), checkedInAt: bkkMs(DS, 830) })] }).jobs;
    const pb = pj.find((j) => j.jobId === "b")!;
    eq([pb.staffId, pb.reason], ["s1", "BOOKED_MOVED_STAFF"], "ตัวควบคุม planDay: นัดใครก็ได้ถูกย้ายช่าง");
    const B = await BK().bookAppointment(cX7, bk({ serviceId: ids.X730, staffId: null, dateStr: D.X7, startMin: 840, channel: "STAFF" }));
    ok(B.ok && B.staffId === ids.x7a, `ตัวควบคุม: นัดใครก็ได้ 14:00 ต้องลงช่างแรก ${fmt(B)}`);
    const bId = B.ok ? B.id : "";
    const a0 = await bookStaff(cX7, ids.X730, ids.x7a, D.X7, 780);
    const a1 = await bookStaff(cX7, ids.X730, ids.x7b, D.X7, 810);
    okCI(await LN.checkIn()(cX7, { appointmentId: a0 }, { via: "STAFF", now: at(D.X7, 775) }), "เช็กอิน a0");
    okCI(await LN.checkIn()(cX7, { appointmentId: a1 }, { via: "STAFF", now: at(D.X7, 805) }), "เช็กอิน a1");
    okJob(await LN.start()(cX7, a1, { now: at(D.X7, 810) }), "เริ่ม a1 13:30");
    okJob(await LN.start()(cX7, a0, { now: at(D.X7, 820) }), "เริ่ม a0 13:40");
    okWI(await LN.walkIn()(cX7, { serviceId: ids.X730, staffId: null, channel: "KIOSK" }, { now: at(D.X7, 830) }), "walk-in 13:50");
    await RN.plan()(cX7, { now: at(D.X7, 835) });
    for (const sid of [ids.x7a, ids.x7b]) eq(await overlapIn(sid, bkkMs(D.X7, 0), bkkMs(D.X7, 1440)), [], `ซ้อนในฐาน ${sid === ids.x7a ? "ช่างศูนย์" : "ช่างหนึ่ง"}`);
    const b = await apRow(bId);
    eq(b.staffId, b.plannedStaffId, "staffId ในฐาน = ช่างในแผน");
    eq(await bookFull(cX7, ids.X730, ids.x7b, D.X7, 840), "FULL", "จอง STAFF ช่างที่แผนกันไว้ 14:00");
  });

  // ORACLE-EDIT 29 ต.ค. (review) J1 — วงรอ checkIn ∥ runPlanner (ผู้ตรวจ B probe2–6: 40P01 ≈13% · 9/9 รอบ)
  const readDeadlocks = async () => Number((await q<{ n: string }>(`SELECT deadlocks::text AS n FROM pg_stat_database WHERE datname = current_database()`))[0]?.n ?? NaN);
  let dlBase = NaN;
  await st("X-6c", "ตัวควบคุม: ตัวนับ deadlock ของฐาน (pg_stat_database.deadlocks) เห็นวงรอที่จงใจสร้าง 1 ครั้ง (2 session ล็อกไขว้ BookingStaff) — ไม่งั้น X-6b ว่างเปล่า", async () => {
    need();
    const c0 = await readDeadlocks();
    const A = await pool.connect();
    const B2 = await pool.connect();
    let codes: string[] = [];
    try {
      await A.query("BEGIN"); await B2.query("BEGIN");
      await A.query(`SELECT id FROM "BookingStaff" WHERE id = $1 FOR UPDATE`, [X6STAFF[0]]);
      await B2.query(`SELECT id FROM "BookingStaff" WHERE id = $1 FOR UPDATE`, [X6STAFF[1]]);
      const pa = A.query(`SELECT id FROM "BookingStaff" WHERE id = $1 FOR UPDATE`, [X6STAFF[1]]).then(() => "ok", (e: { code?: string }) => String(e.code));
      await sleep(300);
      const pb = B2.query(`SELECT id FROM "BookingStaff" WHERE id = $1 FOR UPDATE`, [X6STAFF[0]]).then(() => "ok", (e: { code?: string }) => String(e.code));
      codes = await Promise.all([pa, pb]);
    } finally {
      await A.query("ROLLBACK").catch(() => undefined); await B2.query("ROLLBACK").catch(() => undefined);
      A.release(); B2.release();
    }
    ok(codes.includes("40P01"), `ไม่เกิด deadlock ที่จงใจสร้าง ${fmt(codes)}`);
    await sleep(12_000);
    const c1 = await readDeadlocks();
    ok(Number.isFinite(c0) && c1 > c0, `ตัวนับไม่ขยับ ${c0} → ${c1}`);
    dlBase = c1;
  }, "MAJOR");
  const X6R = 9;
  let x6Done = false;
  await st("X-6", `เช็กอินหลายทาง (token/เบอร์/id · 16 คำขอ/รอบ บน 3 โพรเซส) ∥ runPlanner วน 10 ครั้ง × 2 โพรเซส · ${X6R} รอบ ⇒ ไม่มี throw · ไม่มี 40P01 · ไม่มี BUSY · เช็กอินสำเร็จทุกคำขอ · ทุกนัด ARRIVED บัตร 1 · event 1`, async () => {
    needFx();
    LN.checkIn(); LN.token(); RN.plan();
    const appts: string[][] = [];
    const scs: Scenario[] = [];
    for (let r = 0; r < X6R; r++) {
      const ds = dd(55 + r);
      const ids8: string[] = [];
      const calls: CallSpec[] = [];
      for (let i = 0; i < 8; i++) {
        const phone = `09${String(70_000_000 + r * 100 + i).slice(-8)}`;
        const id = await bookStaff(cX6, ids.X6S, X6STAFF[i], ds, 600, phone);
        ids8.push(id);
        const tok = (await LN.token()(cX6, id)) ?? "missing";
        const byOf = (m: number): CheckInBy => (m === 0 ? { token: tok } : m === 1 ? { phone } : { appointmentId: id });
        for (const m of [i % 3, (i + 1) % 3]) calls.push(ci(cX6, byOf(m), ds, 595, m === 0 ? "QR" : m === 1 ? "PHONE" : "LINE"));
      }
      appts.push(ids8);
      const plan: CallSpec = { fn: "planLoop", ctx: cX6, now: nowIso(ds, 595), times: 10 };
      scs.push({ key: `x6r${r}`, perChild: [[plan], [plan], calls.filter((_, k) => k % 3 === 0), calls.filter((_, k) => k % 3 === 1), calls.filter((_, k) => k % 3 === 2)] });
    }
    const res = await runHarness(scs, NCHILD);
    x6Done = true;
    const bad: string[] = [];
    let dl = 0;
    let throws = 0;
    for (let r = 0; r < X6R; r++) {
      const out = res.get(`x6r${r}`) ?? [];
      if (out.length !== 18) bad.push(`r${r} ได้ผล ${out.length}/18`);
      for (const x of out) {
        if (x.threw) { throws++; if (x.deadlock) dl++; }
        else if (x.fn === "checkIn" && !x.ok) bad.push(`r${r} checkIn ${x.code}`);
      }
      for (const id of appts[r]) {
        const a = await apRow(id);
        const tks = await ticketsOf(id);
        if (a.status !== "ARRIVED" || tks.length !== 1 || a.queueTicketId !== tks[0]?.id) bad.push(`r${r} ${a.status} บัตร ${tks.length}`);
        if ((await obCount("booking.checked_in", id)) !== 1) bad.push(`r${r} event ≠ 1`);
      }
    }
    ok(throws === 0, `throw ${throws} ครั้ง (40P01 ${dl})`);
    ok(bad.length === 0, [...new Set(bad)].slice(0, 6).join(" · "));
  });
  await st("X-6b", "หลัง X-6: ตัวนับ deadlock ของฐานไม่เพิ่ม (40P01 = 0 รวมที่ถูกลองใหม่ภายใน)", async () => {
    ok(Number.isFinite(dlBase), "ตัวควบคุม X-6c ล้ม — วัดไม่ได้");
    ok(x6Done, "X-6 ไม่ได้รันสายยิงพร้อมกัน");
    await sleep(12_000);
    eq((await readDeadlocks()) - dlBase, 0, "deadlock ที่เกิดระหว่าง X-6");
  });

  // ═══════════════ TZ ═══════════════
  console.log("\n── TZ: เช็กอินในโพรเซส TZ −11 / +14 ──");
  for (const [id, tz, appt, min] of [["TZ-1", "Pacific/Pago_Pago", "Z1", 360], ["TZ-2", "Pacific/Kiritimati", "Z2", 1370]] as const) {
    await st(id, `${tz}: เช็กอินนัด ${hhmm(appt === "Z1" ? 390 : 1380)} ตอน ${hhmm(min)} วันไทยเดียวกัน ⇒ ok (ไม่ใช่ NOT_TODAY) · ARRIVED`, async () => {
      needFx();
      LN.checkIn();
      const calls: CallSpec[] = [ci(cL, { appointmentId: fx[appt] }, D.TZ, min)];
      const r = spawnSync(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, TZ: tz, QC_B4_PROBE: JSON.stringify(calls) }, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
      const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("PROBE_JSON="));
      ok(!!line, `probe ${tz} exit=${r.status} ${(r.stderr ?? "").split("\n").filter(Boolean).slice(-2).join(" ¦ ").slice(0, 200)}`);
      const [o] = JSON.parse(line!.slice("PROBE_JSON=".length)) as CallOut[];
      ok(o.ok, `เช็กอินล้ม ${o.code ?? o.threw}`);
      eq((await apRow(fx[appt])).status, "ARRIVED", "สถานะ");
    }, "MAJOR");
  }

  // ORACLE-EDIT 29 ต.ค. (review) J5 J6
  await st("TZ-3", "ข้ามเที่ยงคืน (สาขาเปิด 24 ชม.): งานเมื่อวาน 23:30 กำลังทำ (ถึง 00:30) ⇒ walk-in 00:05 วาง ≥ 00:30 ไม่ซ้อน · นัดเมื่อวาน 23:58 (ยังในผ่อนผันตอน 00:03) ⇒ walk-in 00:03 วาง ≥ 00:58 ไม่ซ้อน", async () => {
    needFx();
    const y = await bookStaff(cTZ3, ids.Z3S, ids.z3, D.TZ3a, 1410);
    okCI(await LN.checkIn()(cTZ3, { appointmentId: y }, { via: "STAFF", now: at(D.TZ3a, 1405) }), "เช็กอิน 23:25");
    okJob(await LN.start()(cTZ3, y, { now: at(D.TZ3a, 1410) }), "เริ่ม 23:30");
    const w = okWI(await LN.walkIn()(cTZ3, { serviceId: ids.Z3S, staffId: null, channel: "KIOSK" }, { now: at(D.TZ3b, 5) }), "walk-in 00:05");
    ok((tms(w.plannedStartAt) ?? 0) >= bkkMs(D.TZ3b, 30), `plannedStartAt ${w.plannedStartAt instanceof Date ? w.plannedStartAt.toISOString() : w.plannedStartAt} ต้อง ≥ 00:30`);
    ok((tms((await apRow(w.appointmentId)).startAt) ?? 0) >= bkkMs(D.TZ3b, 30), "แถว walk-in startAt ต้อง ≥ 00:30");
    eq(await overlapIn(ids.z3, bkkMs(D.TZ3a, 0), bkkMs(D.TZ3b, 1440)), [], "ซ้อน (งานเมื่อวาน)");
    await bookStaff(cTZ3b, ids.Z3bS, ids.z3b, D.TZ3a, 1438);
    const w2 = okWI(await LN.walkIn()(cTZ3b, { serviceId: ids.Z3bS, staffId: null, channel: "KIOSK" }, { now: at(D.TZ3b, 3) }), "walk-in 00:03");
    ok((tms(w2.plannedStartAt) ?? 0) >= bkkMs(D.TZ3b, 58), "walk-in ต้องวางหลังนัด 23:58–00:58");
    eq(await overlapIn(ids.z3b, bkkMs(D.TZ3a, 0), bkkMs(D.TZ3b, 1440)), [], "ซ้อน (นัดเมื่อวาน)");
  });
  await st("TZ-4", "นัด 23:45 มาถึง 00:10 วันถัดไป (ยังไม่ครบเวลาไม่มา 30) ⇒ เช็กอินได้ asWalkIn (ไม่ใช่ NOT_TODAY) · ARRIVED · บัตร businessDate = วันไทยของ now", async () => {
    needFx();
    const y = await bookStaff(cTZ4, ids.Z4S, ids.z4, D.TZ4a, 1425);
    const r = okCI(await LN.checkIn()(cTZ4, { appointmentId: y }, { via: "STAFF", now: at(D.TZ4b, 10) }), "เช็กอิน 00:10");
    eq(r.asWalkIn, true, "asWalkIn");
    eq((await apRow(y)).status, "ARRIVED", "สถานะ");
    eq((await tkRow(r.ticketId)).businessDate, D.TZ4b, "businessDate");
  }, "MAJOR");

  // ═══════════════ EV · MJ ═══════════════
  console.log("\n── EV: event 8 ตัว · 3 ทะเบียน · payload (ใบสั่ง §3.7) ──");
  const NEW_EVENTS = ["booking.created", "booking.rescheduled", "booking.cancelled", "booking.checked_in", "booking.late", "booking.started", "queue.ticket.called", "queue.ticket.done"];
  await st("EV-1", "AUTOMATION_EVENTS มีครบ 8 ตัวคนละ 1 แถว (ป้ายไทย) · WEBHOOK_EVENTS มี 1 แถวต่อ event (ผ่าน spread ไม่ประกาศซ้ำ) · consumers มีตัวจัดการครบ", async () => {
    const auto = (await tryImport<{ AUTOMATION_EVENTS: LabelDef[] }>("@/lib/automation/labels")).mod?.AUTOMATION_EVENTS ?? [];
    const wh = (await tryImport<{ WEBHOOK_EVENTS: LabelDef[] }>("@/lib/webhooks/labels")).mod?.WEBHOOK_EVENTS ?? [];
    const cons = (await tryImport<{ consumers: Record<string, unknown> }>("@/lib/outbox-consumers")).mod?.consumers ?? {};
    const miss: string[] = [];
    for (const e of NEW_EVENTS) {
      const a = auto.filter((x) => x.value === e);
      if (a.length !== 1 || !/[฀-๿]/.test(a[0].label)) miss.push(`${e}:auto=${a.length}`);
      if (wh.filter((x) => x.value === e).length !== 1) miss.push(`${e}:webhook=${wh.filter((x) => x.value === e).length}`);
      if (typeof cons[e] !== "function") miss.push(`${e}:consumer`);
    }
    ok(miss.length === 0, miss.slice(0, 8).join(" · "));
  });
  await st("EV-2", "payload ของ event ใหม่ที่ยิงในรอบนี้: ครบ 8 ชนิด · มี appointmentId/unitId/staffId/kind/channel (+ticketId ของ queue.*) · ไม่มีชื่อ/เบอร์ลูกค้า (X8)", async () => {
    const rows = await q<{ type: string; payload: Record<string, unknown> }>(`SELECT type, payload FROM "OutboxEvent" WHERE "tenantId" = ANY($1::text[]) AND type = ANY($2::text[])`, [ALL_TENANTS, NEW_EVENTS]);
    const seen = new Set(rows.map((r) => r.type));
    const missing = NEW_EVENTS.filter((e) => !seen.has(e));
    ok(missing.length === 0, `ยังไม่มี event: ${missing.join(", ")}`);
    const bad: string[] = [];
    const piiRe = new RegExp([...new Set(PII_PHONES)].map((p) => p.slice(1)).concat(["ลูกค้า QC B4", "คุณวอล์ค", "customerName", "customerPhone"]).join("|"));
    for (const r of rows) {
      const need = ["appointmentId", "unitId", "staffId", "kind", "channel", ...(r.type.startsWith("queue.") ? ["ticketId"] : [])];
      const lack = need.filter((k) => !(k in r.payload));
      if (lack.length) bad.push(`${r.type} ขาด ${lack.join(",")}`);
      if (piiRe.test(JSON.stringify(r.payload))) bad.push(`${r.type} มี PII`);
    }
    ok(bad.length === 0, [...new Set(bad)].slice(0, 6).join(" · "));
  });
  console.log("\n── MJ: minute-job (ใบสั่ง §3.6) ──");
  const mjBlock = (name: string) => {
    const src = existsSync(join(ROOT, MJ_REL)) ? readFileSync(join(ROOT, MJ_REL), "utf8") : "";
    const i = src.indexOf(`"${name}"`);
    ok(i >= 0, `ไม่พบงาน ${name} ใน minute-jobs.ts`);
    return src.slice(Math.max(0, src.lastIndexOf("registerMinuteJob(", i)), src.indexOf("});", i) + 3);
  };
  await st("MJ-1", `"${JOB_TICK}" everyMinutes 1 · cadence minute · ไม่ใช่ vpsOnly · import planner-run ตอนรัน → runLineTick`, async () => {
    const blk = mjBlock(JOB_TICK);
    ok(/everyMinutes:\s*1\b/.test(blk) && /planner-run/.test(blk) && /runLineTick/.test(blk) && !/vpsOnly:\s*true/.test(blk) && !/cadence:\s*"(hourly|daily)"/.test(blk), `บล็อก: ${blk.slice(0, 200)}`);
    const mj = (await tryImport<MjApi>("@/lib/platform/minute-jobs")).mod;
    eq((await mj?.getMinuteJobStatus?.([JOB_TICK]))?.[0]?.everyMinutes, 1, "everyMinutes จากทะเบียน");
  }, "MAJOR");
  await st("MJ-2", `"${JOB_HK}" everyMinutes ≤ 5 · ไม่ใช่ vpsOnly · เรียก runQueueHousekeeping`, async () => {
    const blk = mjBlock(JOB_HK);
    ok(/runQueueHousekeeping/.test(blk) && !/vpsOnly:\s*true/.test(blk), `บล็อก: ${blk.slice(0, 200)}`);
    const mj = (await tryImport<MjApi>("@/lib/platform/minute-jobs")).mod;
    const em = (await mj?.getMinuteJobStatus?.([JOB_HK]))?.[0]?.everyMinutes ?? null;
    ok(em !== null && em >= 1 && em <= 5, `everyMinutes ${em}`);
  }, "MAJOR");

  // ═══════════════ XS ไม่แตะร้านอื่น ═══════════════
  await st("XS-1", "ทั้งรอบไม่แตะนัด/บัตรของร้านอื่นบนฐาน QC (updatedAt ≥ เวลาเริ่ม นอกร้านทดสอบ = 0)", async () => {
    const [a] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE NOT ("tenantId" = ANY($1::text[])) AND "updatedAt" >= $2`, [ALL_TENANTS, RUN_START]);
    const [t] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM "QueueTicket" WHERE NOT ("tenantId" = ANY($1::text[])) AND "updatedAt" >= $2`, [ALL_TENANTS, RUN_START]);
    eq([a.n, t.n], [0, 0], "แถวร้านอื่นที่ถูกแก้");
  });
} catch (e) {
  record("CRASH", "ข้อสอบหยุดกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  for (const f of goFiles) { try { if (existsSync(f)) unlinkSync(f); } catch { /* ไฟล์ของเราเอง */ } }
  console.log("\n── Z: ล้างข้อมูล ──");
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b4-*` 0 · นัด/บัตร/ประเภทคิว/outbox/ค่าตั้งของร้านทดสอบ 0 · ผู้ใช้ทดสอบ 0 · ไฟล์สัญญาณ /tmp/svc-b4-go-* ของรอบนี้ 0", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "QueueTicket", "QueueType", "QueueDailySequence", "OutboxEvent", "SettingValue", "BookingStaff"]) {
      if (!(await cols(t)).length) continue;
      eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [ALL_TENANTS]))[0].n, 0, t);
    }
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, [`${USER_MAIL}%`]))[0].n, 0, "user");
    eq(goFiles.filter((f) => existsSync(f)), [], "ไฟล์สัญญาณ");
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
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, QC_B4_CHILD: JSON.stringify(spec) }, stdio: ["ignore", "pipe", "pipe"] });
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

// ═══════════════ ST. ไฟล์ ═══════════════
console.log("\n── ST: ไฟล์ · ไม่มี migration · เวลาไทย · CAS ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim());
const OWN = new Set([LINE_REL, RUN_REL, SERVICE_REL, INDEX_REL, QUEUE_REL, MJ_REL, OUTBOX_REL, AUTO_REL, WH_REL]);
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
{
  const ch = dirty(["src", "prisma"]);
  const headHas = (() => { try { git(["cat-file", "-e", `HEAD:${LINE_REL}`]); return true; } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("ST-1", "แตะเฉพาะไฟล์ของใบ", "B.4 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("ST-1", "แตะเฉพาะไฟล์ของใบ (queue-line · planner-run · booking/service · booking/index · queue/service · minute-jobs · 3 ทะเบียน) · มีไฟล์ใหม่ 2 ไฟล์ + queue/service + minute-jobs ในชุดที่แก้", () => {
    const outside = ch.filter((f) => !OWN.has(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = [LINE_REL, RUN_REL, QUEUE_REL, MJ_REL].filter((f) => !ch.includes(f));
    ok(miss.length === 0, `ยังไม่แก้: ${miss.join(", ")}`);
  });
}
await st("ST-2", "ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/.getMinutes/.getDate/.getMonth/.getFullYear/toLocaleDateString) ใน queue-line · planner-run · booking/service", () => {
  const bad: string[] = [];
  const present = [LINE_REL, RUN_REL, SERVICE_REL].filter((f) => existsSync(join(ROOT, f)));
  ok(present.includes(LINE_REL) && present.includes(RUN_REL), `ยังไม่มีไฟล์ใหม่: ${[LINE_REL, RUN_REL].filter((f) => !present.includes(f)).join(", ")}`);
  for (const f of present) {
    readFileSync(join(ROOT, f), "utf8").split("\n").forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, "");
      if (/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)|toLocaleDateString/.test(code)) bad.push(`${f}:${i + 1}`);
    });
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
});
await st("ST-3", "ไม่มี migration/แก้ schema (prisma/ ไม่มีไฟล์แก้หรือไฟล์ใหม่)", () => { eq(dirty(["prisma"]), [], "prisma/"); });
await st("ST-4", "ตัววางคิว B.2 + plan-settings B.3 ไม่ถูกแตะ (planner.ts · plan-settings.ts = HEAD)", () => { eq(dirty([PLANNER_REL, PS_REL]), [], "ไฟล์"); }, "MAJOR");
await st("ST-5", "วินัย CAS: queue-line.ts / planner-run.ts ไม่มี `.appointment.update(` / `.queueTicket.update(` (เขียนสถานะด้วย updateMany/UPDATE ที่มีเงื่อนไขสถานะ) · ไม่มีตัวกันในหน่วยความจำ (Mutex/Map ของล็อก)", () => {
  for (const f of [LINE_REL, RUN_REL]) {
    ok(existsSync(join(ROOT, f)), `ไม่มี ${f}`);
    const src = stripComments(readFileSync(join(ROOT, f), "utf8"));
    ok(!/\.(appointment|queueTicket)\.update\s*\(/.test(src), `${f} มี .update( แบบไม่ CAS`);
    ok(!/new\s+Mutex|async-mutex|new\s+Map<[^>]*Promise/.test(src), `${f} มีตัวกันในหน่วยความจำ`);
  }
}, "MAJOR");
await st("ST-6", "queue/service.ts ไม่ import โมดูล booking (ทิศทางเดียว booking→queue)", () => {
  const src = stripComments(readFileSync(join(ROOT, QUEUE_REL), "utf8"));
  ok(!/from\s+["']@\/lib\/modules\/booking|import\(\s*["']@\/lib\/modules\/booking/.test(src), "queue import booking");
}, "MAJOR");

// ═══════════════ G. regression ═══════════════
console.log("\n── G: regression คิว + จองคิว + smoke ──");
const judgeSvc = (out: string) => {
  const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
  if (!line) return false;
  const j = JSON.parse(line.slice(13)) as { failed: string[]; skipped: string[] };
  return j.failed.length === 0 && j.skipped.every((x) => x.startsWith("G-") || x === "ST-1");
};
const REG: { s: string; env?: Record<string, string>; judge?: (out: string, code: number | null) => boolean; note?: string }[] = [
  { s: "qc-queue-public" },
  { s: "qc-systems", judge: (out) => /✅ Queue:/.test(out) && !/❌ Queue/.test(out), note: "บรรทัด Queue ✅" },
  { s: "qc-booking-race" }, { s: "qc-booking-deposit" }, { s: "qc-booking-edit-schedule" },
  { s: "qc-svc-b.3", env: { SVC_B3_NO_REGRESSION: "1" }, judge: judgeSvc, note: "ไม่มี FAIL · SKIP เฉพาะ G-*/ST-1" },
  { s: "qc-svc-b.2" }, { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof (lineLoad.mod as LineApi | null)?.checkIn === "function" && typeof (runLoad.mod as RunApi | null)?.runLineTick === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (queue-line.checkIn / planner-run.runLineTick) — regression รันเมื่อมีงาน" : NO_REG ? "--no-regression / SVC_B4_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.note ? ` (${g.note})` : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b4-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(all, r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.4 · เช็กอิน · walk-in · สาย/ไม่มา =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ไม่นับว่าผ่าน)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
