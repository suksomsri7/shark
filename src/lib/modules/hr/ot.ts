// HR H2.9 ▸ คำขอ OT: ยื่น (ก่อนทำ / ไม่เกิน N ชม. หลังทำ) → อนุมัติตรง → จ่ายจากนาทีที่ "วัดได้" (H2.5) →
//   HrPayAdjustment(kind OT · sourceType OT_REQUEST) ในงวดที่ยังเปิด · ตัวคูณจากชนิดวัน × ตารางกฎหมาย (ot-rules.ts)
//
// กติกา (brief hr-brief-H2.9 R5–R14 · มติผู้คุม Q1–Q14 วันที่ 12 พ.ย.):
//   • ผู้ยื่น: ตัวเอง (ไม่ส่ง employeeId — พนักงานจากบัญชีผู้ใช้ §C.7) หรือยื่นแทนโดย OWNER · MANAGER ในสาขา · คีย์ hr.payadjust.request ในสาขา (Q3)
//   • ผู้อนุมัติ: OWNER · MANAGER ในสาขา · คีย์ hr.payadjust.approve ในสาขา — ของตัวเองไม่ได้ (เจ้าของร้านด้วย) · ผู้ยื่นแทนอนุมัติเองไม่ได้ ยกเว้น OWNER (Q4) ·
//     คนอื่น/นอกสาขา/ร้านอื่น/ไม่พบ = ข้อความเดียวกันทุกไบต์ (notFound)
//   • การจ่าย = ธุรกรรมเดียวต่อคำขอ · ลำดับล็อก (มติผู้คุม — ล็อกงวดก่อน คีย์เดียวกับ payroll.ts/judge.ts):
//       hr:payroll:run:<ระบบ>:<งวดของวันก่อนหน้า, งวดของวันงาน> (เรียง) → งวดปลายทาง (มากขึ้นเท่านั้น) → hr:ot:<id> → hr:judge:<dayId> (เรียง id)
//     ยื่น = hr:ot-emp:<ระบบ>:<พนักงาน> อย่างเดียว · ยกเลิก = hr:ot:<id> อย่างเดียว ⇒ ไม่มีใครถือล็อกในลำดับกลับกัน
//   • จ่ายเมื่อวันนั้นปิดผลแล้วและไม่ stale (Q8) · ไม่ได้มาทำงาน = 0 · รอ = settleCode (WAIT · STALE · NO_SCHEDULE · NO_RATE · LAW · OVERFLOW)
//   • นาทีที่จ่าย = min(ช่วงที่ขอ ∩ เวลาที่ทำจริง, otMin) ปัดลงเป็นขั้น otRoundMin (ค่าตั้ง 1 · 15 · 30 — ค่าตั้งต้น 1 = นาทีจริง · มติ Q7)
//   • ฐานค่าจ้าง + กฎหมายตรึงใน basisJson ตอนคิดเงินครั้งแรก · คิดใหม่ (วันเปลี่ยนรุ่น/ยกเลิก) = รายการส่วนต่าง ไม่แก้แถวที่เข้ารอบแล้ว (payroll.ts#writeOtAdjustmentInTx)
//   • เงินเห็นได้เฉพาะ OWNER · hr.payroll.read · ตัวพนักงานเอง (Q11) · event/แจ้งเตือน/audit = id ล้วน ไม่มีจำนวนเงิน ◂
import type { HrOtRequest, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { lockHrSettings, writeHrSettingsKeys } from "./settings-lock"; // HR-SET-1 ◂
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { formatThaiDate } from "@/lib/ui/date";
import { hrScopeOf, inPayScope, type HrScope } from "./scope"; // HR PRIV-2 ▸ + inPayScope (เงิน OT = สาขาประจำ) ◂
import { employeeOfUser } from "./service";
import { unitOfDay } from "./roster";
import { addDays, bkkDayKey } from "./time-rules";
import { holidayOfDay, holidayRowsInRange } from "./holidays";
import { canManageHrSettings, SETTINGS_TEXT } from "./settings";
import { otDaySpans, otPayDaysInTx, type OtPayStoredRow } from "./judge";
import { loadOtLawRows } from "./law";
import { OtAdjustmentConflict, writeOtAdjustmentInTx } from "./payroll";
import { holidayWorkDayInTx, holidayWorkPricedInTx } from "./payroll"; // HR H3.4 ▸ R11: นาที HOLIDAY_WORK ที่รอบรุ่น 2 จ่ายแล้ว (ไม่จ่ายซ้ำ) ◂
import { otDayMinutes, raised } from "./ot-rules"; // HR H3.4 ▸ R11: แถบชั่วโมงปกติของวันหยุด = min(480, N) ◂
import { normalMinutesOf } from "./work-entries"; // HR H3.4 ▸ R11: ชั่วโมงปกติต่อวันของร้าน (ตรึงใน basisJson ตอนคิดเงินครั้งแรก) ◂
import {
  OT_POLICY_RANGE,
  OT_TEXT,
  OT_WEEK_WARN_MIN,
  otAmount,
  otLawOf,
  otLegalRateFloor,
  otPolicyOf,
  otText,
  otWindow,
  otWorkedPaidMinutes,
  OT_LAW_DEFAULT,
  topMultiplierBp,
  type OtDayClass,
  type OtItem,
  type OtItemBase,
  type OtLaw,
  type OtPolicy,
  type OtProfile,
  type OtSegment,
  type OtTiming,
} from "./ot-rules";

export { OT_TEXT } from "./ot-rules";

type Ctx = { tenantId: string; systemId: string };
type Tx = Prisma.TransactionClient;
/** ผู้กด/ผู้ดู (จาก session — hrViewerOf) */
export type OtViewer = { role: string; unitAccess: unknown; permissions?: unknown; userId?: string | null };
type Fail = { ok: false; reason: string };
const T = OT_TEXT;
export const OT_DECIDED_EVENT = "hr.ot.decided";
/** ธุรกรรมใต้ล็อก (เท่าธุรกรรมของใบลา/สลับกะ — ≤ maxDuration ของหน้า/action/cron) */
const TX_OPTS = { maxWait: 20_000, timeout: 60_000 } as const;
const LIVE: ("PENDING" | "APPROVED")[] = ["PENDING", "APPROVED"];
const MIN_MS = 60_000;
/** หน้าต่างของตัวจ่ายรายชั่วโมง (วันงานย้อนหลัง) · ไม่มีผลลงเวลาภายใน date+8 = จ่าย 0 (R6) */
const SETTLE_BACK_DAYS = 93;
const NO_ATTENDANCE_DAYS = 8;

class OtRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtRefusal";
  }
}
const refuse = (reason: string): Fail => ({ ok: false, reason });
function isUnique(e: unknown): boolean {
  const x = e as { code?: unknown; cause?: { code?: unknown; originalCode?: unknown } } | null;
  return !!x && (x.code === "P2002" || x.code === "23505" || x.cause?.code === "23505" || x.cause?.originalCode === "23505");
}
function reasonOf(e: unknown, dup: string = T.failed): string {
  if (e instanceof OtRefusal) return e.message;
  if (isUnique(e)) return dup;
  console.error("[hr.ot]", e);
  return T.failed;
}

// ── เวลา/วัน ──
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (d: unknown): d is string => typeof d === "string" && DAY_RE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const nowOf = (opts: { now?: Date } | undefined): Date => (opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? new Date(opts.now.getTime()) : new Date());
/** เวลาไทย (นาทีจากเที่ยงคืน) ของวัน → Date */
const bkkAt = (day: string, min: number): Date => new Date(dbDate(day).getTime() + min * MIN_MS - 7 * 3_600_000);
const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const hm = (v: unknown): number | null => {
  const m = typeof v === "string" ? HM_RE.exec(v.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const nextMonth = (p: string): string => {
  const y = Number(p.slice(0, 4));
  const m = Number(p.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const payKey = (ctx: Ctx, period: string) => `hr:payroll:run:${ctx.systemId}:${period}`;

// ── ผู้ดู ──
const permsOf = (v: OtViewer): Record<string, unknown> => (v?.permissions && typeof v.permissions === "object" ? (v.permissions as Record<string, unknown>) : {});
const scopeOf = (v: OtViewer): HrScope => hrScopeOf({ role: v.role as "OWNER", unitAccess: v.unitAccess });
const covers = (s: HrScope, unit: string | null) => s.unitIds === "*" || (!!unit && s.unitIds.includes(unit));
const hasKey = (v: OtViewer, k: string) => permsOf(v)[k] === true || permsOf(v)["hr.*"] === true;
function canRequestFor(v: OtViewer, unit: string | null): boolean {
  if (v.role === "OWNER") return true;
  return (v.role === "MANAGER" || hasKey(v, "hr.payadjust.request")) && covers(scopeOf(v), unit);
}
function canDecide(v: OtViewer, unit: string | null): boolean {
  if (v.role === "OWNER") return true;
  return (v.role === "MANAGER" || hasKey(v, "hr.payadjust.approve")) && covers(scopeOf(v), unit);
}
const seesMoney = (v: OtViewer) => v.role === "OWNER" || permsOf(v)["hr.payroll.read"] === true;
const canList = (v: OtViewer) => v.role === "OWNER" || v.role === "MANAGER" || hasKey(v, "hr.payadjust.approve") || seesMoney(v);

// ── แถว ──
const EMP_SELECT = {
  id: true,
  name: true,
  unitId: true,
  linkedUserId: true,
  startDate: true,
  endDate: true,
  active: true,
  employmentStatus: true,
  units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 },
} as const;
type EmpRow = Prisma.HrEmployeeGetPayload<{ select: typeof EMP_SELECT }>;
const empOf = (db: Tx, ctx: Ctx, id: string) => (id ? (db.hrEmployee.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: EMP_SELECT }) as Promise<EmpRow | null>) : Promise.resolve(null));
const employedOn = (e: EmpRow, day: string) => !(e.startDate && day < dayOf(e.startDate)) && !(e.endDate && day > dayOf(e.endDate));
const dbOf = (ctx: Ctx) => tenantDb(ctx) as unknown as Tx;
type OtRow = HrOtRequest;

// ═════════════ นโยบาย (R14 · settings.hrOt) ═════════════
const policyOfSettings = (settings: unknown): OtPolicy => otPolicyOf(settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>).hrOt : null);
async function policyIn(db: Tx, ctx: Ctx): Promise<OtPolicy> {
  const s = await db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "HR" }, select: { settings: true } });
  return policyOfSettings(s?.settings);
}
/** นโยบาย OT ที่ใช้อยู่ (ค่าตั้งต้นเมื่อยังไม่ตั้ง) */
export async function getOtPolicy(ctx: Ctx): Promise<OtPolicy> {
  return policyIn(dbOf(ctx), ctx);
}
/** ตั้งนโยบาย OT (ทั้งร้าน ⇒ ผู้ตั้งค่า HR ที่ดูแลทุกสาขาเท่านั้น) — ช่องที่ไม่ส่ง = คงเดิม · ล็อก hr:otpolicy:<ระบบ> · spread ค่าตั้งเดิม */
export async function saveOtPolicy(ctx: Ctx, viewer: OtViewer, input: { afterHours?: unknown; maxAheadDays?: unknown; otRoundMin?: unknown }): Promise<{ ok: true; id: string } | Fail> {
  if (!viewer || !canManageHrSettings(viewer as never)) return refuse(SETTINGS_TEXT.noPermission);
  if (scopeOf(viewer).unitIds !== "*") return refuse(SETTINGS_TEXT.shopWide);
  const i = (input ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null);
  const R = OT_POLICY_RANGE;
  const pick = (k: string, ok: (n: number) => boolean, text: string): number | undefined => {
    if (!Object.prototype.hasOwnProperty.call(i, k) || i[k] === undefined) return undefined;
    const n = num(i[k]);
    if (n === null || !Number.isInteger(n) || !ok(n)) throw new OtRefusal(text);
    return n;
  };
  try {
    const after = pick("afterHours", (n) => n >= R.afterHours.min && n <= R.afterHours.max, T.sAfter);
    const ahead = pick("maxAheadDays", (n) => n >= R.maxAheadDays.min && n <= R.maxAheadDays.max, T.sAhead);
    const round = pick("otRoundMin", (n) => R.otRoundMin.includes(n), T.sRound);
    const next = await tenantDb({ tenantId: ctx.tenantId }).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      const sys = await lockHrSettings(tx, ctx, [`hr:otpolicy:${ctx.systemId}`]); // HR-SET-1 ▸ hr:clockpolicy → hr:otpolicy → แถว AppSystem · อ่านใหม่ใต้ล็อก ◂
      if (!sys) throw new OtRefusal(SETTINGS_TEXT.notFound);
      const base = sys.settings && typeof sys.settings === "object" && !Array.isArray(sys.settings) ? (sys.settings as Record<string, unknown>) : {};
      const cur = policyOfSettings(base);
      const nx: OtPolicy = { afterHours: after ?? cur.afterHours, maxAheadDays: ahead ?? cur.maxAheadDays, otRoundMin: round ?? cur.otRoundMin };
      const r = await writeHrSettingsKeys(tx, ctx, { hrOt: nx }); // HR-SET-1 ▸ เปลี่ยนเฉพาะคีย์ hrOt ◂
      if (r.count !== 1) throw new OtRefusal(SETTINGS_TEXT.notFound);
      return nx;
    }, TX_OPTS);
    await writeAudit({ tenantId: ctx.tenantId, actorType: viewer.userId ? "USER" : "SYSTEM", actorId: viewer.userId ?? null, action: "hr.settings.ot-policy.update", targetType: "AppSystem", targetId: ctx.systemId, after: { systemId: ctx.systemId, ...next } });
    return { ok: true, id: ctx.systemId };
  } catch (e) {
    return refuse(reasonOf(e));
  }
}

// ═════════════ ยื่น (R5) ═════════════
function windowText(code: string, p: OtPolicy): string {
  if (code === "TOO_SHORT") return T.tooShort;
  if (code === "TOO_LONG") return T.tooLong;
  if (code === "LATE") return otText(T.late, { n: p.afterHours });
  if (code === "TOO_FAR") return otText(T.tooFar, { n: p.maxAheadDays });
  return T.range;
}
/** วันนั้นมีกะ/ตารางทำงานไหม (ไม่มี = วันหยุด ⇒ ยื่นได้วันละ 1 คำขอ) — กติกาเดียวกับช่องของ judge.ts: สัปดาห์ที่ใช้ตารางกะ = ดูกะ · ไม่งั้นตารางประจำ (ไม่ใช่วันหยุดร้าน) */
async function hasShiftOn(tx: Tx, ctx: Ctx, emp: EmpRow, day: string): Promise<boolean> {
  const mon = mondayOf(day);
  const entries = await tx.hrRosterEntry.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, publishedAt: { not: null }, date: { gte: dbDate(mon), lte: dbDate(addDays(mon, 6)) } }, select: { date: true }, take: 100 });
  if (entries.some((e) => dayOf(e.date) === day)) return true;
  if (entries.length) return false;
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  const sch = await tx.hrWorkSchedule.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, weekday: wd }, select: { dayOff: true, startMin: true, endMin: true, createdAt: true } });
  if (!sch || sch.dayOff || sch.startMin === sch.endMin || day < bkkDayKey(sch.createdAt)) return false;
  const unit = unitOfDay(emp, day);
  return !holidayOfDay(await holidayRowsInRange(tx, day, day, [unit]), unit, day);
}
async function weekMinutes(tx: Tx, ctx: Ctx, employeeId: string, day: string): Promise<number> {
  const mon = mondayOf(day);
  const rows = await tx.hrOtRequest.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, status: { in: LIVE }, date: { gte: dbDate(mon), lte: dbDate(addDays(mon, 6)) } }, select: { minutes: true }, take: 500 });
  return rows.reduce((a, r) => a + r.minutes, 0);
}

/** r2.8a ใบลาเต็มวันที่อนุมัติแล้วครอบวันนั้น (ไม่ใช่ครึ่งวัน/รายชั่วโมง) */
async function fullDayLeave(db: Tx, ctx: Ctx, employeeId: string, day: string): Promise<boolean> {
  return !!(await db.hrLeave.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, status: "APPROVED", fromDate: { lte: dbDate(day) }, toDate: { gte: dbDate(day) }, halfDay: null, hours: null }, select: { id: true } }));
}
/** r2.8b มีค่าจ้างฐานให้คิด OT ไหม (คำตอบใช่/ไม่ใช่เท่านั้น — ไม่ส่งตัวเลขออก) */
async function hasRate(db: Tx, ctx: Ctx, employeeId: string): Promise<boolean> {
  const p = await db.hrSalaryProfile.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId }, select: { payType: true, baseSalarySatang: true, dailyRateSatang: true, hourlyRateSatang: true, otHourlyRateSatang: true } });
  return !!p && otLegalRateFloor({ ...p, otHourlyRateSatang: null }, OT_LAW_DEFAULT) !== null;
}

/** ยื่นคำขอ OT — ไม่ส่ง employeeId = ของตัวเอง · ปฏิเสธ = ไม่มีอะไรถูกเขียน · warnWeek = OT ที่ยังมีผลของสัปดาห์ (จ.–อา.) เกิน 36 ชม. (เตือนอย่างเดียว · Q9) */
export async function requestOt(
  ctx: Ctx,
  actor: OtViewer,
  input: { employeeId?: unknown; date?: unknown; start?: unknown; end?: unknown; reason?: unknown },
  opts: { now?: Date } = {},
): Promise<{ ok: true; id: string; timing: OtTiming; warnWeek: boolean } | Fail> {
  const now = nowOf(opts);
  const uid = str(actor?.userId);
  const date = str(input?.date);
  const given = str(input?.employeeId);
  const db = dbOf(ctx);
  let emp: EmpRow | null;
  let self: boolean;
  if (!given) {
    const link = uid ? await employeeOfUser(ctx.tenantId, uid) : null;
    if (!link || link.systemId !== ctx.systemId) return refuse(T.noEmp);
    emp = await empOf(db, ctx, link.employeeId);
    if (!emp) return refuse(T.noEmp);
    self = true;
  } else {
    emp = await empOf(db, ctx, given);
    if (!emp || !uid || !canRequestFor(actor, unitOfDay(emp, isDay(date) ? date : bkkDayKey(now)))) return refuse(T.noPermRequest);
    self = emp.linkedUserId === uid;
  }
  const sMin = hm(input?.start);
  const eMin = hm(input?.end);
  if (!isDay(date) || sMin === null || eMin === null) return refuse(T.range);
  const startAt = bkkAt(date, sMin);
  const endAt = bkkAt(eMin <= sMin ? addDays(date, 1) : date, eMin);
  const pol = await policyIn(db, ctx);
  const w = otWindow({ startAt, endAt, now, afterHours: pol.afterHours, maxAheadDays: pol.maxAheadDays });
  if (!w.ok) return refuse(windowText(w.code, pol));
  if (self && emp.employmentStatus === "ENDED") return refuse(T.ended);
  if (!employedOn(emp, date)) return refuse(T.outOfEmployment);
  if (await fullDayLeave(db, ctx, emp.id, date)) return refuse(T.leaveDay); // r2.8a
  if (!(await hasRate(db, ctx, emp.id))) return refuse(T.noRate); // r2.8b: ไม่มีค่าจ้างฐาน (คอมมิชชันล้วน) ⇒ ปฏิเสธตอนยื่น ไม่จอดรอตลอดไป
  const minutes = Math.round((endAt.getTime() - startAt.getTime()) / MIN_MS);
  const reason = str(input?.reason).slice(0, 200) || null;
  const e = emp;
  try {
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, `hr:ot-emp:${ctx.systemId}:${e.id}`);
      const clash = await tx.hrOtRequest.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: e.id, status: { in: LIVE }, startAt: { lt: endAt }, endAt: { gt: startAt } }, select: { id: true } });
      if (clash) throw new OtRefusal(T.overlap);
      if (!(await hasShiftOn(tx, ctx, e, date))) {
        const same = await tx.hrOtRequest.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: e.id, status: { in: LIVE }, date: dbDate(date) }, select: { id: true } });
        if (same) throw new OtRefusal(T.dayOffOne);
      }
      const row = await tx.hrOtRequest.create({
        data: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: e.id, date: dbDate(date), startAt, endAt, minutes, timing: w.timing, reason, status: "PENDING", requestedByUserId: uid },
        select: { id: true },
      });
      return { id: row.id, warnWeek: (await weekMinutes(tx, ctx, e.id, date)) > OT_WEEK_WARN_MIN };
    }, TX_OPTS);
    await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: uid, action: "hr.ot.request", targetType: "HrOtRequest", targetId: out.id, after: { otRequestId: out.id, employeeId: e.id, systemId: ctx.systemId, date, minutes, timing: w.timing } });
    return { ok: true, id: out.id, timing: w.timing, warnWeek: out.warnWeek };
  } catch (err) {
    return refuse(reasonOf(err, T.overlap));
  }
}

/** ยกเลิกคำขอที่ยังรออนุมัติ — ผู้ยื่นหรือตัวพนักงานเท่านั้น (คนอื่น = cancelNo · ไม่พบ = notFound) */
export async function cancelOtRequest(ctx: Ctx, actor: OtViewer, id: string): Promise<{ ok: true } | Fail> {
  const uid = str(actor?.userId);
  const rid = str(id);
  const db = dbOf(ctx);
  const r = rid ? await db.hrOtRequest.findFirst({ where: { id: rid, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, employeeId: true, status: true, requestedByUserId: true } }) : null;
  if (!r) return refuse(T.notFound);
  const emp = await empOf(db, ctx, r.employeeId);
  const mine = !!uid && (r.requestedByUserId === uid || emp?.linkedUserId === uid);
  if (!mine || r.status !== "PENDING") return refuse(T.cancelNo);
  try {
    const n = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, `hr:ot:${r.id}`);
      return (await tx.hrOtRequest.updateMany({ where: { id: r.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } })).count;
    }, TX_OPTS);
    if (n !== 1) return refuse(T.cancelNo);
    await writeAudit({ tenantId: ctx.tenantId, actorType: "USER", actorId: uid, action: "hr.ot.cancel", targetType: "HrOtRequest", targetId: r.id, after: { otRequestId: r.id, employeeId: r.employeeId, systemId: ctx.systemId } });
    return { ok: true };
  } catch (err) {
    return refuse(reasonOf(err));
  }
}

// ═════════════ ตัดสิน · ยกเลิกที่อนุมัติแล้ว (R9 · R10) ═════════════
type Gate = { ok: true; req: OtRow; emp: EmpRow; unitId: string | null } | Fail;
/** ด่านผู้ตัดสิน — ไม่ใช่ผู้ตัดสิน/นอกสาขา/ร้านอื่น/ระบบอื่น/ไม่พบ = notFound (ไบต์เดียวกัน) */
async function gate(ctx: Ctx, viewer: OtViewer, id: string): Promise<Gate> {
  const rid = str(id);
  if (!viewer || !str(viewer.userId) || !rid) return refuse(T.notFound);
  const db = dbOf(ctx);
  const req = (await db.hrOtRequest.findFirst({ where: { id: rid, tenantId: ctx.tenantId, systemId: ctx.systemId } })) as OtRow | null;
  if (!req) return refuse(T.notFound);
  const emp = await empOf(db, ctx, req.employeeId);
  if (!emp) return refuse(T.notFound);
  const unitId = unitOfDay(emp, dayOf(req.date));
  if (!canDecide(viewer, unitId)) return refuse(T.notFound);
  return { ok: true, req, emp, unitId };
}

/** อนุมัติ/ไม่อนุมัติคำขอที่รออยู่ — อนุมัติแล้วจ่ายในธุรกรรมเดียวกันเมื่อวันนั้นพร้อม (ไม่พร้อม = settled false · ตัวรายชั่วโมงจ่ายต่อ) */
export async function decideOtRequest(ctx: Ctx, viewer: OtViewer, id: string, status: "APPROVED" | "REJECTED", opts: { now?: Date } = {}): Promise<{ ok: true; status: "APPROVED" | "REJECTED"; settled: boolean } | Fail> {
  const now = nowOf(opts);
  if (status !== "APPROVED" && status !== "REJECTED") return refuse(T.notFound);
  const g = await gate(ctx, viewer, id);
  if (!g.ok) return g;
  const uid = str(viewer.userId);
  if (g.emp.linkedUserId && g.emp.linkedUserId === uid) return refuse(T.self);
  if (status === "APPROVED" && viewer.role !== "OWNER" && g.req.requestedByUserId === uid) return refuse(T.fourEyes);
  if (g.req.status !== "PENDING") return refuse(T.decided);
  if (status === "APPROVED" && (await fullDayLeave(dbOf(ctx), ctx, g.req.employeeId, dayOf(g.req.date)))) return refuse(T.leaveDay); // r2.8a
  try {
    if (status === "REJECTED") {
      const n = await tenantDb(ctx).$transaction(async (t) => {
        const tx = t as unknown as Tx;
        await lock(tx, `hr:ot:${g.req.id}`);
        const u = await tx.hrOtRequest.updateMany({ where: { id: g.req.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "PENDING" }, data: { status: "REJECTED", decidedById: uid, decidedAt: now } });
        if (u.count === 1) await emitDecided(tx, ctx, g.req, "REJECTED", g.unitId);
        return u.count;
      }, TX_OPTS);
      if (n !== 1) return refuse(T.decided);
      await audit(ctx, uid, "hr.ot.reject", g.req, {});
      return { ok: true, status: "REJECTED", settled: false };
    }
    const out = await settleTx(ctx, g.req, { kind: "approve", by: uid, unitId: g.unitId }, now);
    if (out.code === "DECIDED" || out.code === "GONE") return refuse(T.decided);
    await audit(ctx, uid, "hr.ot.approve", g.req, out.settled ? settleAudit(out) : { settleCode: out.settleCode ?? null });
    return { ok: true, status: "APPROVED", settled: out.settled };
  } catch (err) {
    return refuse(reasonOf(err));
  }
}

/** ยกเลิก OT ที่อนุมัติแล้ว (ผู้ตัดสิน · เหตุผล 3–200 ตัวอักษร) — แถวที่ยังไม่เข้ารอบ ⇒ REJECTED · ที่เข้ารอบแล้ว ⇒ DEDUCTION ส่วนต่างในงวดที่ยังเปิด (Q13) */
export async function revokeOtRequest(ctx: Ctx, viewer: OtViewer, id: string, input: { reason?: unknown }, opts: { now?: Date } = {}): Promise<{ ok: true } | Fail> {
  const now = nowOf(opts);
  const g = await gate(ctx, viewer, id);
  if (!g.ok) return g;
  const uid = str(viewer.userId);
  if (g.emp.linkedUserId && g.emp.linkedUserId === uid) return refuse(T.self);
  const reason = str(input?.reason);
  if (Array.from(reason).length < 3 || Array.from(reason).length > 200) return refuse(T.revokeReason);
  if (g.req.status !== "APPROVED") return refuse(T.decided);
  try {
    const out = await settleTx(ctx, g.req, { kind: "revoke", by: uid, unitId: g.unitId, reason }, now);
    if (out.code === "DECIDED" || out.code === "GONE") return refuse(T.decided);
    await audit(ctx, uid, "hr.ot.revoke", g.req, settleAudit(out));
    return { ok: true };
  } catch (err) {
    return refuse(reasonOf(err));
  }
}

async function emitDecided(tx: Tx, ctx: Ctx, r: { id: string; employeeId: string }, status: "APPROVED" | "REJECTED" | "CANCELLED", unitId: string | null): Promise<void> {
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    unitId,
    type: OT_DECIDED_EVENT,
    idempotencyKey: `${OT_DECIDED_EVENT}#${r.id}#${status}`,
    payload: { otRequestId: r.id, systemId: ctx.systemId, employeeId: r.employeeId, status },
  });
}
async function audit(ctx: Ctx, uid: string | null, action: string, r: { id: string; employeeId: string }, extra: Record<string, unknown>): Promise<void> {
  await writeAudit({ tenantId: ctx.tenantId, actorType: uid ? "USER" : "SYSTEM", actorId: uid, action, targetType: "HrOtRequest", targetId: r.id, after: { otRequestId: r.id, employeeId: r.employeeId, systemId: ctx.systemId, ...extra } });
}
const settleAudit = (o: SettleOut) => ({ settleCode: o.settleCode ?? null, adjustmentId: o.created?.id ?? null, periodKey: o.created?.periodKey ?? null, gen: o.gen ?? null, rejected: o.rejected ?? 0 });

// ═════════════ การจ่าย (R6 · R7 · R8 · R10) ═════════════
type Basis = OtProfile & { law: OtLaw; lawRowId: string | null; normalDayMin?: number }; // HR H3.4 ▸ R11 + normalDayMin (ไม่มี = 480 — ฐานเดิมก่อน H3.4) ◂
/** r2.7 สิ่งที่ตรึงตอนจ่ายครั้งแรก: ขั้นปัดนาที (otRoundMin) + ฐานค่าจ้าง/กฎหมาย (เมื่อมีนาทีที่ต้องคิดเงินครั้งแรก) */
type Frozen = { otRoundMin: number; profile: Basis | null };
type Entitlement =
  | { kind: "wait"; code: "WAIT" | "STALE" | "NO_SCHEDULE" | "NO_RATE" | "LAW" | "OVERFLOW" }
  | { kind: "pay"; paid: number; amount: number; segments: OtSegment[]; dayId: string | null; version: number | null; frozen: Frozen | null; dayClass: OtDayClass | null; code: string | null };
type SettleMode = { kind: "approve"; by: string; unitId: string | null } | { kind: "revoke"; by: string; unitId: string | null; reason: string } | { kind: "settle" };
type SettleOut = { code: "DECIDED" | "GONE" | "SKIP" | "WAIT" | "SETTLED"; settled: boolean; settleCode?: string; created?: { id: string; periodKey: string } | null; gen?: number; rejected?: number };

const overlapMin = (s: Date, e: Date, from: Date | null, to: Date | null): number => {
  if (!from || !to) return 0;
  const a = Math.max(s.getTime(), from.getTime());
  const b = Math.min(e.getTime(), to.getTime());
  return b > a ? Math.floor((b - a) / MIN_MS) : 0;
};
const isBasis = (b: unknown): b is Basis => !!b && typeof b === "object" && typeof (b as Record<string, unknown>).payType === "string" && !!(b as Record<string, unknown>).law;
const frozenOf = (raw: unknown): Frozen | null => {
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!b) return null;
  if (typeof b.otRoundMin === "number") return { otRoundMin: b.otRoundMin, profile: isBasis(b.profile) ? b.profile : null };
  return isBasis(b) ? { otRoundMin: 0, profile: b } : null; // รูปเดิมก่อน r2 (ข้อมูลทดสอบของเลนเท่านั้น) — ขั้นยังไม่ตรึง
};
const pay0 = (code: string | null, dayId: string | null, version: number | null, frozen: Frozen | null, dayClass: OtDayClass | null): Entitlement => ({ kind: "pay", paid: 0, amount: 0, segments: [], dayId, version, frozen, dayClass, code });

/**
 * สิทธิ์ที่ควรได้ตอนนี้ของคำขอที่อนุมัติแล้ว — อ่านใต้ล็อก hr:judge:<dayId> ของทุกแถวของวันงาน/วันก่อน (ผู้เรียกถือล็อกงวด + hr:ot:<id> แล้ว) ·
 * r2.2 นาที = ช่วงที่ขอ ∩ เวลาที่ทำงานจริงหลังเลิกกะ (หักพัก/ช่องว่าง · ไม่ปัดด้วย otStepMin) ปัดลงด้วย otRoundMin ที่ตรึงไว้ (r2.7) ·
 * r2.8a ลาเต็มวัน ⇒ 0 (LEAVE) · r2.8c วันงานหลังวันสิ้นสุดการจ้าง ⇒ 0 (ENDED)
 */
async function measure(tx: Tx, ctx: Ctx, r: OtRow, now: Date): Promise<Entitlement> {
  const date = dayOf(r.date);
  const frozen0 = frozenOf(r.basisJson);
  const emp = await tx.hrEmployee.findFirst({ where: { id: r.employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { endDate: true } });
  if (emp?.endDate && date > dayOf(emp.endDate)) return pay0("ENDED", null, null, frozen0, null);
  const days = [addDays(date, -1), date];
  const ids = (await tx.hrAttendanceDay.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: r.employeeId, date: { in: days.map(dbDate) } }, select: { id: true } })).map((x) => x.id).sort();
  for (const id of ids) await lock(tx, `hr:judge:${id}`);
  const view = await otPayDaysInTx(tx, ctx, r.employeeId, days, now);
  const ov = (x: OtPayStoredRow) => otWorkedPaidMinutes({ reqStart: r.startAt, reqEnd: r.endAt, from: x.hasShift ? x.from : null, worked: x.worked, stepMin: 1 });
  const relevant = view.rows.filter((x) => x.day === date || ov(x) > 0 || x.outMissing);
  if (relevant.some((x) => x.stale)) return { kind: "wait", code: "STALE" };
  if (view.pending.some((p) => p.day === date)) return { kind: "wait", code: "WAIT" };
  const ranked = [...relevant].sort((a, b) => ov(b) - ov(a) || (a.day === date ? -1 : 0) - (b.day === date ? -1 : 0) || (a.id < b.id ? -1 : 1));
  const step = frozen0 && frozen0.otRoundMin > 0 ? frozen0.otRoundMin : (await policyIn(tx, ctx)).otRoundMin;
  const frozen: Frozen = { otRoundMin: step, profile: frozen0?.profile ?? null };
  let best = ranked[0] ?? null;
  if (!best || ov(best) === 0) {
    if (view.pending.length) return { kind: "wait", code: "WAIT" };
    if (!best) {
      if (now.getTime() < bkkAt(addDays(date, NO_ATTENDANCE_DAYS), 0).getTime()) return { kind: "wait", code: "WAIT" };
      return pay0(null, null, null, frozen, null); // ยังไม่สิ้นสุด: แถวผลลงเวลาโผล่ทีหลัง ⇒ ตัวรายชั่วโมงคิดใหม่ (r2.6)
    }
  }
  best = best!;
  const dayClass: OtDayClass = best.holidayId ? "HOLIDAY" : "WORKDAY";
  if (best.leaveFull) return pay0("LEAVE", best.id, best.version, frozen, dayClass);
  if (best.status === "NO_SCHEDULE") return { kind: "wait", code: "NO_SCHEDULE" };
  const paid = otWorkedPaidMinutes({ reqStart: r.startAt, reqEnd: r.endAt, from: best.hasShift ? best.from : null, worked: best.worked, stepMin: step });
  if (paid === 0) return pay0(null, best.id, best.version, frozen, dayClass);
  let basis = frozen.profile;
  if (!basis) {
    const p = await tx.hrSalaryProfile.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: r.employeeId }, select: { payType: true, baseSalarySatang: true, dailyRateSatang: true, hourlyRateSatang: true, otHourlyRateSatang: true } });
    if (!p) return { kind: "wait", code: "NO_RATE" };
    const law = otLawOf(await loadOtLawRows(best.day, tx as unknown as Parameters<typeof loadOtLawRows>[1]), best.day); // HR FIX (controller 12 Nov) ▸ cast ผ่าน unknown — tsc เทียบชนิด TransactionClient ทั้งก้อนกับชนิดพารามิเตอร์เกินขีดความซับซ้อน (TS2859) หลัง schema โตขึ้น · ไม่เอ่ยชื่อตารางกฎหมายในไฟล์นี้ (qc-hr-h3.3 S1.3: law.ts = ผู้อ่านเดียว) ◂
    if (!law.ok) return { kind: "wait", code: "LAW" };
    const sysN = normalMinutesOf((await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } }))?.settings); // HR H3.4 ▸ R11 ◂
    basis = { payType: p.payType, baseSalarySatang: p.baseSalarySatang, dailyRateSatang: p.dailyRateSatang, hourlyRateSatang: p.hourlyRateSatang, otHourlyRateSatang: p.otHourlyRateSatang, law: law.law, lawRowId: law.lawRowId, normalDayMin: sysN }; // HR H3.4 ◂
  }
  let amt = otAmount({ ...basis, hasShift: best.hasShift, dayClass, minutes: paid, law: basis.law, normalDayMin: basis.normalDayMin }); // HR H3.4 ▸ R11: ตัวหาร min(480, N) ตรึงต่อคำขอ ◂
  // HR H3.4 ▸ R11: นาที HOLIDAY_WORK ที่รอบเงินเดือนรุ่น 2 (APPROVED/PAID) คิดไปแล้วของวันนี้ หักออกจากส่วน HOLIDAY_WORK ของคำขอ (ไม่จ่ายซ้ำทั้งสองทาง) ◂
  if (amt.ok && amt.segments.some((g) => g.cls === "HOLIDAY_WORK")) { // HR H3.4 ◂
    const priced = await holidayWorkPricedInTx(tx as unknown as Prisma.TransactionClient, ctx, { employeeId: r.employeeId, day: date }); // HR H3.4 ◂
    const { worked } = await holidayWorkDayInTx(tx as unknown as Prisma.TransactionClient, ctx, { employeeId: r.employeeId, day: date }); // HR H3.4 ▸ fix r1 F1: W_day ◂
    if (priced > 0) { // HR H3.4 ◂
      const hw = amt.segments.find((g) => g.cls === "HOLIDAY_WORK")!; // HR H3.4 ◂
      const rest = amt.segments.filter((g) => g.cls !== "HOLIDAY_WORK"); // HR H3.4 ◂
      // HR H3.4 ▸ fix r1 F1: แถบของวัน = นาทีทำงานวันหยุดที่รอบเห็น (W_day) — รอบจ่ายไป priced คำขอได้ส่วนที่เหลือ (worked 400/priced 400 ⇒ 0 · 400/200 ⇒ 200) ·
      //   รอบเก่าที่ไม่เก็บ W_day ⇒ แถบปกติ min(480,N) ◂
      const band = worked ?? otDayMinutes(basis.law, basis.normalDayMin); // HR H3.4 ◂
      const others = worked === null ? 0 : await otherHolidayWorkMinInTx(tx, ctx, r); // HR H3.4 ▸ fix r2 G4: นาที HOLIDAY_WORK ที่คำขออื่นของวันเดียวกันจ่ายไว้แล้ว ◂
      const left = Math.min(hw.minutes, Math.max(0, band - priced - others)); // HR H3.4 ◂
      const hwAmt = left > 0 ? otAmount({ ...basis, hasShift: false, dayClass, minutes: left, law: basis.law, normalDayMin: basis.normalDayMin }) : null; // HR H3.4 ◂
      const segs = [...(hwAmt && hwAmt.ok ? hwAmt.segments.filter((g) => g.cls === "HOLIDAY_WORK") : []), ...rest]; // HR H3.4 ◂
      amt = { ok: true, segments: segs, amountSatang: segs.reduce((x, g) => x + g.amountSatang, 0) }; // HR H3.4 ◂
    } // HR H3.4 ◂
  } // HR H3.4 ◂
  if (!amt.ok) return { kind: "wait", code: amt.code === "OVERFLOW" ? "OVERFLOW" : "NO_RATE" };
  return { kind: "pay", paid, amount: amt.amountSatang, segments: amt.segments, dayId: best.id, version: best.version, frozen: { otRoundMin: step, profile: basis }, dayClass, code: null };
}

/** งวดปลายทาง (R7): ไม่มีรอบที่ยังมีผลตั้งแต่ P0 ⇒ P0 · ไม่งั้นเดือนหลังรอบล่าสุด — ล็อกแล้วตรวจซ้ำจนนิ่ง (มากขึ้นเท่านั้น ⇒ ลำดับล็อกเรียงเสมอ) */
async function lockTarget(tx: Tx, ctx: Ctx, p0: string, held: Set<string>): Promise<string> {
  let t: string | null = null;
  for (let i = 0; i < 36; i++) {
    const latest = (await tx.hrPayrollRun.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: { gte: p0 }, status: { not: "REVERSED" } }, orderBy: { periodKey: "desc" }, select: { periodKey: true } }))?.periodKey ?? null;
    let want = latest ? nextMonth(latest) : p0;
    if (t !== null && want < t) want = t;
    if (t === want) return t;
    if (!held.has(want)) {
      await lock(tx, payKey(ctx, want));
      held.add(want);
    }
    t = want;
  }
  throw new OtRefusal(T.failed);
}

/** ธุรกรรมเดียวของการตัดสิน/ยกเลิก/จ่าย — ล็อกตามลำดับในหัวไฟล์ · คืนผลโดยไม่ throw สำหรับสถานะที่เปลี่ยนไปแล้ว */
async function settleTx(ctx: Ctx, base: { id: string; date: Date; employeeId: string }, mode: SettleMode, now: Date): Promise<SettleOut> {
  const date = dayOf(base.date);
  const p0 = date.slice(0, 7);
  const pPrev = addDays(date, -1).slice(0, 7);
  return tenantDb(ctx).$transaction(async (t): Promise<SettleOut> => {
    const tx = t as unknown as Tx;
    const held = new Set<string>();
    for (const p of [...new Set([pPrev, p0])].sort()) {
      await lock(tx, payKey(ctx, p));
      held.add(p);
    }
    const target = await lockTarget(tx, ctx, p0, held);
    await lock(tx, `hr:ot:${base.id}`);
    const r = (await tx.hrOtRequest.findFirst({ where: { id: base.id, tenantId: ctx.tenantId, systemId: ctx.systemId } })) as OtRow | null;
    if (!r) return { code: "GONE", settled: false };
    let decidedBy = r.decidedById;
    if (mode.kind === "approve") {
      if (r.status !== "PENDING") return { code: "DECIDED", settled: false };
      const u = await tx.hrOtRequest.updateMany({ where: { id: r.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "PENDING" }, data: { status: "APPROVED", decidedById: mode.by, decidedAt: now } });
      if (u.count !== 1) return { code: "DECIDED", settled: false };
      await emitDecided(tx, ctx, r, "APPROVED", mode.unitId);
      decidedBy = mode.by;
    } else if (mode.kind === "revoke") {
      if (r.status !== "APPROVED") return { code: "DECIDED", settled: false };
      const u = await tx.hrOtRequest.updateMany({ where: { id: r.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "APPROVED" }, data: { status: "CANCELLED", revokedAt: now, revokedById: mode.by, revokeReason: mode.reason } });
      if (u.count !== 1) return { code: "DECIDED", settled: false };
      await emitDecided(tx, ctx, r, "CANCELLED", mode.unitId);
      decidedBy = mode.by;
    } else if (r.status !== "APPROVED") return { code: "SKIP", settled: false };

    const ent: Entitlement =
      mode.kind === "revoke"
        ? await revokeKeepInTx(tx, ctx, r) // HR H3.4 ▸ fix r2 G3: ยกเลิกหลังรอบรุ่น 2 คิดวันนั้นแล้ว ⇒ คงค่าทำงานวันหยุดของนาทีที่รอบหักออกให้คำขอนี้ ◂
        : await measure(tx, ctx, r, now);
    if (ent.kind === "wait") {
      // r2.4: เขียนทุกครั้ง (updatedAt ขยับ) ⇒ ตัวรายชั่วโมงหยิบคำขอที่ลองนานที่สุดก่อน — คำขอที่รอไม่ขวางคำขอที่พร้อมจ่าย
      await tx.hrOtRequest.updateMany({ where: { id: r.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { settleCode: ent.code } });
      return { code: "WAIT", settled: false, settleCode: ent.code };
    }
    const res = await writeOtAdjustmentInTx(tx, ctx, {
      otRequestId: r.id,
      employeeId: r.employeeId,
      entitledSatang: ent.amount,
      nextGen: r.settleGen + 1,
      targetPeriod: target,
      paidMinutes: ent.paid,
      requestedById: r.requestedByUserId,
      decidedById: decidedBy,
      dateLabel: formatThaiDate(r.date),
      now,
    });
    await tx.hrOtRequest.updateMany({
      where: { id: r.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
      data: {
        paidMinutes: ent.paid,
        amountSatang: ent.amount,
        segmentsJson: ent.segments as unknown as Prisma.InputJsonValue,
        ...(ent.frozen && JSON.stringify(ent.frozen) !== JSON.stringify(r.basisJson) ? { basisJson: ent.frozen as unknown as Prisma.InputJsonValue, lawRowId: ent.frozen.profile?.lawRowId ?? null } : {}),
        attendanceDayId: ent.dayId,
        attendanceDayVersion: ent.version,
        multiplierBp: topMultiplierBp(ent.segments) ?? (mode.kind === "revoke" ? r.multiplierBp : null),
        settleGen: res.gen,
        settleCode: ent.code,
        settledAt: now,
      },
    });
    return { code: "SETTLED", settled: true, created: res.created ? { id: res.created.id, periodKey: res.created.periodKey } : null, gen: res.gen, rejected: res.rejected };
  }, TX_OPTS);
}

/**
 * ตัวจ่ายรายชั่วโมง (+ ข้อสอบ): คำขอ APPROVED ที่ยังไม่จ่าย หรือจ่ายแล้วแต่แถวผลลงเวลาเปลี่ยนรุ่น/หายไป (คิดใหม่ = รายการส่วนต่าง) ·
 * ≤ maxTx ธุรกรรมต่อรอบ (ค่าตั้งต้น 100) · `tenantId` บังคับ (cron วนร้าน/ระบบเอง) · `systemId` = จำกัดระบบเดียว · พังรายคำขอ = ops WARN id ล้วน แล้วไปต่อ
 */
export async function settleOtRequests(input: { tenantId?: string | null; systemId?: string | null; now: Date; maxTx?: number }): Promise<{ scanned: number; settled: number; waiting: number; failed: number }> {
  const out = { scanned: 0, settled: 0, waiting: 0, failed: 0 };
  const tenantId = str(input?.tenantId);
  if (!tenantId) return out;
  const now = input?.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now : new Date();
  const maxTx = Number.isInteger(input?.maxTx) && input.maxTx! > 0 ? input.maxTx! : 100;
  const systems = str(input?.systemId)
    ? [str(input.systemId)]
    : (await tenantDb({ tenantId }).appSystem.findMany({ where: { tenantId, type: "HR" }, select: { id: true }, orderBy: { id: "asc" }, take: 200 })).map((s) => s.id);
  const since = dbDate(addDays(bkkDayKey(now), -SETTLE_BACK_DAYS));
  for (const systemId of systems) {
    if (out.scanned >= maxTx) break;
    const ctx: Ctx = { tenantId, systemId };
    const db = dbOf(ctx);
    // r2.4: ที่ยังไม่จ่าย เรียงตามครั้งที่ลองล่าสุด (updatedAt — การรอเขียนทุกครั้ง) ⇒ ทุกคำขอได้คิว คำขอที่พร้อมไม่ถูกขวางถาวร
    const open = await db.hrOtRequest.findMany({ where: { tenantId, systemId, status: "APPROVED", settledAt: null, date: { gte: since } }, select: { id: true, date: true, employeeId: true }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: maxTx });
    const done = await db.hrOtRequest.findMany({ where: { tenantId, systemId, status: "APPROVED", settledAt: { not: null }, attendanceDayId: { not: null }, date: { gte: since } }, select: { id: true, date: true, employeeId: true, attendanceDayId: true, attendanceDayVersion: true }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 5000 });
    const dayIds = [...new Set(done.map((d) => d.attendanceDayId!).filter(Boolean))];
    const ver = new Map((dayIds.length ? await db.hrAttendanceDay.findMany({ where: { tenantId, systemId, id: { in: dayIds } }, select: { id: true, version: true } }) : []).map((d) => [d.id, d.version] as const));
    const changed = done.filter((d) => ver.get(d.attendanceDayId!) !== d.attendanceDayVersion);
    // r2.6 + r3.1: จ่าย 0 เพราะไม่มีผลลงเวลา (ไม่มีแถว) ไม่ใช่ที่สิ้นสุด — คิดใหม่เมื่อมีแถวที่ "เกี่ยวกับคำขอ" เท่านั้น:
    //   แถวของวันงาน หรือแถวของวันก่อนที่ช่วงเข้า–ออกทับช่วงที่ขอ (แบบเดียวกับที่ measure นับ) ⇒ คิดใหม่แล้ว attendanceDayId ไม่ว่าง ⇒ ไม่วนซ้ำ ·
    //   แถววันก่อนที่ไม่ทับช่วงที่ขอ ⇒ ไม่หยิบ (กันคำขอ 0 บาทกินโควตาธุรกรรมทุกชั่วโมง)
    const zero = await db.hrOtRequest.findMany({ where: { tenantId, systemId, status: "APPROVED", settledAt: { not: null }, attendanceDayId: null, settleCode: null, date: { gte: since } }, select: { id: true, date: true, employeeId: true, startAt: true, endAt: true }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 2000 });
    const zDays = zero.map((z) => dayOf(z.date)).sort();
    const spans = zero.length ? await otDaySpans(ctx, zero.map((z) => z.employeeId), addDays(zDays[0]!, -1), zDays[zDays.length - 1]!) : [];
    const reappeared = zero.filter((z) => {
      const d = dayOf(z.date);
      const prev = addDays(d, -1);
      return spans.some((x) => x.employeeId === z.employeeId && (x.day === d || (x.day === prev && !!x.inAt && !!x.outAt && x.outAt.getTime() > z.startAt.getTime() && x.inAt.getTime() < z.endAt.getTime())));
    });
    for (const r of [...changed, ...reappeared, ...open]) {
      if (out.scanned >= maxTx) break;
      out.scanned++;
      try {
        const o = await settleTx(ctx, r, { kind: "settle" }, now);
        if (o.code === "SETTLED") {
          out.settled++;
          if (o.created) await audit(ctx, null, "hr.ot.settle", r, settleAudit(o));
        } else if (o.code === "WAIT") out.waiting++;
      } catch (e) {
        out.failed++;
        await logOps("WARN", "hr.ot", "settleOtRequests: จ่าย OT ไม่สำเร็จ (ข้ามไปก่อน รอบหน้าลองใหม่)", { tenantId, detail: `system=${systemId} ot=${r.id} ${e instanceof OtAdjustmentConflict ? e.message : "error"}` }).catch(() => {});
      }
    }
  }
  return out;
}

// ═════════════ ตัวอ่าน (R11) ═════════════
type ListRow = OtRow & { employee: { name: string } };
async function toItems(db: Tx, ctx: Ctx, rows: ListRow[], emps: Map<string, EmpRow>, money: boolean | ((e: EmpRow | undefined) => boolean)): Promise<OtItem[]> { // HR PRIV-2 ▸ money = ต่อแถวได้ (ขอบเขตค่าจ้างของพนักงาน) ◂
  if (!rows.length) return [];
  const days = rows.map((r) => dayOf(r.date)).sort();
  const from = mondayOf(days[0]!);
  const to = addDays(mondayOf(days[days.length - 1]!), 6);
  const units = [...new Set(rows.map((r) => { const e = emps.get(r.employeeId); return e ? unitOfDay(e, dayOf(r.date)) : null; }))];
  const hols = await holidayRowsInRange(db, from, to, units);
  const empIds = [...new Set(rows.map((r) => r.employeeId))];
  const week = await db.hrOtRequest.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: empIds }, status: { in: LIVE }, date: { gte: dbDate(from), lte: dbDate(to) } }, select: { employeeId: true, date: true, minutes: true }, take: 5000 });
  const weekMin = new Map<string, number>();
  for (const w of week) {
    const k = `${w.employeeId}|${mondayOf(dayOf(w.date))}`;
    weekMin.set(k, (weekMin.get(k) ?? 0) + w.minutes);
  }
  return rows.map((r) => {
    const day = dayOf(r.date);
    const e = emps.get(r.employeeId);
    const unit = e ? unitOfDay(e, day) : null;
    const baseItem: OtItemBase = {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      date: day,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      requestedMin: r.minutes,
      paidMin: r.paidMinutes ?? null,
      timing: r.timing,
      status: r.status,
      dayClass: holidayOfDay(hols, unit, day) ? "HOLIDAY" : "WORKDAY",
      multiplierBp: r.multiplierBp ?? null,
      warnWeek: (weekMin.get(`${r.employeeId}|${mondayOf(day)}`) ?? 0) > OT_WEEK_WARN_MIN,
      settled: !!r.settledAt,
      reason: r.reason ?? null,
    };
    if (!(typeof money === "function" ? money(e) : money)) return baseItem; // HR PRIV-2 ◂
    return { ...baseItem, amountSatang: r.amountSatang ?? null, segments: Array.isArray(r.segmentsJson) ? (r.segmentsJson as unknown as OtSegment[]) : [] };
  });
}
const LIST_TAKE = 500;
const STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);

/** รายการคำขอ OT ของผู้ตัดสิน/ผู้ดูเงินเดือน (เฉพาะสาขาในขอบเขต) · เงินเฉพาะ OWNER/hr.payroll.read (Q11) · คนอื่น = listNo */
export async function otRequestList(ctx: Ctx, viewer: OtViewer, input: { from?: unknown; to?: unknown; status?: unknown } = {}): Promise<{ ok: true; items: OtItem[]; capped?: true } | Fail> { // HR H2.11 ▸ capped = คิวรีดิบชนเพดาน LIST_TAKE ◂
  if (!viewer || !canList(viewer)) return refuse(T.listNo);
  const today = bkkDayKey(new Date());
  const from = isDay(input?.from) ? input.from : addDays(today, -35);
  const to = isDay(input?.to) ? input.to : addDays(today, 31);
  const status = typeof input?.status === "string" && STATUSES.has(input.status) ? (input.status as "PENDING") : undefined;
  const db = dbOf(ctx);
  // HR H2.11 ▸ r2 (มติผู้คุม · hunter F1): ขอบเขตสาขาในคิวรีก่อนเพดาน — พนักงานที่สาขาประจำหรือแถวยืมตัวใดอยู่ในขอบเขต (ชุดที่ใหญ่กว่าเสมอ) ·
  //   ตัวกรองสาขาของวันเดิมข้างล่างคงเดิม (ไม่ขยาย/ไม่แคบลง) · ทุกสาขา = ไม่กรอง · แถวไม่มีสาขา = ตกเหมือนเดิม ◂
  const sc211 = scopeOf(viewer);
  const unit211: Prisma.HrOtRequestWhereInput = sc211.unitIds === "*" ? {} : { employee: { OR: [{ unitId: { in: sc211.unitIds } }, { units: { some: { unitId: { in: sc211.unitIds } } } }] } };
  const rows = (await db.hrOtRequest.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, date: { gte: dbDate(from), lte: dbDate(to) }, ...(status ? { status } : {}), ...unit211 }, // HR H2.11 ◂
    include: { employee: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { startAt: "desc" }, { id: "asc" }],
    take: LIST_TAKE,
  })) as ListRow[];
  const emps = new Map(((await db.hrEmployee.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: [...new Set(rows.map((r) => r.employeeId))] } }, select: EMP_SELECT })) as EmpRow[]).map((e) => [e.id, e] as const));
  const scope = scopeOf(viewer);
  const mine = rows.filter((r) => {
    const e = emps.get(r.employeeId);
    return !!e && covers(scope, unitOfDay(e, dayOf(r.date)));
  });
  // HR PRIV-2 ▸ R6/N1: แถว/นาทียังตามกติกายืมตัวเดิม · เงิน (amountSatang · segments) เฉพาะพนักงานที่สาขาประจำอยู่ในขอบเขตค่าจ้าง (ทุกสาขา = ทุกคน เหมือนเดิม) ◂
  const pay = seesMoney(viewer); // HR PRIV-2 ◂
  return { ok: true, items: await toItems(db, ctx, mine, emps, (e) => pay && !!e && inPayScope(scope, e.unitId)), ...(rows.length >= LIST_TAKE ? { capped: true as const } : {}) }; // HR H2.11 ◂ // HR PRIV-2 ◂
}

/** คำขอ OT ของตัวเอง (พนักงานจากบัญชีผู้ใช้เท่านั้น — ไม่รับ id) พร้อมยอดเงินของตัวเอง */
export async function myOtRequests(ctx: Ctx, actor: OtViewer): Promise<{ ok: true; items: OtItem[] } | Fail> {
  const uid = str(actor?.userId);
  const link = uid ? await employeeOfUser(ctx.tenantId, uid) : null;
  if (!link || link.systemId !== ctx.systemId) return refuse(T.noEmp);
  const db = dbOf(ctx);
  const emp = await empOf(db, ctx, link.employeeId);
  if (!emp) return refuse(T.noEmp);
  const rows = (await db.hrOtRequest.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id },
    include: { employee: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { startAt: "desc" }, { id: "asc" }],
    take: 100,
  })) as ListRow[];
  return { ok: true, items: await toItems(db, ctx, rows, new Map([[emp.id, emp]]), true) };
}

// ═════════════ ตัวรับ outbox (R12) ═════════════
type OtEvent = { id: string; tenantId: string; type: string; payload: unknown; systemId: string | null; unitId: string | null };
const NOTIFIED_AUDIT = "hr.ot.notified";
/** แจ้งพนักงาน (บัญชีที่ผูก) หนึ่งครั้งต่อคำขอต่อสถานะ — ไม่มีจำนวนเงิน · ล็อก hr-ot-notify:<id>:<สถานะ> + audit กันซ้ำ */
export async function notifyOtDecided(evt: OtEvent): Promise<void> {
  const p = (evt?.payload ?? {}) as { otRequestId?: unknown; systemId?: unknown; status?: unknown };
  const id = typeof p.otRequestId === "string" ? p.otRequestId : "";
  const systemId = typeof p.systemId === "string" ? p.systemId : (evt?.systemId ?? "");
  const status = p.status === "APPROVED" || p.status === "REJECTED" || p.status === "CANCELLED" ? p.status : null;
  if (!id || !systemId || !status || !evt?.tenantId) return;
  const ctx: Ctx = { tenantId: evt.tenantId, systemId };
  const title = status === "APPROVED" ? T.nTitleA : status === "REJECTED" ? T.nTitleR : T.nTitleC;
  const marker = `${id}#${status}`;
  await tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    await lock(tx, `hr-ot-notify:${marker}`);
    if (await tx.auditLog.findFirst({ where: { tenantId: ctx.tenantId, action: NOTIFIED_AUDIT, targetId: marker }, select: { id: true } })) return;
    const r = await tx.hrOtRequest.findFirst({ where: { id, tenantId: ctx.tenantId, systemId }, select: { id: true, employeeId: true, date: true } });
    const emp = r ? await tx.hrEmployee.findFirst({ where: { id: r.employeeId, tenantId: ctx.tenantId, systemId }, select: { linkedUserId: true } }) : null;
    if (r && emp?.linkedUserId) {
      await tx.appNotification.createMany({ data: [{ tenantId: ctx.tenantId, recipientUserId: emp.linkedUserId, title, body: otText(T.nBody, { d: formatThaiDate(r.date, { long: true }) }) }] });
    }
    await tx.auditLog.createMany({ data: [{ tenantId: ctx.tenantId, actorType: "SYSTEM", actorId: null, action: NOTIFIED_AUDIT, targetType: "HrOtRequest", targetId: marker, after: { otRequestId: id, status, notified: !!emp?.linkedUserId } }] });
  }, TX_OPTS);
}

// HR H2.10 ▸ ประตูปุ่ม "ยกเลิก" ของหน้า "ของฉัน" — สถานะเดียวที่ cancelOtRequest ข้างบนยอม (PENDING · ผู้ยื่นหรือตัวพนักงาน) ◂
export const otCancelOpen = (status: string): boolean => status === "PENDING";
// ◂ HR H2.10
// HR H3.4 ▸ (fix r2 G3/G4) ค่าทำงานในวันหยุดจ่ายครั้งเดียวต่อนาทีที่ทำจริง ไม่ว่าลำดับคำขอ/รอบ/ยกเลิก:
//   นาที HOLIDAY_WORK ที่คำขออื่น (อนุมัติ หรือยกเลิกแต่ยังคงส่วนที่ต้องจ่าย) ของพนักงาน·วันเดียวกันจ่ายไว้แล้ว ·
//   ยกเลิกคำขอหลังรอบรุ่น 2 (APPROVED/PAID) คิดวันนั้น: รอบหักนาทีของคำขอนี้ออกไปแล้ว ⇒ คำขอนี้คงส่วน HOLIDAY_WORK = min(นาทีของคำขอ, W_day − รอบจ่าย − คำขออื่น)
//   (ส่วน OT ×3 ถูกถอน) · ไม่มีรอบ = ถอนทั้งหมด (เดิม)
async function otherHolidayWorkMinInTx(tx: Tx, ctx: Ctx, r: OtRow): Promise<number> {
  const rows = await tx.hrOtRequest.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: r.employeeId, date: r.date, id: { not: r.id }, status: { in: ["APPROVED", "CANCELLED"] }, settledAt: { not: null } },
    select: { segmentsJson: true },
  });
  return rows.reduce((s, x) => s + hwMinutesOf(x.segmentsJson), 0);
}
function hwMinutesOf(segs: unknown): number {
  return (Array.isArray(segs) ? segs : []).reduce((s: number, g) => {
    const o = g && typeof g === "object" ? (g as Record<string, unknown>) : {};
    return s + (o.cls === "HOLIDAY_WORK" && typeof o.minutes === "number" ? o.minutes : 0);
  }, 0);
}
async function revokeKeepInTx(tx: Tx, ctx: Ctx, r: OtRow): Promise<Entitlement> {
  const none = pay0(null, r.attendanceDayId, r.attendanceDayVersion, frozenOf(r.basisJson), null);
  const frozen = frozenOf(r.basisJson);
  const mine = hwMinutesOf(r.segmentsJson);
  if (!frozen?.profile || mine <= 0 || !r.settledAt) return none;
  const day = dayOf(r.date);
  const { worked } = await holidayWorkDayInTx(tx as unknown as Prisma.TransactionClient, ctx, { employeeId: r.employeeId, day });
  if (worked === null) return none;
  const priced = await holidayWorkPricedInTx(tx as unknown as Prisma.TransactionClient, ctx, { employeeId: r.employeeId, day });
  const keep = Math.min(mine, Math.max(0, worked - priced - (await otherHolidayWorkMinInTx(tx, ctx, r))));
  if (keep <= 0) return none;
  const seg0 = (r.segmentsJson as unknown as OtSegment[]).find((g) => g.cls === "HOLIDAY_WORK");
  const law = frozen.profile.law;
  const dayClass: OtDayClass = seg0 && seg0.multiplierBp === raised(law).holidayWorkPaidBp ? "HOLIDAY" : "WORKDAY";
  const amt = otAmount({ ...frozen.profile, hasShift: false, dayClass, minutes: keep, law, normalDayMin: frozen.profile.normalDayMin });
  if (!amt.ok) return none;
  const segments = amt.segments.filter((g) => g.cls === "HOLIDAY_WORK");
  return { kind: "pay", paid: keep, amount: segments.reduce((x, g) => x + g.amountSatang, 0), segments, dayId: r.attendanceDayId, version: r.attendanceDayVersion, frozen, dayClass, code: null };
}
// ◂ HR H3.4
