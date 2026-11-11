// HR H2.3 ▸ คำขอสลับกะ / ยกกะให้เพื่อน (HrShiftSwapRequest) — ยื่น → เพื่อนตอบรับ → สายอนุมัติ (หรือผู้จัดตารางตัดสินตรง) → เขียนตารางกะในธุรกรรมเดียว
//
// กติกา (brief H2.3 R1–R14 · มติ Q1–Q18 วันที่ 22 ต.ค. · มติข้อสอบ 1–9 วันที่ 11 พ.ย.):
//   • ผู้ขอ = เจ้าของกะต้นทางที่ผูกบัญชีกับผู้กด (ไม่รับ id พนักงานจากฟอร์ม · §C.7) · ไม่มีการยื่นแทน (Q4)
//   • รูป: SWAP (แลกกับกะของเพื่อน) · GIVE (ยกกะให้เพื่อนที่ระบุ) · ไม่ระบุเพื่อน = ปฏิเสธ (Q2)
//   • เพื่อนตอบรับ ⇒ PENDING แล้วเข้าสายอนุมัติ (มีกติกา) · ไม่มีกติกา ⇒ คง PENDING ให้ผู้จัดตารางตัดสินตรง (Q1) ·
//     เจ้าของร้านเป็นผู้ขอ/ผู้รับ ⇒ ใช้ผลทันทีตอนตอบรับ ไม่เข้าสาย (Q8)
//   • ผู้ตัดสินตรง = OWNER หรือคีย์ hr.employee.create ที่ให้ไว้ชัด (บทบาท MANAGER อย่างเดียว = อ่านได้ ตัดสินไม่ได้ — Q9) + ทั้งสองกะอยู่ในขอบเขตสาขา
//   • ใช้ผล = ย้ายเจ้าของแถวในที่ (id/เวลา/การเผยแพร่คงเดิม — Q17) ผ่าน roster.ts#reassignEntriesInTx · ใช้ไม่ได้ ⇒ CANCELLED + audit รหัส ไม่ throw (Q10)
//   • หมดอายุแบบขี้เกียจ: วันของกะใดกะหนึ่งผ่านไปแล้วตอนตอบรับ/ตัดสิน/ใช้ผล ⇒ CANCELLED (Q7 — ไม่มี cron)
//   • ล็อก (R13 · §C.8): hr-swap:<id> ก่อนเสมอ แล้วจึงกุญแจตารางกะ (เรียงจากน้อยไปมาก) · ยื่นใหม่ยังไม่มี id ⇒ กุญแจตารางกะอย่างเดียว + partial unique ·
//     ทุกคำสั่งในธุรกรรมใช้ tx (รวม submitForApproval/cancelRequest ของแกน)
//   • ผลลัพธ์ = { ok: true, … } | { ok: false, reason } — reason ข้อความไทยคงที่ (swap-rules.ts SWAP_TEXT) ไม่มีชื่อ/id · audit/event = id ล้วน ◂
import { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { cancelRequest, SELF_DECIDE_REFUSED, submitForApproval } from "@/lib/modules/approval/service";
import { HR_OTHER_BRANCH_TEXT, HR_UNASSIGNED_TEXT, hrScopeOf } from "./scope";
import { addDays, bkkDayKey } from "./time-rules";
import { ROSTER_RULE_DEFAULTS, rosterWarnings, weekStartOf, type RosterWarning } from "./roster-rules";
import { lockRosterKeysInTx, reassignEntriesInTx, ROSTER_TEXT, unitOfDay } from "./roster";
import { employeeOfUser } from "./service";
import {
  applyCodeText,
  type SwapParty,
  cleanSwapReason,
  shapeOf,
  SWAP_OPEN_STATUSES,
  SWAP_TEXT,
  swapLockKey,
  swapRosterKeys,
  type SwapApplyCode,
  type SwapShape,
  type SwapStatus,
} from "./swap-rules";

type Ctx = { tenantId: string; systemId: string };
type Tx = Prisma.TransactionClient;
export type SwapActor = { userId: string; role: MembershipCtx["role"] | string; unitAccess: unknown; permissions?: unknown };
export type SwapFail = { ok: false; reason: string };
export type { SwapShape, SwapStatus } from "./swap-rules";

export const SWAP_ENTITY = "HrShiftSwapRequest";
export const SWAP_REQUESTED_EVENT = "hr.shift.swap_requested";
export const SWAP_APPROVED_EVENT = "hr.shift.swap_approved";
/** ธุรกรรมใต้ล็อก (เท่าธุรกรรมใต้ล็อกของใบลา H0.7 — ≤ maxDuration ของหน้า/action) */
const SWAP_TX_OPTS = { maxWait: 20_000, timeout: 60_000 } as const;

/** ข้อความคงที่ — ชุดเดียวกับ swap-rules + ข้อความตารางกะ/สาขา/แกนที่ใช้ร่วม */
export const SWAP_REFUSAL = {
  ...SWAP_TEXT,
  duplicate: ROSTER_TEXT.duplicate,
  entryChanged: ROSTER_TEXT.entryChanged,
  noPermission: ROSTER_TEXT.noPermission,
  otherBranch: HR_OTHER_BRANCH_TEXT,
  unassigned: HR_UNASSIGNED_TEXT,
  self: SELF_DECIDE_REFUSED,
} as const;
const T = SWAP_REFUSAL;

class SwapRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapRefusal";
  }
}
const refuse = (reason: string): SwapFail => ({ ok: false, reason });
function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2002";
  const x = e as { code?: unknown; cause?: { code?: unknown; originalCode?: unknown } } | null;
  return !!x && (x.code === "P2002" || x.code === "23505" || x.cause?.code === "23505" || x.cause?.originalCode === "23505");
}
/** ข้อผิดพลาดใด ๆ → ข้อความไทยคงที่ (ไม่ส่ง e.message ของระบบ) */
function reasonOf(e: unknown, dupText: string = T.open): string {
  if (e instanceof SwapRefusal) return e.message;
  if (isUniqueViolation(e)) return dupText;
  console.error("[hr.swap]", e);
  return T.failed;
}

// ── วันที่ ──
const dbDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const todayKey = () => bkkDayKey(new Date());
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// ── ผู้ดู ──
const memberOf = (v: SwapActor): MembershipCtx =>
  ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: (v.permissions ?? {}) as Record<string, unknown> }) as MembershipCtx;
/** ผู้ตัดสินตรง (Q9): OWNER หรือคีย์ hr.employee.create / hr.* ที่ให้ไว้ชัด — บทบาท MANAGER อย่างเดียวไม่พอ */
function isDecider(v: SwapActor | null | undefined): boolean {
  if (!v || !v.userId) return false;
  if (v.role === "OWNER") return true;
  const p = (v.permissions ?? {}) as Record<string, unknown>;
  return p["hr.employee.create"] === true || p["hr.*"] === true;
}
/** อ่านรายการของผู้จัดการได้ไหม (R10): ผู้ตัดสิน + บทบาท MANAGER */
const isManagerReader = (v: SwapActor | null | undefined): boolean => !!v && (isDecider(v) || v.role === "MANAGER");
/** สาขาของกะอยู่ในขอบเขตผู้ดูไหม (H1.1 R12.1: ผู้ดูทุกสาขาผ่านเสมอ) — null = ผ่าน */
function unitRefusal(v: SwapActor, unitId: string | null): string | null {
  const scope = hrScopeOf({ role: v.role as MembershipCtx["role"], unitAccess: v.unitAccess });
  if (scope.unitIds === "*") return null;
  if (unitId && scope.unitIds.includes(unitId) && evaluate(memberOf(v), { module: "hr", action: "hr.employee.create", unitId })) return null;
  return unitId ? T.otherBranch : T.unassigned;
}
function unitVisible(v: SwapActor, unitId: string | null): boolean {
  const scope = hrScopeOf({ role: v.role as MembershipCtx["role"], unitAccess: v.unitAccess });
  return scope.unitIds === "*" || (!!unitId && scope.unitIds.includes(unitId));
}

// ── แถว ──
const ENTRY_SELECT = { id: true, employeeId: true, date: true, shiftId: true, unitId: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true, published: true, publishedAt: true, updatedAt: true } as const;
type EntryRow = Prisma.HrRosterEntryGetPayload<{ select: typeof ENTRY_SELECT }>;
const EMP_SELECT = {
  id: true,
  unitId: true,
  active: true,
  employmentStatus: true,
  linkedUserId: true,
  startDate: true,
  endDate: true,
  contractEndAt: true,
  units: { select: { id: true, unitId: true, fromDate: true, toDate: true }, take: 200 },
} as const;
type EmpRow = Prisma.HrEmployeeGetPayload<{ select: typeof EMP_SELECT }>;
const SWAP_SELECT = {
  id: true,
  tenantId: true,
  systemId: true,
  requesterEmployeeId: true,
  fromEntryId: true,
  targetEmployeeId: true,
  toEntryId: true,
  status: true,
  reason: true,
  requestedByUserId: true,
  peerDecidedAt: true,
  decidedById: true,
  decidedAt: true,
  createdAt: true,
} as const;
type SwapRow = Prisma.HrShiftSwapRequestGetPayload<{ select: typeof SWAP_SELECT }>;

const isEnded = (e: EmpRow) => !e.active || e.employmentStatus === "ENDED";
function inEmployment(e: EmpRow, day: string): boolean {
  if (e.startDate && day < dayOf(e.startDate)) return false;
  const last = e.endDate ?? e.contractEndAt;
  return !(last && day > dayOf(last));
}
const entryOf = (tx: Tx, ctx: Ctx, id: string | null | undefined) =>
  id ? tx.hrRosterEntry.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: ENTRY_SELECT }) : Promise.resolve(null);
const empOf = (tx: Tx, ctx: Ctx, id: string | null | undefined) =>
  id ? tx.hrEmployee.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: EMP_SELECT }) : Promise.resolve(null);
async function onLeave(tx: Tx, ctx: Ctx, employeeId: string, day: string): Promise<boolean> {
  const d = dbDate(day);
  const n = await tx.hrLeave.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, status: "APPROVED", fromDate: { lte: d }, toDate: { gte: d } } });
  return n > 0;
}
async function holds(tx: Tx, ctx: Ctx, employeeId: string, day: string, shiftId: string): Promise<boolean> {
  const n = await tx.hrRosterEntry.count({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId, date: dbDate(day), shiftId } });
  return n > 0;
}
/** เจ้าของร้าน (OWNER ที่รับคำเชิญแล้ว) — อ่านด้วย tx */
async function isTenantOwnerTx(tx: Tx, tenantId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const m = await tx.membership.findFirst({ where: { tenantId, userId, role: "OWNER", acceptedAt: { not: null } }, select: { id: true } });
  return !!m;
}
/** ล็อกต่อคำขอ (ล็อกแรกของทุกทางที่มี id คำขอ) */
async function lockSwapInTx(tx: Tx, swapId: string): Promise<void> {
  await tx.$queryRaw`SELECT count(pg_advisory_xact_lock(hashtextextended(${swapLockKey(swapId)}::text, 0)))::int AS n`;
}
const swapOf = (tx: Tx, ctx: Ctx, id: string) => (id ? tx.hrShiftSwapRequest.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: SWAP_SELECT }) : Promise.resolve(null));

// ═══════════════════════════ ตรวจคำขอ (R4) — ใช้ตอนยื่นและตอนเพื่อนตอบรับ (ตรวจซ้ำใต้ล็อก) ═══════════════════════════
type Checked = { from: EntryRow; to: EntryRow | null; requester: EmpRow; target: EmpRow; shape: SwapShape };
/**
 * ลำดับข้อความ (brief R4): กะไม่พบ → ไม่ใช่กะของผู้กด → ยังไม่เผยแพร่ → ผ่านไปแล้ว → ตัวเอง → เพื่อนไม่พบ/พ้นสภาพ → ไม่มีบัญชี →
 * กะของเพื่อน → เหมือนกัน → สาขาเดียวกันในวันนั้น → ลา → ถือกะซ้ำ → มีคำขอเปิดค้าง (ต้นทาง/ปลายทางของคำขออื่น — มติข้อสอบ 5)
 * actorUserId = ตรวจว่าผู้กดเป็นเจ้าของกะ (ตอนยื่น) · ไม่ส่ง = ตอนตอบรับ (ผูกกับผู้ขอเดิมแทน)
 */
async function checkInTx(
  tx: Tx,
  ctx: Ctx,
  p: { fromEntryId: string; targetEmployeeId: string; toEntryId: string | null; actorUserId?: string; requesterEmployeeId?: string; excludeSwapId?: string; viewpoint?: Viewpoint },
  today: string,
): Promise<Checked> {
  try {
    return await checkCore(tx, ctx, p, today);
  } catch (e) {
    // r3 (review r2-M1): ข้อความเขียนจากมุมผู้ขอ — ผู้กดเป็นเพื่อนผู้รับกะ ⇒ สลับ "คุณ" ↔ "เพื่อนร่วมงาน"
    if (p.viewpoint === "TARGET" && e instanceof SwapRefusal) throw new SwapRefusal(forTarget(e.message));
    throw e;
  }
}
/** มุมของผู้รับข้อความ: REQUESTER (ยื่น) · TARGET (เพื่อนตอบรับ) */
type Viewpoint = "REQUESTER" | "TARGET";
const TARGET_VIEW: Readonly<Record<string, string>> = {
  [SWAP_TEXT.leaveYou]: SWAP_TEXT.leavePeer,
  [SWAP_TEXT.leavePeer]: SWAP_TEXT.leaveYou,
  [SWAP_TEXT.endedYou]: SWAP_TEXT.targetNotFound,
  [SWAP_TEXT.targetNotFound]: SWAP_TEXT.endedYou,
};
const forTarget = (text: string): string => TARGET_VIEW[text] ?? text;
async function checkCore(
  tx: Tx,
  ctx: Ctx,
  p: { fromEntryId: string; targetEmployeeId: string; toEntryId: string | null; actorUserId?: string; requesterEmployeeId?: string; excludeSwapId?: string },
  today: string,
): Promise<Checked> {
  const from = await entryOf(tx, ctx, p.fromEntryId);
  if (!from) throw new SwapRefusal(T.shiftNotFound);
  const requester = await empOf(tx, ctx, from.employeeId);
  if (!requester) throw new SwapRefusal(T.shiftNotFound);
  if (p.actorUserId !== undefined && requester.linkedUserId !== p.actorUserId) throw new SwapRefusal(T.notOwn);
  if (p.requesterEmployeeId !== undefined && from.employeeId !== p.requesterEmployeeId) throw new SwapRefusal(T.entryChanged);
  // r2 F1 (มติผู้คุม): ต้องเป็นแถวที่ "ประกาศอยู่ตอนนี้" — แถวที่ถูกย้ายแล้วยังไม่เผยแพร่ใหม่ (published=false) ขอสลับไม่ได้
  //   (การเผยแพร่ภายหลังจะขยับ updatedAt จนคำขอที่ถูกต้องถูกยกเลิกเป็น ENTRY_CHANGED)
  if (from.publishedAt === null || !from.published) throw new SwapRefusal(T.unpublished);
  const fromDay = dayOf(from.date);
  if (fromDay < today) throw new SwapRefusal(T.past);
  if (p.targetEmployeeId === requester.id) throw new SwapRefusal(T.selfTarget);
  const target = await empOf(tx, ctx, p.targetEmployeeId);
  if (!target || isEnded(target) || !inEmployment(target, fromDay)) throw new SwapRefusal(T.targetNotFound);
  if (!target.linkedUserId) throw new SwapRefusal(T.unlinked);
  let to: EntryRow | null = null;
  if (p.toEntryId) {
    to = await entryOf(tx, ctx, p.toEntryId);
    if (!to || to.employeeId !== target.id || to.publishedAt === null || dayOf(to.date) < today) throw new SwapRefusal(T.toBad);
    if (!to.published) throw new SwapRefusal(T.unpublished); // r2 F1
    if (to.id === from.id || (dayOf(to.date) === fromDay && to.shiftId === from.shiftId)) throw new SwapRefusal(T.same);
  }
  const toDay = to ? dayOf(to.date) : null;
  // สาขาเดียวกันในวันนั้น (Q5 · H2.1 R3): คนที่จะมาทำกะต้องอยู่สาขาของแถวในวันนั้น (ยืมตัวก่อนได้) — unitId ของแถวจึงไม่เปลี่ยน
  if (unitOfDay(target, fromDay) !== from.unitId) throw new SwapRefusal(T.branch);
  if (to && toDay && unitOfDay(requester, toDay) !== to.unitId) throw new SwapRefusal(T.branch);
  if (to && toDay && (isEnded(requester) || !inEmployment(requester, toDay))) throw new SwapRefusal(T.endedYou); // r2 F3: บอกฝ่ายผู้ขอ
  // คนที่จะมาทำงานวันนั้นต้องไม่ลาอนุมัติแล้ว (ทั้งวัน) — ข้อความไม่มีชื่อ
  if (await onLeave(tx, ctx, target.id, fromDay)) throw new SwapRefusal(T.leavePeer);
  if (to && toDay && (await onLeave(tx, ctx, requester.id, toDay))) throw new SwapRefusal(T.leaveYou);
  // เจ้าของใหม่ต้องไม่ถือ (วัน, กะ) เดียวกันอยู่แล้ว
  if (await holds(tx, ctx, target.id, fromDay, from.shiftId)) throw new SwapRefusal(T.duplicate);
  if (to && toDay && (await holds(tx, ctx, requester.id, toDay, to.shiftId))) throw new SwapRefusal(T.duplicate);
  // คำขอเปิดค้างที่ใช้กะใดกะหนึ่งนี้อยู่แล้ว (ต้นทางหรือปลายทาง — ใต้ล็อกของ (เจ้าของกะ, วัน) จึงไม่มีช่องแข่ง)
  const entryIds = [from.id, ...(to ? [to.id] : [])];
  const clash = await tx.hrShiftSwapRequest.count({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      status: { in: [...SWAP_OPEN_STATUSES] },
      ...(p.excludeSwapId ? { id: { not: p.excludeSwapId } } : {}),
      OR: [{ fromEntryId: { in: entryIds } }, { toEntryId: { in: entryIds } }],
    },
  });
  if (clash > 0) throw new SwapRefusal(T.open);
  return { from, to, requester, target, shape: shapeOf(to?.id) };
}

// ═══════════════════════════ ใช้ผล (R8 body) — ผู้เรียกถือ hr-swap:<id> + กุญแจตารางกะแล้ว ═══════════════════════════
type Applied = { ok: true; entryIds: string[]; employeeIds: string[]; dates: string[] } | { ok: false; code: SwapApplyCode; party?: SwapParty };
async function applyInTx(tx: Tx, ctx: Ctx, s: SwapRow, today: string): Promise<Applied> {
  const from = await entryOf(tx, ctx, s.fromEntryId);
  const to = s.toEntryId ? await entryOf(tx, ctx, s.toEntryId) : null;
  if (!from || (s.toEntryId && !to) || !s.targetEmployeeId) return { ok: false, code: "ENTRY_GONE" };
  if (from.employeeId !== s.requesterEmployeeId || (to && to.employeeId !== s.targetEmployeeId)) return { ok: false, code: "ENTRY_CHANGED" };
  const fromDay = dayOf(from.date);
  const toDay = to ? dayOf(to.date) : null;
  if (fromDay < today || (toDay && toDay < today)) return { ok: false, code: "PAST" };
  const [requester, target] = [await empOf(tx, ctx, s.requesterEmployeeId), await empOf(tx, ctx, s.targetEmployeeId)];
  if (!requester || !target || isEnded(target) || !inEmployment(target, fromDay)) return { ok: false, code: "ENDED" };
  if (to && toDay && (isEnded(requester) || !inEmployment(requester, toDay))) return { ok: false, code: "ENDED", party: "YOU" };
  if (unitOfDay(target, fromDay) !== from.unitId || (to && toDay && unitOfDay(requester, toDay) !== to.unitId)) return { ok: false, code: "BRANCH" };
  if (await onLeave(tx, ctx, target.id, fromDay)) return { ok: false, code: "LEAVE" };
  if (to && toDay && (await onLeave(tx, ctx, requester.id, toDay))) return { ok: false, code: "LEAVE", party: "YOU" };
  const moves = [{ entryId: from.id, toEmployeeId: target.id }, ...(to ? [{ entryId: to.id, toEmployeeId: requester.id }] : [])];
  const expect = [
    { entryId: from.id, employeeId: requester.id, updatedAtMax: s.createdAt },
    ...(to ? [{ entryId: to.id, employeeId: target.id, updatedAtMax: s.createdAt }] : []),
  ];
  const r = await reassignEntriesInTx(tx, ctx, moves, { expect });
  if (!r.ok) return { ok: false, code: r.code };
  return {
    ok: true,
    entryIds: moves.map((m) => m.entryId).sort(),
    employeeIds: [requester.id, target.id].sort(),
    dates: [...new Set([fromDay, ...(toDay ? [toDay] : [])])].sort(),
  };
}
/** หลังใช้ผลสำเร็จ: event (ใน tx เดียวกัน · key ต่อคำขอ ⇒ ส่งซ้ำไม่เพิ่มแถว) */
async function emitApproved(tx: Tx, ctx: Ctx, s: SwapRow, unitId: string | null, a: Extract<Applied, { ok: true }>): Promise<void> {
  await emitOutbox(tx, {
    tenantId: ctx.tenantId,
    systemId: ctx.systemId,
    unitId,
    type: SWAP_APPROVED_EVENT,
    idempotencyKey: `${SWAP_APPROVED_EVENT}#${s.id}`,
    payload: { swapId: s.id, systemId: ctx.systemId, entryIds: a.entryIds, employeeIds: a.employeeIds, dates: a.dates },
  });
}
/** CANCELLED + ยกเลิกคำขออนุมัติที่ยัง PENDING (ใน tx) — ใช้ตอนหมดอายุ */
async function expireInTx(tx: Tx, ctx: Ctx, s: SwapRow): Promise<void> {
  const reqs = await tx.approvalRequest.findMany({ where: { tenantId: ctx.tenantId, entityType: SWAP_ENTITY, entityId: s.id, status: "PENDING" }, select: { id: true } });
  for (const r of reqs) await cancelRequest({ tenantId: ctx.tenantId }, r.id, { tx });
  await tx.hrShiftSwapRequest.updateMany({ where: { id: s.id, tenantId: ctx.tenantId, status: { in: [...SWAP_OPEN_STATUSES] } }, data: { status: "CANCELLED", decidedAt: new Date() } });
}
async function datesOf(tx: Tx, ctx: Ctx, s: SwapRow): Promise<{ fromDay: string | null; toDay: string | null; unitId: string | null }> {
  const [f, t] = [await entryOf(tx, ctx, s.fromEntryId), await entryOf(tx, ctx, s.toEntryId)];
  return { fromDay: f ? dayOf(f.date) : null, toDay: t ? dayOf(t.date) : null, unitId: f?.unitId ?? null };
}

async function audit(ctx: Ctx, actorId: string | null, action: string, swapId: string, after: Record<string, unknown>) {
  await writeAudit({ tenantId: ctx.tenantId, actorType: actorId ? "USER" : "SYSTEM", actorId, action, targetType: SWAP_ENTITY, targetId: swapId, after: { systemId: ctx.systemId, swapId, ...after } });
}

// ═══════════════════════════ ยื่นคำขอ (R2–R4) ═══════════════════════════
export async function requestSwap(
  ctx: Ctx,
  actor: SwapActor,
  input: { fromEntryId: string; targetEmployeeId: string | null; toEntryId?: string | null; reason?: string | null },
): Promise<{ ok: true; id: string } | SwapFail> {
  if (!actor?.userId) return refuse(T.notOwn);
  const fromEntryId = str(input?.fromEntryId);
  const targetEmployeeId = str(input?.targetEmployeeId);
  const toEntryId = str(input?.toEntryId) || null;
  if (!targetEmployeeId) return refuse(T.noTarget);
  if (!fromEntryId) return refuse(T.shiftNotFound);
  const reason = cleanSwapReason(input?.reason);
  if (reason === undefined) return refuse(T.reasonTooLong);
  try {
    const today = todayKey();
    const made = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      // ยังไม่มี id คำขอ ⇒ กุญแจตารางกะอย่างเดียว (R13): (เจ้าของกะต้นทาง, เพื่อน) × (วันต้นทาง, วันปลายทาง)
      const [f0, t0] = [await entryOf(tx, ctx, fromEntryId), await entryOf(tx, ctx, toEntryId)];
      if (f0) await lockRosterKeysInTx(tx, ctx.systemId, swapRosterKeys(f0.employeeId, targetEmployeeId, [dayOf(f0.date), t0 ? dayOf(t0.date) : null]));
      const c = await checkInTx(tx, ctx, { fromEntryId, targetEmployeeId, toEntryId, actorUserId: actor.userId }, today);
      // แถวเปลี่ยนเจ้าของ/วันระหว่างอ่านก่อนล็อก ⇒ กุญแจที่ถือไม่ใช่ของมัน
      if (!f0 || c.from.employeeId !== f0.employeeId || dayOf(c.from.date) !== dayOf(f0.date) || (c.to && (!t0 || dayOf(c.to.date) !== dayOf(t0.date)))) throw new SwapRefusal(T.entryChanged);
      const row = await tx.hrShiftSwapRequest.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          requesterEmployeeId: c.requester.id,
          fromEntryId: c.from.id,
          targetEmployeeId: c.target.id,
          toEntryId: c.to?.id ?? null,
          status: "AWAITING_PEER",
          reason,
          requestedByUserId: actor.userId,
          createdAt: new Date(), // นาฬิกาเดียวกับ updatedAt ของแถวตารางกะ (เทียบ "ไม่ถูกแตะตั้งแต่ยื่น" — D10)
        },
        select: { id: true },
      });
      // payload = id ล้วน (R9 · §C.1)
      await emitOutbox(tx, {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        unitId: c.from.unitId,
        type: SWAP_REQUESTED_EVENT,
        idempotencyKey: `${SWAP_REQUESTED_EVENT}#${row.id}`,
        payload: { swapId: row.id, systemId: ctx.systemId, fromEntryId: c.from.id, toEntryId: c.to?.id ?? null, requesterEmployeeId: c.requester.id, targetEmployeeId: c.target.id },
      });
      return { id: row.id, c };
    }, SWAP_TX_OPTS);
    await audit(ctx, actor.userId, "hr.swap.request", made.id, {
      fromEntryId: made.c.from.id,
      toEntryId: made.c.to?.id ?? null,
      targetEmployeeId: made.c.target.id,
      requesterEmployeeId: made.c.requester.id,
      shape: made.c.shape,
    });
    return { ok: true, id: made.id };
  } catch (e) {
    return refuse(reasonOf(e)); // partial unique (ต้นทางเปิดค้าง) = ข้อความ "คำขอค้าง" เดียวกัน
  }
}

// ═══════════════════════════ เพื่อนตอบรับ / ไม่รับ (R5 · R7) ═══════════════════════════
export async function respondSwap(ctx: Ctx, actor: SwapActor, swapId: string, input: { accept: boolean }): Promise<{ ok: true; status: SwapStatus } | SwapFail> {
  const id = str(swapId);
  if (!actor?.userId || !id) return refuse(T.stale);
  const accept = input?.accept === true;
  try {
    const today = todayKey();
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockSwapInTx(tx, id);
      const s = await swapOf(tx, ctx, id);
      if (!s) throw new SwapRefusal(T.stale);
      const target = await empOf(tx, ctx, s.targetEmployeeId);
      if (!target || target.linkedUserId !== actor.userId) throw new SwapRefusal(T.notYours);
      if (s.status !== "AWAITING_PEER") throw new SwapRefusal(T.stale);
      if (!accept) {
        const r = await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: "AWAITING_PEER" }, data: { status: "REJECTED", peerDecidedAt: new Date() } });
        if (r.count !== 1) throw new SwapRefusal(T.stale);
        return { status: "REJECTED" as SwapStatus, expired: false, auto: null as Extract<Applied, { ok: true }> | null };
      }
      const d = await datesOf(tx, ctx, s);
      await lockRosterKeysInTx(tx, ctx.systemId, swapRosterKeys(s.requesterEmployeeId, s.targetEmployeeId, [d.fromDay, d.toDay]));
      const d2 = await datesOf(tx, ctx, s);
      if ((d2.fromDay && d2.fromDay < today) || (d2.toDay && d2.toDay < today)) {
        await expireInTx(tx, ctx, s); // Q7: หมดอายุ ⇒ CANCELLED (commit) แล้วตอบข้อความหมดอายุ
        return { status: "CANCELLED" as SwapStatus, expired: true, auto: null };
      }
      // ตรวจซ้ำทั้งชุด (ของเปลี่ยนตั้งแต่ยื่น) — ผู้ขอต้องยังถือกะต้นทาง
      const c = await checkInTx(tx, ctx, { fromEntryId: s.fromEntryId, targetEmployeeId: s.targetEmployeeId ?? "", toEntryId: s.toEntryId, requesterEmployeeId: s.requesterEmployeeId, excludeSwapId: s.id, viewpoint: "TARGET" }, today);
      if (dayOf(c.from.date) !== d.fromDay || (c.to ? dayOf(c.to.date) : null) !== d.toDay) throw new SwapRefusal(T.entryChanged);
      const now = new Date();
      const r = await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: "AWAITING_PEER" }, data: { status: "PENDING", peerDecidedAt: now } });
      if (r.count !== 1) throw new SwapRefusal(T.stale);
      // Q8: เจ้าของร้านเป็นผู้ขอหรือผู้รับ ⇒ ใช้ผลเลย ไม่เข้าสาย (แบบ H0.7 R4)
      if ((await isTenantOwnerTx(tx, ctx.tenantId, c.requester.linkedUserId)) || (await isTenantOwnerTx(tx, ctx.tenantId, c.target.linkedUserId))) {
        const a = await applyInTx(tx, ctx, { ...s, status: "PENDING" }, today);
        // ผู้กด = เพื่อนผู้รับกะ ⇒ ข้อความจากมุมของเขา (r3)
        if (!a.ok) throw new SwapRefusal(forTarget(applyCodeText(a.code, { dup: T.duplicate, changed: T.entryChanged }, a.party)));
        const u = await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "APPROVED", decidedAt: now, decidedById: null } });
        if (u.count !== 1) throw new SwapRefusal(T.stale);
        await emitApproved(tx, ctx, s, c.from.unitId, a);
        return { status: "APPROVED" as SwapStatus, expired: false, auto: a };
      }
      // มีกติกา ⇒ คำขอ PENDING ในสาย (ใน tx นี้) · ไม่มีกติกา ⇒ คง PENDING ให้ผู้จัดตารางตัดสินตรง (Q1)
      await submitForApproval(
        { tenantId: ctx.tenantId },
        { entityType: SWAP_ENTITY, entityId: s.id, systemId: ctx.systemId, unitId: c.from.unitId, requestedById: c.requester.linkedUserId ?? s.requestedByUserId ?? actor.userId },
        { tx },
      );
      return { status: "PENDING" as SwapStatus, expired: false, auto: null };
    }, SWAP_TX_OPTS);
    if (out.expired) return refuse(T.expired);
    if (out.auto) await audit(ctx, actor.userId, "hr.swap.owner_auto", id, { entryIds: out.auto.entryIds });
    else await audit(ctx, actor.userId, "hr.swap.respond", id, { accept, status: out.status });
    return { ok: true, status: out.status };
  } catch (e) {
    return refuse(reasonOf(e, T.stale));
  }
}

// ═══════════════════════════ ผู้ขอยกเลิก (R5 · R13) ═══════════════════════════
export async function cancelSwap(ctx: Ctx, actor: SwapActor, swapId: string): Promise<{ ok: true } | SwapFail> {
  const id = str(swapId);
  if (!actor?.userId || !id) return refuse(T.stale);
  try {
    await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockSwapInTx(tx, id);
      const s = await swapOf(tx, ctx, id);
      if (!s) throw new SwapRefusal(T.stale);
      const requester = await empOf(tx, ctx, s.requesterEmployeeId);
      if (!requester || requester.linkedUserId !== actor.userId) throw new SwapRefusal(T.notOwn);
      if (s.status !== "AWAITING_PEER" && s.status !== "PENDING") throw new SwapRefusal(T.stale);
      // คำขออนุมัติก่อน แล้วจึงคำขอสลับ (ลำดับเดียวกับ Q16 ใน roster.ts) · ตัดสินในสายไปแล้ว ⇒ ยกเลิกเองไม่ได้ (ย้อนทั้งหมด)
      const reqs = await tx.approvalRequest.findMany({ where: { tenantId: ctx.tenantId, entityType: SWAP_ENTITY, entityId: id, status: { not: "CANCELLED" } }, select: { id: true } });
      for (const r of reqs) if (!(await cancelRequest({ tenantId: ctx.tenantId }, r.id, { tx }))) throw new SwapRefusal(T.decided);
      const u = await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: s.status }, data: { status: "CANCELLED", decidedAt: new Date() } });
      if (u.count !== 1) throw new SwapRefusal(T.stale);
    }, SWAP_TX_OPTS);
    await audit(ctx, actor.userId, "hr.swap.cancel", id, {});
    return { ok: true };
  } catch (e) {
    return refuse(reasonOf(e, T.stale));
  }
}

// ═══════════════════════════ ผู้จัดตารางตัดสินตรง (Q1 · Q9 · R7) ═══════════════════════════
export async function decideSwap(
  ctx: Ctx,
  viewer: SwapActor,
  swapId: string,
  input: { decision: "APPROVED" | "REJECTED" },
): Promise<{ ok: true; status: SwapStatus; warnings: RosterWarning[] } | SwapFail> {
  if (!isDecider(viewer)) return refuse(T.noPermission);
  const id = str(swapId);
  const decision = input?.decision === "APPROVED" ? "APPROVED" : input?.decision === "REJECTED" ? "REJECTED" : null;
  if (!id || !decision) return refuse(T.stale);
  try {
    const today = todayKey();
    const out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lockSwapInTx(tx, id);
      const s = await swapOf(tx, ctx, id);
      if (!s) throw new SwapRefusal(T.stale); // ไม่พบแถว = ถูกยกเลิก/ลบไปแล้ว (Q16)
      // r2 (review m4): ขอบเขตสาขาก่อนสถานะ — ผู้ตัดสินนอกสาขาได้ข้อความสาขาเสมอ (ไม่บอกว่าคำขอยังรออยู่หรือไม่)
      const [from, to] = [await entryOf(tx, ctx, s.fromEntryId), await entryOf(tx, ctx, s.toEntryId)];
      for (const e of [from, to]) {
        if (!e) continue;
        const r = unitRefusal(viewer, e.unitId);
        if (r) throw new SwapRefusal(r);
      }
      if (s.status !== "PENDING") throw new SwapRefusal(T.stale);
      const [requester, target] = [await empOf(tx, ctx, s.requesterEmployeeId), await empOf(tx, ctx, s.targetEmployeeId)];
      if ((requester?.linkedUserId && requester.linkedUserId === viewer.userId) || (target?.linkedUserId && target.linkedUserId === viewer.userId)) throw new SwapRefusal(T.self);
      const chain = await tx.approvalRequest.count({ where: { tenantId: ctx.tenantId, entityType: SWAP_ENTITY, entityId: id, status: { not: "CANCELLED" } } });
      if (chain > 0) throw new SwapRefusal(T.inChain);
      const now = new Date();
      if (decision === "REJECTED") {
        const u = await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "REJECTED", decidedById: viewer.userId, decidedAt: now } });
        if (u.count !== 1) throw new SwapRefusal(T.stale);
        return { kind: "rejected" as const };
      }
      await lockRosterKeysInTx(tx, ctx.systemId, swapRosterKeys(s.requesterEmployeeId, s.targetEmployeeId, [from ? dayOf(from.date) : null, to ? dayOf(to.date) : null]));
      // ใต้ล็อกตารางกะ: สถานะอาจเปลี่ยน (ย้าย/ลบแถวยกเลิกคำขอ — Q16) ⇒ อ่านใหม่
      const s2 = await swapOf(tx, ctx, id);
      if (!s2 || s2.status !== "PENDING") throw new SwapRefusal(T.stale);
      const d = await datesOf(tx, ctx, s2);
      if ((d.fromDay && d.fromDay < today) || (d.toDay && d.toDay < today)) {
        await expireInTx(tx, ctx, s2);
        return { kind: "expired" as const };
      }
      const a = await applyInTx(tx, ctx, s2, today);
      if (!a.ok) {
        await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: now } });
        return { kind: "refused" as const, code: a.code, party: a.party };
      }
      const u = await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "APPROVED", decidedById: viewer.userId, decidedAt: now } });
      if (u.count !== 1) throw new SwapRefusal(T.stale);
      await emitApproved(tx, ctx, s2, d.unitId, a);
      return { kind: "applied" as const, a, s: s2 };
    }, SWAP_TX_OPTS);
    if (out.kind === "rejected") {
      await audit(ctx, viewer.userId, "hr.swap.decide", id, { decision: "REJECTED" });
      return { ok: true, status: "REJECTED", warnings: [] };
    }
    if (out.kind === "expired") return refuse(T.expired);
    if (out.kind === "refused") {
      await audit(ctx, viewer.userId, "hr.swap.apply_refused", id, { requestId: null, code: out.code });
      return refuse(applyCodeText(out.code, { dup: T.duplicate, changed: T.entryChanged }, out.party));
    }
    await audit(ctx, viewer.userId, "hr.swap.apply", id, { requestId: null, entryIds: out.a.entryIds, decidedById: viewer.userId });
    return { ok: true, status: "APPROVED", warnings: await swapWarnings(ctx, out.s, false) };
  } catch (e) {
    return refuse(reasonOf(e, T.stale));
  }
}

// ═══════════════════════════ ผลของสายอนุมัติ (R8 — เรียกจาก approval-effects.ts เท่านั้น) ═══════════════════════════
/**
 * เรียกซ้ำ/พร้อมกันได้ (สถานะ ≠ PENDING ⇒ ไม่ทำอะไร) · ใช้ไม่ได้ (ตารางเปลี่ยน/ซ้ำ/ลา/พ้นสภาพ/ข้ามสาขา/ผ่านไปแล้ว) ⇒ CANCELLED + audit รหัส
 * **ไม่ throw** (คำขออนุมัติคง APPROVED — แถวของผู้ขออ่าน "อนุมัติแล้ว แต่ตารางกะเปลี่ยนไป") · ข้อผิดพลาดของฐานข้อมูล ⇒ throw ให้ event retry
 */
export async function applySwapDecision(input: { tenantId: string; systemId: string; swapId: string; requestId: string; approved: boolean }): Promise<{ applied: boolean; code?: SwapApplyCode }> {
  const ctx: Ctx = { tenantId: input.tenantId, systemId: input.systemId };
  const id = str(input.swapId);
  if (!ctx.tenantId || !ctx.systemId || !id || !input.requestId) return { applied: false };
  const today = todayKey();
  const out = await tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    await lockSwapInTx(tx, id);
    const s = await swapOf(tx, ctx, id);
    if (!s || s.status !== "PENDING") return { kind: "noop" as const };
    const req = await tx.approvalRequest.findFirst({ where: { id: input.requestId, tenantId: ctx.tenantId, entityType: SWAP_ENTITY, entityId: id }, select: { status: true } });
    if (!req || req.status !== (input.approved ? "APPROVED" : "REJECTED")) return { kind: "noop" as const };
    const last = await tx.approvalDecision.findFirst({ where: { tenantId: ctx.tenantId, requestId: input.requestId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { decidedById: true } });
    const decidedById = last?.decidedById ?? null;
    const now = new Date();
    if (!input.approved) {
      await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "REJECTED", decidedById, decidedAt: now } });
      return { kind: "rejected" as const };
    }
    const d = await datesOf(tx, ctx, s);
    await lockRosterKeysInTx(tx, ctx.systemId, swapRosterKeys(s.requesterEmployeeId, s.targetEmployeeId, [d.fromDay, d.toDay]));
    const s2 = await swapOf(tx, ctx, id); // ใต้ล็อกตารางกะ — การย้าย/ลบแถวอาจยกเลิกคำขอไปแล้ว (Q16)
    if (!s2 || s2.status !== "PENDING") return { kind: "noop" as const };
    const a = await applyInTx(tx, ctx, s2, today);
    if (!a.ok) {
      await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: now } });
      return { kind: "refused" as const, code: a.code };
    }
    const u = await tx.hrShiftSwapRequest.updateMany({ where: { id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "APPROVED", decidedById, decidedAt: now } });
    if (u.count !== 1) return { kind: "noop" as const };
    const d2 = await datesOf(tx, ctx, s2);
    await emitApproved(tx, ctx, s2, d2.unitId, a);
    return { kind: "applied" as const, a, decidedById };
  }, SWAP_TX_OPTS);
  if (out.kind === "refused") {
    await audit(ctx, null, "hr.swap.apply_refused", id, { requestId: input.requestId, code: out.code });
    return { applied: false, code: out.code };
  }
  if (out.kind === "applied") {
    await audit(ctx, null, "hr.swap.apply", id, { requestId: input.requestId, entryIds: out.a.entryIds, decidedById: out.decidedById });
    return { applied: true };
  }
  return { applied: false };
}

// ═══════════════════════════ คำเตือน (R10 — เตือนอย่างเดียว ไม่บล็อก) ═══════════════════════════
/**
 * rosterWarnings บนแถวของผู้ขอ + ผู้รับ (± 1 วัน + สัปดาห์ที่ครอบ — H2.1 R9) · simulate = จำลองหลังสลับ (ก่อนตัดสิน) ·
 * คืนเฉพาะคำเตือนของสองคนนี้ที่แตะกะของคำขอ (ไม่มีคนที่สาม · ไม่มีชื่อ)
 */
async function swapWarnings(ctx: Ctx, s: SwapRow, simulate: boolean): Promise<RosterWarning[]> {
  const db = tenantDb(ctx);
  const ids = [s.fromEntryId, ...(s.toEntryId ? [s.toEntryId] : [])];
  const mine = await db.hrRosterEntry.findMany({ where: { id: { in: ids } }, select: { id: true, date: true } });
  if (mine.length === 0 || !s.targetEmployeeId) return [];
  const days = mine.map((r) => dayOf(r.date)).sort();
  const emps = [s.requesterEmployeeId, s.targetEmployeeId];
  const from = addDays(weekStartOf(days[0]!), -1);
  const to = addDays(weekStartOf(days[days.length - 1]!), 7);
  const rows = await db.hrRosterEntry.findMany({
    where: { employeeId: { in: emps }, date: { gte: dbDate(from), lte: dbDate(to) } },
    select: { id: true, employeeId: true, date: true, startMin: true, endMin: true, breakMin: true, crossesMidnight: true },
    take: 2000,
  });
  const sim = rows.map((r) => ({
    id: r.id,
    employeeId: simulate && r.id === s.fromEntryId ? s.targetEmployeeId! : simulate && r.id === s.toEntryId ? s.requesterEmployeeId : r.employeeId,
    date: dayOf(r.date),
    startMin: r.startMin,
    endMin: r.endMin,
    breakMin: r.breakMin,
    crossesMidnight: r.crossesMidnight,
  }));
  const touched = new Set(ids);
  return rosterWarnings(sim, ROSTER_RULE_DEFAULTS).filter((w) => emps.includes(w.employeeId) && w.entryIds.some((i) => touched.has(i)));
}

/** ตัวอย่างคำเตือนหลังสลับ (ผู้ตัดสินในขอบเขตเท่านั้น) */
export async function swapPreview(ctx: Ctx, viewer: SwapActor, swapId: string): Promise<{ ok: true; warnings: RosterWarning[] } | SwapFail> {
  if (!isDecider(viewer)) return refuse(T.noPermission);
  try {
    const s = await tenantDb(ctx).hrShiftSwapRequest.findFirst({ where: { id: str(swapId) }, select: SWAP_SELECT });
    if (!s) return refuse(T.stale);
    const entries = await tenantDb(ctx).hrRosterEntry.findMany({ where: { id: { in: [s.fromEntryId, ...(s.toEntryId ? [s.toEntryId] : [])] } }, select: { unitId: true } });
    for (const e of entries) {
      const r = unitRefusal(viewer, e.unitId);
      if (r) return refuse(r);
    }
    return { ok: true, warnings: await swapWarnings(ctx, s, s.status === "AWAITING_PEER" || s.status === "PENDING") };
  } catch (e) {
    return refuse(reasonOf(e, T.stale));
  }
}

// ═══════════════════════════ ตัวอ่าน (R10 — DTO whitelist) ═══════════════════════════
export type SwapSide = { entryId: string; date: string; startMin: number; endMin: number; crossesMidnight: boolean; shiftName: string };
export type SwapItem = {
  id: string;
  shape: SwapShape;
  status: SwapStatus;
  createdAt: Date;
  peerDecidedAt: Date | null;
  decidedAt: Date | null;
  requester: { employeeId: string; name: string };
  target: { employeeId: string; name: string };
  from: SwapSide | null;
  to: SwapSide | null;
  reason?: string | null;
  canRespond: boolean;
  canCancel: boolean;
  outcome?: string;
};
export type SwapListResult = { ok: true; items: SwapItem[] } | SwapFail;

/** สาขาของกะฝั่งหนึ่ง (exists=false = แถวไม่มีแล้ว) */
type SideUnit = { exists: boolean; unitId: string | null };
/** แถว → DTO · ฝั่งกะ = เฉพาะสองกะของคำขอ (ไม่มีแถวอื่นของใคร) · reason เฉพาะเมื่อผู้เรียกบอกว่าเห็นได้ */
async function toItems(ctx: Ctx, rows: SwapRow[], o: { me: string | null; showReason: (s: SwapRow, units: { from: SideUnit; to: SideUnit | null }) => boolean; showTo?: (units: { from: SideUnit; to: SideUnit | null }) => boolean }): Promise<SwapItem[]> {
  if (rows.length === 0) return [];
  const db = tenantDb(ctx);
  const entryIds = [...new Set(rows.flatMap((r) => [r.fromEntryId, ...(r.toEntryId ? [r.toEntryId] : [])]))];
  const empIds = [...new Set(rows.flatMap((r) => [r.requesterEmployeeId, ...(r.targetEmployeeId ? [r.targetEmployeeId] : [])]))];
  const [entries, emps, reqs] = await Promise.all([
    db.hrRosterEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, date: true, startMin: true, endMin: true, crossesMidnight: true, shiftId: true, unitId: true } }),
    db.hrEmployee.findMany({ where: { id: { in: empIds } }, select: { id: true, name: true } }),
    db.approvalRequest.findMany({ where: { entityType: SWAP_ENTITY, entityId: { in: rows.map((r) => r.id) } }, select: { entityId: true, status: true } }),
  ]);
  const shifts = await db.hrShift.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.shiftId))] } }, select: { id: true, name: true } });
  const eOf = new Map(entries.map((e) => [e.id, e]));
  const nOf = new Map(emps.map((e) => [e.id, e.name]));
  const sOf = new Map(shifts.map((s) => [s.id, s.name]));
  const side = (id: string | null): SwapSide | null => {
    const e = id ? eOf.get(id) : undefined;
    return e ? { entryId: e.id, date: dayOf(e.date), startMin: e.startMin, endMin: e.endMin, crossesMidnight: e.crossesMidnight, shiftName: sOf.get(e.shiftId) ?? "" } : null;
  };
  const unitOfSide = (id: string): SideUnit => {
    const e = eOf.get(id);
    return { exists: !!e, unitId: e?.unitId ?? null };
  };
  const unitsOf = (r: SwapRow) => ({ from: unitOfSide(r.fromEntryId), to: r.toEntryId ? unitOfSide(r.toEntryId) : null });
  return rows.map((r) => {
    const reqApproved = reqs.some((q) => q.entityId === r.id && q.status === "APPROVED");
    const item: SwapItem = {
      id: r.id,
      shape: shapeOf(r.toEntryId),
      status: r.status as SwapStatus,
      createdAt: r.createdAt,
      peerDecidedAt: r.peerDecidedAt,
      decidedAt: r.decidedAt,
      requester: { employeeId: r.requesterEmployeeId, name: nOf.get(r.requesterEmployeeId) ?? "" },
      target: { employeeId: r.targetEmployeeId ?? "", name: r.targetEmployeeId ? (nOf.get(r.targetEmployeeId) ?? "") : "" },
      from: side(r.fromEntryId),
      to: o.showTo && !o.showTo(unitsOf(r)) ? null : side(r.toEntryId), // r2 ruling F2: กะของสาขานอกขอบเขต ไม่ส่ง (shape ยังบอกว่าเป็น SWAP)
      canRespond: !!o.me && r.targetEmployeeId === o.me && r.status === "AWAITING_PEER",
      canCancel: !!o.me && r.requesterEmployeeId === o.me && (r.status === "AWAITING_PEER" || r.status === "PENDING"),
    };
    if (o.showReason(r, unitsOf(r))) item.reason = r.reason;
    if (r.status === "CANCELLED" && reqApproved) item.outcome = T.outcomeStale;
    return item;
  });
}

/** คำขอที่ผู้กดเป็นผู้ขอหรือผู้รับ (พนักงานของผู้กดจาก employeeOfUser — ไม่รับ id จากฟอร์ม) */
export async function listMySwaps(ctx: Ctx, actor: SwapActor): Promise<SwapListResult> {
  try {
    if (!actor?.userId) return { ok: true, items: [] };
    const me = await employeeOfUser(ctx.tenantId, actor.userId);
    if (!me || me.systemId !== ctx.systemId) return { ok: true, items: [] };
    const rows = await tenantDb(ctx).hrShiftSwapRequest.findMany({
      where: { OR: [{ requesterEmployeeId: me.employeeId }, { targetEmployeeId: me.employeeId }] },
      select: SWAP_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    });
    return { ok: true, items: await toItems(ctx, rows, { me: me.employeeId, showReason: () => true }) };
  } catch (e) {
    return refuse(reasonOf(e, T.stale));
  }
}

/**
 * รายการของผู้จัดการ: ผู้ตัดสิน + บทบาท MANAGER · ขอบเขต = สาขาของกะต้นทาง (มติ H2.1 ข้อ 5) กรองใน query (r2 F2b — ไม่ใช่หลัง take) ·
 * คำขอที่ยังเปิดก่อน แล้วจึงใหม่สุด · ไม่เกิน MANAGER_LIST_MAX แถว · reason เฉพาะผู้ตัดสินที่ทั้งสองกะอยู่ในขอบเขต (Q18 · r2 F2) · ไม่มีเงิน
 */
const MANAGER_LIST_MAX = 500;
export async function listSwapsForManager(ctx: Ctx, viewer: SwapActor, input: { status?: string | null; unitId?: string | null } = {}): Promise<SwapListResult> {
  if (!isManagerReader(viewer)) return refuse(T.noPermission);
  try {
    const status = typeof input?.status === "string" && ["AWAITING_PEER", "PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(input.status) ? (input.status as SwapStatus) : null;
    const unitId = str(input?.unitId) || null;
    if (unitId && !unitVisible(viewer, unitId)) return refuse(T.otherBranch);
    const scope = hrScopeOf({ role: viewer.role as MembershipCtx["role"], unitAccess: viewer.unitAccess });
    const unitWhere: Prisma.HrShiftSwapRequestWhereInput[] = [];
    if (scope.unitIds !== "*") unitWhere.push({ fromEntry: { unitId: { in: scope.unitIds } } });
    if (unitId) unitWhere.push({ fromEntry: { unitId } });
    const base: Prisma.HrShiftSwapRequestWhereInput = unitWhere.length ? { AND: unitWhere } : {};
    const db = tenantDb(ctx);
    const order: Prisma.HrShiftSwapRequestOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "desc" }];
    const openStatuses = (status ? [status] : [...SWAP_OPEN_STATUSES]).filter((x) => SWAP_OPEN_STATUSES.includes(x));
    const closedStatuses = (status ? [status] : ["APPROVED", "REJECTED", "CANCELLED"]).filter((x) => !SWAP_OPEN_STATUSES.includes(x as SwapStatus)) as SwapStatus[];
    const open = openStatuses.length ? await db.hrShiftSwapRequest.findMany({ where: { ...base, status: { in: openStatuses } }, select: SWAP_SELECT, orderBy: order, take: MANAGER_LIST_MAX }) : [];
    const rest = MANAGER_LIST_MAX - open.length;
    const closed = closedStatuses.length && rest > 0 ? await db.hrShiftSwapRequest.findMany({ where: { ...base, status: { in: closedStatuses } }, select: SWAP_SELECT, orderBy: order, take: rest }) : [];
    const decider = isDecider(viewer);
    const sideOk = (u: SideUnit | null) => u === null || (u.exists && unitVisible(viewer, u.unitId));
    const me = await employeeOfUser(ctx.tenantId, viewer.userId).catch(() => null);
    return {
      ok: true,
      items: await toItems(ctx, [...open, ...closed], {
        me: me && me.systemId === ctx.systemId ? me.employeeId : null,
        showReason: (_r, u) => decider && sideOk(u.from) && sideOk(u.to),
        // r2 ruling F2 (H1.1 สาขา): ผู้ดูที่ขอบเขตไม่ครอบทั้งสองกะ ⇒ to = null (ไม่เห็นกะของอีกสาขา)
        showTo: (u) => sideOk(u.from) && sideOk(u.to),
      }),
    };
  } catch (e) {
    return refuse(reasonOf(e, T.stale));
  }
}
// ◂ HR H2.3
