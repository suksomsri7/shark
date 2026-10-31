// SVC D.12 ▸ ย้ายห้อง · ต่อสัญญา · ต้นสายเงินประกัน — สัญญา ledger/svc-briefs/svc-brief-d.12.md §4 (ชื่อ/ชนิดตรงตัว · ข้อสอบ qc-svc-d.12 ผูก)
//
// ชั้นตรวจ "เข้ม" (เงิน + สคบ. + ข้อมูลข้ามร้าน):
//   • ขอบเขต (X1): หน่วย DORM ของร้าน → Membership สด → dorm.lease.manage → ขอบเขตอาคาร (D.13) → สัญญา/ห้องของหน่วยนั้น · ไม่ผ่าน ⇒ NOT_FOUND เหตุผลเดียว
//   • ประกันตามต้นสาย (มติ R2): สัญญาใหม่ชี้ previousLeaseId · ประกันอยู่ที่ ref GL ของสัญญาตัวแรกในสาย (depositLeaseIdOf) ⇒ ย้ายห้อง/ต่อสัญญาไม่มี JV/เงินใหม่
//   • ย้ายห้อง (มติ R3): in-place ก่อนเริ่มสัญญา (ยังไม่มีบิล) หรือสัญญาใหม่ "วันที่ 1 ของเดือนค่าห้องที่ยังไม่ออกบิล" — ใต้ล็อกรอบบิลของเดือนนั้น (ไม่เก็บซ้ำ/ไม่หาย)
//   • ต่อสัญญา: สัญญาใหม่ต่อท้ายวันจบเดิม (ขึ้นค่าห้องได้ตอนนี้เท่านั้น — RENT_LOCKED_IN_LEASE RENEWAL) · สัญญาเดิมไม่แตะ (snapshot เดิมทุกไบต์)
//   • ธุรกรรมเดียว (runDormMoneyTx · connection เดียว) · ล็อก advisory ต้นสาย → ตัวเอง → (รอบบิล) → แถว (CAS) · 40P01 ⇒ ลองใหม่ 1 ครั้ง ⇒ BUSY · ไม่ throw
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import { bkkYmd } from "@/lib/core/quiet-hours";
import type { MembershipCtx } from "@/lib/core/rbac";
import { resolveSettings, snapshotPolicy } from "@/lib/core/settings";
import { evaluateLegal, leaseKind as legalLeaseKind, normalizeLegalMode } from "@/lib/core/settings/legal/th-rental-2568";
import { createExternalInvoice, runDormMoneyTx, securityDepositHeld } from "@/lib/modules/account";
import { claimRoom, exclusiveEnd, moveOccupancy, resizeOccupancy } from "@/lib/modules/rooms";
import { MOVEOUT_NF_REASON, moveOutAccess } from "./moveout-access";
import { dormScopeFor, dormVisibleRoomIds } from "./scope";

// ───────────────────────── ชนิด · ค่าคงที่ ─────────────────────────
export type LeaseChangeCtx = { tenantId: string; actorUserId: string };
type LegalInfo = { code: string; messageTh: string; citation: string };
export type ChangeFail = { ok: false; code: string; reason: string; legal?: LegalInfo };
export type Tx = Prisma.TransactionClient;

const MAX_CHAIN = 50;
const MAX_SATANG = 1_000_000_000;
const DAY_MS = 86_400_000;
const EVENT_ENDED = "dorm.lease.ended";
const EVENT_RENEWED = "dorm.lease.renewed";

export const fail = (code: string, reason: string, legal?: LegalInfo): ChangeFail => (legal ? { ok: false, code, reason, legal } : { ok: false, code, reason });
export const notFound = (): ChangeFail => fail("NOT_FOUND", MOVEOUT_NF_REASON);
export const busy = (): ChangeFail => fail("BUSY", "มีรายการอื่นของสัญญานี้กำลังบันทึกพร้อมกัน — ยังไม่มีอะไรเปลี่ยน ลองใหม่อีกครั้ง");
export const unavailable = (): ChangeFail => fail("UNAVAILABLE", "ระบบบันทึกขัดข้องชั่วคราว — ยังไม่มีอะไรเปลี่ยน ลองใหม่อีกครั้ง");
export const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
export const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

/** ยกเลิกทั้ง tx พร้อมผลปฏิเสธ (ไม่มีแถวใดเกิด) */
export class Abort extends Error {
  constructor(public readonly result: ChangeFail) {
    super("dorm.d12 abort");
  }
}

// ───────────────────────── วันที่ (สตริง YYYY-MM-DD · ไม่ใช้ getDate/getMonth/getDay ดิบ) ─────────────────────────
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const dimOf = (y: number, m1: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m1 - 1];
const pad2 = (n: number) => String(n).padStart(2, "0");
export function parseYmd(s: unknown): { y: number; m: number; d: number } | null {
  if (typeof s !== "string") return null;
  const r = YMD_RE.exec(s);
  if (!r) return null;
  const y = Number(r[1]);
  const m = Number(r[2]);
  const d = Number(r[3]);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > dimOf(y, m)) return null;
  return { y, m, d };
}
const ymdMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
export const addDaysYmd = (ymd: string, n: number) => new Date(ymdMs(ymd) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((ymdMs(b) - ymdMs(a)) / DAY_MS);
export const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
export const ymdOfDb = (d: Date | null | undefined): string => (d instanceof Date ? d.toISOString().slice(0, 10) : "");
export function addMonthsKey(p: string, k: number): string {
  const y = Number(p.slice(0, 4));
  const m0 = Number(p.slice(5, 7)) - 1 + k;
  return `${String(y + Math.floor(m0 / 12)).padStart(4, "0")}-${pad2((((m0 % 12) + 12) % 12) + 1)}`;
}
export const monthEndOf = (p: string) => `${p}-${pad2(dimOf(Number(p.slice(0, 4)), Number(p.slice(5, 7))))}`;
/** วันสุดท้ายที่อยู่ได้ (รวมวันนั้น) — สูตรเดียวกับ D.5 §2.2 (lease.ts#leaseEndDate · เขียนซ้ำที่นี่กันวงโหลดโมดูล) */
export function leaseEndYmd(start: string, months: number): string {
  const p = parseYmd(start);
  if (!p) throw new Error("leaseEndYmd: วันที่ไม่ถูกต้อง");
  const m0 = p.m - 1 + months;
  const y = p.y + Math.floor(m0 / 12);
  const m1 = (((m0 % 12) + 12) % 12) + 1;
  return addDaysYmd(`${y}-${pad2(m1)}-${pad2(Math.min(p.d, dimOf(y, m1)))}`, -1);
}

// ───────────────────────── ล็อก · ลองใหม่ ─────────────────────────
export async function advisoryLock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
export const leaseLockKey = (leaseId: string) => `dorm.lease:${leaseId}`;
export const lateFeeLockKey = (leaseId: string) => `dorm.latefee:${leaseId}`;
export const runLockKey = (unitId: string, periodKey: string) => `dorm.billrun:${unitId}:${periodKey}`;

export function isDeadlock(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "40P01" || o.originalCode === "40P01" || o.code === "P2034") return true;
    if (typeof o.message === "string" && /deadlock|40P01|write conflict/i.test(o.message)) return true;
    cur = o.cause ?? (isRec(o.meta) ? o.meta.driverAdapterError : undefined);
  }
  return false;
}
/**
 * ธุรกรรมเดียวของใบ D.12 (runDormMoneyTx ของ facade บัญชี · connection เดียว) — Abort ⇒ ผลปฏิเสธ (rollback ทั้งก้อน) ·
 *   40P01/P2034 ⇒ ลองใหม่ 1 ครั้ง · ยังชน ⇒ BUSY · error อื่นโยนให้ผู้เรียก (ผู้เรียกแปลงเป็น UNAVAILABLE + logOps)
 */
export async function d12Tx<T>(fn: (tx: Tx) => Promise<T>, runner: (f: (tx: Tx) => Promise<T>) => Promise<T> = runDormMoneyTx): Promise<T | ChangeFail> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runner(fn);
    } catch (e) {
      if (e instanceof Abort) return e.result;
      if (!isDeadlock(e)) throw e;
    }
  }
  return busy();
}
export const isFail = (x: unknown): x is ChangeFail => isRec(x) && x.ok === false && typeof x.code === "string";

export async function logD12(where: string, tenantId: unknown, e: unknown): Promise<void> {
  try {
    await logOps("ERROR", `dorm.d12.${where}`, "บริการย้ายออก/ย้ายห้อง/ต่อสัญญาของหอขัดข้อง", {
      tenantId: typeof tenantId === "string" ? tenantId : undefined,
      detail: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : String(e).slice(0, 500),
    });
  } catch {
    /* log ล้มไม่ทำให้ผู้ใช้ล้มซ้ำ */
  }
}

// ───────────────────────── ด่านร่วม (§3: หน่วย DORM ของร้าน → Membership สด → สิทธิ์ → ขอบเขตอาคาร) ─────────────────────────
export type D12Gate = {
  tenantId: string;
  unitId: string;
  unitName: string;
  actorUserId: string;
  role: string;
  /** dorm.deposit.deduct.approve (มติ R7) */
  approve: boolean;
  visibleRooms: Set<string> | null;
};
export async function d12Gate(ctx: unknown, unitId: unknown, need: "manage" | "lease"): Promise<D12Gate | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const tenantId = ctx.tenantId;
  const actorUserId = ctx.actorUserId;
  const tdb = tenantDb({ tenantId });
  const unit = await tdb.businessUnit.findFirst({ where: { id: unitId, type: "DORM" }, select: { id: true, name: true } });
  if (!unit) return null;
  const mem = await tdb.membership.findFirst({ where: { tenantId, userId: actorUserId, acceptedAt: { not: null } }, select: { id: true, role: true, unitAccess: true, permissions: true } });
  if (!mem) return null;
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  const acc = moveOutAccess(m, unit.id);
  if (need === "manage" ? !acc.manage : !acc.lease) return null;
  const visibleRooms = await dormVisibleRoomIds(tenantId, unit.id, await dormScopeFor(tenantId, unit.id, { id: mem.id, ctx: m }));
  return { tenantId, unitId: unit.id, unitName: unit.name, actorUserId, role: String(mem.role), approve: acc.approve, visibleRooms };
}
export const roomVisible = (g: D12Gate, roomId: string): boolean => g.visibleRooms === null || g.visibleRooms.has(roomId);

// ───────────────────────── ต้นสายเงินประกัน (§4.1 · มติ R2) ─────────────────────────
type ChainRow = { id: string; unitId: string; partyId: string; previousLeaseId: string | null };
const dbOf = (tx: Tx | null, tenantId: string, unitId: string): Tx => tx ?? (tenantDb({ tenantId, unitId }) as unknown as Tx);

/**
 * สัญญาตัวแรกสุดในสาย previousLeaseId (ร้าน/หน่วย/ผู้เช่าเดียวกันเท่านั้น · กันวง ≤ 50 ขั้น) — ประกันอยู่ที่ ref GL ของสัญญานี้
 *   tx = อ่านผ่านธุรกรรมของผู้เรียก (ไม่เปิด connection ที่สอง) · null = อ่านนอกธุรกรรม · ไม่พบสัญญา ⇒ คืน leaseId เดิม
 */
export async function depositLeaseIdOf(tx: Tx | null, input: { tenantId: string; unitId: string; leaseId: string }): Promise<string> {
  return (await leaseChainOf(tx, input)).root;
}
/** สายของสัญญา (ต้นสาย → … → ตัวเอง) */
export async function leaseChainOf(tx: Tx | null, input: { tenantId: string; unitId: string; leaseId: string }): Promise<{ root: string; ids: string[] }> {
  const db = dbOf(tx, input.tenantId, input.unitId);
  const first = await db.dormLease.findFirst({ where: { tenantId: input.tenantId, unitId: input.unitId, id: input.leaseId }, select: { id: true, unitId: true, partyId: true, previousLeaseId: true } });
  if (!first) return { root: input.leaseId, ids: [input.leaseId] };
  const ids = [first.id];
  let cur: ChainRow = first;
  for (let i = 0; i < MAX_CHAIN && cur.previousLeaseId; i++) {
    const prev: ChainRow | null = await db.dormLease.findFirst({
      where: { tenantId: input.tenantId, id: cur.previousLeaseId, unitId: first.unitId, partyId: first.partyId },
      select: { id: true, unitId: true, partyId: true, previousLeaseId: true },
    });
    if (!prev || ids.includes(prev.id)) break;
    ids.unshift(prev.id);
    cur = prev;
  }
  return { root: ids[0], ids };
}
/** ต้นสายของหลายสัญญา (อ่านเป็นชุดต่อชั้น · ≤ 50 ชั้น) — คืน Map leaseId → ต้นสาย */
export async function depositRootsOf(tenantId: string, unitId: string, leaseIds: string[]): Promise<Map<string, string>> {
  const db = dbOf(null, tenantId, unitId);
  const out = new Map<string, string>();
  const ids = [...new Set(leaseIds)];
  if (!ids.length) return out;
  const known = new Map<string, ChainRow>();
  let want = ids;
  for (let i = 0; i <= MAX_CHAIN && want.length; i++) {
    const rows = await db.dormLease.findMany({ where: { tenantId, unitId, id: { in: want } }, select: { id: true, unitId: true, partyId: true, previousLeaseId: true } });
    for (const r of rows) known.set(r.id, r);
    want = [...new Set(rows.map((r) => r.previousLeaseId).filter((x): x is string => !!x && !known.has(x)))];
  }
  for (const id of ids) {
    const start = known.get(id);
    let cur = start;
    const seen = new Set<string>();
    while (cur && cur.previousLeaseId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const prev = known.get(cur.previousLeaseId);
      if (!prev || prev.partyId !== start?.partyId || prev.unitId !== start?.unitId) break;
      cur = prev;
    }
    out.set(id, cur?.id ?? id);
  }
  return out;
}

// ───────────────────────── ร่วม: ค่าห้องของห้อง · เดือนค่าห้องของรอบบิล ─────────────────────────
/** ค่าห้องปัจจุบันของห้อง (resolver แบบ D.5): rooms.rent.monthly ของ snapshot > 0 ⇒ ราคาประเภทห้อง > 0 ⇒ ค่าเดิม */
function rentOfRoom(snapValues: Record<string, unknown>, typeMonthly: number | null, fallback: number): number {
  const s = snapValues["rooms.rent.monthly"];
  if (isInt(s) && s > 0) return s;
  if (isInt(typeMonthly) && typeMonthly > 0) return typeMonthly;
  return fallback;
}
/** งวดบิล (periodKey) ที่เก็บค่าห้องของเดือน m — ADVANCE: งวด = m · ARREARS: งวด = m + 1 (ค่าปัจจุบันของหน่วย แบบ D.8) */
export async function rentTimingOf(tenantId: string, unitId: string): Promise<"ADVANCE" | "ARREARS"> {
  const r = await resolveSettings({ tenantId }, ["rooms.billing.rentTiming"], { unitId });
  return r["rooms.billing.rentTiming"]?.value === "ARREARS" ? "ARREARS" : "ADVANCE";
}
export const rentMonthOfPeriod = (periodKey: string, timing: "ADVANCE" | "ARREARS") => (timing === "ARREARS" ? addMonthsKey(periodKey, -1) : periodKey);
export const periodOfRentMonth = (rentMonth: string, timing: "ADVANCE" | "ARREARS") => (timing === "ARREARS" ? addMonthsKey(rentMonth, 1) : rentMonth);
const isSendClaim = (v: unknown) => typeof v === "string" && v.startsWith("sending:");

const LEASE_SEL = {
  id: true,
  unitId: true,
  roomId: true,
  partyId: true,
  coTenants: true,
  status: true,
  startDate: true,
  endDate: true,
  rentSatang: true,
  commonFeeSatang: true,
  occupancyId: true,
  signedAt: true,
  templateKey: true,
  templateVersion: true,
  previousLeaseId: true,
  policySnapshot: true,
} as const;

async function endedEvent(tx: Tx, tenantId: string, unitId: string, leaseId: string, roomId: string, reason: "MOVED_OUT" | "TRANSFER" | "RENEWED"): Promise<void> {
  await emitOutbox(tx, { tenantId, unitId, type: EVENT_ENDED, idempotencyKey: `${EVENT_ENDED}:${leaseId}`, payload: { unitId, leaseId, roomId, reason } });
}
export { endedEvent as emitLeaseEnded };

// ═════════════════════════ 4.2 ย้ายห้อง ═════════════════════════
export async function transferRoom(
  ctx: LeaseChangeCtx,
  input: { unitId: string; leaseId: string; toRoomId: string; effectiveDate: string; rentSatang?: number; meterReadings?: { meterId: string; value: number }[]; meterReason?: string | null },
  deps?: { now?: Date },
): Promise<{ ok: true; duplicate: boolean; mode: "IN_PLACE" | "NEW_LEASE"; leaseId: string; previousLeaseId: string | null; carriedDepositSatang: number } | ChangeFail> {
  const tenantForLog = isRec(ctx) ? ctx.tenantId : null;
  try {
    if (!isRec(input)) return notFound();
    const g = await d12Gate(ctx, input.unitId, "lease");
    if (!g) return notFound();
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const lease = isStr(input.leaseId) ? await db.dormLease.findFirst({ where: { id: input.leaseId }, select: LEASE_SEL }) : null;
    if (!lease || !roomVisible(g, lease.roomId)) return notFound();
    const toRoom = isStr(input.toRoomId)
      ? await db.hotelRoom.findFirst({ where: { id: input.toRoomId }, select: { id: true, number: true, roomTypeId: true, roomType: { select: { monthlyRateSatang: true } } } })
      : null;
    if (!toRoom || !roomVisible(g, toRoom.id)) return notFound();
    const eff = parseYmd(input.effectiveDate) ? input.effectiveDate : null;
    if (!eff) return fail("INVALID_INPUT", "วันที่ย้ายห้องไม่ถูกต้อง (ใช้รูปแบบ ปปปป-ดด-วว)");
    if (input.rentSatang !== undefined && input.rentSatang !== null && !(isInt(input.rentSatang) && input.rentSatang > 0 && input.rentSatang <= MAX_SATANG))
      return fail("INVALID_INPUT", "ค่าห้องต้องเป็นจำนวนเต็มสตางค์มากกว่า 0");
    const readingsIn = Array.isArray(input.meterReadings) ? input.meterReadings : [];
    for (const r of readingsIn) if (!isRec(r) || !isStr(r.meterId) || !isInt(r.value) || r.value < 0) return fail("INVALID_INPUT", "เลขมิเตอร์ต้องเป็นจำนวนเต็มไม่ติดลบ");
    const root = await depositLeaseIdOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id });
    const carried = async () => securityDepositHeld({ tenantId: g.tenantId, unitId: g.unitId, leaseId: root });

    // ซ้ำ (คำขอเดิม) ⇒ ผลเดิม
    const kid = await db.dormLease.findFirst({ where: { previousLeaseId: lease.id, endReason: null, status: { not: "CANCELLED" } }, select: { id: true, roomId: true, startDate: true } });
    if (lease.status === "ENDED" && lease.previousLeaseId !== undefined && kid && kid.roomId === toRoom.id && ymdOfDb(kid.startDate) === eff) {
      // SVC D.12 (Y20) ▸ ซ้ำหลังโพรเซสตายหลัง commit ⇒ เติมใบค่าน้ำไฟห้องเดิม (idempotent ต่อ ref + เครื่องหมายเสร็จ) ◂
      await transferUtilityInvoice(g.tenantId, g.unitId, g.actorUserId, lease.id, deps?.now instanceof Date ? deps.now : new Date()).catch((e) => logD12("transfer.utility", g.tenantId, e));
      return { ok: true, duplicate: true, mode: "NEW_LEASE", leaseId: kid.id, previousLeaseId: lease.id, carriedDepositSatang: await carried() };
    }
    const start = ymdOfDb(lease.startDate);
    if (lease.status === "ACTIVE" && lease.roomId === toRoom.id && eff === start)
      return { ok: true, duplicate: true, mode: "IN_PLACE", leaseId: lease.id, previousLeaseId: null, carriedDepositSatang: await carried() };
    if (lease.status !== "ACTIVE") return fail("NOT_EDITABLE", "ย้ายห้องได้เฉพาะสัญญาที่ยังมีผลและยังไม่แจ้งย้ายออก");
    const mo = await db.dormMoveOut.findFirst({ where: { leaseId: lease.id, status: { not: "CANCELLED" } }, select: { id: true } });
    if (mo) return fail("NOT_EDITABLE", "สัญญานี้แจ้งย้ายออกแล้ว — ยกเลิกการแจ้งย้ายออกก่อนย้ายห้อง");
    if (toRoom.id === lease.roomId) return fail("INVALID_INPUT", "ห้องปลายทางเป็นห้องเดิม");
    const end = ymdOfDb(lease.endDate);
    const billsNow = await db.dormBill.count({ where: { leaseId: lease.id, status: { not: "VOID" } } });

    // ── IN_PLACE: ก่อนเริ่มสัญญา + ยังไม่มีบิล ⇒ ย้ายช่วงเดิมไปห้องใหม่ (สัญญาเดิม · ประกันเดิม) ──
    if (eff === start && billsNow === 0) {
      if (!lease.occupancyId) return fail("NOT_EDITABLE", "สัญญานี้ไม่มีการถือห้อง — ย้ายห้องไม่ได้");
      const out = await d12Tx(async (tx) => {
        await advisoryLock(tx, leaseLockKey(root));
        if (root !== lease.id) await advisoryLock(tx, leaseLockKey(lease.id));
        const cur = await tx.dormLease.findFirst({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, roomId: true } });
        if (!cur) throw new Abort(notFound());
        if (cur.status === "ACTIVE" && cur.roomId === toRoom.id) return { dup: true };
        if (cur.status !== "ACTIVE") throw new Abort(fail("NOT_EDITABLE", "ย้ายห้องได้เฉพาะสัญญาที่ยังมีผล"));
        if ((await tx.dormBill.count({ where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id, status: { not: "VOID" } } })) > 0)
          throw new Abort(fail("ALREADY_BILLED", "สัญญานี้ออกบิลแล้ว — ย้ายห้องได้ตั้งแต่วันที่ 1 ของเดือนที่ยังไม่ออกบิล"));
        const r = await moveOccupancy(tx, { tenantId: g.tenantId, unitId: g.unitId, occupancyId: lease.occupancyId as string, toRoomId: toRoom.id });
        if (!r.ok) throw new Abort(r.code === "ROOM_TAKEN" ? roomTaken() : r.code === "ROOM_INACTIVE" ? fail("ROOM_UNAVAILABLE", "ห้องปลายทางปิดซ่อมหรือปิดใช้งานอยู่") : notFound());
        const u = await tx.dormLease.updateMany({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId, status: "ACTIVE", roomId: lease.roomId }, data: { roomId: toRoom.id } });
        if (u.count !== 1) throw new Abort(fail("NOT_EDITABLE", "สัญญานี้เปลี่ยนไปแล้ว — โหลดหน้าใหม่"));
        await tx.auditLog.create({
          data: { tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.lease.transferred", targetType: "DormLease", targetId: lease.id, after: { mode: "IN_PLACE", fromRoomId: lease.roomId, toRoomId: toRoom.id, effectiveDate: eff } },
        });
        return { dup: false };
      });
      if (isFail(out)) return out;
      return { ok: true, duplicate: out.dup, mode: "IN_PLACE", leaseId: lease.id, previousLeaseId: null, carriedDepositSatang: await carried() };
    }

    // ── NEW_LEASE: วันที่ 1 ของเดือนค่าห้องที่ยังไม่ออกบิล (มติ R3) ──
    if (eff.slice(8) !== "01") return fail("TRANSFER_DATE", "ย้ายห้องระหว่างสัญญาได้เฉพาะวันที่ 1 ของเดือน (เดือนที่ยังไม่ออกบิลค่าห้อง) — ระบบยังไม่รองรับย้ายกลางเดือน");
    if (eff <= start) return fail("INVALID_INPUT", "วันย้ายห้องต้องหลังวันเริ่มสัญญา");
    if (end && eff > end) return fail("INVALID_INPUT", "วันย้ายห้องต้องไม่เกินวันจบสัญญา");
    const timing = await rentTimingOf(g.tenantId, g.unitId);
    const effMonth = eff.slice(0, 7);
    const billCheck = (bills: { periodKey: string; status: string; sentVia: string | null }[]): ChangeFail | null => {
      const hit = bills.filter((b) => rentMonthOfPeriod(b.periodKey, timing) >= effMonth);
      if (!hit.length) return null;
      if (hit.some((b) => b.status === "DRAFT" || b.status === "HELD" || isSendClaim(b.sentVia))) return fail("BILL_PENDING", "มีบิลของเดือนนั้นที่ยังไม่ส่ง/กำลังส่ง — ส่งหรือลบบิลในรอบบิลก่อน แล้วค่อยย้ายห้อง");
      return fail("ALREADY_BILLED", "เดือนนี้ออกบิลค่าห้องไปแล้ว — ย้ายห้องได้ตั้งแต่วันที่ 1 ของเดือนที่ยังไม่ออกบิล");
    };
    const pre = billCheck(await db.dormBill.findMany({ where: { leaseId: lease.id, status: { not: "VOID" } }, select: { periodKey: true, status: true, sentVia: true } }));
    if (pre) return pre;
    // snapshot ใหม่ของห้องใหม่ (ค่าตั้งปัจจุบัน) · ค่าห้อง — อ่านก่อนเปิด tx (ไม่มี connection ที่สองระหว่างถือ tx)
    const snap = await snapshotPolicy({ tenantId: g.tenantId }, "lease", { unitId: g.unitId, roomTypeId: toRoom.roomTypeId, roomId: toRoom.id });
    const rent = isInt(input.rentSatang) ? input.rentSatang : rentOfRoom(snap.values, toRoom.roomType?.monthlyRateSatang ?? null, lease.rentSatang);
    const oldSnap = isRec(lease.policySnapshot) ? lease.policySnapshot : null;
    const policySnapshot = { ...snap, ...(oldSnap && isRec(oldSnap.legal) ? { legal: oldSnap.legal } : {}), transfer: { fromLeaseId: lease.id, effectiveDate: eff } };
    const heldNow = await carried();
    const meters = readingsIn.length
      ? await db.dormMeter.findMany({ where: { id: { in: readingsIn.map((r) => r.meterId) }, role: "ROOM", removedAt: null }, select: { id: true, roomId: true } })
      : [];
    for (const r of readingsIn) {
      const m = meters.find((x) => x.id === r.meterId);
      if (!m || (m.roomId !== lease.roomId && m.roomId !== toRoom.id)) return notFound();
    }
    // SVC D.12 (Y13) ▸ ห้องเดิมมีมิเตอร์ ⇒ ต้องจดเลขห้องเดิมวันย้ายครบทุกตัว (ค่าน้ำไฟถึงวันย้าย) หรือระบุเหตุผล ≥ 10 ตัว (จด audit) ◂
    const oldMeters = await db.dormMeter.findMany({ where: { roomId: lease.roomId, role: "ROOM", removedAt: null }, select: { id: true } });
    const meterReason = typeof input.meterReason === "string" ? input.meterReason.trim() : "";
    const missingOld = oldMeters.filter((m) => !readingsIn.some((r) => r.meterId === m.id));
    if (missingOld.length && [...meterReason].length < 10)
      return fail("METER_MISSING", "ห้องเดิมมีมิเตอร์น้ำ/ไฟ — จดเลขมิเตอร์ห้องเดิม ณ วันย้ายให้ครบ (หรือระบุเหตุผลอย่างน้อย 10 ตัวอักษรว่าทำไมจดไม่ได้)");
    const newId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.slice(0, 25);
    const P = periodOfRentMonth(effMonth, timing);
    const out = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== lease.id) await advisoryLock(tx, leaseLockKey(lease.id));
      await advisoryLock(tx, runLockKey(g.unitId, P)); // ไม่ซ้อนกับการเตรียมรอบบิลของเดือนนั้น (D.8 เขียนบิลใต้ล็อกเดียวกัน)
      const cur = await tx.dormLease.findFirst({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, endDate: true, occupancyId: true } });
      if (!cur) throw new Abort(notFound());
      const k = await tx.dormLease.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, previousLeaseId: lease.id, status: { not: "CANCELLED" } }, select: { id: true, roomId: true, startDate: true } });
      if (k) {
        if (k.roomId === toRoom.id && ymdOfDb(k.startDate) === eff) return { dup: true, id: k.id };
        throw new Abort(fail("NOT_EDITABLE", "สัญญานี้มีสัญญาต่อ/ย้ายห้องไปแล้ว"));
      }
      if (cur.status !== "ACTIVE") throw new Abort(fail("NOT_EDITABLE", "ย้ายห้องได้เฉพาะสัญญาที่ยังมีผลและยังไม่แจ้งย้ายออก"));
      if (await tx.dormMoveOut.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id, status: { not: "CANCELLED" } }, select: { id: true } }))
        throw new Abort(fail("NOT_EDITABLE", "สัญญานี้แจ้งย้ายออกแล้ว — ยกเลิกการแจ้งย้ายออกก่อนย้ายห้อง"));
      const bc = billCheck(await tx.dormBill.findMany({ where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id, status: { not: "VOID" } }, select: { periodKey: true, status: true, sentVia: true } }));
      if (bc) throw new Abort(bc);
      const oldEnd = ymdOfDb(cur.endDate);
      if (!cur.occupancyId) throw new Abort(fail("NOT_EDITABLE", "สัญญานี้ไม่มีการถือห้อง — ย้ายห้องไม่ได้"));
      const rs = await resizeOccupancy(tx, { tenantId: g.tenantId, unitId: g.unitId, occupancyId: cur.occupancyId, end: eff });
      if (!rs.ok) throw new Abort(rs.code === "ROOM_TAKEN" ? roomTaken() : fail("NOT_EDITABLE", "ปรับช่วงการถือห้องเดิมไม่ได้"));
      const c = await claimRoom(tx, {
        tenantId: g.tenantId,
        unitId: g.unitId,
        roomId: toRoom.id,
        start: eff,
        end: oldEnd ? exclusiveEnd(oldEnd) : exclusiveEnd(leaseEndYmd(eff, 12)),
        kind: "LEASE",
        refType: "DormLease",
        refId: newId,
        requireRentMode: "MONTHLY",
      });
      if (!c.ok) {
        if (c.code === "ROOM_TAKEN") throw new Abort(roomTaken());
        if (c.code === "ROOM_INACTIVE") throw new Abort(fail("ROOM_UNAVAILABLE", "ห้องปลายทางปิดซ่อมหรือปิดใช้งานอยู่"));
        if (c.code === "RENT_MODE_MISMATCH") throw new Abort(fail("RENT_MODE_MISMATCH", "ห้องปลายทางเปิดให้เช่ารายคืน ไม่ใช่รายเดือน"));
        throw new Abort(notFound());
      }
      await tx.dormLease.create({
        data: {
          id: newId,
          tenantId: g.tenantId,
          unitId: g.unitId,
          roomId: toRoom.id,
          partyId: lease.partyId,
          coTenants: (lease.coTenants ?? { occupants: [], vehicles: [] }) as Prisma.InputJsonValue,
          status: "ACTIVE",
          termType: "FIXED",
          startDate: dbDate(eff),
          endDate: oldEnd ? dbDate(oldEnd) : null,
          rentSatang: rent,
          commonFeeSatang: lease.commonFeeSatang,
          depositSatang: heldNow,
          advanceRentSatang: 0,
          bookingFeeSatang: 0,
          occupancyId: c.occupancyId,
          signedAt: lease.signedAt,
          templateKey: lease.templateKey,
          templateVersion: lease.templateVersion,
          moveInPhotos: [],
          previousLeaseId: lease.id,
          createdById: g.actorUserId,
          policySnapshot: policySnapshot as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      const upd = await tx.dormLease.updateMany({
        where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId, status: "ACTIVE" },
        data: { status: "ENDED", endReason: "TRANSFER", endDate: dbDate(addDaysYmd(eff, -1)), endedAt: deps?.now instanceof Date ? deps.now : new Date() },
      });
      if (upd.count !== 1) throw new Abort(fail("NOT_EDITABLE", "สัญญานี้เปลี่ยนไปแล้ว — โหลดหน้าใหม่"));
      const readAt = deps?.now instanceof Date ? deps.now : new Date();
      for (const r of readingsIn) {
        const m = meters.find((x) => x.id === r.meterId);
        if (!m) continue;
        const kind = m.roomId === lease.roomId ? "MOVE_OUT" : "MOVE_IN";
        const forLease = kind === "MOVE_OUT" ? lease.id : newId;
        const had = await tx.dormMeterReading.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, meterId: m.id, leaseId: forLease, kind }, select: { id: true } });
        if (had) await tx.dormMeterReading.updateMany({ where: { id: had.id, tenantId: g.tenantId }, data: { value: r.value, readAt, readById: g.actorUserId } });
        else
          await tx.dormMeterReading.create({
            data: { tenantId: g.tenantId, unitId: g.unitId, meterId: m.id, leaseId: forLease, periodKey: effMonth, kind, value: r.value, readAt, readById: g.actorUserId, source: "MANUAL" },
          });
      }
      await endedEvent(tx, g.tenantId, g.unitId, lease.id, lease.roomId, "TRANSFER");
      await tx.auditLog.create({
        data: {
          tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.lease.transferred", targetType: "DormLease", targetId: newId,
          after: { mode: "NEW_LEASE", previousLeaseId: lease.id, fromRoomId: lease.roomId, toRoomId: toRoom.id, effectiveDate: eff, rentSatang: rent, carriedDepositSatang: heldNow, depositLeaseId: root, ...(missingOld.length ? { meterMissingReason: meterReason } : {}) },
        },
      });
      return { dup: false, id: newId };
    });
    if (isFail(out)) return out;
    // ล้มหลัง commit ⇒ งานตามเวลา dorm.moveout เติมให้ (transferUtilityBackfill · idempotent ต่อ ref)
    await transferUtilityInvoice(g.tenantId, g.unitId, g.actorUserId, lease.id, deps?.now instanceof Date ? deps.now : new Date()).catch((e) => logD12("transfer.utility", g.tenantId, e));
    return { ok: true, duplicate: out.dup, mode: "NEW_LEASE", leaseId: out.id, previousLeaseId: lease.id, carriedDepositSatang: await carried() };
  } catch (e) {
    await logD12("transfer", tenantForLog, e);
    return unavailable();
  }
}
const roomTaken = () => fail("ROOM_TAKEN", "ห้องปลายทางมีผู้เช่าหรือถูกจองในช่วงวันที่เลือกแล้ว — เลือกห้องหรือวันอื่น");

/**
 * ค่าน้ำไฟห้องเดิมถึงวันย้าย (§4.2) — ใบแจ้งหนี้ ref DormTransfer/<oldLeaseId> (นอก tx · idempotent ต่อ ref) · สูตร §2.3 ข้อ 7 (ตัวเดียวกับใบย้ายออก)
 *   นับเป็นหนี้ของสายสัญญา (ใบย้ายออกหักด้วยประกันตอนจบสาย)
 *   SVC D.12 (Y13) ▸ จบแล้ว (ออกใบ หรือไม่มีบรรทัด) ⇒ AuditLog dorm.lease.transfer_utility (เครื่องหมายว่างานเติมไม่ต้องทำซ้ำ) ◂
 */
export const TRANSFER_UTILITY_DONE = "dorm.lease.transfer_utility";
export async function transferUtilityInvoice(tenantId: string, unitId: string, actorUserId: string | null, oldLeaseId: string, now: Date): Promise<boolean> {
  const db = tenantDb({ tenantId, unitId });
  if (await db.auditLog.findFirst({ where: { action: TRANSFER_UTILITY_DONE, targetType: "DormLease", targetId: oldLeaseId }, select: { id: true } })) return false;
  const old = await db.dormLease.findFirst({ where: { id: oldLeaseId, status: "ENDED", endReason: "TRANSFER" }, select: { id: true, roomId: true, partyId: true, endDate: true } });
  if (!old || !old.endDate) return false;
  const effMonth = addDaysYmd(ymdOfDb(old.endDate), 1).slice(0, 7);
  const mo = await import("./moveout");
  const lines = await mo.utilityLinesForLease(tenantId, unitId, oldLeaseId, old.roomId, effMonth);
  let docId: string | null = null;
  if (lines && lines.lines.length) {
    const party = await tenantDb({ tenantId }).party.findFirst({ where: { id: old.partyId }, select: { name: true } });
    const r = await createExternalInvoice({
      tenantId,
      sourceKind: "DORM",
      unitId,
      refType: "DormTransfer",
      refId: oldLeaseId,
      customer: { name: party?.name ?? "ผู้เช่า" },
      partyId: old.partyId,
      lines: lines.lines,
      vat: lines.vat,
      issueDate: bkkYmd(now),
      dueDate: bkkYmd(now),
      createdById: actorUserId,
    });
    if (!r.ok) throw new Error(`transfer utility invoice: ${r.code}`);
    docId = r.docId;
  }
  // เครื่องหมายเสร็จครั้งเดียว (ล็อกต่อสัญญาเดิม · ตรวจซ้ำใต้ล็อก — เรียกพร้อมกันหลายทางไม่จดซ้ำ)
  const marked = await d12Tx(async (tx) => {
    await advisoryLock(tx, `dorm.transfer_utility:${oldLeaseId}`);
    if (await tx.auditLog.findFirst({ where: { tenantId, action: TRANSFER_UTILITY_DONE, targetType: "DormLease", targetId: oldLeaseId }, select: { id: true } })) return false;
    await tx.auditLog.create({
      data: { tenantId, unitId, actorType: actorUserId ? "USER" : "SYSTEM", actorId: actorUserId, action: TRANSFER_UTILITY_DONE, targetType: "DormLease", targetId: oldLeaseId, after: { docId, effMonth } },
    });
    return true;
  });
  return marked === true;
}

// ═════════════════════════ 4.3 ต่อสัญญา ═════════════════════════
export async function renewLease(
  ctx: LeaseChangeCtx,
  input: { unitId: string; leaseId: string; months: number; rentSatang?: number },
  deps?: { now?: Date },
): Promise<{ ok: true; duplicate: boolean; leaseId: string; startDate: string; endDate: string; rentSatang: number; legal: { code: string | null } } | ChangeFail> {
  const tenantForLog = isRec(ctx) ? ctx.tenantId : null;
  try {
    if (!isRec(input)) return notFound();
    const g = await d12Gate(ctx, input.unitId, "lease");
    if (!g) return notFound();
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const lease = isStr(input.leaseId) ? await db.dormLease.findFirst({ where: { id: input.leaseId }, select: LEASE_SEL }) : null;
    if (!lease || !roomVisible(g, lease.roomId)) return notFound();
    const kidOf = async () =>
      db.dormLease.findFirst({ where: { previousLeaseId: lease.id, roomId: lease.roomId, status: { not: "CANCELLED" } }, select: { id: true, startDate: true, endDate: true, rentSatang: true } });
    const asResult = (k: { id: string; startDate: Date; endDate: Date | null; rentSatang: number }, dup: boolean, code: string | null) => ({
      ok: true as const,
      duplicate: dup,
      leaseId: k.id,
      startDate: ymdOfDb(k.startDate),
      endDate: ymdOfDb(k.endDate),
      rentSatang: k.rentSatang,
      legal: { code },
    });
    const existing = await kidOf();
    if (existing) return asResult(existing, true, null);
    if (lease.status !== "ACTIVE") return fail("NOT_EDITABLE", "ต่อสัญญาได้เฉพาะสัญญาที่ยังมีผลและยังไม่แจ้งย้ายออก");
    if (await db.dormMoveOut.findFirst({ where: { leaseId: lease.id, status: { not: "CANCELLED" } }, select: { id: true } }))
      return fail("NOT_EDITABLE", "สัญญานี้แจ้งย้ายออกแล้ว — ยกเลิกการแจ้งย้ายออกก่อนต่อสัญญา");
    if (!isInt(input.months) || input.months < 1 || input.months > 360) return fail("INVALID_INPUT", "ระยะต่อสัญญาต้องเป็นจำนวนเดือนเต็ม 1–360 เดือน");
    if (input.rentSatang !== undefined && input.rentSatang !== null && !(isInt(input.rentSatang) && input.rentSatang > 0 && input.rentSatang <= MAX_SATANG))
      return fail("INVALID_INPUT", "ค่าห้องต้องเป็นจำนวนเต็มสตางค์มากกว่า 0");
    const oldEnd = ymdOfDb(lease.endDate);
    if (!oldEnd) return fail("NOT_EDITABLE", "สัญญานี้ไม่มีวันจบ — ไม่ต้องต่อสัญญา");
    const startDate = addDaysYmd(oldEnd, 1);
    const endDate = leaseEndYmd(startDate, input.months);
    const room = await db.hotelRoom.findFirst({ where: { id: lease.roomId }, select: { id: true, roomTypeId: true, roomType: { select: { monthlyRateSatang: true } } } });
    if (!room) return notFound();
    // snapshot ใหม่ = ค่าตั้งปัจจุบัน (สัญญาเดิมไม่แตะ) · ค่าห้อง = ที่ระบุ ?? ค่าห้องปัจจุบันของห้อง
    const snap = await snapshotPolicy({ tenantId: g.tenantId }, "lease", { unitId: g.unitId, roomTypeId: room.roomTypeId, roomId: room.id });
    const rent = isInt(input.rentSatang) ? input.rentSatang : rentOfRoom(snap.values, room.roomType?.monthlyRateSatang ?? null, lease.rentSatang);
    const live = await resolveSettings({ tenantId: g.tenantId }, ["rooms.legal.mode", "rooms.legal.outOfScopeReason"], { unitId: g.unitId, roomTypeId: room.roomTypeId, roomId: room.id });
    const mode = normalizeLegalMode(live["rooms.legal.mode"]?.value);
    const lctx = { mode, outOfScopeReason: typeof live["rooms.legal.outOfScopeReason"]?.value === "string" ? (live["rooms.legal.outOfScopeReason"]?.value as string) : null };
    const rl = evaluateLegal("RENT_LOCKED_IN_LEASE", { context: "RENEWAL", oldSatang: lease.rentSatang, newSatang: rent }, lctx);
    if (rl.level === "BLOCK") return fail("LEGAL_BLOCK", rl.messageTh, { code: rl.code, messageTh: rl.messageTh, citation: rl.citation });
    // ตัวกั้นประกัน + ล่วงหน้า กับยอดถือของสาย (แบบ D.5 · ค่าห้องใหม่)
    const root = await depositLeaseIdOf(null, { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id });
    const held = await securityDepositHeld({ tenantId: g.tenantId, unitId: g.unitId, leaseId: root });
    const kind = legalLeaseKind(input.months);
    let legalCode: string | null = rl.level === "WARN" ? rl.code : null;
    if (kind) {
      const dep = evaluateLegal("DEPOSIT_ADVANCE_LIMIT", { leaseKind: kind, monthlyRentSatang: rent, depositSatang: held, advanceRentSatang: 0 }, lctx);
      if (dep.level === "BLOCK") return fail("LEGAL_BLOCK", dep.messageTh, { code: dep.code, messageTh: dep.messageTh, citation: dep.citation });
      if (dep.level === "WARN") legalCode = dep.code;
    }
    const oldSnap = isRec(lease.policySnapshot) ? lease.policySnapshot : null;
    const policySnapshot = {
      ...snap,
      legal: { mode, level: legalCode ? "WARN" : "OK", code: legalCode, reason: null, approvalId: null },
      renewal: { fromLeaseId: lease.id, startDate, months: input.months, previousContract: oldSnap && isRec(oldSnap.contract) ? { tenantName: oldSnap.contract.tenantName ?? null } : null },
    };
    const newId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.slice(0, 25);
    const out = await d12Tx(async (tx) => {
      await advisoryLock(tx, leaseLockKey(root));
      if (root !== lease.id) await advisoryLock(tx, leaseLockKey(lease.id));
      const k = await tx.dormLease.findFirst({
        where: { tenantId: g.tenantId, unitId: g.unitId, previousLeaseId: lease.id, roomId: lease.roomId, status: { not: "CANCELLED" } },
        select: { id: true, startDate: true, endDate: true, rentSatang: true },
      });
      if (k) return { dup: true as const, k };
      const cur = await tx.dormLease.findFirst({ where: { id: lease.id, tenantId: g.tenantId, unitId: g.unitId }, select: { status: true, endDate: true } });
      if (!cur || cur.status !== "ACTIVE" || ymdOfDb(cur.endDate) !== oldEnd) throw new Abort(fail("NOT_EDITABLE", "ต่อสัญญาได้เฉพาะสัญญาที่ยังมีผลและยังไม่แจ้งย้ายออก"));
      if (await tx.dormMoveOut.findFirst({ where: { tenantId: g.tenantId, unitId: g.unitId, leaseId: lease.id, status: { not: "CANCELLED" } }, select: { id: true } }))
        throw new Abort(fail("NOT_EDITABLE", "สัญญานี้แจ้งย้ายออกแล้ว — ยกเลิกการแจ้งย้ายออกก่อนต่อสัญญา"));
      const c = await claimRoom(tx, {
        tenantId: g.tenantId,
        unitId: g.unitId,
        roomId: lease.roomId,
        start: startDate,
        end: exclusiveEnd(endDate),
        kind: "LEASE",
        refType: "DormLease",
        refId: newId,
        requireRentMode: "MONTHLY",
      });
      if (!c.ok) {
        if (c.code === "ROOM_TAKEN") throw new Abort(fail("ROOM_TAKEN", "ห้องนี้ถูกจองในช่วงหลังวันจบสัญญาแล้ว — ต่อสัญญาช่วงนี้ไม่ได้"));
        if (c.code === "ROOM_INACTIVE") throw new Abort(fail("ROOM_UNAVAILABLE", "ห้องนี้ปิดซ่อมหรือปิดใช้งานอยู่"));
        throw new Abort(fail("INVALID_INPUT", "ช่วงวันที่ของสัญญาต่อไม่ถูกต้อง"));
      }
      const row = await tx.dormLease.create({
        data: {
          id: newId,
          tenantId: g.tenantId,
          unitId: g.unitId,
          roomId: lease.roomId,
          partyId: lease.partyId,
          coTenants: (lease.coTenants ?? { occupants: [], vehicles: [] }) as Prisma.InputJsonValue,
          status: "ACTIVE",
          termType: "FIXED",
          startDate: dbDate(startDate),
          endDate: dbDate(endDate),
          rentSatang: rent,
          commonFeeSatang: lease.commonFeeSatang,
          depositSatang: held,
          advanceRentSatang: 0,
          bookingFeeSatang: 0,
          occupancyId: c.occupancyId,
          signedAt: lease.signedAt,
          templateKey: snap.template.key,
          templateVersion: snap.template.version,
          moveInPhotos: [],
          previousLeaseId: lease.id,
          createdById: g.actorUserId,
          policySnapshot: policySnapshot as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, startDate: true, endDate: true, rentSatang: true },
      });
      await emitOutbox(tx, { tenantId: g.tenantId, unitId: g.unitId, type: EVENT_RENEWED, idempotencyKey: `${EVENT_RENEWED}:${newId}`, payload: { unitId: g.unitId, leaseId: newId, previousLeaseId: lease.id, roomId: lease.roomId } });
      await tx.auditLog.create({
        data: {
          tenantId: g.tenantId, unitId: g.unitId, actorType: "USER", actorId: g.actorUserId, action: "dorm.lease.renewed", targetType: "DormLease", targetId: newId,
          after: { previousLeaseId: lease.id, startDate, endDate, months: input.months, rentSatang: rent, oldRentSatang: lease.rentSatang, legalCode, at: (deps?.now instanceof Date ? deps.now : new Date()).toISOString() },
        },
      });
      return { dup: false as const, k: row };
    });
    if (isFail(out)) return out;
    return asResult(out.k, out.dup, out.dup ? null : legalCode);
  } catch (e) {
    await logD12("renew", tenantForLog, e);
    return unavailable();
  }
}

// ═════════════════════════ SVC D.12 (Y2) ▸ โมเดลจอเริ่ม (แจ้งย้ายออก · ต่อสัญญา · ย้ายห้อง จากหน้าสัญญา) ═════════════════════════
export type LeaseChangeModel = {
  leaseId: string;
  roomNumber: string;
  tenantName: string;
  status: string;
  startDate: string;
  endDate: string | null;
  rentSatang: number;
  noticeDays: number;
  today: string;
  suggestMoveOutDate: string;
  suggestTransferDate: string;
  moveOutId: string | null;
  rooms: { id: string; number: string }[];
  oldMeters: { meterId: string; kind: "ELEC" | "WATER" }[];
  /** SVC D.12 (Y25) ▸ มิเตอร์ห้องของห้องปลายทางแต่ละห้อง (ช่องเลข MOVE_IN) ◂ */
  roomMeters: Record<string, { meterId: string; kind: "ELEC" | "WATER" }[]>;
  can: { notice: boolean; lease: boolean };
};
/** อ่านอย่างเดียว · ด่านเดียวกับฟังก์ชันเขียน (ไม่ผ่าน ⇒ null) · ไม่มีเบอร์/เลขบัตร */
export async function leaseChangeModel(ctx: LeaseChangeCtx, input: { unitId: string; leaseId: string }, deps?: { now?: Date }): Promise<LeaseChangeModel | null> {
  try {
    if (!isRec(input)) return null;
    const gm = await d12Gate(ctx, input.unitId, "manage");
    const gl = await d12Gate(ctx, input.unitId, "lease");
    const g = gm ?? gl;
    if (!g) return null;
    const db = tenantDb({ tenantId: g.tenantId, unitId: g.unitId });
    const lease = isStr(input.leaseId)
      ? await db.dormLease.findFirst({ where: { id: input.leaseId }, select: { id: true, roomId: true, partyId: true, status: true, startDate: true, endDate: true, rentSatang: true, policySnapshot: true } })
      : null;
    if (!lease || !roomVisible(g, lease.roomId)) return null;
    const now = deps?.now instanceof Date ? deps.now : new Date();
    const today = bkkYmd(now);
    const room = await db.hotelRoom.findFirst({ where: { id: lease.roomId }, select: { number: true } });
    const party = await tenantDb({ tenantId: g.tenantId }).party.findFirst({ where: { id: lease.partyId }, select: { name: true } });
    const snap = isRec(lease.policySnapshot) && isRec(lease.policySnapshot.values) ? lease.policySnapshot.values : {};
    const nd = snap["rooms.moveout.noticeDays"];
    const noticeDays = isInt(nd) && nd >= 0 ? nd : 30;
    const mo = await db.dormMoveOut.findFirst({ where: { leaseId: lease.id, status: { not: "CANCELLED" } }, select: { id: true } });
    const rooms = (await db.hotelRoom.findMany({ select: { id: true, number: true }, orderBy: { number: "asc" }, take: 500 })).filter((r) => r.id !== lease.roomId && roomVisible(g, r.id));
    const allMeters = await db.dormMeter.findMany({ where: { role: "ROOM", removedAt: null }, select: { id: true, kind: true, roomId: true }, orderBy: [{ kind: "asc" }, { id: "asc" }], take: 2000 });
    const meters = allMeters.filter((m) => m.roomId === lease.roomId);
    const roomMeters: LeaseChangeModel["roomMeters"] = {};
    for (const m of allMeters) if (m.roomId && m.roomId !== lease.roomId && roomVisible(g, m.roomId)) (roomMeters[m.roomId] ??= []).push({ meterId: m.id, kind: m.kind === "WATER" ? "WATER" : "ELEC" });
    const end = ymdOfDb(lease.endDate) || null;
    const want = addDaysYmd(today, noticeDays);
    const suggestMoveOutDate = end && want > end ? end : want;
    return {
      leaseId: lease.id,
      roomNumber: room?.number ?? "",
      tenantName: party?.name ?? "",
      status: lease.status,
      startDate: ymdOfDb(lease.startDate),
      endDate: end,
      rentSatang: lease.rentSatang,
      noticeDays,
      today,
      suggestMoveOutDate,
      suggestTransferDate: `${addMonthsKey(today.slice(0, 7), 1)}-01`,
      moveOutId: mo?.id ?? null,
      rooms,
      oldMeters: meters.map((m) => ({ meterId: m.id, kind: m.kind === "WATER" ? "WATER" : "ELEC" })),
      roomMeters,
      can: { notice: !!gm, lease: !!gl },
    };
  } catch (e) {
    await logD12("lease-model", isRec(ctx) ? ctx.tenantId : null, e);
    return null;
  }
}
