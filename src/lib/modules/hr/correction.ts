// HR H2.6 ▸ คำขอแก้เวลา ("ลืมลงเวลาออก") — ยื่น → อนุมัติ → ประวัติเก็บครบ (server เท่านั้น) · brief hr-brief-H2.6 R2–R12 · มติผู้คุม Q1–Q18
//
// กติกา:
//   • ประวัติ = ยกเลิก (void) ไม่ลบ/ไม่เขียนทับ: ADD = แถวใหม่ · CHANGE = ยกเลิกแถวเป้าหมาย + แถวใหม่ชนิดเดิม · VOID = ยกเลิกแถวเป้าหมาย ·
//     แถวเดิมคงทุกคอลัมน์ (เพิ่มแค่ voidedAt/voidedByCorrectionId) · ไฟล์นี้เป็นผู้เขียน voidedAt และ HrTimeCorrection ผู้เดียว
//   • แถวใหม่: source CORRECTION · correctionId · ไม่มี note/พิกัด/อุปกรณ์ (Q14) · กะ + ผลตัดสินเข้างาน = สิ่งที่ clock() จะบันทึก ณ เวลานั้น
//     (clock.ts#correctedPunchColumnsInTx — คิดหลังยกเลิกแถวเป้าหมาย)
//   • ใช้ผล (ตัดสินตรง · ผลของสายอนุมัติ · เจ้าของยื่นเอง) ในธุรกรรมเดียว: ตรวจซ้ำใต้ล็อก → ยกเลิก/เพิ่มแถว → APPROVED → คิดผลแถวที่บันทึกแล้วใหม่
//     (judge.ts#recomputeStoredDaysInTx — ตัวตัดสินชุดเดียวกับ H2.5 · Q6) → event + แจ้งเตือน · ใช้ผลไม่ได้ = CANCELLED + audit รหัส
//   • ลำดับล็อก (R8): hr:payroll:run:<ระบบ>:<งวด> ของทุกงวดที่เกี่ยว (เรียง) → hr-corr:<id> → hr:clock:<พนักงาน> → hr:judge:<dayId> (เรียง) →
//     hr:roster:<ระบบ>:<พนักงาน>:<วัน> (เรียง) — ล็อกงวดก่อนเสมอเหมือน recomputeAttendanceDay ⇒ ไม่วนรอกับตัวคิดผลใหม่/ตัวปิดวัน/อนุมัติ-จ่ายเงินเดือน
//   • หลักฐาน POS (Q10): snapshot ตอนยื่น (src/lib/hr-pos-evidence.ts) · ไม่อนุมัติเอง ไม่บล็อก · ตอนใช้ผลไม่อ่าน
//   • เหตุผลของคำขอ = เฉพาะผู้ดู R9 · audit/outbox/แจ้งเตือนมีแค่ id/วัน/รหัส · ข้อความคงที่ไทยทุกไบต์ (correction-rules.ts CORRECTION_TEXT)
//   • เวลา `opts.now` = ข้อสอบ/ฝั่งเซิร์ฟเวอร์เท่านั้น — action/หน้าไม่ส่ง ◂
import { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { formatThaiDateFull } from "@/lib/ui/date";
import type { MembershipCtx } from "@/lib/core/rbac";
import { cancelRequest, SELF_DECIDE_REFUSED, submitForApproval } from "@/lib/modules/approval/service";
import { posShiftEvidence } from "@/lib/hr-pos-evidence";
import { CLOCK_TEXT, correctedPunchColumnsInTx } from "./clock";
import { recomputeStoredDaysInTx } from "./judge";
import { unitOfDay } from "./roster";
import { HR_OTHER_BRANCH_TEXT, HR_UNASSIGNED_TEXT, hrScopeOf } from "./scope";
import { employeeOfUser, type HrTx } from "./service";
import { addDays, bkkDayKey, bkkMidnight } from "./time-rules";
import {
  CORRECTION_ACTIONS,
  CORRECTION_RULES,
  CORRECTION_TEXT,
  PUNCH_KINDS,
  applyCodeText,
  checkCorrection,
  cleanCorrectionReason,
  sessionDayOf,
  type ApplyCode,
  type CorrectionAction,
  type LivePunch,
  type PunchKind,
} from "./correction-rules";

type Ctx = { tenantId: string; systemId: string };
type Tx = HrTx;
export type CorrectionActor = { userId: string; role: MembershipCtx["role"] | string; unitAccess: unknown; permissions?: unknown };
type Fail = { ok: false; reason: string };

export const CORRECTION_ENTITY = "HrTimeCorrection";
export const CORRECTION_EVENT = "hr.attendance.corrected";
const T = CORRECTION_TEXT;
const TX_OPTS = { maxWait: 20_000, timeout: 60_000 } as const;
const MIN_MS = 60_000;
const EVIDENCE_HOURS = 36;
const LIST_MAX = 200;

const refuse = (reason: string): Fail => ({ ok: false, reason });
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const nowOf = (opts: { now?: Date } | undefined): Date => (opts?.now instanceof Date && Number.isFinite(opts.now.getTime()) ? new Date(opts.now.getTime()) : new Date());
const toMinute = (d: Date) => new Date(Math.floor(d.getTime() / MIN_MS) * MIN_MS);
function dateOf(v: unknown): Date | null {
  const d = v instanceof Date ? v : typeof v === "string" && v.trim() ? new Date(v) : null;
  return d && Number.isFinite(d.getTime()) ? toMinute(d) : null;
}
class CorrectionRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorrectionRefusal";
  }
}
function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2002";
  const x = e as { code?: unknown; cause?: { code?: unknown; originalCode?: unknown } } | null;
  return !!x && (x.code === "P2002" || x.code === "23505" || x.cause?.code === "23505" || x.cause?.originalCode === "23505");
}
/** ล็อกต่อคีย์ (แบบ swap.ts/roster.ts — $queryRaw count) */
async function lockKey(tx: Tx, key: string): Promise<void> {
  await tx.$queryRaw`SELECT count(pg_advisory_xact_lock(hashtextextended(${key}::text, 0)))::int AS n`;
}
const payrollKey = (ctx: Ctx, month: string) => `hr:payroll:run:${ctx.systemId}:${month}`;

// ── ผู้ดู/ผู้ตัดสิน ──
const permsOf = (v: CorrectionActor) => (v.permissions ?? {}) as Record<string, unknown>;
const hasKey = (v: CorrectionActor) => permsOf(v)["hr.employee.create"] === true || permsOf(v)["hr.*"] === true;
const scopeOf = (v: CorrectionActor) => hrScopeOf({ role: v.role as MembershipCtx["role"], unitAccess: v.unitAccess });
function covers(v: CorrectionActor, unitId: string | null): boolean {
  if (v.role === "OWNER") return true;
  const s = scopeOf(v);
  return s.unitIds === "*" || (!!unitId && s.unitIds.includes(unitId));
}
/** ผู้ตัดสินตรง (R6 · Q3): OWNER หรือคีย์ hr.employee.create / hr.* ที่ให้ไว้ชัด — บทบาท MANAGER อย่างเดียวไม่พอ */
const isDecider = (v: CorrectionActor | null | undefined): v is CorrectionActor => !!v && !!v.userId && (v.role === "OWNER" || hasKey(v));
/** ผู้ดูแลของสาขา (ยื่นแทน · อ่านรายการ): OWNER · MANAGER ในสาขา · คีย์ในสาขา */
const isManagerOf = (v: CorrectionActor | null | undefined, unitId: string | null): boolean =>
  !!v && !!v.userId && (v.role === "OWNER" || ((v.role === "MANAGER" || hasKey(v)) && covers(v, unitId)));
const isManagerReader = (v: CorrectionActor | null | undefined): boolean => !!v && !!v.userId && (v.role === "OWNER" || v.role === "MANAGER" || hasKey(v));

// ── แถว ──
const EMP_SELECT = {
  id: true,
  name: true,
  unitId: true,
  active: true,
  employmentStatus: true,
  linkedUserId: true,
  startDate: true,
  endDate: true,
  units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 },
} as const;
type EmpRow = Prisma.HrEmployeeGetPayload<{ select: typeof EMP_SELECT }>;
const CORR_SELECT = {
  id: true,
  tenantId: true,
  systemId: true,
  employeeId: true,
  attendanceId: true,
  kind: true,
  action: true,
  day: true,
  proposedAt: true,
  originalAt: true,
  reason: true,
  status: true,
  requestedByUserId: true,
  decidedById: true,
  decidedAt: true,
  resultAttendanceId: true,
  evidenceJson: true,
  createdAt: true,
} as const;
type CorrRow = Prisma.HrTimeCorrectionGetPayload<{ select: typeof CORR_SELECT }>;

const isEnded = (e: EmpRow) => !e.active || e.employmentStatus === "ENDED";
const inEmployment = (e: Pick<EmpRow, "startDate" | "endDate">, day: string) => !(e.startDate && day < dayOf(e.startDate)) && !(e.endDate && day > dayOf(e.endDate));
const empOf = (db: Tx, ctx: Ctx, id: string | null | undefined) =>
  id ? (db.hrEmployee.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: EMP_SELECT }) as Promise<EmpRow | null>) : Promise.resolve(null);
const corrOf = (db: Tx, ctx: Ctx, id: string) =>
  id ? (db.hrTimeCorrection.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: CORR_SELECT }) as Promise<CorrRow | null>) : Promise.resolve(null);
const dbOf = (ctx: Ctx) => tenantDb(ctx) as unknown as Tx;
/** การลงเวลาที่ยังมีผลของพนักงานรอบ ๆ ช่วงเวลา (± 2 วัน) */
async function liveAround(db: Tx, ctx: Ctx, employeeId: string, times: Date[]): Promise<LivePunch[]> {
  const ts = times.map((t) => t.getTime());
  const rows = await db.hrAttendance.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, voidedAt: null, at: { gte: new Date(Math.min(...ts) - 2 * 86_400_000), lte: new Date(Math.max(...ts) + 2 * 86_400_000) } },
    select: { id: true, kind: true, at: true },
    orderBy: [{ at: "asc" }, { id: "asc" }],
    take: 2_000,
  });
  return rows.map((r) => ({ id: r.id, kind: String(r.kind), at: r.at }));
}
const codeText = (code: ApplyCode) => applyCodeText(code);

/** งวด (YYYY-MM) ที่ต้องถือล็อก: วันของรอบ + วันไทยของเวลาเดิม/เวลาที่ขอ */
function monthsOf(c: { day: Date | string | null; originalAt: Date | null; proposedAt: Date | null }): string[] {
  const days = [typeof c.day === "string" ? c.day : c.day ? dayOf(c.day) : null, c.originalAt ? bkkDayKey(c.originalAt) : null, c.proposedAt ? bkkDayKey(c.proposedAt) : null].filter((x): x is string => !!x);
  return [...new Set(days.map((d) => d.slice(0, 7)))].sort();
}
/** วันที่ต้องคิดผลแถวที่บันทึกใหม่: วันของรอบ ± 1 (+ วันไทยของเวลาเดิม/ที่ขอ ± 1) เฉพาะงวดที่ถือล็อก */
function recomputeDaysOf(c: { day: Date | null; originalAt: Date | null; proposedAt: Date | null }, months: string[]): string[] {
  const base = [c.day ? dayOf(c.day) : null, c.originalAt ? bkkDayKey(c.originalAt) : null, c.proposedAt ? bkkDayKey(c.proposedAt) : null].filter((x): x is string => !!x);
  const all = new Set<string>();
  for (const d of base) for (const k of [-1, 0, 1]) all.add(addDays(d, k));
  return [...all].filter((d) => months.includes(d.slice(0, 7))).sort();
}
async function paidIn(tx: Tx, ctx: Ctx, months: string[]): Promise<boolean> {
  if (!months.length) return false;
  const n = await tx.hrPayrollRun.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, periodKey: { in: months }, status: { in: ["APPROVED", "PAID"] } } });
  return n > 0;
}

// ── แจ้งเตือน (ชื่อ + วันเท่านั้น — ไม่มีเหตุผล/เวลา) ──
type Note = { tenantId: string; recipientUserId: string; title: string; body: string };
const noteBody = (emp: { name: string }, day: string) => `${emp.name} · ${formatThaiDateFull(day)}`;
/** ผู้ตัดสินตรงของสาขา (เจ้าของ + คีย์ในขอบเขต) ยกเว้นพนักงานคนนั้นและผู้ยื่น */
async function decidersOf(tx: Tx, ctx: Ctx, unitId: string | null, exclude: (string | null)[]): Promise<string[]> {
  const ms = await tx.membership.findMany({ where: { tenantId: ctx.tenantId, acceptedAt: { not: null } }, select: { userId: true, role: true, unitAccess: true, permissions: true }, orderBy: { userId: "asc" }, take: 2000 });
  return ms
    .filter((m) => !exclude.includes(m.userId))
    .filter((m) => {
      const v: CorrectionActor = { userId: m.userId, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions };
      return isDecider(v) && covers(v, unitId);
    })
    .map((m) => m.userId);
}
async function notifyOutcome(tx: Tx, ctx: Ctx, c: Pick<CorrRow, "requestedByUserId">, emp: Pick<EmpRow, "name" | "linkedUserId">, day: string, title: string, actorId: string | null): Promise<void> {
  const to = [...new Set([emp.linkedUserId, c.requestedByUserId].filter((u): u is string => !!u && u !== actorId))];
  if (to.length) await tx.appNotification.createMany({ data: to.map((u): Note => ({ tenantId: ctx.tenantId, recipientUserId: u, title, body: noteBody(emp, day) })) });
}

async function audit(ctx: Ctx, actorId: string | null, action: string, correctionId: string, after: Record<string, unknown>) {
  await writeAudit({ tenantId: ctx.tenantId, actorType: actorId ? "USER" : "SYSTEM", actorId, action, targetType: CORRECTION_ENTITY, targetId: correctionId, after: { systemId: ctx.systemId, correctionId, ...after } });
}
type Recomputed = Awaited<ReturnType<typeof recomputeStoredDaysInTx>>;
async function auditRecomputed(ctx: Ctx, actorId: string | null, employeeId: string, correctionId: string, list: Recomputed) {
  for (const r of list) {
    await writeAudit({
      tenantId: ctx.tenantId,
      actorType: actorId ? "USER" : "SYSTEM",
      actorId,
      action: "hr.attendance.day_recomputed",
      targetType: "HrAttendanceDay",
      targetId: r.dayId,
      after: { dayId: r.dayId, employeeId, date: r.date, systemId: ctx.systemId, correctionId, before: r.before, after: r.after, ...(r.voided ? { voided: true } : {}) },
    });
  }
}

// ═══════════════════════════ ใช้ผล (R5) — ผู้เรียกถือล็อกงวด → hr-corr (ถ้ามี id) แล้ว · ไฟล์นี้ถือ hr:clock ต่อ ═══════════════════════════
type Applied = { ok: true; resultId: string | null; recomputed: Recomputed; unitId: string | null } | { ok: false; code: ApplyCode };
async function applyInTx(tx: Tx, ctx: Ctx, c: CorrRow, o: { months: string[]; deciderId: string | null; now: Date }): Promise<Applied> {
  if (await paidIn(tx, ctx, o.months)) return { ok: false, code: "PAID" };
  await lockKey(tx, `hr:clock:${c.employeeId}`);
  const emp = await empOf(tx, ctx, c.employeeId);
  const day = c.day ? dayOf(c.day) : bkkDayKey(c.proposedAt);
  if (!emp || !inEmployment(emp, day)) return { ok: false, code: "EMPLOYMENT" };
  const action = c.action as CorrectionAction;
  const at = action === "VOID" ? null : c.proposedAt;
  const live = await liveAround(tx, ctx, emp.id, [c.proposedAt, ...(c.originalAt ? [c.originalAt] : [])]);
  const chk = checkCorrection(live, { action, kind: c.kind, at, attendanceId: c.attendanceId });
  if (!chk.ok) return { ok: false, code: chk.code };
  if (action !== "ADD") {
    const v = await tx.hrAttendance.updateMany({
      where: { id: c.attendanceId ?? "", tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, voidedAt: null },
      data: { voidedAt: o.now, voidedByCorrectionId: c.id },
    });
    if (v.count !== 1) return { ok: false, code: "TARGET" };
  }
  let resultId: string | null = null;
  if (at) {
    const cols = await correctedPunchColumnsInTx(tx, ctx, emp.id, c.kind, at);
    const row = await tx.hrAttendance.create({
      data: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, kind: c.kind, at, source: "CORRECTION", correctionId: c.id, ...cols },
      select: { id: true },
    });
    resultId = row.id;
  }
  const recomputed = await recomputeStoredDaysInTx(tx, ctx, { employeeId: emp.id, days: recomputeDaysOf(c, o.months), now: o.now, deciderId: o.deciderId, reason: T.recomputeReason });
  return { ok: true, resultId, recomputed, unitId: unitOfDay(emp, day) };
}
async function emitCorrected(tx: Tx, ctx: Ctx, c: CorrRow, a: Extract<Applied, { ok: true }>): Promise<void> {
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    unitId: a.unitId,
    type: CORRECTION_EVENT,
    idempotencyKey: `${CORRECTION_EVENT}#${c.id}`,
    payload: { correctionId: c.id, systemId: ctx.systemId, employeeId: c.employeeId, action: c.action, kind: c.kind, day: c.day ? dayOf(c.day) : null, attendanceId: c.attendanceId, resultAttendanceId: a.resultId },
  });
}
/** สำเร็จ: APPROVED (guard PENDING หรือแถวที่เพิ่งเขียน APPROVED) + ผลลัพธ์ + event + แจ้งเตือน */
async function finishApplied(tx: Tx, ctx: Ctx, c: CorrRow, a: Extract<Applied, { ok: true }>, deciderId: string | null, now: Date, fromStatus: "PENDING" | "APPROVED"): Promise<boolean> {
  const u = await tx.hrTimeCorrection.updateMany({
    where: { id: c.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: fromStatus },
    data: { status: "APPROVED", decidedById: deciderId, decidedAt: now, resultAttendanceId: a.resultId },
  });
  if (u.count !== 1) return false;
  await emitCorrected(tx, ctx, c, a);
  const emp = await empOf(tx, ctx, c.employeeId);
  if (emp) await notifyOutcome(tx, ctx, c, emp, c.day ? dayOf(c.day) : bkkDayKey(c.proposedAt), T.nApproved, deciderId);
  return true;
}
/** ใช้ผลไม่ได้: CANCELLED + แจ้งพนักงาน/ผู้ยื่น */
async function cancelRefused(tx: Tx, ctx: Ctx, c: CorrRow, now: Date, actorId: string | null): Promise<void> {
  const u = await tx.hrTimeCorrection.updateMany({ where: { id: c.id, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: now } });
  if (u.count !== 1) return;
  const emp = await empOf(tx, ctx, c.employeeId);
  if (emp) await notifyOutcome(tx, ctx, c, emp, c.day ? dayOf(c.day) : bkkDayKey(c.proposedAt), T.nCancelled, actorId);
}

// ═══════════════════════════ ยื่นคำขอ (R4) ═══════════════════════════
export type CorrectionInput = { action?: unknown; attendanceId?: unknown; kind?: unknown; at?: unknown; reason?: unknown; employeeId?: unknown };
export type RequestResult = { ok: true; id: string; status: "PENDING" | "APPROVED"; requestId: string | null } | Fail;

/**
 * ลำดับ (ข้อความคงที่ ไม่มีการเขียนเมื่อปฏิเสธ): เหตุผล → รูปคำขอ → พนักงาน (ตัวเอง = ผูกบัญชี+ยังทำงาน · ยื่นแทน = R6 ไม่งั้น empNf) →
 * แถวเป้าหมาย (ของพนักงานนี้/ระบบนี้ ยังมีผล) → เวลา ≤ ตอนนี้ → วันของรอบ ≥ วันนี้ − 35 → ช่วงการจ้าง →
 * ธุรกรรม: ล็อกงวด → จ่ายแล้ว → hr:clock → รอ ≤ 5 → ลำดับ (checkCorrection) → แทรก PENDING (partial unique ⇒ dupPending) →
 * มีกติกาอนุมัติ ⇒ submitForApproval ใน tx · เจ้าของร้านยื่น ⇒ APPROVED + ใช้ผลใน tx นี้ (Q4) · ไม่งั้นแจ้งผู้ตัดสินของสาขา ·
 * หลักฐาน POS อ่านก่อนเปิดธุรกรรม (snapshot — ไม่เปิด connection ที่สองใต้ล็อก)
 */
export async function requestCorrection(ctx: Ctx, actor: CorrectionActor, input: CorrectionInput, opts: { now?: Date } = {}): Promise<RequestResult> {
  if (!actor?.userId || !ctx?.tenantId || !ctx?.systemId) return refuse(T.empNf);
  const now = nowOf(opts);
  const reason = cleanCorrectionReason(input?.reason);
  if (!reason) return refuse(T.reason);
  // ── รูปคำขอ ──
  const action = str(input?.action) as CorrectionAction;
  if (!CORRECTION_ACTIONS.includes(action)) return refuse(T.badInput);
  const targetId = str(input?.attendanceId);
  const kindIn = str(input?.kind) as PunchKind;
  const at = action === "VOID" ? null : dateOf(input?.at);
  if (action === "ADD" && (!PUNCH_KINDS.includes(kindIn) || !at)) return refuse(T.badInput);
  if (action !== "ADD" && !targetId) return refuse(T.badInput);
  if (action === "CHANGE" && !at) return refuse(T.badInput);
  const db = dbOf(ctx);
  // ── พนักงาน ──
  const selfMode = input?.employeeId === undefined || input?.employeeId === null || input?.employeeId === "";
  let emp: EmpRow | null;
  if (selfMode) {
    const link = await employeeOfUser(ctx.tenantId, actor.userId);
    if (!link || link.systemId !== ctx.systemId) return refuse(CLOCK_TEXT.mNoEmp);
    emp = await empOf(db, ctx, link.employeeId);
    if (!emp) return refuse(CLOCK_TEXT.mNoEmp);
    if (isEnded(emp)) return refuse(CLOCK_TEXT.mInactive);
  } else {
    emp = await empOf(db, ctx, str(input?.employeeId));
    if (!emp) return refuse(T.empNf);
  }
  // แถวเป้าหมาย (อ่านก่อนเพื่อหาวันของรอบสำหรับด่านสาขา — ปฏิเสธเรื่องแถวหลังด่านพนักงาน)
  const target = targetId ? await db.hrAttendance.findFirst({ where: { id: targetId, tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, voidedAt: null }, select: { id: true, kind: true, at: true } }) : null;
  const kind: PunchKind = action === "ADD" ? kindIn : ((target ? String(target.kind) : "IN") as PunchKind);
  const when = at ?? target?.at ?? now;
  const live = await liveAround(db, ctx, emp.id, [when, ...(target ? [target.at] : [])]);
  const others = target ? live.filter((r) => r.id !== target.id) : live;
  const day = sessionDayOf(others, when, kind);
  const origDay = target ? sessionDayOf(others, target.at, String(target.kind)) : day;
  if (!selfMode && !isManagerOf(actor, unitOfDay(emp, day))) return refuse(T.empNf);
  if (targetId && !target) return refuse(T.targetNf);
  if (at && at.getTime() > now.getTime()) return refuse(T.future);
  const cutoff = addDays(bkkDayKey(now), -CORRECTION_RULES.BACK_DAYS);
  if ((day < origDay ? day : origDay) < cutoff) return refuse(T.tooOld);
  if (!inEmployment(emp, day) || !inEmployment(emp, origDay)) return refuse(T.outOfEmployment);
  const unitId = unitOfDay(emp, day);
  const ownerAuto = actor.role === "OWNER";
  const evidence = { posShifts: await posShiftEvidence({ tenantId: ctx.tenantId, userId: emp.linkedUserId, from: bkkMidnight(day), to: new Date(bkkMidnight(day).getTime() + EVIDENCE_HOURS * 3_600_000) }), deviceLogout: null };
  const proposedAt = at ?? target!.at;
  const months = monthsOf({ day, originalAt: target?.at ?? null, proposedAt });
  const empId = emp.id;
  try {
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      for (const m of months) await lockKey(tx, payrollKey(ctx, m));
      if (await paidIn(tx, ctx, months)) throw new CorrectionRefusal(T.paid);
      await lockKey(tx, `hr:clock:${empId}`);
      if (!ownerAuto) {
        const pending = await tx.hrTimeCorrection.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: empId, status: "PENDING" } });
        if (pending >= CORRECTION_RULES.MAX_PENDING) throw new CorrectionRefusal(T.tooMany);
      }
      const liveTx = await liveAround(tx, ctx, empId, [proposedAt, ...(target ? [target.at] : [])]);
      const chk = checkCorrection(liveTx, { action, kind, at, attendanceId: target?.id ?? null });
      if (!chk.ok) throw new CorrectionRefusal(codeText(chk.code));
      const row = (await tx.hrTimeCorrection.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          employeeId: empId,
          attendanceId: target?.id ?? null,
          kind,
          action,
          day: dbDate(day),
          proposedAt,
          originalAt: target?.at ?? null,
          reason,
          status: ownerAuto ? "APPROVED" : "PENDING",
          requestedByUserId: actor.userId,
          evidenceJson: evidence as Prisma.InputJsonValue,
        },
        select: CORR_SELECT,
      })) as CorrRow;
      if (ownerAuto) {
        const a = await applyInTx(tx, ctx, row, { months, deciderId: actor.userId, now });
        if (!a.ok) throw new CorrectionRefusal(codeText(a.code));
        if (!(await finishApplied(tx, ctx, row, a, actor.userId, now, "APPROVED"))) throw new CorrectionRefusal(T.stale);
        return { id: row.id, status: "APPROVED" as const, requestId: null, applied: a };
      }
      const sub = await submitForApproval({ tenantId: ctx.tenantId }, { entityType: CORRECTION_ENTITY, entityId: row.id, systemId: ctx.systemId, unitId, requestedById: actor.userId }, { tx });
      const requestId = "requestId" in sub ? sub.requestId : null;
      if (!requestId) {
        const e2 = await empOf(tx, ctx, empId);
        const to = await decidersOf(tx, ctx, unitId, [e2?.linkedUserId ?? null, actor.userId]);
        if (to.length && e2) await tx.appNotification.createMany({ data: to.map((u): Note => ({ tenantId: ctx.tenantId, recipientUserId: u, title: T.nPending, body: noteBody(e2, day) })) });
      }
      return { id: row.id, status: "PENDING" as const, requestId, applied: null };
    }, TX_OPTS);
    await audit(ctx, actor.userId, "hr.correction.request", out.id, { employeeId: empId, action, kind, day, attendanceId: target?.id ?? null, onBehalf: !selfMode, requestId: out.requestId });
    if (out.applied) {
      await audit(ctx, actor.userId, "hr.correction.owner_auto", out.id, { resultAttendanceId: out.applied.resultId, decidedById: actor.userId });
      await auditRecomputed(ctx, actor.userId, empId, out.id, out.applied.recomputed);
    }
    return { ok: true, id: out.id, status: out.status, requestId: out.requestId };
  } catch (e) {
    if (e instanceof CorrectionRefusal) return refuse(e.message);
    if (isUniqueViolation(e)) return refuse(T.dupPending);
    throw e;
  }
}

// ═══════════════════════════ ตัดสินตรง (R6 · R7) ═══════════════════════════
export async function decideCorrection(ctx: Ctx, viewer: CorrectionActor, id: string, input: { decision?: unknown }, opts: { now?: Date } = {}): Promise<{ ok: true; status: "APPROVED" | "REJECTED" } | Fail> {
  if (!isDecider(viewer)) return refuse(T.noPerm);
  const cid = str(id);
  const decision = input?.decision === "APPROVED" ? "APPROVED" : input?.decision === "REJECTED" ? "REJECTED" : null;
  if (!cid || !decision || !ctx?.tenantId || !ctx?.systemId) return refuse(T.stale);
  const now = nowOf(opts);
  const db = dbOf(ctx);
  const c0 = await corrOf(db, ctx, cid);
  if (!c0) return refuse(T.stale);
  const emp0 = await empOf(db, ctx, c0.employeeId);
  if (!emp0) return refuse(T.stale);
  const day = c0.day ? dayOf(c0.day) : bkkDayKey(c0.proposedAt);
  const unit = unitOfDay(emp0, day);
  if (!covers(viewer, unit)) return refuse(unit ? HR_OTHER_BRANCH_TEXT : HR_UNASSIGNED_TEXT);
  if ((emp0.linkedUserId && emp0.linkedUserId === viewer.userId) || c0.requestedByUserId === viewer.userId) return refuse(SELF_DECIDE_REFUSED);
  if (c0.status !== "PENDING") return refuse(T.stale);
  const chainLive = (tx: Tx) => tx.approvalRequest.count({ where: { tenantId: ctx.tenantId, entityType: CORRECTION_ENTITY, entityId: cid, status: { not: "CANCELLED" } } });
  if ((await chainLive(db)) > 0) return refuse(T.inChain);
  const months = decision === "APPROVED" ? monthsOf(c0) : [];
  type Out = { kind: "rejected" } | { kind: "applied"; a: Extract<Applied, { ok: true }> } | { kind: "refused"; code: ApplyCode };
  try {
    const out: Out = await tenantDb(ctx).$transaction(async (t): Promise<Out> => {
      const tx = t as unknown as Tx;
      for (const m of months) await lockKey(tx, payrollKey(ctx, m));
      await lockKey(tx, `hr-corr:${cid}`);
      const c = await corrOf(tx, ctx, cid);
      if (!c || c.status !== "PENDING") throw new CorrectionRefusal(T.stale);
      if ((await chainLive(tx)) > 0) throw new CorrectionRefusal(T.inChain);
      if (decision === "REJECTED") {
        const u = await tx.hrTimeCorrection.updateMany({ where: { id: cid, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "PENDING" }, data: { status: "REJECTED", decidedById: viewer.userId, decidedAt: now } });
        if (u.count !== 1) throw new CorrectionRefusal(T.stale);
        await notifyOutcome(tx, ctx, c, emp0, day, T.nRejected, viewer.userId);
        return { kind: "rejected" };
      }
      const a = await applyInTx(tx, ctx, c, { months, deciderId: viewer.userId, now });
      if (!a.ok) {
        await cancelRefused(tx, ctx, c, now, viewer.userId);
        return { kind: "refused", code: a.code };
      }
      if (!(await finishApplied(tx, ctx, c, a, viewer.userId, now, "PENDING"))) throw new CorrectionRefusal(T.stale);
      return { kind: "applied", a };
    }, TX_OPTS);
    if (out.kind === "rejected") {
      await audit(ctx, viewer.userId, "hr.correction.decide", cid, { decision: "REJECTED" });
      return { ok: true, status: "REJECTED" };
    }
    if (out.kind === "refused") {
      await audit(ctx, viewer.userId, "hr.correction.apply_refused", cid, { requestId: null, code: out.code });
      return refuse(codeText(out.code));
    }
    await audit(ctx, viewer.userId, "hr.correction.decide", cid, { decision: "APPROVED", resultAttendanceId: out.a.resultId });
    await auditRecomputed(ctx, viewer.userId, c0.employeeId, cid, out.a.recomputed);
    return { ok: true, status: "APPROVED" };
  } catch (e) {
    if (e instanceof CorrectionRefusal) return refuse(e.message);
    throw e;
  }
}

// ═══════════════════════════ ผลของสายอนุมัติ (R7 — เรียกจาก approval-effects.ts เท่านั้น) ═══════════════════════════
/**
 * เรียกซ้ำ/พร้อมกันได้: คำขอแก้เวลาไม่ใช่ PENDING / คำขออนุมัติไม่ตรงผล ⇒ applied false (ไม่ทำอะไร) · ผู้ตัดสิน = ApprovalDecision ล่าสุด ·
 * ใช้ผลไม่ได้ ⇒ CANCELLED + audit hr.correction.apply_refused {correctionId, requestId, code} (ไม่ throw) · ข้อผิดพลาดฐานข้อมูล ⇒ throw (event retry)
 */
export async function applyCorrectionDecision(
  input: { tenantId: string; systemId: string; correctionId: string; requestId: string; approved: boolean },
  opts: { now?: Date } = {},
): Promise<{ applied: boolean; code?: ApplyCode }> {
  const ctx: Ctx = { tenantId: str(input?.tenantId), systemId: str(input?.systemId) };
  const cid = str(input?.correctionId);
  const requestId = str(input?.requestId);
  if (!ctx.tenantId || !ctx.systemId || !cid || !requestId) return { applied: false };
  const now = nowOf(opts);
  const c0 = await corrOf(dbOf(ctx), ctx, cid);
  if (!c0 || c0.status !== "PENDING") return { applied: false };
  const months = input.approved ? monthsOf(c0) : [];
  type Out = { kind: "noop" } | { kind: "rejected" } | { kind: "applied"; a: Extract<Applied, { ok: true }>; decidedById: string | null } | { kind: "refused"; code: ApplyCode };
  const out: Out = await tenantDb(ctx).$transaction(async (t): Promise<Out> => {
    const tx = t as unknown as Tx;
    for (const m of months) await lockKey(tx, payrollKey(ctx, m));
    await lockKey(tx, `hr-corr:${cid}`);
    const c = await corrOf(tx, ctx, cid);
    if (!c || c.status !== "PENDING") return { kind: "noop" };
    const req = await tx.approvalRequest.findFirst({ where: { id: requestId, tenantId: ctx.tenantId, entityType: CORRECTION_ENTITY, entityId: cid }, select: { status: true } });
    if (!req || req.status !== (input.approved ? "APPROVED" : "REJECTED")) return { kind: "noop" };
    const last = await tx.approvalDecision.findFirst({ where: { tenantId: ctx.tenantId, requestId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { decidedById: true } });
    const decidedById = last?.decidedById ?? null;
    if (!input.approved) {
      const u = await tx.hrTimeCorrection.updateMany({ where: { id: cid, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "PENDING" }, data: { status: "REJECTED", decidedById, decidedAt: now } });
      if (u.count !== 1) return { kind: "noop" };
      const emp = await empOf(tx, ctx, c.employeeId);
      if (emp) await notifyOutcome(tx, ctx, c, emp, c.day ? dayOf(c.day) : bkkDayKey(c.proposedAt), T.nRejected, decidedById);
      return { kind: "rejected" };
    }
    const a = await applyInTx(tx, ctx, c, { months, deciderId: decidedById, now });
    if (!a.ok) {
      await cancelRefused(tx, ctx, c, now, decidedById);
      return { kind: "refused", code: a.code };
    }
    if (!(await finishApplied(tx, ctx, c, a, decidedById, now, "PENDING"))) return { kind: "noop" };
    return { kind: "applied", a, decidedById };
  }, TX_OPTS);
  if (out.kind === "refused") {
    await audit(ctx, null, "hr.correction.apply_refused", cid, { requestId, code: out.code });
    return { applied: false, code: out.code };
  }
  if (out.kind === "rejected") {
    await audit(ctx, null, "hr.correction.decide", cid, { requestId, decision: "REJECTED" });
    return { applied: false };
  }
  if (out.kind === "applied") {
    await audit(ctx, null, "hr.correction.apply", cid, { requestId, decidedById: out.decidedById, resultAttendanceId: out.a.resultId });
    await auditRecomputed(ctx, out.decidedById, c0.employeeId, cid, out.a.recomputed);
    return { applied: true };
  }
  return { applied: false };
}

// ═══════════════════════════ ยกเลิก (R6) — ผู้ยื่นหรือพนักงานเอง · PENDING เท่านั้น ═══════════════════════════
export async function cancelCorrection(ctx: Ctx, actor: CorrectionActor, id: string): Promise<{ ok: true } | Fail> {
  const cid = str(id);
  if (!actor?.userId || !cid || !ctx?.tenantId || !ctx?.systemId) return refuse(T.notOwn);
  try {
    await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockKey(tx, `hr-corr:${cid}`);
      const c = await corrOf(tx, ctx, cid);
      if (!c) throw new CorrectionRefusal(T.notOwn);
      const emp = await empOf(tx, ctx, c.employeeId);
      if (c.requestedByUserId !== actor.userId && !(emp?.linkedUserId && emp.linkedUserId === actor.userId)) throw new CorrectionRefusal(T.notOwn);
      if (c.status !== "PENDING") throw new CorrectionRefusal(T.stale);
      const reqs = await tx.approvalRequest.findMany({ where: { tenantId: ctx.tenantId, entityType: CORRECTION_ENTITY, entityId: cid, status: { not: "CANCELLED" } }, select: { id: true } });
      for (const r of reqs) if (!(await cancelRequest({ tenantId: ctx.tenantId }, r.id, { tx }))) throw new CorrectionRefusal(T.stale);
      const u = await tx.hrTimeCorrection.updateMany({ where: { id: cid, tenantId: ctx.tenantId, systemId: ctx.systemId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
      if (u.count !== 1) throw new CorrectionRefusal(T.stale);
    }, TX_OPTS);
    await audit(ctx, actor.userId, "hr.correction.cancel", cid, {});
    return { ok: true };
  } catch (e) {
    if (e instanceof CorrectionRefusal) return refuse(e.message);
    throw e;
  }
}

// ═══════════════════════════ ตัวอ่าน (R9) ═══════════════════════════
export type CorrectionItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  action: CorrectionAction;
  kind: PunchKind;
  day: string | null;
  originalAt: string | null;
  proposedAt: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reason: string;
  filedOnBehalf: boolean;
  createdAt: string;
  decidedAt: string | null;
  evidence: { posShifts: { shiftNo: number; openedAt: string; closedAt: string | null; forced: boolean }[]; deviceLogout: null } | null;
  periodCount: number | null;
  repeat: boolean | null;
};
type EmpLite = Pick<EmpRow, "id" | "name" | "linkedUserId" | "unitId" | "units">;
function evidenceOf(v: unknown): CorrectionItem["evidence"] {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as { posShifts?: unknown };
  const shifts = Array.isArray(o.posShifts)
    ? o.posShifts.flatMap((s) => {
        const x = (s ?? {}) as Record<string, unknown>;
        return typeof x.shiftNo === "number" && typeof x.openedAt === "string" ? [{ shiftNo: x.shiftNo, openedAt: x.openedAt, closedAt: typeof x.closedAt === "string" ? x.closedAt : null, forced: x.forced === true }] : [];
      })
    : [];
  return { posShifts: shifts, deviceLogout: null };
}
async function periodCountOf(db: Tx, ctx: Ctx, employeeId: string, day: string | null): Promise<number> {
  if (!day) return 0;
  const m = day.slice(0, 7);
  const from = `${m}-01`;
  const to = addDays(dayOf(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1))), -1);
  return db.hrTimeCorrection.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, status: { in: ["PENDING", "APPROVED"] }, day: { gte: dbDate(from), lte: dbDate(to) } } });
}
async function itemOf(db: Tx, ctx: Ctx, c: CorrRow, emp: EmpLite, viewerUserId: string | null, withCount: boolean): Promise<CorrectionItem> {
  const day = c.day ? dayOf(c.day) : null;
  const own = !!viewerUserId && emp.linkedUserId === viewerUserId;
  const n = withCount && !own ? await periodCountOf(db, ctx, emp.id, day) : null;
  return {
    id: c.id,
    employeeId: emp.id,
    employeeName: emp.name,
    action: c.action as CorrectionAction,
    kind: String(c.kind) as PunchKind,
    day,
    originalAt: c.originalAt ? c.originalAt.toISOString() : null,
    proposedAt: c.action === "VOID" ? null : c.proposedAt.toISOString(),
    status: c.status as CorrectionItem["status"],
    reason: c.reason,
    filedOnBehalf: !!c.requestedByUserId && c.requestedByUserId !== emp.linkedUserId,
    createdAt: c.createdAt.toISOString(),
    decidedAt: c.decidedAt ? c.decidedAt.toISOString() : null,
    evidence: evidenceOf(c.evidenceJson),
    periodCount: n,
    repeat: n === null ? null : n >= CORRECTION_RULES.REPEAT_AT,
  };
}
/** ผู้ดูคำขอนี้ได้ไหม: เจ้าของ · ผู้จัดการ/คีย์ในสาขาของวันนั้น · พนักงานคนนั้น · ผู้ยื่น */
const canView = (v: CorrectionActor, c: CorrRow, emp: EmpLite) =>
  isManagerOf(v, unitOfDay(emp, c.day ? dayOf(c.day) : bkkDayKey(c.proposedAt))) || (!!emp.linkedUserId && emp.linkedUserId === v.userId) || (!!c.requestedByUserId && c.requestedByUserId === v.userId);

export async function correctionDetail(ctx: Ctx, viewer: CorrectionActor, id: string, opts: { now?: Date } = {}): Promise<{ ok: true; item: CorrectionItem } | Fail> {
  void opts;
  const cid = str(id);
  if (!viewer?.userId || !cid || !ctx?.tenantId || !ctx?.systemId) return refuse(T.detailNo);
  const db = dbOf(ctx);
  const c = await corrOf(db, ctx, cid);
  const emp = c ? await empOf(db, ctx, c.employeeId) : null;
  if (!c || !emp || !canView(viewer, c, emp)) return refuse(T.detailNo);
  return { ok: true, item: await itemOf(db, ctx, c, emp, viewer.userId, true) };
}

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
/** รายการของผู้ดูแล (เจ้าของ · ผู้จัดการ · คีย์) — เฉพาะสาขาในขอบเขต · ใหม่สุดก่อน ไม่เกิน 200 */
export async function listCorrections(ctx: Ctx, viewer: CorrectionActor, input: { status?: unknown; employeeId?: unknown } = {}, opts: { now?: Date } = {}): Promise<{ ok: true; items: CorrectionItem[] } | Fail> {
  void opts;
  if (!isManagerReader(viewer) || !ctx?.tenantId || !ctx?.systemId) return refuse(T.detailNo);
  const db = dbOf(ctx);
  const status = STATUSES.find((s) => s === input?.status) ?? null;
  const employeeId = str(input?.employeeId);
  const rows = (await db.hrTimeCorrection.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ...(status ? { status } : {}), ...(employeeId ? { employeeId } : {}) },
    select: CORR_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIST_MAX * 2,
  })) as CorrRow[];
  const emps = new Map((await db.hrEmployee.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: [...new Set(rows.map((r) => r.employeeId))] } }, select: EMP_SELECT })).map((e) => [e.id, e as EmpRow]));
  const items: CorrectionItem[] = [];
  for (const c of rows) {
    const emp = emps.get(c.employeeId);
    if (!emp || !isManagerOf(viewer, unitOfDay(emp, c.day ? dayOf(c.day) : bkkDayKey(c.proposedAt)))) continue;
    items.push(await itemOf(db, ctx, c, emp, viewer.userId, true));
    if (items.length >= LIST_MAX) break;
  }
  return { ok: true, items };
}

/** คำขอของตัวเอง (พนักงานที่ผูกบัญชีในระบบนี้ + ที่ผู้ใช้ยื่นเอง) — ไม่รับ id พนักงานจากผู้เรียก · ไม่มีตัวนับซ้ำ */
export async function myCorrections(ctx: Ctx, actor: CorrectionActor, opts: { now?: Date } = {}): Promise<{ ok: true; items: CorrectionItem[] } | Fail> {
  void opts;
  if (!actor?.userId || !ctx?.tenantId || !ctx?.systemId) return refuse(T.detailNo);
  const db = dbOf(ctx);
  const link = await employeeOfUser(ctx.tenantId, actor.userId);
  const mine = link && link.systemId === ctx.systemId ? link.employeeId : null;
  const rows = (await db.hrTimeCorrection.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, OR: [...(mine ? [{ employeeId: mine }] : []), { requestedByUserId: actor.userId }] },
    select: CORR_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIST_MAX,
  })) as CorrRow[];
  const emps = new Map((await db.hrEmployee.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: [...new Set(rows.map((r) => r.employeeId))] } }, select: EMP_SELECT })).map((e) => [e.id, e as EmpRow]));
  const items: CorrectionItem[] = [];
  for (const c of rows) {
    const emp = emps.get(c.employeeId);
    if (emp) items.push(await itemOf(db, ctx, c, emp, actor.userId, false));
  }
  return { ok: true, items };
}

/**
 * การลงเวลาที่ยังมีผล (ให้ฟอร์มเลือกแถวที่จะแก้/ยกเลิก) — ช่วงวันไทย from..to (≤ 62 วัน) · ไม่ส่ง employeeId = ของตัวเอง (บัญชีที่ผูก) ·
 * ส่ง = ผู้ดูแลของสาขา (R6) · คืนเฉพาะ id/พนักงาน/ชนิด/เวลา (ไม่มีหมายเหตุ/พิกัด/อุปกรณ์)
 */
export type CorrectablePunch = { id: string; employeeId: string; kind: PunchKind; at: string };
export async function correctablePunches(ctx: Ctx, viewer: CorrectionActor, input: { employeeIds?: unknown; from?: unknown; to?: unknown }): Promise<CorrectablePunch[]> {
  const from = str(input?.from);
  const to = str(input?.to);
  if (!viewer?.userId || !ctx?.tenantId || !ctx?.systemId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from || addDays(from, 62) < to) return [];
  const db = dbOf(ctx);
  const asked = Array.isArray(input?.employeeIds) ? [...new Set(input.employeeIds.map(str).filter(Boolean))].slice(0, 500) : [];
  let ids: string[];
  if (!asked.length) {
    const link = await employeeOfUser(ctx.tenantId, viewer.userId);
    ids = link && link.systemId === ctx.systemId ? [link.employeeId] : [];
  } else {
    const emps = (await db.hrEmployee.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: asked } }, select: EMP_SELECT })) as EmpRow[];
    ids = emps.filter((e) => isManagerOf(viewer, unitOfDay(e, to))).map((e) => e.id);
  }
  if (!ids.length) return [];
  const rows = await db.hrAttendance.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: { in: ids }, voidedAt: null, at: { gte: bkkMidnight(from), lt: bkkMidnight(addDays(to, 1)) } },
    select: { id: true, employeeId: true, kind: true, at: true },
    orderBy: [{ at: "asc" }, { id: "asc" }],
    take: 5_000,
  });
  return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, kind: String(r.kind) as PunchKind, at: r.at.toISOString() }));
}
