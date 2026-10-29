// QC — SVC B.3 · หาเวลาว่าง v2 + จองแบบมีกติกา · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้ (แย้ง = wo-notes)
// สัญญา: ledger/svc-briefs/svc-brief-b.3.md (§3 สัญญา · §6 จุดที่เลือกเอง) · ledger/SVC-MASTER-PLAN.md แถว B.3
//        ledger/DESIGN-BOOKING-QUEUE.md R3 §4.3 · ภาคผนวก ก #8 #9 #19–#25 #33–#35 · ใบ B.0 §9 (carry) · ใบ B.1 §4
//
// กลุ่มข้อ:
//   P   pure: planSettingsFrom (4 แม่แบบ · คีย์ · throw · ไม่แก้ input) · computeDepositSatang · P-0 ตัวควบคุม (ค่าแม่แบบในข้อสอบ = ทะเบียน)
//   PS  resolve จริงจากฐาน → planSettingsFrom
//   S   findSlots: เท่ารุ่นแรก (STAFF) · หน้าต่าง/skill/นาทีเฉพาะคน · ใครก็ได้ = รวม · 0% · % ออนไลน์ · งานสูงสุด · พักขั้นต่ำ (ค่ามาก) ·
//       สถานะถือช่อง · lead (+รายบริการ) · horizon · step · คอลัมน์ชนะค่าตั้ง · ใครก็ได้ปิด · X1
//   B   bookAppointment: แถวที่เขียน · รหัสล้ม · ร้านยืนยันก่อน · เพดานต่อเบอร์ · % ออนไลน์ "เต็ม" แต่พนักงานจองได้ · ถือช่องมัดจำ · ร้านเดิม · idempotency · X1
//   H   expireDepositHolds: ยังไม่ถึง/ถึง · snapshot ชนะ · ไม่แตะแถวอื่น · X5 ซ้อน 2 รอบ · minute-job
//   X   ยิงพร้อมกันจาก 5 โพรเซสแยก × 2 คำขอ (ตัวกันในหน่วยความจำแดง) — X3-0 ตัวควบคุม (createAppointment เดิม) · X3-1…X3-8
//   TZ  findSlots ใน TZ +14 / −11 = in-process
//   Z   ล้างข้อมูลหมด (tenant/แถว/ผู้ใช้/ไฟล์สัญญาณ)
//   ST  ไฟล์ของใบ · ไม่มี migration · เวลาไทย · pure · minute-job
//   G   regression
//
// วันที่สัมพัทธ์ (วันไทย +5…+27 ภายใน horizon 30) · ร้านทดสอบ slug `qc-svc-b3-*` · ลบใน finally (+ กวาดค้างตอนเริ่ม)
// ORACLE-EDIT 28 ต.ค. (review): +X3-4b X3-9 X3-9b X3-10 X3-11 X3-12 · H-6 H-7 H-8 · B-16 · B-4 ใช้วันพรุ่งนี้ (กันเปราะ 22:00–22:30) — /root/svc-runs/fix/b3.md G1–G6
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-b.3.mts
//      (ห้าม timeout ครอบ · SVC_B3_NO_REGRESSION=1 = ข้าม G เป็น SKIP ซึ่งไม่นับผ่าน)
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const LABEL = "qc-svc-b.3";
const SERVICE_REL = "src/lib/modules/booking/service.ts";
const SLOTS_REL = "src/lib/modules/booking/slots.ts";
const PS_REL = "src/lib/modules/booking/plan-settings.ts";
const INDEX_REL = "src/lib/modules/booking/index.ts";
const MJ_REL = "src/lib/platform/minute-jobs.ts";
const JOB_NAME = "booking.depositHolds.expire";

loadSvcQcEnv(LABEL); // ด่านฐาน: ไม่ใช่ qc-svc (ep-mute-scene) ⇒ exit 4 ก่อนแตะฐาน
if (process.env.CI) { console.error(`🔴 ${LABEL}: ห้าม export CI (with-gate-lock ข้าม flock)`); process.exit(4); }

// ═══════════════ สำเนาสัญญา (ใบสั่ง §3) ═══════════════
type MinWindow = { startMin: number; endMin: number };
type PlanSettings = {
  queueOrder: "SINGLE_LINE" | "APPOINTMENT_FIRST"; backfill: boolean; safetyBeforeBookingMin: number; graceMin: number;
  noShowAfterMin: number; lateAction: "RELEASE" | "HOLD"; priorityEnabled: boolean; walkInMaxWaitMin: number;
  overrunExtendMin: number; minBreakMin: number; maxJobsPerDay: number | null;
};
type PsApi = { PLAN_SETTING_KEYS?: readonly string[]; planSettingsFrom?: (v: Readonly<Record<string, unknown>>) => PlanSettings };
type SlotsApi = { computeDepositSatang?: (amount: unknown, i: { priceSatang: number; durationMin: number; serviceDepositSatang: number }) => number };
type BookingChannel = "ONLINE" | "LINE" | "STAFF" | "PHONE";
type BookingCtx = { tenantId: string; unitId: string };
type Slot = { startMin: number; hhmm: string; staffId: string };
type BookInput = {
  serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: BookingChannel;
  customerName: string; customerPhone: string; note?: string; idempotencyKey?: string;
};
type BookFailCode = "FULL" | "PAST" | "LEAD_TIME" | "BEYOND_HORIZON" | "OFF_GRID" | "OUTSIDE_HOURS" | "PHONE_LIMIT"
  | "NOT_QUALIFIED" | "ON_LEAVE" | "NOT_FOUND" | "ANY_DISABLED" | "BAD_INPUT"
  | "RELEASED"; // ORACLE-EDIT 28 ต.ค. (review) G3
type BookResult =
  | { ok: true; id: string; staffId: string; status: "PENDING" | "CONFIRMED"; holdUntil: Date | null }
  | { ok: false; code: BookFailCode; reason: string };
type CreateInput = {
  tenantId: string; unitId: string; serviceId: string; staffId: string; dateStr: string; startMin: number;
  customerName: string; customerPhone: string; source?: "STAFF" | "ONLINE"; idempotencyKey?: string;
};
type BookingApi = {
  findSlots?: (ctx: BookingCtx, q: { serviceId: string; staffId: string | null; dateStr: string; channel: BookingChannel }) => Promise<Slot[]>;
  bookAppointment?: (ctx: BookingCtx, i: BookInput) => Promise<BookResult>;
  expireDepositHolds?: (now: Date) => Promise<{ expired: number }>;
  getAvailableSlots: (tenantId: string, unitId: string, serviceId: string, staffId: string | null, dateStr: string) => Promise<Slot[]>;
  createAppointment: (i: CreateInput) => Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
  // ORACLE-EDIT 28 ต.ค. (review) G4 G5
  recordDeposit: (ctx: BookingCtx, appointmentId: string) => Promise<{ ok: boolean; reason?: string; saleId?: string; noop?: boolean }>;
  setAppointmentStatus: (tenantId: string, unitId: string, appointmentId: string, status: "PENDING" | "CONFIRMED" | "ARRIVED" | "DONE" | "NO_SHOW" | "CANCELLED") => Promise<{ ok: boolean; reason?: string }>;
};
type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
type SetRes = { ok: boolean; code?: string; issues?: unknown };
type Resolved = { value: unknown };
type SettingsApi = {
  setSettings: (actor: Actor, ctx: { tenantId: string }, changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => Promise<SetRes>;
  applyTemplate: (actor: Actor, ctx: { tenantId: string }, i: { unitId: string; domain: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" }) => Promise<SetRes>;
  resolveSettings: (ctx: { tenantId: string }, keys: string[], refs: { unitId: string; staffId?: string; serviceId?: string }) => Promise<Record<string, Resolved>>;
  getDef: (key: string) => unknown;
  defaultFor: (def: never, templateKey: string | null) => unknown;
};
type MjApi = { getMinuteJobStatus?: (names?: string[]) => Promise<{ name: string; everyMinutes: number | null }[]> };

// ═══════════════ ตัวช่วย ═══════════════
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
class AssertFail extends Error {}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const fmt = (v: unknown): string => { try { return JSON.stringify(v)?.slice(0, 220) ?? String(v); } catch { return String(v); } };
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
const W = (startMin: number, endMin: number): MinWindow => ({ startMin, endMin });
const addDays = (ds: string, n: number): string => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const bkkToday = (): string => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const bkkMs = (ds: string, min: number): number => { const [y, m, d] = ds.split("-").map(Number); return Date.UTC(y, m - 1, d) + (min - 420) * 60_000; };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === "object") { for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v); Object.freeze(o); }
  return o;
};
/** เวลาไทย (now + offset) ปัดขึ้นเป็นช่อง 15 นาที → { dateStr, startMin } */
const soonSlot = (offsetMin: number): { dateStr: string; startMin: number } => {
  const ms = Date.now() + offsetMin * 60_000;
  const bkk = ms + 7 * 3_600_000;
  const ds = new Date(bkk).toISOString().slice(0, 10);
  const minOfDay = Math.floor((bkk - Date.UTC(Number(ds.slice(0, 4)), Number(ds.slice(5, 7)) - 1, Number(ds.slice(8, 10)))) / 60_000);
  const up = Math.ceil((minOfDay + 1) / 15) * 15;
  return up >= 1440 ? { dateStr: addDays(ds, 1), startMin: up - 1440 } : { dateStr: ds, startMin: up };
};
const range = (a: number, b: number, step: number): number[] => { const o: number[] = []; for (let t = a; t <= b; t += step) o.push(t); return o; };

// ═══════════════ โหลดโมดูล ═══════════════
const psLoad = existsSync(join(ROOT, PS_REL)) ? await tryImport<PsApi>(pathToFileURL(join(ROOT, PS_REL)).href) : { mod: null, err: `ยังไม่มี «${PS_REL}»` };
const slotsLoad = await tryImport<SlotsApi>("@/lib/modules/booking/slots");
const bookingLoad = await tryImport<BookingApi>("@/lib/modules/booking/service");
const BK = (): BookingApi => { if (!bookingLoad.mod) throw new AssertFail(`โหลด booking/service ไม่ได้ (${bookingLoad.err})`); return bookingLoad.mod; };
const FIND = (): NonNullable<BookingApi["findSlots"]> => { const f = BK().findSlots; if (typeof f !== "function") throw new AssertFail("booking/service ยังไม่มี export findSlots"); return f; };
const BOOK = (): NonNullable<BookingApi["bookAppointment"]> => { const f = BK().bookAppointment; if (typeof f !== "function") throw new AssertFail("booking/service ยังไม่มี export bookAppointment"); return f; };
const EXPIRE = (): NonNullable<BookingApi["expireDepositHolds"]> => { const f = BK().expireDepositHolds; if (typeof f !== "function") throw new AssertFail("booking/service ยังไม่มี export expireDepositHolds"); return f; };
const PSF = (): NonNullable<PsApi["planSettingsFrom"]> => { const f = psLoad.mod?.planSettingsFrom; if (typeof f !== "function") throw new AssertFail(psLoad.mod ? "plan-settings.ts ไม่มี export planSettingsFrom" : psLoad.err); return f; };
const PSKEYS = (): readonly string[] => { const k = psLoad.mod?.PLAN_SETTING_KEYS; if (!Array.isArray(k)) throw new AssertFail(psLoad.mod ? "plan-settings.ts ไม่มี export PLAN_SETTING_KEYS" : psLoad.err); return k; };
const DEP = (): NonNullable<SlotsApi["computeDepositSatang"]> => { const f = slotsLoad.mod?.computeDepositSatang; if (typeof f !== "function") throw new AssertFail(`slots.ts ยังไม่มี export computeDepositSatang ${slotsLoad.err}`); return f; };

// ═══════════════ โหมดลูกโพรเซส (ยิงพร้อมกัน · TZ probe) ═══════════════
type CallSpec = { fn: "book"; ctx: BookingCtx; input: BookInput } | { fn: "create"; input: CreateInput };
type CallOut = { fn: "book" | "create"; ok: boolean; code: string | null; id: string | null; staffId: string | null; status: string | null; threw: string | null };
type ChildSpec = { run: string; idx: number; scenarios: { key: string; calls: CallSpec[] }[] };
// ORACLE-EDIT 28 ต.ค. (review): layout "one" = ทุกคำขอในโพรเซสเดียว (pool ของ Prisma ≤ 10 · จับ BLOCKER-2 pool ค้าง)
type Scenario = { key: string; calls: CallSpec[]; layout?: "pair" | "one" };
const goFile = (run: string, key: string) => `/tmp/svc-b3-go-${run}-${key}`;
async function runCall(c: CallSpec): Promise<CallOut> {
  try {
    if (c.fn === "create") {
      const r = await BK().createAppointment(c.input);
      return { fn: "create", ok: r.ok, code: r.ok ? null : "LEGACY", id: r.ok ? r.id : null, staffId: r.ok ? c.input.staffId : null, status: null, threw: null };
    }
    const f = BK().bookAppointment;
    if (typeof f !== "function") return { fn: "book", ok: false, code: null, id: null, staffId: null, status: null, threw: "ไม่มี export bookAppointment" };
    const r = await f(c.ctx, c.input);
    return r.ok
      ? { fn: "book", ok: true, code: null, id: r.id, staffId: r.staffId, status: r.status, threw: null }
      : { fn: "book", ok: false, code: r.code, id: null, staffId: null, status: null, threw: null };
  } catch (e) {
    return { fn: c.fn, ok: false, code: null, id: null, staffId: null, status: null, threw: errMsg(e).slice(0, 160) };
  }
}
if (process.env.QC_B3_CHILD) {
  const spec = JSON.parse(process.env.QC_B3_CHILD) as ChildSpec;
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
type Probe = { ctx: BookingCtx; serviceId: string; staffIds: (string | null)[]; dates: string[]; channels: BookingChannel[] };
async function probeRun(p: Probe) {
  const out: Slot[][] = [];
  for (const ds of p.dates) for (const sid of p.staffIds) for (const ch of p.channels) out.push(await FIND()(p.ctx, { serviceId: p.serviceId, staffId: sid, dateStr: ds, channel: ch }));
  return out;
}
if (process.env.QC_B3_PROBE) {
  try { console.log(`PROBE_JSON=${JSON.stringify(await probeRun(JSON.parse(process.env.QC_B3_PROBE) as Probe))}`); process.exit(0); }
  catch (e) { console.error(`PROBE_ERR ${errMsg(e)}`); process.exit(3); }
}

const settingsLoad = await tryImport<SettingsApi>("@/lib/core/settings");
const SETTINGS = (): SettingsApi => { if (!settingsLoad.mod) throw new AssertFail(`โหลด core/settings ไม่ได้ (${settingsLoad.err})`); return settingsLoad.mod; };

// ═══════════════ P. pure ═══════════════
console.log("\n── P: plan-settings.ts · computeDepositSatang (pure · ใบสั่ง §3.1) ──");
const PLAN_KEYS = [
  "booking.queue.order", "booking.queue.walkInFillGaps", "booking.queue.safetyMin", "booking.late.graceMin", "booking.late.noShowAfterMin",
  "booking.late.afterGrace", "booking.queue.priorityGroups", "booking.queue.walkInCloseWaitMin", "booking.queue.overrunExtendMin",
  "booking.staff.minBreakMin", "booking.staff.maxJobsPerDay",
];
const TPL_VALUES: Record<string, Record<string, unknown>> = {
  BARBER: { "booking.queue.order": "SINGLE_LINE_BY_TIME", "booking.queue.walkInFillGaps": true, "booking.queue.safetyMin": 5, "booking.late.graceMin": 10, "booking.late.noShowAfterMin": 30, "booking.late.afterGrace": "RELEASE_REQUEUE", "booking.queue.priorityGroups": [], "booking.queue.walkInCloseWaitMin": 120, "booking.queue.overrunExtendMin": 5, "booking.staff.minBreakMin": 0, "booking.staff.maxJobsPerDay": null },
  SPA: { "booking.queue.order": "SINGLE_LINE_BY_TIME", "booking.queue.walkInFillGaps": true, "booking.queue.safetyMin": 10, "booking.late.graceMin": 15, "booking.late.noShowAfterMin": 30, "booking.late.afterGrace": "RELEASE_REQUEUE", "booking.queue.priorityGroups": [], "booking.queue.walkInCloseWaitMin": 90, "booking.queue.overrunExtendMin": 5, "booking.staff.minBreakMin": 10, "booking.staff.maxJobsPerDay": 6 },
  CLINIC: { "booking.queue.order": "APPOINTMENT_FIRST", "booking.queue.walkInFillGaps": false, "booking.queue.safetyMin": 0, "booking.late.graceMin": 15, "booking.late.noShowAfterMin": 60, "booking.late.afterGrace": "WAIT_NOTIFY_COUNTER", "booking.queue.priorityGroups": ["ELDERLY", "MONK", "DISABLED"], "booking.queue.walkInCloseWaitMin": 180, "booking.queue.overrunExtendMin": 5, "booking.staff.minBreakMin": 0, "booking.staff.maxJobsPerDay": null },
  _fallback: { "booking.queue.order": "SINGLE_LINE_BY_TIME", "booking.queue.walkInFillGaps": true, "booking.queue.safetyMin": 5, "booking.late.graceMin": 10, "booking.late.noShowAfterMin": null, "booking.late.afterGrace": "WAIT_NOTIFY_COUNTER", "booking.queue.priorityGroups": [], "booking.queue.walkInCloseWaitMin": 120, "booking.queue.overrunExtendMin": 5, "booking.staff.minBreakMin": 0, "booking.staff.maxJobsPerDay": null },
};
const TPL_EXPECT: Record<string, PlanSettings> = {
  BARBER: { queueOrder: "SINGLE_LINE", backfill: true, safetyBeforeBookingMin: 5, graceMin: 10, noShowAfterMin: 30, lateAction: "RELEASE", priorityEnabled: false, walkInMaxWaitMin: 120, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null },
  SPA: { queueOrder: "SINGLE_LINE", backfill: true, safetyBeforeBookingMin: 10, graceMin: 15, noShowAfterMin: 30, lateAction: "RELEASE", priorityEnabled: false, walkInMaxWaitMin: 90, overrunExtendMin: 5, minBreakMin: 10, maxJobsPerDay: 6 },
  CLINIC: { queueOrder: "APPOINTMENT_FIRST", backfill: false, safetyBeforeBookingMin: 0, graceMin: 15, noShowAfterMin: 60, lateAction: "HOLD", priorityEnabled: true, walkInMaxWaitMin: 180, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null },
  _fallback: { queueOrder: "SINGLE_LINE", backfill: true, safetyBeforeBookingMin: 5, graceMin: 10, noShowAfterMin: Number.POSITIVE_INFINITY, lateAction: "HOLD", priorityEnabled: false, walkInMaxWaitMin: 120, overrunExtendMin: 5, minBreakMin: 0, maxJobsPerDay: null },
};
await st("P-0", "ตัวควบคุม: ค่าแม่แบบ 11 คีย์ × 4 แม่แบบในข้อสอบ = ค่าเริ่มในทะเบียน (defs/booking.ts)", () => {
  const s = SETTINGS();
  for (const [tpl, vals] of Object.entries(TPL_VALUES)) for (const k of PLAN_KEYS) {
    const def = s.getDef(k);
    ok(!!def, `ทะเบียนไม่มีคีย์ ${k}`);
    eq(s.defaultFor(def as never, tpl === "_fallback" ? null : tpl), vals[k], `${tpl} ${k}`);
  }
}, "MAJOR");
for (const [i, tpl] of (["BARBER", "SPA", "CLINIC", "_fallback"] as const).entries()) {
  await st(`P-${i + 1}`, `planSettingsFrom(ค่าแม่แบบ ${tpl}) ตรงตาราง §3.1${tpl === "_fallback" ? " (afterGrace รอ ⇒ HOLD · noShow null ⇒ Infinity)" : ""}`, () => {
    eq(PSF()(deepFreeze(structuredClone(TPL_VALUES[tpl]))), TPL_EXPECT[tpl], tpl);
  });
}
await st("P-5", "PLAN_SETTING_KEYS = 11 คีย์ตามตาราง (ไม่ขาดไม่เกิน) · ทุกคีย์อยู่ในทะเบียน", () => {
  eq([...PSKEYS()].sort(), [...PLAN_KEYS].sort(), "PLAN_SETTING_KEYS");
});
await st("P-6", "planSettingsFrom: คีย์ขาด ⇒ throw · enum แปลก ⇒ throw · ไม่แก้ input (deep-freeze) · คีย์เกินไม่มีผล", () => {
  const base = TPL_VALUES.BARBER;
  for (const k of ["booking.queue.order", "booking.staff.minBreakMin", "booking.late.afterGrace"]) {
    const v = { ...base }; delete v[k];
    let threw = false; try { PSF()(v); } catch { threw = true; }
    ok(threw, `ขาด ${k} ไม่ throw`);
  }
  let t2 = false; try { PSF()({ ...base, "booking.queue.order": "RANDOM" }); } catch { t2 = true; }
  ok(t2, "queue.order แปลกไม่ throw");
  const frozen = deepFreeze({ ...structuredClone(base), "booking.booking.onlineSharePct": 0 });
  eq(PSF()(frozen), TPL_EXPECT.BARBER, "input แช่แข็ง + คีย์เกิน");
}, "MAJOR");
await st("P-7", "computeDepositSatang: null⇒0 · PER_SERVICE ⇒ มัดจำบริการ · PERCENT 20% ≥90 นาที (50000→10000 · 89 นาที⇒0) · min null · ปัดครึ่งขึ้น (33333→6667 · 2×25%→1)", () => {
  const f = DEP();
  const I = (priceSatang: number, durationMin: number, serviceDepositSatang = 7700) => ({ priceSatang, durationMin, serviceDepositSatang });
  eq(f(null, I(50000, 90)), 0, "null");
  eq(f({ mode: "PER_SERVICE" }, I(50000, 30, 7700)), 7700, "PER_SERVICE");
  eq(f({ mode: "PERCENT", bp: 2000, minDurationMin: 90 }, I(50000, 90)), 10000, "PERCENT 90");
  eq(f({ mode: "PERCENT", bp: 2000, minDurationMin: 90 }, I(50000, 89)), 0, "PERCENT 89");
  eq(f({ mode: "PERCENT", bp: 2000, minDurationMin: null }, I(33333, 30)), 6667, "PERCENT ปัด");
  eq(f({ mode: "PERCENT", bp: 2500, minDurationMin: null }, I(2, 30)), 1, "ครึ่งขึ้น 0.5");
  eq(f({ mode: "PERCENT", bp: 2500, minDurationMin: null }, I(1, 30)), 0, "0.25 ⇒ 0");
  eq(f({ mode: "PERCENT", bp: 0, minDurationMin: null }, I(50000, 120)), 0, "bp 0");
  let threw = false; try { f({ mode: "WHAT" }, I(1, 1)); } catch { threw = true; }
  ok(threw, "รูปแปลกไม่ throw");
});

// ═══════════════ ฐานข้อมูล ═══════════════
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await pool.query<T>(sql, params)).rows;
type ColRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const colCache = new Map<string, ColRow[]>();
const cols = async (table: string) => {
  if (!colCache.has(table)) colCache.set(table, await q<ColRow>(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table]));
  return colCache.get(table) ?? [];
};
const rid = (p: string) => `svcb3_${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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
const SLUG = "qc-svc-b3-";
const USER_MAIL = "qc-svc-b3-";
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
const TODAY = bkkToday();
const dd = (k: number) => addDays(TODAY, 5 + k);
const ids = {
  tA: `svcb3_tA_${RUN}`, tB: `svcb3_tB_${RUN}`,
  uMain: `svcb3_uMain_${RUN}`, u24: `svcb3_u24_${RUN}`, uRace: `svcb3_uRace_${RUN}`, uFb: `svcb3_uFb_${RUN}`, uB: `svcb3_uB_${RUN}`,
  owner: `svcb3_owner_${RUN}`,
  S60: `svcb3_S60_${RUN}`, S30: `svcb3_S30_${RUN}`, S90: `svcb3_S90_${RUN}`, SNB: `svcb3_SNB_${RUN}`,
  T60: `svcb3_T60_${RUN}`, T30: `svcb3_T30_${RUN}`, R60: `svcb3_R60_${RUN}`, R30: `svcb3_R30_${RUN}`, F60: `svcb3_F60_${RUN}`, B60: `svcb3_B60_${RUN}`,
  stZ: `svcb3_stZ_${RUN}`, stA: `svcb3_stA_${RUN}`, stB: `svcb3_stB_${RUN}`, stC: `svcb3_stC_${RUN}`, stQ: `svcb3_stQ_${RUN}`,
  stS: `svcb3_stS_${RUN}`, stM: `svcb3_stM_${RUN}`, stK: `svcb3_stK_${RUN}`,
  s24: `svcb3_s24_${RUN}`, r1: `svcb3_r1_${RUN}`, r2: `svcb3_r2_${RUN}`, r3: `svcb3_r3_${RUN}`, rCap: `svcb3_rCap_${RUN}`, rCtl: `svcb3_rCtl_${RUN}`,
  f1: `svcb3_f1_${RUN}`, b1: `svcb3_b1_${RUN}`,
  // ORACLE-EDIT 28 ต.ค. (review): สาขาไม่มีเพดานเบอร์ (uNc) · สาขาเชื่อมระบบสมาชิก (uMem)
  uNc: `svcb3_uNc_${RUN}`, uMem: `svcb3_uMem_${RUN}`, N60: `svcb3_N60_${RUN}`, M60: `svcb3_M60_${RUN}`, n1: `svcb3_n1_${RUN}`, n2: `svcb3_n2_${RUN}`,
  memSys: `svcb3_memSys_${RUN}`,
};
const MEM_STAFF = Array.from({ length: 6 }, (_, i) => `svcb3_m${i + 1}_${RUN}`);
const cM: BookingCtx = { tenantId: ids.tA, unitId: ids.uMain };
const c24: BookingCtx = { tenantId: ids.tA, unitId: ids.u24 };
const cR: BookingCtx = { tenantId: ids.tA, unitId: ids.uRace };
const cF: BookingCtx = { tenantId: ids.tA, unitId: ids.uFb };
const cB: BookingCtx = { tenantId: ids.tB, unitId: ids.uB };
const cNc: BookingCtx = { tenantId: ids.tA, unitId: ids.uNc };
const cMem: BookingCtx = { tenantId: ids.tA, unitId: ids.uMem };
const OWNER: Actor = { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: ids.owner };
let phoneN = 0;
const newPhone = () => `08${String(30_000_000 + ++phoneN).slice(-8)}`;
const bk = (o: Partial<BookInput> & { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: BookingChannel }): BookInput =>
  ({ customerName: "ลูกค้า QC B3", customerPhone: newPhone(), idempotencyKey: rid("idem"), ...o });
const okBook = (r: BookResult, what: string): Extract<BookResult, { ok: true }> => { if (!r.ok) throw new AssertFail(`${what}: ล้ม ${r.code} ${r.reason}`); return r; };
const failCode = (r: BookResult, code: BookFailCode, what: string): string => {
  if (r.ok) throw new AssertFail(`${what}: ต้องล้ม ${code} แต่สำเร็จ (${r.staffId})`);
  eq(r.code, code, `${what} code`);
  ok(typeof r.reason === "string" && r.reason.trim().length > 0, `${what}: reason ว่าง`);
  return r.reason;
};
type ApRow = { id: string; status: string; channel: string | null; source: string; assignMode: string; kind: string; staffId: string; startAt: Date; endAt: Date; createdAt: Date;
  priceSatang: number; depositSatang: number; depositPaidAt: Date | null; cancelReason: string | null; policySnapshot: { domain?: string; template?: { key?: string }; values?: Record<string, unknown> } | null };
const apRow = async (id: string): Promise<ApRow> => {
  const [r] = await q<ApRow>(`SELECT id, status::text AS status, channel, source, "assignMode", kind, "staffId", "startAt", "endAt", "createdAt", "priceSatang", "depositSatang", "depositPaidAt", "cancelReason", "policySnapshot" FROM "Appointment" WHERE id = $1`, [id]);
  if (!r) throw new AssertFail(`ไม่พบนัด ${id}`);
  return r;
};
const countLive = async (staffId: string, ds: string) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "staffId" = $1 AND "startAt" >= $2 AND "startAt" < $3 AND status NOT IN ('CANCELLED','NO_SHOW')`, [staffId, new Date(bkkMs(ds, 0)), new Date(bkkMs(ds, 1440))]))[0].n;
const countTenantAppts = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n;
const rawAp = async (o: { unitId?: string; staffId: string; serviceId: string; ds: string; a: number; z: number; status?: string; channel?: string | null; source?: string; phone?: string; depositSatang?: number; kind?: string }) => {
  const id = rid("ap");
  await insertRow("Appointment", {
    id, tenantId: ids.tA, unitId: o.unitId ?? ids.uMain, staffId: o.staffId, serviceId: o.serviceId, startAt: new Date(bkkMs(o.ds, o.a)), endAt: new Date(bkkMs(o.ds, o.z)),
    status: o.status ?? "CONFIRMED", channel: o.channel ?? null, source: o.source ?? "STAFF", customerName: "นัดดิบ", customerPhone: o.phone ?? "0800000000",
    depositSatang: o.depositSatang ?? 0, kind: o.kind ?? "BOOKED", updatedAt: new Date(),
  });
  return id;
};
const setS = async (changes: { key: string; scope: string; scopeId: string; value: unknown }[]) => {
  const r = await SETTINGS().setSettings(OWNER, { tenantId: ids.tA }, changes);
  ok(r.ok, `setSettings ${fmt(changes.map((c) => `${c.key}@${c.scope}=${fmt(c.value)}`))}: ${r.code} ${fmt(r.issues)}`);
};
const fs = (ctx: BookingCtx, serviceId: string, staffId: string | null, dateStr: string, channel: BookingChannel) => FIND()(ctx, { serviceId, staffId, dateStr, channel });
const mins = (s: Slot[]) => s.map((x) => x.startMin);
const SNAP_KEYS = ["booking.deposit.method", "booking.deposit.amount", "booking.deposit.payWithinMin", "booking.deposit.forfeitPct", "booking.late.graceMin", "booking.late.afterGrace", "booking.late.noShowAfterMin", "booking.late.freeChangeBeforeMin", "booking.late.selfRescheduleMax", "booking.booking.requireConfirm"];

const goFiles: string[] = [];
const hold: { main: { id: string; createdAt: number } | null } = { main: null };
let setupOk = false;
let tplOk = false;
let fullReason = "";
const D = {
  pf: dd(0), any: dd(1), z: dd(2), s: dd(3), s2: dd(4), m: dd(5), m2: dd(6), k: dd(7), qs: dd(8), p: dd(9), p2: dd(10),
  h: dd(11), h2: dd(12), h3: dd(13), col: dd(14), b: dd(15), idem: dd(16), skill: dd(17), cap: dd(18), dep: dd(19),
  h6: dd(20), h7: dd(21), h7r: dd(22), h8: dd(23), // ORACLE-EDIT 28 ต.ค. (review)
};
console.log(`\n(วันนี้ไทย ${TODAY} · วันทดสอบ ${D.pf} … ${D.dep})`);

try {
  const stale = (await q<{ id: string }>(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`])).map((r) => r.id);
  if (stale.length) { console.log(`(กวาด tenant ค้างจากรอบก่อน ${stale.length} ร้าน)`); await cleanup(stale); }
  await cleanupUsers();

  // ── สร้างข้อมูล ──
  try {
    tenantIds.push(ids.tA, ids.tB);
    await insertRow("Tenant", { id: ids.tA, name: "QC B3 ร้าน A", slug: `${SLUG}a-${RUN}`, updatedAt: new Date() });
    await insertRow("Tenant", { id: ids.tB, name: "QC B3 ร้าน B", slug: `${SLUG}b-${RUN}`, updatedAt: new Date() });
    for (const [id, t, n] of [[ids.uMain, ids.tA, "main"], [ids.u24, ids.tA, "h24"], [ids.uRace, ids.tA, "race"], [ids.uFb, ids.tA, "fb"], [ids.uB, ids.tB, "b"], [ids.uNc, ids.tA, "nc"], [ids.uMem, ids.tA, "mem"]] as const)
      await insertRow("BusinessUnit", { id, tenantId: t, type: "BOOKING", name: `สาขา ${n}`, slug: `b3-${n}-${RUN}`, updatedAt: new Date() });
    for (const [u, t, open, close] of [[ids.uMain, ids.tA, 600, 1200], [ids.uRace, ids.tA, 600, 1200], [ids.uFb, ids.tA, 600, 1200], [ids.uB, ids.tB, 600, 1200], [ids.u24, ids.tA, 0, 1440], [ids.uNc, ids.tA, 600, 1200], [ids.uMem, ids.tA, 600, 1200]] as const)
      for (let w = 0; w < 7; w++) await insertRow("BookingHours", { id: rid("bh"), tenantId: t, unitId: u, weekday: w, openMin: open, closeMin: close, closed: false, updatedAt: new Date() });
    const svc = async (id: string, t: string, u: string, name: string, durationMin: number, priceSatang: number, bufferMin: number, o: { depositSatang?: number; bookable?: boolean } = {}) =>
      insertRow("BookingService", { id, tenantId: t, unitId: u, name, durationMin, priceSatang, bufferMin, depositSatang: o.depositSatang ?? 0, bookable: o.bookable ?? true, sortOrder: 0, updatedAt: new Date() });
    await svc(ids.S60, ids.tA, ids.uMain, "ตัดผมชาย", 60, 30000, 0);
    await svc(ids.S30, ids.tA, ids.uMain, "สระไดร์", 30, 15000, 5);
    await svc(ids.S90, ids.tA, ids.uMain, "ทำสี", 90, 50000, 0);
    await svc(ids.SNB, ids.tA, ids.uMain, "ค่าห่อของขวัญ", 30, 5000, 0, { bookable: false });
    await svc(ids.T60, ids.tA, ids.u24, "ตัดผม 24", 60, 30000, 0);
    await svc(ids.T30, ids.tA, ids.u24, "สระ 24", 30, 15000, 5);
    await svc(ids.R60, ids.tA, ids.uRace, "ตัดผมแข่ง", 60, 30000, 0);
    await svc(ids.R30, ids.tA, ids.uRace, "สระแข่ง", 30, 15000, 5);
    await svc(ids.F60, ids.tA, ids.uFb, "ตัดผมร้านเดิม", 60, 30000, 0, { depositSatang: 5000 });
    await svc(ids.B60, ids.tB, ids.uB, "ตัดผมร้าน B", 60, 30000, 0);
    await svc(ids.N60, ids.tA, ids.uNc, "ตัดผม ไม่จำกัดเบอร์", 60, 30000, 0);
    await svc(ids.M60, ids.tA, ids.uMem, "ตัดผม สาขาสมาชิก", 60, 30000, 0);
    let ord = 0;
    const staff = async (id: string, t: string, u: string, name: string, sortOrder: number) =>
      insertRow("BookingStaff", { id, tenantId: t, unitId: u, name, sortOrder, createdAt: new Date(Date.now() - 120_000 + ++ord * 1000), updatedAt: new Date() });
    await staff(ids.stZ, ids.tA, ids.uMain, "ช่างแจ๊ค (0%)", 0);
    await staff(ids.stA, ids.tA, ids.uMain, "ช่างเอ", 1);
    await staff(ids.stB, ids.tA, ids.uMain, "ช่างบี (อาวุโส)", 2);
    await staff(ids.stC, ids.tA, ids.uMain, "ช่างซี (พาร์ทไทม์)", 3);
    await staff(ids.stQ, ids.tA, ids.uMain, "ช่างคิว (สระอย่างเดียว)", 4);
    await staff(ids.stS, ids.tA, ids.uMain, "ช่างเอส (20%)", 5);
    await staff(ids.stM, ids.tA, ids.uMain, "ช่างเอ็ม (2 งาน/วัน)", 6);
    await staff(ids.stK, ids.tA, ids.uMain, "ช่างเค (พัก 15)", 7);
    await staff(ids.s24, ids.tA, ids.u24, "ช่าง 24 ชม.", 1);
    for (const [i, id] of [ids.r1, ids.r2, ids.r3, ids.rCap, ids.rCtl].entries()) await staff(id, ids.tA, ids.uRace, `ช่างแข่ง ${i + 1}`, i + 1);
    await staff(ids.f1, ids.tA, ids.uFb, "ช่างร้านเดิม", 1);
    await staff(ids.b1, ids.tB, ids.uB, "ช่างร้าน B", 1);
    await staff(ids.n1, ids.tA, ids.uNc, "ช่างเอ็น 1", 1);
    await staff(ids.n2, ids.tA, ids.uNc, "ช่างเอ็น 2", 2);
    for (const [i, id] of MEM_STAFF.entries()) await staff(id, ids.tA, ids.uMem, `ช่างสมาชิก ${i + 1}`, i + 1);
    // สาขา uMem เชื่อมระบบสมาชิก (ทางลูกค้าใหม่ member.findOrCreate + Party)
    await insertRow("AppSystem", { id: ids.memSys, tenantId: ids.tA, type: "MEMBER", name: "สมาชิก QC B3", updatedAt: new Date() });
    await insertRow("AppSystemUnit", { id: rid("asu"), tenantId: ids.tA, systemId: ids.memSys, unitId: ids.uMem, type: "MEMBER" });
    for (let w = 0; w < 7; w++) await insertRow("BookingStaffHours", { id: rid("sh"), tenantId: ids.tA, unitId: ids.uMain, staffId: ids.stC, weekday: w, startMin: 780, endMin: 1200 });
    const ss = async (staffId: string, serviceId: string, durationMin: number | null, priceSatang: number | null) =>
      insertRow("BookingStaffService", { id: rid("ss"), tenantId: ids.tA, unitId: ids.uMain, staffId, serviceId, durationMin, priceSatang, updatedAt: new Date() });
    await ss(ids.stB, ids.S60, 75, 35000);
    await ss(ids.stB, ids.S30, null, null);
    await ss(ids.stB, ids.S90, null, 40000);
    await ss(ids.stQ, ids.S30, null, null);
    await insertRow("User", { id: ids.owner, email: `${USER_MAIL}owner-${RUN}@qc.invalid`, name: "QC B3 owner", updatedAt: new Date() });
    await insertRow("Membership", { id: rid("mb"), userId: ids.owner, tenantId: ids.tA, role: "OWNER", unitAccess: JSON.stringify(["*"]), permissions: "{}", acceptedAt: new Date(), updatedAt: new Date() });
    setupOk = true;
  } catch (e) {
    console.log(`  ❌ สร้างข้อมูลทดสอบไม่สำเร็จ: ${errMsg(e)}`);
  }
  const need = () => ok(setupOk, "สร้างข้อมูลทดสอบไม่สำเร็จ (ดูบรรทัดบน)");

  console.log("\n── ตั้งแม่แบบ/ค่าตั้ง ──");
  await st("T-0", "applyTemplate BARBER (uMain · u24 · uRace) + ทับรายช่าง/รายบริการ (0% · 20% · 2 งาน · พัก 15 · S30 ร้านยืนยันก่อน)", async () => {
    need();
    for (const u of [ids.uMain, ids.u24, ids.uRace, ids.uNc, ids.uMem]) {
      const a = await SETTINGS().applyTemplate(OWNER, { tenantId: ids.tA }, { unitId: u, domain: "booking", templateKey: "BARBER", overwrite: "RESET_ALL" });
      ok(a.ok, `applyTemplate ${u}: ${a.code} ${fmt(a.issues)}`);
    }
    await setS([
      { key: "booking.booking.onlineSharePct", scope: "STAFF", scopeId: ids.stZ, value: 0 },
      { key: "booking.booking.onlineSharePct", scope: "STAFF", scopeId: ids.stS, value: 20 },
      { key: "booking.staff.maxJobsPerDay", scope: "STAFF", scopeId: ids.stM, value: 2 },
      { key: "booking.staff.minBreakMin", scope: "STAFF", scopeId: ids.stK, value: 15 },
      { key: "booking.booking.requireConfirm", scope: "SERVICE", scopeId: ids.S30, value: true },
      { key: "booking.booking.onlineSharePct", scope: "STAFF", scopeId: ids.rCap, value: 20 },
      { key: "booking.booking.maxOpenPerPhone", scope: "UNIT", scopeId: ids.uNc, value: null }, // ORACLE-EDIT 28 ต.ค. (review)
    ]);
    tplOk = true;
  });
  const needTpl = () => { need(); ok(tplOk, "ตั้งแม่แบบ/ค่าตั้งไม่สำเร็จ (T-0)"); };

  // ═══════════════ PS ═══════════════
  console.log("\n── PS: resolve จริง → planSettingsFrom ──");
  await st("PS-1", "resolveSettings(PLAN_SETTING_KEYS) ของ uMain (BARBER) และ uFb (ยังไม่เลือกแม่แบบ) → planSettingsFrom = BARBER / _fallback", async () => {
    needTpl();
    for (const [u, tpl] of [[ids.uMain, "BARBER"], [ids.uFb, "_fallback"]] as const) {
      const r = await SETTINGS().resolveSettings({ tenantId: ids.tA }, [...PSKEYS()], { unitId: u });
      const vals = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.value]));
      eq(PSF()(vals), TPL_EXPECT[tpl], tpl);
    }
  }, "MAJOR");

  // ═══════════════ S. findSlots ═══════════════
  console.log("\n── S: findSlots (ใบสั่ง §3.2 ช่องเวลา) ──");
  await st("S-0", "ตัวควบคุม: getAvailableSlots ตัวเดิมบนแม่แบบตัดผม (ช่างเอ ตัดผม 60) = 10:00…19:00 ทุก 15 นาที", async () => {
    needTpl();
    eq(mins(await BK().getAvailableSlots(ids.tA, ids.uMain, ids.S60, ids.stA, D.pf)), range(600, 1140, 15), "ช่อง");
  }, "MAJOR");
  await st("S-1", "ช่อง STAFF = getAvailableSlots ตัวเดิมทุกไบต์ (ช่างเอ/บี/ซี/ใครก็ได้ × ตัดผม 60/สระ 30)", async () => {
    needTpl();
    await rawAp({ staffId: ids.stA, serviceId: ids.S60, ds: D.pf, a: 660, z: 720 });
    for (const sid of [ids.stA, ids.stB, ids.stC, null]) for (const sv of [ids.S60, ids.S30]) {
      const got = await fs(cM, sv, sid, D.pf, "STAFF");
      const want = await BK().getAvailableSlots(ids.tA, ids.uMain, sv, sid, D.pf);
      eq(JSON.stringify(got), JSON.stringify(want), `${sid ?? "any"}/${sv}`);
    }
  });
  await st("S-2", "ONLINE: หน้าต่างรายช่าง (พาร์ทไทม์ 13:00–19:00) · นาทีเฉพาะคน (ช่างบี 75 ⇒ ช่องท้าย 18:45) · ทำไม่ได้ ⇒ [] (ช่างคิว ตัดผม) · บริการ bookable=false ⇒ []", async () => {
    needTpl();
    eq(mins(await fs(cM, ids.S60, ids.stC, D.pf, "ONLINE")), range(780, 1140, 15), "ช่างซี");
    eq(mins(await fs(cM, ids.S60, ids.stB, D.pf, "ONLINE")), range(600, 1125, 15), "ช่างบี 75 นาที");
    eq(await fs(cM, ids.S60, ids.stQ, D.pf, "ONLINE"), [], "ช่างคิว ตัดผม");
    ok((await fs(cM, ids.S30, ids.stQ, D.pf, "ONLINE")).length > 0, "ช่างคิว สระ ต้องมีช่อง");
    eq(await fs(cM, ids.SNB, ids.stA, D.pf, "ONLINE"), [], "SNB ONLINE");
    ok((await fs(cM, ids.SNB, ids.stA, D.pf, "STAFF")).length > 0, "SNB ช่อง STAFF ต้องมี (active เท่านั้น)");
  });
  await st("S-3", "ช่าง 0% ไม่โผล่ออนไลน์ (ระบุตัว = [] · ใครก็ได้ไม่มีช่างแจ๊ค) แต่ช่อง STAFF มี และใครก็ได้ STAFF ได้ช่างแจ๊คก่อน (sortOrder 0)", async () => {
    needTpl();
    eq(await fs(cM, ids.S60, ids.stZ, D.z, "ONLINE"), [], "ช่างแจ๊ค ONLINE");
    eq(await fs(cM, ids.S60, ids.stZ, D.z, "LINE"), [], "ช่างแจ๊ค LINE");
    const any = await fs(cM, ids.S60, null, D.z, "ONLINE");
    ok(any.length > 0 && !any.some((x) => x.staffId === ids.stZ), `ใครก็ได้ ONLINE มีช่างแจ๊คหรือว่าง: ${fmt(any.slice(0, 2))}`);
    eq(any[0].staffId, ids.stA, "ใครก็ได้ ONLINE 10:00");
    eq(mins(await fs(cM, ids.S60, ids.stZ, D.z, "STAFF")), range(600, 1140, 15), "ช่างแจ๊ค STAFF");
    eq((await fs(cM, ids.S60, null, D.z, "STAFF"))[0].staffId, ids.stZ, "ใครก็ได้ STAFF 10:00");
  });
  await st("S-4", "ใครก็ได้ = รวมเวลาของทุกช่างที่ทำได้ · ช่างต่อเวลา = คนแรกตาม sortOrder ที่ว่าง (ONLINE และ STAFF)", async () => {
    needTpl();
    await rawAp({ staffId: ids.stA, serviceId: ids.S60, ds: D.any, a: 600, z: 1200 });
    await rawAp({ staffId: ids.stB, serviceId: ids.S60, ds: D.any, a: 600, z: 840 });
    const order = [ids.stZ, ids.stA, ids.stB, ids.stC, ids.stQ, ids.stS, ids.stM, ids.stK];
    for (const ch of ["ONLINE", "STAFF"] as const) {
      const per = new Map<string, Set<number>>();
      for (const sid of order) per.set(sid, new Set(mins(await fs(cM, ids.S60, sid, D.any, ch))));
      const times = [...new Set([...per.values()].flatMap((s) => [...s]))].sort((a, b) => a - b);
      const want = times.map((t) => ({ startMin: t, hhmm: hhmm(t), staffId: order.find((sid) => per.get(sid)?.has(t)) ?? "" }));
      const got = await fs(cM, ids.S60, null, D.any, ch);
      eq(got.map((x) => [x.startMin, x.staffId]), want.map((x) => [x.startMin, x.staffId]), `ใครก็ได้ ${ch}`);
      eq(got.map((x) => x.hhmm), want.map((x) => x.hhmm), `hhmm ${ch}`);
    }
  });
  await st("S-5", "% ออนไลน์ 20% (เพดาน 120 นาที): แถวรุ่นแรก ONLINE 60 นับ · แถว STAFF ไม่นับ ⇒ ตัดผม 60 ยังได้ · ทำสี 90 ไม่ได้ · วันอื่นไม่กระทบ", async () => {
    needTpl();
    await rawAp({ staffId: ids.stS, serviceId: ids.S60, ds: D.s, a: 600, z: 660, channel: null, source: "ONLINE" });
    await rawAp({ staffId: ids.stS, serviceId: ids.S60, ds: D.s, a: 660, z: 720, channel: "STAFF", source: "STAFF" });
    ok((await fs(cM, ids.S60, ids.stS, D.s, "ONLINE")).length > 0, "ตัดผม 60 ต้องยังมีช่อง (60+60 ≤ 120)");
    eq(await fs(cM, ids.S90, ids.stS, D.s, "ONLINE"), [], "ทำสี 90 (60+90 > 120)");
    ok((await fs(cM, ids.S90, ids.stS, D.s, "STAFF")).length > 0, "ทำสี STAFF ต้องมี");
    ok((await fs(cM, ids.S90, ids.stS, D.s2, "ONLINE")).length > 0, "วันอื่นต้องมีช่อง");
  });
  await st("S-6", "งานสูงสุด 2/วัน: มี 2 งาน ⇒ ONLINE [] (ใครก็ได้ไม่มีช่างเอ็ม) · STAFF มีช่อง · CANCELLED/NO_SHOW ไม่นับ", async () => {
    needTpl();
    await rawAp({ staffId: ids.stM, serviceId: ids.S60, ds: D.m, a: 600, z: 660 });
    await rawAp({ staffId: ids.stM, serviceId: ids.S60, ds: D.m, a: 660, z: 720, status: "PENDING" });
    eq(await fs(cM, ids.S60, ids.stM, D.m, "ONLINE"), [], "ช่างเอ็ม ONLINE");
    ok(!(await fs(cM, ids.S60, null, D.m, "ONLINE")).some((x) => x.staffId === ids.stM), "ใครก็ได้มีช่างเอ็ม");
    ok((await fs(cM, ids.S60, ids.stM, D.m, "STAFF")).length > 0, "STAFF ต้องมี");
    await rawAp({ staffId: ids.stM, serviceId: ids.S60, ds: D.m2, a: 600, z: 660 });
    await rawAp({ staffId: ids.stM, serviceId: ids.S60, ds: D.m2, a: 660, z: 720, status: "CANCELLED" });
    await rawAp({ staffId: ids.stM, serviceId: ids.S60, ds: D.m2, a: 720, z: 780, status: "NO_SHOW" });
    ok((await fs(cM, ids.S60, ids.stM, D.m2, "ONLINE")).length > 0, "วันที่มี 1 งาน + ยกเลิก/ไม่มา ต้องมีช่อง");
  });
  await st("S-7", "พักขั้นต่ำ 15 แบบค่ามาก (ONLINE): สระ 30 ต่อจากตัดผม 10–11 ⇒ 11:15 · ก่อนสระ 12:15(buf 5) ถึง 11:30 · หลัง ⇒ 13:00 · STAFF ไม่ใช้พัก", async () => {
    needTpl();
    await rawAp({ staffId: ids.stK, serviceId: ids.S60, ds: D.k, a: 600, z: 660 });
    await rawAp({ staffId: ids.stK, serviceId: ids.S30, ds: D.k, a: 735, z: 770 });
    eq((await fs(cM, ids.S30, ids.stK, D.k, "ONLINE")).map((x) => x.hhmm), [675, 690, ...range(780, 1170, 15)].map(hhmm), "ONLINE");
    eq((await fs(cM, ids.S30, ids.stK, D.k, "STAFF")).map((x) => x.hhmm), [660, 675, 690, ...range(780, 1170, 15)].map(hhmm), "STAFF");
  }, "MAJOR");
  await st("S-8", "สถานะที่ถือช่อง: PENDING/QUEUED/IN_SERVICE/LATE/DONE ถือ · CANCELLED/NO_SHOW ไม่ถือ (carry B.0)", async () => {
    needTpl();
    const sts: [string, number][] = [["PENDING", 600], ["QUEUED", 660], ["IN_SERVICE", 720], ["LATE", 780], ["DONE", 840], ["CANCELLED", 900], ["NO_SHOW", 960]];
    for (const [s, a] of sts) await rawAp({ staffId: ids.stA, serviceId: ids.S60, ds: D.qs, a, z: a + 60, status: s });
    for (const ch of ["ONLINE", "STAFF"] as const) eq(mins(await fs(cM, ids.S60, ids.stA, D.qs, ch)), range(900, 1140, 15), ch);
  });
  await st("S-9", "lead 60 (ONLINE): ช่องแรก (วันนี้/พรุ่งนี้ ร้าน 24 ชม.) ≥ now+60 และ < now+60+15 · STAFF ช่องแรก ≤ now+15 · lead รายบริการ 0 (สระ) ⇒ ช่องแรก ≤ now+15", async () => {
    needTpl();
    const tom = addDays(TODAY, 1);
    const first = async (sv: string, ch: BookingChannel) => {
      const all = [...(await fs(c24, sv, ids.s24, TODAY, ch)).map((x) => bkkMs(TODAY, x.startMin)), ...(await fs(c24, sv, ids.s24, tom, ch)).map((x) => bkkMs(tom, x.startMin))];
      return Math.min(...all);
    };
    const t0 = Date.now();
    const on = await first(ids.T60, "ONLINE");
    const stf = await first(ids.T60, "STAFF");
    const t1 = Date.now();
    ok(on >= t0 + 60 * 60_000 && on < t1 + 75 * 60_000, `ONLINE ช่องแรก ${new Date(on).toISOString()} (now ${new Date(t0).toISOString()})`);
    ok(stf > t0 && stf <= t1 + 15 * 60_000, `STAFF ช่องแรก ${new Date(stf).toISOString()}`);
    await setS([{ key: "booking.booking.minLeadMin", scope: "SERVICE", scopeId: ids.T30, value: 0 }]);
    const u0 = Date.now();
    const s30 = await first(ids.T30, "ONLINE");
    const u1 = Date.now();
    ok(s30 >= u0 && s30 <= u1 + 15 * 60_000, `สระ lead 0 ช่องแรก ${new Date(s30).toISOString()}`);
    ok((await first(ids.T60, "ONLINE")) >= u0 + 60 * 60_000, "ตัดผม (lead สาขา 60) ต้องไม่เปลี่ยน");
  });
  await st("S-10", "คอลัมน์ชนะค่าตั้ง: ตั้ง service.cleanupMin 30 + onlineBookable false ที่ตัดผม 60 ⇒ ช่อง ONLINE ไม่เปลี่ยน (ใช้ bufferMin/bookable ของแถว)", async () => {
    needTpl();
    const before = await fs(cM, ids.S60, ids.stA, D.col, "ONLINE");
    ok(before.length > 0, "ก่อนตั้งต้องมีช่อง");
    await setS([
      { key: "booking.service.cleanupMin", scope: "SERVICE", scopeId: ids.S60, value: 30 },
      { key: "booking.service.onlineBookable", scope: "SERVICE", scopeId: ids.S60, value: false },
    ]);
    eq(await fs(cM, ids.S60, ids.stA, D.col, "ONLINE"), before, "หลังตั้ง");
  }, "MAJOR");
  await st("S-11", "X1: บริการ/ช่างร้านอื่น · สาขาอื่น ⇒ [] · วันที่ไม่จริง ⇒ []", async () => {
    needTpl();
    eq(await fs(cB, ids.S60, null, D.pf, "STAFF"), [], "ctx ร้าน B + บริการร้าน A");
    eq(await fs(cM, ids.B60, ids.b1, D.pf, "STAFF"), [], "ctx A + บริการ/ช่างร้าน B");
    eq(await fs(cM, ids.S60, ids.s24, D.pf, "STAFF"), [], "ช่างสาขา u24 ใน ctx uMain");
    eq(await fs(cM, ids.T60, null, D.pf, "STAFF"), [], "บริการสาขา u24 ใน ctx uMain");
    eq(await fs(cM, ids.S60, ids.stA, "2031-02-30", "STAFF"), [], "2031-02-30");
  });

  // ═══════════════ B. bookAppointment ═══════════════
  console.log("\n── B: bookAppointment (ใบสั่ง §3.2) ──");
  await st("B-1", "ONLINE สำเร็จ: CONFIRMED · channel/source/assignMode/kind · ราคา · มัดจำ 0 (60 นาที < 90) · holdUntil null · snapshot 10 คีย์ · ช่องที่ทับ ⇒ FULL", async () => {
    needTpl();
    const r = okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.b, startMin: 600, channel: "ONLINE" })), "จอง");
    eq([r.staffId, r.status, r.holdUntil], [ids.stA, "CONFIRMED", null], "ผล");
    const a = await apRow(r.id);
    eq([a.status, a.channel, a.source, a.assignMode, a.kind, a.priceSatang, a.depositSatang, a.endAt.getTime() - a.startAt.getTime(), a.startAt.getTime()],
      ["CONFIRMED", "ONLINE", "ONLINE", "SPECIFIC", "BOOKED", 30000, 0, 60 * 60_000, bkkMs(D.b, 600)], "แถว");
    ok(!!a.policySnapshot && a.policySnapshot.domain === "booking", `policySnapshot ${fmt(a.policySnapshot)}`);
    eq(Object.keys(a.policySnapshot?.values ?? {}).sort(), [...SNAP_KEYS].sort(), "คีย์ snapshot");
    eq(a.policySnapshot?.template?.key, "BARBER", "แม่แบบใน snapshot");
    fullReason = failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.b, startMin: 630, channel: "ONLINE" })), "FULL", "ทับ 10:30");
    eq(await countLive(ids.stA, D.b), 1, "นัดของวัน");
  });
  await st("B-2", "ร้านจองให้ (STAFF/PHONE): CONFIRMED · นอกหน้าต่างได้ (พาร์ทไทม์ 10:00) · นอกกริด 10:10 ได้ · ONLINE เดียวกัน ⇒ OUTSIDE_HOURS / OFF_GRID · source STAFF", async () => {
    needTpl();
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stC, dateStr: D.b, startMin: 600, channel: "ONLINE" })), "OUTSIDE_HOURS", "ONLINE พาร์ทไทม์ 10:00");
    const r = okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stC, dateStr: D.b, startMin: 600, channel: "STAFF" })), "STAFF พาร์ทไทม์");
    const a = await apRow(r.id);
    eq([r.status, a.channel, a.source, a.assignMode], ["CONFIRMED", "STAFF", "STAFF", "SPECIFIC"], "แถว STAFF");
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stB, dateStr: D.b, startMin: 610, channel: "ONLINE" })), "OFF_GRID", "ONLINE 10:10");
    const p = okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stB, dateStr: D.b, startMin: 610, channel: "PHONE" })), "PHONE 10:10");
    eq((await apRow(p.id)).channel, "PHONE", "channel PHONE");
  });
  await st("B-3", "PAST (ทุกช่อง) · ทำบริการไม่ได้ ⇒ NOT_QUALIFIED · bookable=false ONLINE ⇒ NOT_FOUND (STAFF ได้) · ราคา/นาทีเฉพาะคน (ช่างบี 75 นาที ฿350)", async () => {
    needTpl();
    const y = addDays(TODAY, -1);
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: y, startMin: 600, channel: "STAFF" })), "PAST", "STAFF เมื่อวาน");
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: y, startMin: 600, channel: "ONLINE" })), "PAST", "ONLINE เมื่อวาน");
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stQ, dateStr: D.skill, startMin: 600, channel: "STAFF" })), "NOT_QUALIFIED", "ช่างคิว ตัดผม");
    failCode(await BOOK()(cM, bk({ serviceId: ids.SNB, staffId: ids.stA, dateStr: D.skill, startMin: 600, channel: "ONLINE" })), "NOT_FOUND", "SNB ONLINE");
    okBook(await BOOK()(cM, bk({ serviceId: ids.SNB, staffId: ids.stA, dateStr: D.skill, startMin: 600, channel: "STAFF" })), "SNB STAFF");
    const r = okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stB, dateStr: D.skill, startMin: 600, channel: "ONLINE" })), "ช่างบี");
    const a = await apRow(r.id);
    eq([a.priceSatang, a.endAt.getTime() - a.startAt.getTime()], [35000, 75 * 60_000], "ราคา/นาทีเฉพาะคน");
  });
  // ORACLE-EDIT 28 ต.ค. (review): เดิมจอง ONLINE ตัดผม 60 ที่ now+75 — ช่วง 22:00–22:30 ไทย ช่องนั้นเลยเที่ยงคืน (t+60 > 24:00) ⇒ OUTSIDE_HOURS ปลอม · ข้อที่ผ่าน lead ใช้วันพรุ่งนี้ 12:00 (S-9 ตรวจขอบ lead แล้ว)
  await st("B-4", "lead/horizon (ร้าน 24 ชม.): ONLINE now+20 ⇒ LEAD_TIME · พรุ่งนี้ 12:00 ได้ · STAFF now+20 ได้ · horizon 3 ⇒ วันนี้+3 BEYOND_HORIZON · +2 ได้ · STAFF +3 ได้", async () => {
    needTpl();
    const s20 = soonSlot(20);
    failCode(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: ids.s24, ...s20, channel: "ONLINE" })), "LEAD_TIME", `ONLINE ${s20.dateStr} ${hhmm(s20.startMin)}`);
    okBook(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: ids.s24, dateStr: addDays(TODAY, 1), startMin: 720, channel: "ONLINE" })), "ONLINE พรุ่งนี้ 12:00");
    okBook(await BOOK()(c24, bk({ serviceId: ids.T30, staffId: ids.s24, ...s20, channel: "STAFF" })), "STAFF now+20");
    await setS([{ key: "booking.booking.horizonDays", scope: "UNIT", scopeId: ids.u24, value: 3 }]);
    failCode(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: ids.s24, dateStr: addDays(TODAY, 3), startMin: 600, channel: "ONLINE" })), "BEYOND_HORIZON", "ONLINE +3");
    eq(await fs(c24, ids.T60, ids.s24, addDays(TODAY, 3), "ONLINE"), [], "findSlots ONLINE +3");
    ok((await fs(c24, ids.T60, ids.s24, addDays(TODAY, 2), "ONLINE")).length > 0, "findSlots ONLINE +2 ต้องมี");
    okBook(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: ids.s24, dateStr: addDays(TODAY, 2), startMin: 600, channel: "ONLINE" })), "ONLINE +2");
    okBook(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: ids.s24, dateStr: addDays(TODAY, 3), startMin: 600, channel: "STAFF" })), "STAFF +3");
  });
  await st("B-5", "ช่องทุก 30 (u24): findSlots ONLINE/STAFF ทุกเวลาหาร 30 ลงตัว · ONLINE 10:15 ⇒ OFF_GRID · STAFF 10:15 ได้", async () => {
    needTpl();
    await setS([{ key: "booking.booking.slotStepMin", scope: "UNIT", scopeId: ids.u24, value: 30 }]);
    const d2 = addDays(TODAY, 2);
    for (const ch of ["ONLINE", "STAFF"] as const) {
      const s = await fs(c24, ids.T30, ids.s24, d2, ch);
      ok(s.length > 20 && s.every((x) => x.startMin % 30 === 0), `${ch}: ${fmt(mins(s).slice(0, 6))}`);
      ok(mins(s).includes(780), `${ch} ต้องมี 13:00`);
    }
    failCode(await BOOK()(c24, bk({ serviceId: ids.T30, staffId: ids.s24, dateStr: d2, startMin: 615, channel: "ONLINE" })), "OFF_GRID", "ONLINE 10:15");
    okBook(await BOOK()(c24, bk({ serviceId: ids.T30, staffId: ids.s24, dateStr: d2, startMin: 1095, channel: "STAFF" })), "STAFF 18:15");
  }, "MAJOR");
  await st("B-6", "ร้านยืนยันก่อน: รายบริการ (สระ ⇒ PENDING · ตัดผม CONFIRMED) · ระดับสาขา (u24) ONLINE PENDING / STAFF CONFIRMED · PENDING ถือช่อง", async () => {
    needTpl();
    const a = okBook(await BOOK()(cM, bk({ serviceId: ids.S30, staffId: ids.stA, dateStr: D.dep, startMin: 600, channel: "ONLINE" })), "สระ ONLINE");
    eq([a.status, a.holdUntil], ["PENDING", null], "สระ (ไม่มีมัดจำ)");
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.dep, startMin: 600, channel: "ONLINE" })), "FULL", "ทับ PENDING");
    eq(okBook(await BOOK()(cM, bk({ serviceId: ids.S30, staffId: ids.stB, dateStr: D.dep, startMin: 600, channel: "STAFF" })), "สระ STAFF").status, "CONFIRMED", "สระ STAFF");
    eq(okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.dep, startMin: 720, channel: "ONLINE" })), "ตัดผม").status, "CONFIRMED", "ตัดผม ONLINE");
    await setS([{ key: "booking.booking.requireConfirm", scope: "UNIT", scopeId: ids.u24, value: true }]);
    const d2 = addDays(TODAY, 2);
    eq(okBook(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: ids.s24, dateStr: d2, startMin: 720, channel: "ONLINE" })), "u24 ONLINE").status, "PENDING", "u24 ONLINE");
    eq(okBook(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: ids.s24, dateStr: d2, startMin: 840, channel: "STAFF" })), "u24 STAFF").status, "CONFIRMED", "u24 STAFF");
  });
  await st("B-7", "เพดานนัดค้าง 2/เบอร์: เบอร์รูปต่างกัน (ขีด/+66) นับเป็นเบอร์เดียว · นัดที่ร้านลงนับด้วย · ครั้งที่ 3 ONLINE ⇒ PHONE_LIMIT · STAFF ได้ · สาขาอื่นไม่นับ · ยกเลิก 1 ⇒ จองได้ · นัดในอดีตไม่นับ", async () => {
    needTpl();
    const P = "0891112233";
    const r1 = okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.p, startMin: 600, channel: "ONLINE", customerPhone: P })), "ONLINE 1");
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stB, dateStr: D.p, startMin: 600, channel: "STAFF", customerPhone: "089-111-2233" })), "STAFF 2");
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.p, startMin: 720, channel: "ONLINE", customerPhone: "+66891112233" })), "PHONE_LIMIT", "ONLINE 3 (+66)");
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.p, startMin: 720, channel: "LINE", customerPhone: "089 111 2233" })), "PHONE_LIMIT", "LINE 3");
    okBook(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: ids.s24, dateStr: addDays(TODAY, 2), startMin: 1020, channel: "ONLINE", customerPhone: P })), "สาขาอื่น");
    await q(`UPDATE "Appointment" SET status = 'CANCELLED' WHERE id = $1`, [r1.id]);
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.p, startMin: 720, channel: "ONLINE", customerPhone: P })), "หลังยกเลิก 1");
    const Q = "0897776655";
    const yd = addDays(TODAY, -2);
    await rawAp({ staffId: ids.stC, serviceId: ids.S60, ds: yd, a: 800, z: 860, phone: Q });
    await rawAp({ staffId: ids.stC, serviceId: ids.S60, ds: yd, a: 900, z: 960, phone: Q });
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.p2, startMin: 600, channel: "ONLINE", customerPhone: Q })), "อดีตไม่นับ");
  });
  await st("B-8", "% ออนไลน์เต็ม ⇒ \"เต็ม\" แต่พนักงานยังจองได้: 20% (120) · รุ่นแรก 60 + LINE 60 ⇒ ONLINE ถัดไป FULL (reason = ช่องทับ) · STAFF ได้ · findSlots ONLINE [] · วันอื่นยังได้", async () => {
    needTpl();
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stS, dateStr: D.s, startMin: 780, channel: "LINE" })), "LINE 13:00 (ใช้ถึง 120)");
    eq((await apRow((await q<{ id: string }>(`SELECT id FROM "Appointment" WHERE "staffId" = $1 AND "startAt" = $2`, [ids.stS, new Date(bkkMs(D.s, 780))]))[0].id)).channel, "LINE", "channel LINE");
    const why = failCode(await BOOK()(cM, bk({ serviceId: ids.S30, staffId: ids.stS, dateStr: D.s, startMin: 900, channel: "ONLINE" })), "FULL", "ONLINE สระ 15:00");
    ok(!!fullReason, "ไม่มี reason ของช่องทับ (B-1)");
    eq(why, fullReason, "ข้อความ \"เต็ม\" ต้องเดียวกับช่องทับ (ไม่บอกว่ากันไว้)");
    eq(await fs(cM, ids.S60, ids.stS, D.s, "ONLINE"), [], "findSlots ตัดผม ONLINE");
    eq(await fs(cM, ids.S30, ids.stS, D.s, "ONLINE"), [], "findSlots สระ ONLINE");
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stS, dateStr: D.s, startMin: 900, channel: "STAFF" })), "STAFF 15:00");
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stS, dateStr: D.s2, startMin: 600, channel: "ONLINE" })), "วันอื่น ONLINE");
  });
  await st("B-9", "ช่าง 0% ONLINE ⇒ FULL (ข้อความเดียวกับช่องทับ) · STAFF ได้ · งานสูงสุดครบ ONLINE ⇒ FULL · STAFF ได้", async () => {
    needTpl();
    eq(failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stZ, dateStr: D.z, startMin: 600, channel: "ONLINE" })), "FULL", "0% ONLINE"), fullReason, "ข้อความ 0%");
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stZ, dateStr: D.z, startMin: 600, channel: "STAFF" })), "0% STAFF");
    eq(failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stM, dateStr: D.m, startMin: 900, channel: "ONLINE" })), "FULL", "maxJobs ONLINE"), fullReason, "ข้อความงานสูงสุด");
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stM, dateStr: D.m, startMin: 900, channel: "STAFF" })), "maxJobs STAFF");
  });
  await st("B-10", "ใครก็ได้: assignMode ANY · ได้ช่างแรกที่ว่าง (ONLINE ข้ามช่างแจ๊ค 0% ⇒ ช่างเอ · ช่างเอไม่ว่าง ⇒ ช่างบี) · STAFF ได้ช่างแจ๊ค", async () => {
    needTpl();
    const ds = D.idem;
    const a = okBook(await BOOK()(cM, bk({ serviceId: ids.S30, staffId: null, dateStr: ds, startMin: 1020, channel: "LINE" })), "ใครก็ได้ 1");
    eq(a.staffId, ids.stA, "คนแรก ONLINE");
    eq((await apRow(a.id)).assignMode, "ANY", "assignMode");
    const b = okBook(await BOOK()(cM, bk({ serviceId: ids.S30, staffId: null, dateStr: ds, startMin: 1020, channel: "ONLINE" })), "ใครก็ได้ 2");
    eq(b.staffId, ids.stB, "คนที่สอง ONLINE");
    eq(okBook(await BOOK()(cM, bk({ serviceId: ids.S30, staffId: null, dateStr: ds, startMin: 1020, channel: "STAFF" })), "ใครก็ได้ STAFF").staffId, ids.stZ, "STAFF ได้ช่างแจ๊ค");
  });
  await st("B-11", "ถือช่องมัดจำ (แม่แบบตัดผม: PROMPTPAY_SLIP · 20% ≥90 นาที · จ่ายใน 15): ทำสี ONLINE ⇒ PENDING มัดจำ 10000 · holdUntil = createdAt+15 · ช่องถูกถือ · STAFF ช่างบี ⇒ CONFIRMED มัดจำ 8000 (ราคาเฉพาะคน) ไม่ถือ", async () => {
    needTpl();
    const r = okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: ids.stA, dateStr: D.h, startMin: 600, channel: "ONLINE" })), "ทำสี ONLINE");
    const a = await apRow(r.id);
    eq([r.status, a.status, a.depositSatang, a.priceSatang, a.depositPaidAt], ["PENDING", "PENDING", 10000, 50000, null], "แถวถือช่อง");
    ok(r.holdUntil instanceof Date, `holdUntil ไม่ใช่ Date: ${fmt(r.holdUntil)}`);
    eq(r.holdUntil?.getTime(), a.createdAt.getTime() + 15 * 60_000, "holdUntil");
    eq([a.policySnapshot?.values?.["booking.deposit.payWithinMin"], a.policySnapshot?.values?.["booking.deposit.method"]], [15, "PROMPTPAY_SLIP"], "snapshot มัดจำ");
    ok(!mins(await fs(cM, ids.S60, ids.stA, D.h, "ONLINE")).includes(600), "ช่อง 10:00 ยังโผล่");
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.h, startMin: 630, channel: "ONLINE" })), "FULL", "ทับช่องถือ");
    const s = okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: ids.stB, dateStr: D.h, startMin: 600, channel: "STAFF" })), "ทำสี STAFF ช่างบี");
    const b = await apRow(s.id);
    eq([s.status, s.holdUntil, b.depositSatang, b.priceSatang], ["CONFIRMED", null, 8000, 40000], "STAFF");
    hold.main = { id: r.id, createdAt: a.createdAt.getTime() };
  });
  await st("B-12", "ร้านเดิม (_fallback): ONLINE CONFIRMED · มัดจำเคาน์เตอร์ 5000 ไม่ถือช่อง · snapshot _fallback · horizon 14 ⇒ วันนี้+20 BEYOND_HORIZON · STAFF ได้", async () => {
    needTpl();
    const r = okBook(await BOOK()(cF, bk({ serviceId: ids.F60, staffId: ids.f1, dateStr: D.z, startMin: 600, channel: "ONLINE" })), "ONLINE");
    const a = await apRow(r.id);
    eq([r.status, r.holdUntil, a.depositSatang, a.policySnapshot?.template?.key, a.policySnapshot?.values?.["booking.deposit.method"]], ["CONFIRMED", null, 5000, "_fallback", "NONE"], "แถว");
    failCode(await BOOK()(cF, bk({ serviceId: ids.F60, staffId: ids.f1, dateStr: addDays(TODAY, 20), startMin: 600, channel: "ONLINE" })), "BEYOND_HORIZON", "+20");
    okBook(await BOOK()(cF, bk({ serviceId: ids.F60, staffId: ids.f1, dateStr: addDays(TODAY, 20), startMin: 600, channel: "STAFF" })), "STAFF +20");
  });
  await st("B-13", "idempotency: key เดิม 2 ครั้ง ⇒ id เดิม แถวเดียว", async () => {
    needTpl();
    const key = rid("k");
    const i = bk({ serviceId: ids.S60, staffId: ids.stC, dateStr: D.idem, startMin: 840, channel: "ONLINE", idempotencyKey: key });
    const a = okBook(await BOOK()(cM, i), "ครั้ง 1");
    const b = okBook(await BOOK()(cM, i), "ครั้ง 2");
    eq(b.id, a.id, "id");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [ids.tA, key]))[0].n, 1, "แถว");
  }, "MAJOR");
  await st("B-14", "ใครก็ได้ปิด (u24): ONLINE null ⇒ ANY_DISABLED + findSlots [] · ระบุตัวได้ · STAFF ใครก็ได้ได้", async () => {
    needTpl();
    await setS([{ key: "booking.booking.anyStaffOption", scope: "UNIT", scopeId: ids.u24, value: false }]);
    const d2 = addDays(TODAY, 2);
    failCode(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: null, dateStr: d2, startMin: 1140, channel: "ONLINE" })), "ANY_DISABLED", "ONLINE ใครก็ได้");
    eq(await fs(c24, ids.T60, null, d2, "ONLINE"), [], "findSlots ONLINE ใครก็ได้");
    ok((await fs(c24, ids.T60, ids.s24, d2, "ONLINE")).length > 0, "ระบุตัวต้องมีช่อง");
    okBook(await BOOK()(c24, bk({ serviceId: ids.T60, staffId: null, dateStr: d2, startMin: 1260, channel: "STAFF" })), "STAFF ใครก็ได้");
  }, "MAJOR");
  await st("B-15", "X1: ช่าง/บริการร้านอื่น/สาขาอื่น ⇒ NOT_FOUND ไม่สร้างแถว", async () => {
    needTpl();
    const before = await countTenantAppts();
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.b1, dateStr: D.skill, startMin: 1080, channel: "STAFF" })), "NOT_FOUND", "ช่างร้าน B");
    failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.s24, dateStr: D.skill, startMin: 1080, channel: "STAFF" })), "NOT_FOUND", "ช่างสาขา u24");
    failCode(await BOOK()(cM, bk({ serviceId: ids.B60, staffId: ids.stA, dateStr: D.skill, startMin: 1080, channel: "STAFF" })), "NOT_FOUND", "บริการร้าน B");
    failCode(await BOOK()(cB, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.skill, startMin: 1080, channel: "STAFF" })), "NOT_FOUND", "ctx ร้าน B");
    eq(await countTenantAppts(), before, "จำนวนนัด");
  });

  // ORACLE-EDIT 28 ต.ค. (review) G1 G6: key เดิมแต่ข้อมูลจองต่าง ⇒ BAD_INPUT · key ของสาขาอื่น ⇒ BAD_INPUT · เบอร์ที่เหลือแค่ "0"/ว่าง ⇒ BAD_INPUT
  await st("B-16", "idempotencyKey เดิม + ข้อมูลต่าง (ช่าง/เวลา/บริการ/เบอร์) ⇒ BAD_INPUT · key เดิมที่สาขาอื่น ⇒ BAD_INPUT · ข้อมูลเดิม ⇒ id เดิม (ตัวควบคุม) · แถวเดียว · เบอร์ +66/ว่าง ⇒ BAD_INPUT", async () => {
    needTpl();
    const key = rid("k16");
    const base = bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.col, startMin: 600, channel: "ONLINE", idempotencyKey: key, customerPhone: "0815551616" });
    const a = okBook(await BOOK()(cM, base), "ครั้งแรก");
    failCode(await BOOK()(cM, { ...base, staffId: ids.stB }), "BAD_INPUT", "ช่างต่าง");
    failCode(await BOOK()(cM, { ...base, startMin: 720 }), "BAD_INPUT", "เวลาต่าง");
    failCode(await BOOK()(cM, { ...base, dateStr: D.skill }), "BAD_INPUT", "วันต่าง");
    failCode(await BOOK()(cM, { ...base, serviceId: ids.S30 }), "BAD_INPUT", "บริการต่าง");
    failCode(await BOOK()(cM, { ...base, customerPhone: "0815559999" }), "BAD_INPUT", "เบอร์ต่าง");
    failCode(await BOOK()(c24, { ...base, serviceId: ids.T60, staffId: ids.s24, dateStr: addDays(TODAY, 2), startMin: 1200 }), "BAD_INPUT", "สาขาอื่น");
    eq(okBook(await BOOK()(cM, base), "ข้อมูลเดิม").id, a.id, "id ข้อมูลเดิม");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [ids.tA, key]))[0].n, 1, "แถว");
    for (const ph of ["+66", "66", "0066", "  "]) failCode(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stB, dateStr: D.col, startMin: 900, channel: "ONLINE", customerPhone: ph })), "BAD_INPUT", `เบอร์ "${ph}"`);
    eq(await countLive(ids.stB, D.col), 0, "ไม่มีแถวจากเบอร์ผิด");
  });

  // ═══════════════ H. ปล่อยช่องที่ไม่จ่ายมัดจำ ═══════════════
  console.log("\n── H: expireDepositHolds (ใบสั่ง §3.3) ──");
  const needHold = () => { needTpl(); ok(!!hold.main, "ไม่มีนัดถือช่องจาก B-11"); return hold.main as { id: string; createdAt: number }; };
  await st("H-1", "ยังไม่ครบ 15 นาที (now = createdAt+14) ⇒ ยัง PENDING", async () => {
    const h = needHold();
    await EXPIRE()(new Date(h.createdAt + 14 * 60_000));
    eq((await apRow(h.id)).status, "PENDING", "สถานะ");
  });
  await st("H-2", "ครบแล้ว (createdAt+16 · ตั้ง payWithinMin สาขาเป็น 60 ก่อน — snapshot ชนะ) ⇒ CANCELLED + DEPOSIT_TIMEOUT · ช่อง 10:00 กลับมา · จองใหม่ได้", async () => {
    const h = needHold();
    await setS([{ key: "booking.deposit.payWithinMin", scope: "UNIT", scopeId: ids.uMain, value: 60 }]);
    await EXPIRE()(new Date(h.createdAt + 16 * 60_000));
    const a = await apRow(h.id);
    eq([a.status, a.cancelReason], ["CANCELLED", "DEPOSIT_TIMEOUT"], "แถว");
    ok(mins(await fs(cM, ids.S60, ids.stA, D.h, "ONLINE")).includes(600), "ช่อง 10:00 ไม่กลับมา");
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.h, startMin: 600, channel: "ONLINE" })), "จองใหม่ 10:00");
    await setS([{ key: "booking.deposit.payWithinMin", scope: "UNIT", scopeId: ids.uMain, value: 15 }]);
  });
  await st("H-3", "ไม่แตะแถวที่ไม่ใช่ hold: จ่ายแล้ว · STAFF ค้างจ่าย · แถวรุ่นแรก PENDING มีมัดจำ · PENDING รอร้านยืนยัน (ไม่มีมัดจำ) — แต่ LINE ถือช่องหมดเวลา ⇒ ปล่อย", async () => {
    needTpl();
    const paid = okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: ids.stA, dateStr: D.h2, startMin: 600, channel: "ONLINE" })), "ONLINE จ่ายแล้ว");
    await q(`UPDATE "Appointment" SET "depositPaidAt" = now() WHERE id = $1`, [paid.id]);
    const stf = okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: ids.stB, dateStr: D.h2, startMin: 600, channel: "STAFF" })), "STAFF");
    const legacy = await rawAp({ staffId: ids.stC, serviceId: ids.S90, ds: D.h2, a: 840, z: 930, status: "PENDING", channel: null, source: "ONLINE", depositSatang: 5000 });
    const conf = okBook(await BOOK()(cM, bk({ serviceId: ids.S30, staffId: ids.stA, dateStr: D.h2, startMin: 780, channel: "ONLINE" })), "รอร้านยืนยัน");
    const line = okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: ids.stB, dateStr: D.h2, startMin: 900, channel: "LINE" })), "LINE ถือช่อง");
    eq([line.status, line.holdUntil instanceof Date], ["PENDING", true], "LINE ถือ");
    const lineRow = await apRow(line.id);
    await EXPIRE()(new Date(lineRow.createdAt.getTime() + 16 * 60_000));
    eq((await apRow(paid.id)).status, "PENDING", "จ่ายแล้ว");
    eq((await apRow(stf.id)).status, "CONFIRMED", "STAFF");
    eq((await apRow(legacy)).status, "PENDING", "แถวรุ่นแรก");
    eq((await apRow(conf.id)).status, "PENDING", "รอร้านยืนยัน");
    eq([(await apRow(line.id)).status, (await apRow(line.id)).cancelReason], ["CANCELLED", "DEPOSIT_TIMEOUT"], "LINE");
  });
  await st("H-4", "X5: ปล่อยซ้อน 2 รอบพร้อมกัน ⇒ ถือช่อง 3 ใบปล่อยครบ · ผลรวม expired = จำนวนแถวที่เปลี่ยนจริง (ไม่นับซ้ำ)", async () => {
    needTpl();
    const hs = [
      okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: ids.stA, dateStr: D.h3, startMin: 600, channel: "ONLINE" })), "hold 1"),
      okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: ids.stB, dateStr: D.h3, startMin: 600, channel: "ONLINE" })), "hold 2"),
      okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: ids.stC, dateStr: D.h3, startMin: 840, channel: "LINE" })), "hold 3"),
    ];
    for (const h of hs) eq(h.status, "PENDING", "hold");
    const maxCreated = Math.max(...(await Promise.all(hs.map((h) => apRow(h.id)))).map((a) => a.createdAt.getTime()));
    const cnt = async () => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "cancelReason" = 'DEPOSIT_TIMEOUT'`))[0].n;
    const before = await cnt();
    const now = new Date(maxCreated + 16 * 60_000);
    const [x, y] = await Promise.all([EXPIRE()(now), EXPIRE()(now)]);
    const after = await cnt();
    eq(x.expired + y.expired, after - before, `expired ${x.expired}+${y.expired} เทียบแถวที่เปลี่ยน`);
    for (const h of hs) eq((await apRow(h.id)).status, "CANCELLED", `hold ${h.id}`);
    eq((await EXPIRE()(now)).expired, 0, "รอบที่สาม");
  });
  await st("H-5", `minute-job "${JOB_NAME}" ลงทะเบียน everyMinutes 1 · cadence minute · ไม่ใช่ vpsOnly · เรียก expireDepositHolds`, async () => {
    const src = existsSync(join(ROOT, MJ_REL)) ? readFileSync(join(ROOT, MJ_REL), "utf8") : "";
    const i = src.indexOf(`"${JOB_NAME}"`);
    ok(i >= 0, "ไม่พบชื่องานใน minute-jobs.ts");
    const blk = src.slice(Math.max(0, src.lastIndexOf("registerMinuteJob(", i)), src.indexOf("});", i) + 3);
    ok(/everyMinutes:\s*1\b/.test(blk) && /expireDepositHolds/.test(blk) && !/vpsOnly:\s*true/.test(blk) && !/cadence:\s*"(hourly|daily)"/.test(blk), `บล็อก: ${blk.slice(0, 200)}`);
    const mj = (await tryImport<MjApi>("@/lib/platform/minute-jobs")).mod;
    ok(typeof mj?.getMinuteJobStatus === "function", "โหลด minute-jobs ไม่ได้");
    const [s] = await mj!.getMinuteJobStatus!([JOB_NAME]);
    eq(s?.everyMinutes, 1, "everyMinutes จากทะเบียน");
  }, "MAJOR");

  // ═══════════════ ORACLE-EDIT 28 ต.ค. (review) G3 G4 G5 ═══════════════
  const holdThenExpire = async (staffId: string, ds: string, startMin: number, key?: string) => {
    const input = bk({ serviceId: ids.S90, staffId, dateStr: ds, startMin, channel: "ONLINE", ...(key ? { idempotencyKey: key } : {}) });
    const r = okBook(await BOOK()(cM, input), `ถือช่อง ${hhmm(startMin)}`);
    eq(r.status, "PENDING", "ถือช่อง");
    const row = await apRow(r.id);
    await EXPIRE()(new Date(row.createdAt.getTime() + 16 * 60_000));
    eq((await apRow(r.id)).status, "CANCELLED", "หลังปล่อย");
    return Object.assign(r, { input });
  };
  await st("H-6", "ส่งซ้ำด้วย key เดิมหลังปล่อยช่อง ⇒ RELEASED (ไม่ใช่ ok/CONFIRMED) · หลัง NO_SHOW ⇒ RELEASED · ตัวควบคุม: key ของนัดที่ยัง active ⇒ ok id เดิม", async () => {
    needTpl();
    const k1 = rid("k6");
    const h = await holdThenExpire(ids.stA, D.h6, 600, k1);
    const rel = await BOOK()(cM, h.input);
    const why = failCode(rel, "RELEASED", "replay หลังปล่อย");
    ok(/ยกเลิก/.test(why), `reason ต้องบอกว่ายกเลิกแล้ว: ${why}`);
    eq((await apRow(h.id)).status, "CANCELLED", "แถวเดิมยัง CANCELLED");
    const k2 = rid("k6b");
    const in2 = bk({ serviceId: ids.S60, staffId: ids.stB, dateStr: D.h6, startMin: 600, channel: "ONLINE", idempotencyKey: k2 });
    const b = okBook(await BOOK()(cM, in2), "จองเพื่อ NO_SHOW");
    await q(`UPDATE "Appointment" SET status = 'NO_SHOW' WHERE id = $1`, [b.id]);
    failCode(await BOOK()(cM, in2), "RELEASED", "replay หลัง NO_SHOW");
    const k3 = rid("k6c");
    const in3 = bk({ serviceId: ids.S60, staffId: ids.stC, dateStr: D.h6, startMin: 840, channel: "ONLINE", idempotencyKey: k3 });
    const c = okBook(await BOOK()(cM, in3), "active");
    eq(okBook(await BOOK()(cM, in3), "replay active").id, c.id, "id replay active");
  });
  await st("H-7", "recordDeposit หลังปล่อย ⇒ ปฏิเสธ (depositPaidAt/depositSaleId ยัง null) · ตัวควบคุม: รับมัดจำก่อนหมดเวลา ⇒ ok แล้วไม่ถูกปล่อย · แข่ง expire ∥ recordDeposit 10 รอบ ⇒ ทุกรอบผลเดียว · ไม่มีแถว CANCELLED ที่จ่ายแล้ว", async () => {
    needTpl();
    const h = await holdThenExpire(ids.stA, D.h7, 600);
    const rd = await BK().recordDeposit(cM, h.id);
    eq(rd.ok, false, `recordDeposit หลังปล่อย ${fmt(rd)}`);
    ok(typeof rd.reason === "string" && rd.reason.length > 0, "ต้องมีเหตุผล");
    const a = await apRow(h.id);
    eq([a.status, a.depositPaidAt], ["CANCELLED", null], "แถวหลังปฏิเสธ");
    eq((await q<{ s: string | null }>(`SELECT "depositSaleId" AS s FROM "Appointment" WHERE id = $1`, [h.id]))[0].s, null, "depositSaleId");
    const live = okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: ids.stB, dateStr: D.h7, startMin: 600, channel: "ONLINE" })), "ถือช่องตัวควบคุม");
    const rd2 = await BK().recordDeposit(cM, live.id);
    eq(rd2.ok, true, `recordDeposit ก่อนหมดเวลา ${fmt(rd2)}`);
    const lr = await apRow(live.id);
    ok(lr.depositPaidAt !== null, "ตัวควบคุมต้องจ่ายแล้ว");
    await EXPIRE()(new Date(lr.createdAt.getTime() + 16 * 60_000));
    ok((await apRow(live.id)).status !== "CANCELLED", "จ่ายแล้วถูกปล่อย");
    const slots: [string, number][] = [[ids.stA, 600], [ids.stA, 750], [ids.stA, 900], [ids.stA, 1050], [ids.stB, 600], [ids.stB, 750], [ids.stB, 900], [ids.stB, 1050], [ids.stC, 780], [ids.stC, 930]];
    const bad: string[] = [];
    let paidWins = 0;
    let expireWins = 0;
    for (const [sid, t] of slots) {
      const r = okBook(await BOOK()(cM, bk({ serviceId: ids.S90, staffId: sid, dateStr: D.h7r, startMin: t, channel: "ONLINE" })), `รอบ ${hhmm(t)}`);
      const row = await apRow(r.id);
      const [, dep] = await Promise.all([EXPIRE()(new Date(row.createdAt.getTime() + 16 * 60_000)), BK().recordDeposit(cM, r.id).catch((e: unknown) => ({ ok: false, reason: `throw ${errMsg(e)}` }))]);
      const after = await apRow(r.id);
      const paid = after.depositPaidAt !== null;
      if (after.status === "CANCELLED" && paid) bad.push(`${hhmm(t)} CANCELLED+จ่าย`);
      else if (paid && !dep.ok) bad.push(`${hhmm(t)} จ่ายแต่ recordDeposit บอกล้ม`);
      else if (!paid && after.status !== "CANCELLED") bad.push(`${hhmm(t)} ไม่จ่ายและไม่ปล่อย`);
      else if (!paid && dep.ok) bad.push(`${hhmm(t)} recordDeposit ok แต่ไม่จ่าย`);
      if (paid) paidWins++; else expireWins++;
    }
    ok(bad.length === 0, bad.slice(0, 3).join(" · "));
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND status = 'CANCELLED' AND "depositPaidAt" IS NOT NULL`, [ids.tA]))[0].n, 0, "แถว CANCELLED ที่จ่ายแล้ว");
    console.log(`     (แข่ง 10 รอบ: จ่ายชนะ ${paidWins} · ปล่อยชนะ ${expireWins})`);
  });
  await st("H-8", "setAppointmentStatus ปลุกนัดที่ถูกปล่อยกลับเป็น CONFIRMED ขณะช่องถูกจองแล้ว ⇒ ok:false + แถวยัง CANCELLED + ช่างมีนัด active 1 · ตัวควบคุม: ช่องว่าง ⇒ ok · CONFIRMED · cancelReason ล้าง", async () => {
    needTpl();
    const h = await holdThenExpire(ids.stA, D.h8, 600);
    okBook(await BOOK()(cM, bk({ serviceId: ids.S60, staffId: ids.stA, dateStr: D.h8, startMin: 600, channel: "ONLINE" })), "คนใหม่จองช่องที่ปล่อย");
    const r = await BK().setAppointmentStatus(ids.tA, ids.uMain, h.id, "CONFIRMED");
    eq(r.ok, false, `ปลุกทับ ${fmt(r)}`);
    ok(typeof r.reason === "string" && r.reason.length > 0, "ต้องมีเหตุผล");
    eq((await apRow(h.id)).status, "CANCELLED", "แถวเดิม");
    eq(await countLive(ids.stA, D.h8), 1, "นัด active ของช่างเอ");
    const g = await holdThenExpire(ids.stB, D.h8, 600);
    const r2 = await BK().setAppointmentStatus(ids.tA, ids.uMain, g.id, "CONFIRMED");
    eq(r2.ok, true, `ปลุกตอนช่องว่าง ${fmt(r2)}`);
    const a = await apRow(g.id);
    eq([a.status, a.cancelReason], ["CONFIRMED", null], "แถวที่ปลุก");
  });

  // ═══════════════ X. ยิงพร้อมกันข้ามโพรเซส ═══════════════
  console.log("\n── X: ยิงพร้อมกัน 5 โพรเซส × 2 (X3) ──");
  const NCHILD = 5;
  const X = { x0: dd(0), x1: dd(1), x2: dd(2), x3: dd(3), x4: dd(4), x5: dd(5), x6: dd(6), x7: dd(7), x8: dd(8) };
  const rb = (o: Partial<BookInput> & { serviceId: string; staffId: string | null; dateStr: string; startMin: number; channel: BookingChannel }): CallSpec => ({ fn: "book", ctx: cR, input: bk(o) });
  const rc = (staffId: string, ds: string, startMin: number): CallSpec => ({ fn: "create", input: { tenantId: ids.tA, unitId: ids.uRace, serviceId: ids.R60, staffId, dateStr: ds, startMin, customerName: "ลูกค้าแข่ง", customerPhone: newPhone(), source: "STAFF" } });
  const ten = <T,>(f: (i: number) => T): T[] => Array.from({ length: 10 }, (_, i) => f(i));
  const racePhone = "0865554444";
  // ORACLE-EDIT 28 ต.ค. (review)
  const X4B = dd(9);
  const X10R = dd(10);
  const PHONE_FORMS = ["0874441234", "087-444-1234", "087 444 1234", "+66874441234", "+66 87 444 1234", "66874441234", "0066874441234", "+660874441234", "660874441234", "(+66)874441234"];
  const key9 = rid("x9");
  const key9b = rid("x9b");
  const key10 = rid("x10");
  const PHONE12 = "0957771212";
  const idemKey = rid("xidem");
  const scenarios: Scenario[] = [
    { key: "x0", calls: ten(() => rc(ids.r1, X.x0, 600)) },
    { key: "x1", calls: ten(() => rb({ serviceId: ids.R60, staffId: ids.r1, dateStr: X.x1, startMin: 600, channel: "ONLINE" })) },
    { key: "x2", calls: ten(() => rb({ serviceId: ids.R60, staffId: null, dateStr: X.x2, startMin: 600, channel: "ONLINE" })) },
    { key: "x3", calls: ten((i) => rb({ serviceId: ids.R60, staffId: ids.rCap, dateStr: X.x3, startMin: 600 + i * 60, channel: "ONLINE" })) },
    { key: "x4", calls: ten((i) => rb({ serviceId: ids.R60, staffId: [ids.r1, ids.r2, ids.r3, ids.rCtl, ids.rCap][i % 5], dateStr: X.x4, startMin: i < 5 ? 600 : 720, channel: "ONLINE", customerPhone: racePhone })) },
    { key: "x5", calls: ten((i) => rb({ serviceId: ids.R30, staffId: ids.rCtl, dateStr: X.x5, startMin: 600 + i * 45, channel: "ONLINE" })) },
    { key: "x6", calls: ten((i) => rb({ serviceId: ids.R60, staffId: ids.rCtl, dateStr: X.x6, startMin: 600 + i * 60, channel: "STAFF" })) },
    { key: "x7", calls: ten((i) => (i % 2 === 0 ? rc(ids.r2, X.x7, 600) : rb({ serviceId: ids.R60, staffId: ids.r2, dateStr: X.x7, startMin: 600, channel: "ONLINE" }))) },
    { key: "x8", calls: ten(() => rb({ serviceId: ids.R60, staffId: ids.r3, dateStr: X.x8, startMin: 600, channel: "ONLINE", idempotencyKey: idemKey, customerPhone: "0861112222" })) },
    // ORACLE-EDIT 28 ต.ค. (review): ชุดเพิ่ม G1 G2 G6
    { key: "x4b", calls: ten((i) => rb({ serviceId: ids.R60, staffId: [ids.r1, ids.r2, ids.r3, ids.rCtl, ids.rCap][i % 5], dateStr: X4B, startMin: i < 5 ? 600 : 720, channel: "ONLINE", customerPhone: PHONE_FORMS[i] })) },
    { key: "x9", calls: ten(() => ({ fn: "book", ctx: cNc, input: bk({ serviceId: ids.N60, staffId: ids.n1, dateStr: dd(3), startMin: 600, channel: "ONLINE", idempotencyKey: key9, customerPhone: "0862223333" }) }) as CallSpec) },
    { key: "x9b", calls: ten(() => ({ fn: "book", ctx: cNc, input: bk({ serviceId: ids.N60, staffId: ids.n1, dateStr: dd(4), startMin: 600, channel: "STAFF", idempotencyKey: key9b, customerPhone: "0862224444" }) }) as CallSpec) },
    { key: "x10", calls: ten((i) => (i % 2 === 0
      ? ({ fn: "book", ctx: cNc, input: bk({ serviceId: ids.N60, staffId: ids.n2, dateStr: dd(5), startMin: 600, channel: "ONLINE", idempotencyKey: key10, customerPhone: "0863335555" }) } as CallSpec)
      : rb({ serviceId: ids.R60, staffId: ids.r1, dateStr: X10R, startMin: 600, channel: "ONLINE", idempotencyKey: key10, customerPhone: "0863335555" }))) },
    { key: "x11", layout: "one", calls: Array.from({ length: 20 }, () => ({ fn: "book", ctx: cMem, input: bk({ serviceId: ids.M60, staffId: null, dateStr: dd(1), startMin: 600, channel: "ONLINE", customerPhone: newPhone().replace(/^08/, "09") }) }) as CallSpec) },
    { key: "x12", calls: ten((i) => ({ fn: "book", ctx: cMem, input: bk({ serviceId: ids.M60, staffId: MEM_STAFF[i % 5], dateStr: dd(2), startMin: i % 2 === 0 ? 600 : 720, channel: i % 2 === 0 ? "STAFF" : "ONLINE", customerPhone: PHONE12 }) }) as CallSpec) },
  ];
  let results = new Map<string, CallOut[]>();
  let harnessErr = "";
  if (setupOk && tplOk) {
    try { results = await runHarness(scenarios, NCHILD); } catch (e) { harnessErr = errMsg(e); }
  } else harnessErr = "สร้างข้อมูล/แม่แบบไม่สำเร็จ";
  const R = (key: string, n = 10): CallOut[] => {
    ok(!harnessErr, `สายยิงพร้อมกันล้ม: ${harnessErr}`);
    const r = results.get(key) ?? [];
    ok(r.length === n, `${key}: ได้ผล ${r.length}/${n} (ลูกโพรเซสตาย/หมดเวลา)`);
    return r;
  };
  const summ = (r: CallOut[]) => ({ ok: r.filter((x) => x.ok).length, codes: r.filter((x) => !x.ok).map((x) => x.code ?? `throw:${x.threw}`) });
  const noThrowBook = (r: CallOut[]) => { const t = r.filter((x) => x.fn === "book" && x.threw); ok(t.length === 0, `bookAppointment throw ${t.length} ครั้ง: ${t[0]?.threw}`); };
  await st("X3-0", "ตัวควบคุม: createAppointment เดิม 10 ทางข้ามโพรเซส ช่องเดียว ⇒ สำเร็จ 1 · แถว 1 (สายยิงพร้อมกันทำงาน)", async () => {
    const r = R("x0");
    eq(summ(r).ok, 1, `สำเร็จ ${fmt(summ(r))}`);
    eq(await countLive(ids.r1, X.x0), 1, "แถว");
  });
  await st("X3-1", "ONLINE ช่องเดียวกัน ช่างเดียวกัน 10 ทาง ⇒ 1 สำเร็จ · 9 FULL · ไม่มี throw · แถว 1", async () => {
    const r = R("x1"); noThrowBook(r);
    const s = summ(r);
    eq([s.ok, s.codes.filter((c) => c === "FULL").length], [1, 9], fmt(s));
    eq(await countLive(ids.r1, X.x1), 1, "แถว");
  });
  await st("X3-2", "ใครก็ได้ 10 ทาง ช่างว่าง 5 คน ⇒ 5 สำเร็จ คนละช่าง · 5 FULL · ไม่มีช่างซ้อน", async () => {
    const r = R("x2"); noThrowBook(r);
    const s = summ(r);
    eq([s.ok, s.codes.filter((c) => c === "FULL").length], [5, 5], fmt(s));
    eq(new Set(r.filter((x) => x.ok).map((x) => x.staffId)).size, 5, "ช่างไม่ซ้ำ");
    for (const sid of [ids.r1, ids.r2, ids.r3, ids.rCap, ids.rCtl]) eq(await countLive(sid, X.x2), 1, `แถวช่าง ${sid}`);
  });
  await st("X3-3", "% ออนไลน์ 20% (120 นาที) · 10 ทางคนละเวลา ⇒ สำเร็จ 2 พอดี · 8 FULL (ตัวนับใต้ล็อก)", async () => {
    const r = R("x3"); noThrowBook(r);
    const s = summ(r);
    eq([s.ok, s.codes.filter((c) => c === "FULL").length], [2, 8], fmt(s));
    eq(await countLive(ids.rCap, X.x3), 2, "แถว");
  });
  await st("X3-4", "เบอร์เดียว 10 ทาง (คนละช่าง/เวลา) เพดาน 2 ⇒ สำเร็จ 2 พอดี · 8 PHONE_LIMIT", async () => {
    const r = R("x4"); noThrowBook(r);
    const s = summ(r);
    eq([s.ok, s.codes.filter((c) => c === "PHONE_LIMIT").length], [2, 8], fmt(s));
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "unitId" = $1 AND "customerPhone" = $2 AND status NOT IN ('CANCELLED','NO_SHOW')`, [ids.uRace, racePhone]))[0].n, 2, "แถว");
  });
  await st("X3-5", "ตัวควบคุมบวก ONLINE: 10 ทาง ช่างเดียว คนละเวลา คนละเบอร์ (350 ≤ 360 นาที) ⇒ สำเร็จ 10 (ไม่ปฏิเสธเกิน · ไม่หมดเวลา)", async () => {
    const r = R("x5"); noThrowBook(r);
    eq(summ(r).ok, 10, fmt(summ(r)));
  });
  await st("X3-6", "ตัวควบคุมบวก STAFF: 10 ทาง ช่างเดียว 10:00–19:00 ⇒ สำเร็จ 10", async () => {
    const r = R("x6"); noThrowBook(r);
    eq(summ(r).ok, 10, fmt(summ(r)));
    eq(await countLive(ids.rCtl, X.x6), 10, "แถว");
  });
  await st("X3-7", "ผสม createAppointment เดิม 5 + bookAppointment 5 ช่องเดียวกัน ⇒ สำเร็จรวม 1 · แถว 1 (ใช้ล็อกเดียวกัน)", async () => {
    const r = R("x7"); noThrowBook(r);
    eq(summ(r).ok, 1, fmt(summ(r)));
    eq(await countLive(ids.r2, X.x7), 1, "แถว");
  });
  await st("X3-8", "idempotencyKey เดียวกัน 10 ทาง ⇒ ทุกทาง ok id เดียว · แถว 1", async () => {
    const r = R("x8"); noThrowBook(r);
    eq(summ(r).ok, 10, fmt(summ(r)));
    eq(new Set(r.map((x) => x.id)).size, 1, "id");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [ids.tA, idemKey]))[0].n, 1, "แถว");
  });

  // ═══════════════ ORACLE-EDIT 28 ต.ค. (review) X3-4b X3-9 X3-9b X3-10 X3-11 X3-12 ═══════════════
  await st("X3-4b", "เพดาน 2/เบอร์ · เบอร์เดียวกัน 10 รูปแบบ (ขีด/เว้นวรรค/+66/66/0066/+660/(+66)) พร้อมกัน ⇒ สำเร็จ 2 พอดี · 8 PHONE_LIMIT", async () => {
    const r = R("x4b"); noThrowBook(r);
    const s = summ(r);
    eq([s.ok, s.codes.filter((c) => c === "PHONE_LIMIT").length], [2, 8], fmt(s));
  });
  await st("X3-9", "สาขาไม่มีเพดานเบอร์ · key เดียว 10 ทาง ONLINE ช่างเดียวช่องเดียว ⇒ ทุกทาง ok id เดียว (ไม่มี FULL) · แถว 1", async () => {
    const r = R("x9"); noThrowBook(r);
    eq(summ(r), { ok: 10, codes: [] }, "ผล");
    eq(new Set(r.map((x) => x.id)).size, 1, "id");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [ids.tA, key9]))[0].n, 1, "แถว");
  });
  await st("X3-9b", "เหมือน X3-9 แต่ช่อง STAFF (ไม่มีล็อกเบอร์) ⇒ ทุกทาง ok id เดียว · แถว 1", async () => {
    const r = R("x9b"); noThrowBook(r);
    eq(summ(r), { ok: 10, codes: [] }, "ผล");
    eq(new Set(r.map((x) => x.id)).size, 1, "id");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [ids.tA, key9b]))[0].n, 1, "แถว");
  });
  await st("X3-10", "key เดียว 2 สาขาพร้อมกัน (5+5) ⇒ สาขาหนึ่ง ok ทั้ง 5 id เดียวของสาขานั้น · อีกสาขา BAD_INPUT ทั้ง 5 (ไม่ได้ id ข้ามสาขา) · แถว 1", async () => {
    const r = R("x10"); noThrowBook(r);
    const nc = r.filter((_, i) => i % 2 === 0);
    const rc2 = r.filter((_, i) => i % 2 === 1);
    const unitOf = async (id: string | null) => (id ? (await q<{ u: string }>(`SELECT "unitId" AS u FROM "Appointment" WHERE id = $1`, [id]))[0]?.u ?? null : null);
    for (const [grp, u] of [[nc, ids.uNc], [rc2, ids.uRace]] as const) for (const x of grp) if (x.ok) eq(await unitOf(x.id), u, "id ของสาขาตัวเอง");
    const okNc = nc.every((x) => x.ok) && rc2.every((x) => !x.ok && x.code === "BAD_INPUT");
    const okR = rc2.every((x) => x.ok) && nc.every((x) => !x.ok && x.code === "BAD_INPUT");
    ok(okNc || okR, `ผลผสม: uNc ${fmt(summ(nc))} · uRace ${fmt(summ(rc2))}`);
    eq(new Set(r.filter((x) => x.ok).map((x) => x.id)).size, 1, "id");
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Appointment" WHERE "tenantId" = $1 AND "idempotencyKey" = $2`, [ids.tA, key10]))[0].n, 1, "แถว");
  });
  await st("X3-11", "สาขาเชื่อมระบบสมาชิก · ลูกค้าใหม่ 20 ทาง \"ใครก็ได้\" ในโพรเซสเดียว (เกิน pool) ⇒ 0 throw · สำเร็จ 6 = จำนวนช่าง (คนละช่าง) · 14 FULL", async () => {
    const r = R("x11", 20); noThrowBook(r);
    const s = summ(r);
    eq([s.ok, s.codes.filter((c) => c === "FULL").length], [6, 14], fmt(s));
    eq(new Set(r.filter((x) => x.ok).map((x) => x.staffId)).size, 6, "ช่างไม่ซ้ำ");
    for (const sid of MEM_STAFF) eq(await countLive(sid, dd(1)), 1, `แถวช่าง ${sid}`);
  });
  await st("X3-12", "สาขาเชื่อมสมาชิก · เบอร์ใหม่เดียวกัน 10 ทาง (STAFF 5 + ONLINE 5 คนละช่าง/เวลา) ⇒ 0 throw · STAFF ok ครบ 5 · ONLINE ok หรือ PHONE_LIMIT · ลูกค้า (Customer) ของเบอร์นี้ 1 แถว", async () => {
    const r = R("x12"); noThrowBook(r);
    const stf = r.filter((_, i) => i % 2 === 0);
    const onl = r.filter((_, i) => i % 2 === 1);
    eq(summ(stf).ok, 5, `STAFF ${fmt(summ(stf))}`);
    ok(onl.every((x) => x.ok || x.code === "PHONE_LIMIT"), `ONLINE ${fmt(summ(onl))}`);
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Customer" WHERE "tenantId" = $1 AND "memberSystemId" = $2 AND regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE '%957771212'`, [ids.tA, ids.memSys]))[0].n, 1, "Customer");
  });

  // ═══════════════ TZ ═══════════════
  console.log("\n── TZ: findSlots ใน TZ +14 / −11 ──");
  await st("TZ-1", "findSlots (ช่างเอ/ซี/ใครก็ได้ × ONLINE/STAFF × 2 วัน) ใน TZ Kiritimati และ Pago_Pago = in-process ทุกไบต์", async () => {
    needTpl();
    FIND();
    const p: Probe = { ctx: cM, serviceId: ids.S60, staffIds: [ids.stA, ids.stC, null], dates: [D.pf, D.col], channels: ["ONLINE", "STAFF"] };
    const here = JSON.stringify(await probeRun(p));
    for (const tz of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      const r = spawnSync(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, TZ: tz, QC_B3_PROBE: JSON.stringify(p) }, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
      const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("PROBE_JSON="));
      ok(!!line, `probe ${tz} exit=${r.status} ${(r.stderr ?? "").split("\n").filter(Boolean).slice(-2).join(" ¦ ").slice(0, 200)}`);
      eq(line!.slice("PROBE_JSON=".length) === here, true, `ผล ${tz} ต่างจาก in-process`);
    }
  }, "MAJOR");
} catch (e) {
  record("CRASH", "ข้อสอบหยุดกลางทาง", "FAIL", errMsg(e), "CRITICAL");
} finally {
  try { await cleanup(tenantIds); await cleanupUsers(); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  for (const f of goFiles) { try { if (existsSync(f)) unlinkSync(f); } catch { /* ไฟล์ของเราเอง */ } }
  console.log("\n── Z: ล้างข้อมูล ──");
  await st("Z-1", "หลังล้าง: tenant `qc-svc-b3-*` 0 · นัด/ค่าตั้ง/ช่างของร้านทดสอบ 0 · ผู้ใช้ทดสอบ 0 · ไฟล์สัญญาณ /tmp/svc-b3-go-* ของรอบนี้ 0", async () => {
    eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG}%`]))[0].n, 0, "tenant");
    for (const t of ["Appointment", "SettingValue", "BookingStaff", "BookingService", "BookingProfile"]) {
      if (!(await cols(t)).length) continue;
      eq((await q<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [[ids.tA, ids.tB]]))[0].n, 0, t);
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
    const spec: ChildSpec = { run: RUN, idx, scenarios: scs.map((s) => ({ key: s.key, calls: s.layout === "one" ? (idx === 0 ? s.calls : []) : s.calls.slice(idx * 2, idx * 2 + 2) })) };
    const ch = spawn(process.execPath, [...process.execArgv, SELF], { cwd: ROOT, env: { ...process.env, QC_B3_CHILD: JSON.stringify(spec) }, stdio: ["ignore", "pipe", "pipe"] });
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
console.log("\n── ST: ไฟล์ · ไม่มี migration · เวลาไทย · pure ──");
const git = (args: string[]) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
const dirty = (paths: string[]) => git(["status", "--porcelain", "--untracked-files=all", "--", ...paths]).split("\n").filter(Boolean).map((l) => l.slice(3).trim());
const OWN = new Set([SERVICE_REL, SLOTS_REL, PS_REL, INDEX_REL, MJ_REL]);
{
  const ch = dirty(["src", "prisma"]);
  const headHas = (() => { try { return /export async function bookAppointment/.test(git(["show", `HEAD:${SERVICE_REL}`])); } catch { return false; } })();
  if (ch.length === 0 && headHas) skip("ST-1", "แตะเฉพาะไฟล์ของใบ", "B.3 merge แล้ว — ข้อนี้ตรวจเฉพาะตอนรับใบ");
  else await st("ST-1", "แตะเฉพาะไฟล์ของใบ (service/slots/plan-settings/index/minute-jobs) · มี service.ts + plan-settings.ts + minute-jobs.ts ในชุดที่แก้", () => {
    const outside = ch.filter((f) => !OWN.has(f));
    ok(outside.length === 0, `ไฟล์นอกใบ: ${outside.slice(0, 6).join(", ")}`);
    const miss = [SERVICE_REL, PS_REL, MJ_REL].filter((f) => !ch.includes(f));
    ok(miss.length === 0, `ยังไม่แก้: ${miss.join(", ")}`);
  });
}
await st("ST-2", "ไม่มีเวลาเครื่องดิบ (.getDay/.getHours/.getMinutes/.getDate/.getMonth/.getFullYear/toLocaleDateString) ใน service.ts · slots.ts · plan-settings.ts", () => {
  const bad: string[] = [];
  for (const f of [SERVICE_REL, SLOTS_REL, PS_REL]) {
    if (!existsSync(join(ROOT, f))) continue;
    readFileSync(join(ROOT, f), "utf8").split("\n").forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, "");
      if (/\.(getDay|getHours|getMinutes|getDate|getMonth|getFullYear)\s*\(\s*\)|toLocaleDateString/.test(code)) bad.push(`${f}:${i + 1}`);
    });
  }
  ok(bad.length === 0, bad.slice(0, 4).join(" · "));
});
await st("ST-3", "plan-settings.ts + slots.ts pure: import เฉพาะ type จาก ./planner (plan-settings) · ไม่มี prisma/db/next/server-only · ไม่มี Date.now / new Date() / Math.random", () => {
  ok(existsSync(join(ROOT, PS_REL)), `ไม่มี ${PS_REL}`);
  for (const f of [PS_REL, SLOTS_REL]) {
    const src = readFileSync(join(ROOT, f), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const imps = [...src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)];
    const badImp = imps.filter((m) => !(f === PS_REL && m[2] === "./planner" && (m[1] || /import\s+type|\{\s*type\s/.test(m[0]))));
    ok(badImp.length === 0, `${f} import ไม่ได้: ${badImp.map((m) => m[2]).join(", ")}`);
    ok(!/\bDate\.now\s*\(|new\s+Date\s*\(\s*\)|Math\.random|["']server-only["']|use server/.test(src), `${f} มีนาฬิกา/สุ่ม/server`);
  }
}, "MAJOR");
await st("ST-4", "ไม่มี migration/แก้ schema ในงาน (prisma/ ไม่มีไฟล์แก้หรือไฟล์ใหม่)", () => {
  eq(dirty(["prisma"]), [], "prisma/");
});

// ═══════════════ G. regression ═══════════════
console.log("\n── G: regression booking + B.1 + ตัววางคิว + smoke ──");
const REG: { s: string; env?: Record<string, string>; judge?: (out: string, code: number | null) => boolean }[] = [
  { s: "qc-booking-race" }, { s: "qc-booking-deposit" }, { s: "qc-booking-edit-schedule" }, { s: "qc-booking-hours-hr" }, { s: "qc-hr-leave-booking" },
  {
    s: "qc-svc-b.1", env: { SVC_B1_NO_REGRESSION: "1" },
    judge: (out) => {
      const line = out.split("\n").reverse().find((l) => l.startsWith("JSON_SUMMARY "));
      if (!line) return false;
      const j = JSON.parse(line.slice(13)) as { failed: string[]; skipped: string[] };
      return j.failed.length === 0 && j.skipped.every((x) => x.startsWith("G-") || x === "ST-1");
    },
  },
  { s: "qc-svc-b.2" }, { s: "qc-svc-smoke" },
];
{
  const hasWork = typeof bookingLoad.mod?.bookAppointment === "function" && typeof bookingLoad.mod?.findSlots === "function";
  const why = !hasWork ? "ยังไม่มีงานของใบ (findSlots / bookAppointment) — regression รันเมื่อมีงาน" : process.env.SVC_B3_NO_REGRESSION === "1" ? "ตั้ง SVC_B3_NO_REGRESSION=1" : "";
  for (const [i, g] of REG.entries()) {
    const id = `G-${i + 1}`;
    const name = `${g.s}${g.judge ? " (ไม่มี FAIL · SKIP เฉพาะ G-*/ST-1)" : " exit 0"}`;
    if (why) { skip(id, name, why); continue; }
    if (!existsSync(join(ROOT, "scripts", `${g.s}.mts`))) { record(id, name, "FAIL", "ไม่มีไฟล์ชุด", "CRITICAL"); continue; }
    const t = Date.now();
    const r = spawnSync("pnpm", ["exec", "tsx", `scripts/${g.s}.mts`], { cwd: ROOT, env: { ...process.env, ...(g.env ?? {}) }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 40 * 60_000 });
    const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    const log = `/tmp/svc-b3-reg-${g.s}.log`;
    try { writeFileSync(log, all); } catch { /* ไม่เป็นไร */ }
    const pass = g.judge ? g.judge(r.stdout ?? "", r.status) : r.status === 0;
    const tail = all.split("\n").filter((l) => /ผ่าน|JSON_SUMMARY|หยุด|❌|Error/.test(l)).slice(-2).join(" ¦ ").slice(0, 220);
    record(id, `${name} (${Math.round((Date.now() - t) / 1000)} วิ)`, pass ? "PASS" : "FAIL", pass ? "" : `exit=${r.status ?? r.signal} · ${tail} · log ${log}`, "CRITICAL");
  }
}

const failed = cks.filter((c) => c.res === "FAIL");
const skipped = cks.filter((c) => c.res === "SKIP");
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC B.3 · หาเวลาว่าง v2 =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: [...failed, ...skipped].map((c) => c.id) })}`);
// รับใบ = ผ่านทุกข้อ (SKIP ไม่นับว่าผ่าน)
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
