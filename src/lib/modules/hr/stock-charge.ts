// HR H4.6 ▸ เบิกของ/ค่าเสียหายของพนักงาน → รายการหักเงินเดือนที่ "รออนุมัติ" (server เท่านั้น · brief ledger/hr-briefs/hr-brief-H4.6.md)
//
// กติกา:
//   • ระบบไม่หักเงินเองเด็ดขาด — สร้าง HrPayAdjustment DEDUCTION · PENDING · sourceType INVENTORY_ISSUE · sourceRef "hrstock:<requestKey>"
//     แล้วรอการอนุมัติด้วย decideAdjustment เดิมของ H1.3 (ไม่มีทางอนุมัติอัตโนมัติ ไม่มีอนุมัติทีละหลายรายการสำหรับแถวนี้)
//   • ต้องมีหนังสือยินยอมของพนักงาน (ติ๊กยืนยัน + เลขที่/ที่เก็บเอกสาร + วันที่ลงนาม) — เก็บบนแถว HrStockCharge ให้ผู้อนุมัติเห็น
//   • ด่าน: ยื่น = hr.payadjust.request (สาขาของพนักงาน) + ขอบเขตสาขา · ตัดสต็อก = inventory.movement.consume เพิ่ม · ห้ามแถวของตัวเอง (OWNER ด้วย)
//     ไม่พบ/ข้ามร้าน/นอกขอบเขต/ไม่มีคีย์ = ข้อความเดียวกันทุกไบต์ (noAccess) · พนักงานที่สิ้นสุดการจ้าง/ปิดใช้งาน = ปฏิเสธ (ทวงคืนผ่านรายการออกจากงาน)
//   • ความเป็นอะตอมกับคลัง (consumeBatch อยู่คนละ tx — facade เปิดทางเขียนทางเดียว): ตัดสต็อกก่อนด้วยคีย์กันซ้ำ "hr-stock:<ระบบ HR>:<requestKey>"
//     (คลังคืน movement เดิมเมื่อเรียกซ้ำ) → แล้ว tx เดียวของ HR ใต้ล็อก hr:stock:<ระบบ>:<requestKey> สร้างรายการหัก + แถวนี้ + outbox ·
//     ล้มระหว่างสองขั้น = ลองใหม่ด้วยคีย์เดิมแล้วจบฝั่ง HR (movement เดิม · ไม่ตัดซ้ำ) · ที่ไม่มีใครลองใหม่ = หนี้ D1 (ตัวกวาด)
//   • คลังไม่เห็นข้อมูลเงิน: movement = sourceModule "HR" · refType "HrStockCharge" · refId = requestKey · ไม่มีพนักงาน/ยอด
//   • ถอน/คืนเงิน (มติผู้คุม Q8 ทาง 2 — ไม่มีแถวเงินได้ ไม่แตะไฟล์แช่แข็ง): รออนุมัติ = ไม่อนุมัติ (REJECTED) · อนุมัติแล้วยังไม่เข้ารอบ =
//     ยกเลิกในที่ (APPROVED→REJECTED ใต้ล็อกงวด) · เข้ารอบร่าง = ทางลบเดิมของรอบร่าง (คำนวณรอบร่างใหม่) · เข้ารอบอนุมัติ/จ่ายแล้ว =
//     ไม่แตะเงินเดือน บันทึก "ค้างคืน" (refundOwedSatang) ให้คืนนอกเงินเดือน แล้วกด "คืนแล้ว" (เจ้าของ/ผู้อนุมัติเงินเดือน) · ไม่คืนของเข้าคลัง (Q9)
//   • เงิน = สตางค์จำนวนเต็ม ไม่ปัดที่ใด · ประวัติ (audit) = id ล้วน ไม่มียอด/เลขหนังสือยินยอม · outbox payload = { chargeId, employeeId }
//   • opts.now ใช้ได้เฉพาะข้อสอบ — action/หน้าไม่ส่ง ◂
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { writeAudit } from "@/lib/core/audit";
import { canReadInventory, canViewPayroll, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { thaiDateKey } from "@/lib/ui/date";
import { consumeBatch, getItem, listItems, searchItems } from "@/lib/modules/inventory";
import { cancelStockChargeAdjustmentInTx, cancelStockChargeDraftAdjustment, stockChargeTargetPeriod, writeStockChargeAdjustmentInTx } from "./payroll"; // ทางเขียนเดียวของ HrPayAdjustment อยู่ที่ payroll.ts
import { employeeOfUser } from "./service";
import { hrScopeOf, unitWhere, isAllBranches, payScopeWhere } from "./scope"; // HR PRIV-2 ▸ + ขอบเขตค่าจ้าง ◂

type Ctx = { tenantId: string; systemId: string };
type Tx = Prisma.TransactionClient;
/** ผู้ดู = HrViewer ของ hr/privacy (role · unitAccess · permissions · userId) */
export type StockViewer = { role: MembershipCtx["role"]; unitAccess: unknown; permissions: unknown; userId?: string | null };
export type StockChargeKind = "ISSUE" | "DAMAGE";
/** แหล่งที่มาของรายการหัก (payroll.ts เขียนลงแถว HrPayAdjustment ตามนี้ทั้งก้อน) */
export type StockAdjustmentSource = { sourceType: "INVENTORY_ISSUE"; sourceRef: string };
export type StockChargeInput = {
  requestKey?: unknown;
  employeeId?: unknown;
  kind?: unknown;
  inventorySystemId?: unknown;
  itemId?: unknown;
  qty?: unknown;
  takeStock?: unknown;
  amountSatang?: unknown;
  description?: unknown;
  consent?: { confirmed?: unknown; ref?: unknown; at?: unknown } | null;
};
export type StockChargeStatus = "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "WITHDRAWN" | "CANCELLING" | "CANCELLED" | "REFUND_OWED" | "REPAID" | "REMOVED";

// ═══════════════════════════ ข้อความคงที่ (ห้ามต่อชื่อ/ยอด/id) ═══════════════════════════
export const STOCK_TEXT = {
  noAccess: "คุณไม่มีสิทธิ์ดูหรือจัดการรายการหักเงินของพนักงานคนนี้",
  self: "ขอหักเงินของตัวเองไม่ได้ — ให้ผู้ดูแลคนอื่นทำแทน",
  ended: "พนักงานคนนี้สิ้นสุดการจ้างแล้ว — ขอหักเงินผ่านระบบนี้ไม่ได้",
  kind: "เลือกชนิด: เบิกของ หรือ ค่าเสียหาย",
  item: "ไม่พบสินค้านี้ในคลัง (หรือเป็นบริการ)",
  qty: "จำนวนต้องเป็นจำนวนเต็ม 1–999",
  amount: "ยอดหักต้องเป็นจำนวนเต็มสตางค์ ตั้งแต่ 0.01 ถึง 50,000 บาท",
  noCost: "สินค้านี้ยังไม่มีต้นทุน — ระบุยอดหักเอง",
  desc: "กรุณาใส่รายละเอียด (ไม่เกิน 120 ตัวอักษร)",
  consent: "ต้องมีหนังสือยินยอมของพนักงาน — ระบุเลขที่หรือที่เก็บเอกสาร และวันที่ลงนาม (ไม่เกินวันนี้)",
  key: "คำขอไม่สมบูรณ์ — กรุณาเปิดหน้านี้ใหม่แล้วลองอีกครั้ง",
  replayDiff: "คำขอนี้ถูกส่งไปแล้วด้วยข้อมูลอื่น — กรุณาเปิดหน้านี้ใหม่",
  invAccess: "คุณไม่มีสิทธิ์เบิกหรือตัดสต็อกในคลังนี้",
  noPeriod: "หางวดเงินเดือนที่ยังไม่มีรอบจ่ายไม่พบ — ตรวจรอบจ่ายเงินเดือน",
  withdrawn: "รายการนี้ถอนไปแล้ว",
  withdrawPerm: "ถอนรายการนี้ได้เฉพาะผู้ยื่นขณะยังรออนุมัติ หรือผู้อนุมัติรายการเงินเดือน",
  notify: "มีรายการหักค่าของหรือค่าเสียหายรอการอนุมัติ",
  // มติผู้คุม Q8 ทาง 2 (คืนเงินนอกเงินเดือน)
  reason: "เหตุผลยาวเกินไป (ไม่เกิน 120 ตัวอักษร)",
  repayPerm: "บันทึกการคืนเงินได้เฉพาะเจ้าของร้านหรือผู้อนุมัติรายการเงินเดือน",
  repayRef: "ระบุเลขที่หรือหลักฐานการคืนเงิน (1–80 ตัวอักษร)",
  notOwed: "รายการนี้ไม่มียอดค้างคืน",
  changed: "รายการนี้เปลี่ยนไปแล้ว — กรุณาเปิดหน้านี้ใหม่แล้วลองอีกครั้ง",
  failed: "บันทึกไม่สำเร็จ — กรุณาลองอีกครั้ง",
  stock: "สต็อกไม่พอ — ตัดสต็อกได้ไม่เกินยอดคงเหลือ (หรือยื่นแบบไม่ตัดสต็อก)",
  draftRefused: "รอบร่างเปลี่ยนระหว่างถอนรายการ — รายการกลับเป็นสถานะเดิม กรุณาลองอีกครั้ง",
  retryOther: "คำขอนี้ยื่นโดยผู้ใช้อื่น — ให้ผู้ยื่นเดิมหรือเจ้าของร้านดำเนินการต่อ",
} as const;
const T = STOCK_TEXT;
/** ข้อความที่หน้าจอแสดงได้ (ผลของ action → รหัสสั้นใน URL → ข้อความจากรายการนี้เท่านั้น) */
export const STOCK_MSG: Record<string, string> = {
  ...Object.fromEntries(Object.entries(STOCK_TEXT).map(([k, v]) => [`s.${k}`, v])),
  "ok.request": "ยื่นรายการหักแล้ว — รอผู้อนุมัติรายการเงินเดือน",
  "ok.withdraw": "ถอนรายการแล้ว",
  "ok.refund": "บันทึกยอดค้างคืนพนักงานแล้ว — คืนนอกเงินเดือน แล้วกด “คืนแล้ว”",
  "ok.repaid": "บันทึกการคืนเงินแล้ว",
};
const MSG_CODE = new Map(Object.entries(STOCK_MSG).map(([k, v]) => [v, k]));
/** ข้อความผลลัพธ์ → รหัสสั้น (ไม่รู้จัก = s.failed) */
export const stockMsgCode = (text: string): string => MSG_CODE.get(text) ?? "s.failed";

type Fail = { ok: false; reason: string; code?: string };
const refuse = (reason: string, code?: string): Fail => (code ? { ok: false, reason, code } : { ok: false, reason });
class StockRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockRefusal";
  }
}
const TX_OPTS = { maxWait: 20_000, timeout: 45_000 } as const;
export const STOCK_MAX_SATANG = 5_000_000; // 50,000 บาทต่อรายการ (Q4)
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EV = "hr.stock_charge.requested";

// ═══════════════════════════ ตัวช่วย ═══════════════════════════
const nowOf = (o?: { now?: Date }): Date => (o?.now instanceof Date && Number.isFinite(o.now.getTime()) ? new Date(o.now.getTime()) : new Date());
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const chars = (s: string): number => [...s].length; // นับแบบ char_length ของ PostgreSQL
const dbDate = (day: string): Date => new Date(`${day}T00:00:00Z`);
const dayOf = (d: Date | null | undefined): string | null => (d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null);
const validDay = (s: string): boolean => DAY_RE.test(s) && dayOf(dbDate(s)) === s;
const permsOf = (v: StockViewer): Record<string, unknown> => (v.permissions && typeof v.permissions === "object" ? (v.permissions as Record<string, unknown>) : {});
const membershipOf = (v: StockViewer): MembershipCtx => ({ role: v.role, unitAccess: (Array.isArray(v.unitAccess) ? v.unitAccess : []) as string[], permissions: permsOf(v) });
const uidOf = (v: StockViewer | null | undefined): string => (v && typeof v.userId === "string" ? v.userId.trim() : "");
const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const unitQ = (unitId: string | null) => (unitId ? { unitId } : {});
const monthOf = (now: Date): string => thaiDateKey(now).slice(0, 7);
/** ผู้อนุมัติรายการเงินเดือน = OWNER หรือ (hr.payadjust.approve ในสาขาของพนักงาน ∧ ผู้ดูเงินเดือน) */
function isPayApprover(m: MembershipCtx, unitId: string | null): boolean {
  return m.role === "OWNER" || (evaluate(m, { module: "hr", action: "hr.payadjust.approve", ...unitQ(unitId) }) && canViewPayroll(m));
}
/** ผู้ดูรายการหักค่าของ (ยอด · หนังสือยินยอม) = ผู้ดูเงินเดือน */
export function canSeeStockCharges(v: StockViewer | null | undefined): boolean {
  return !!v && canViewPayroll(membershipOf(v));
}
/** ยื่นรายการหักค่าของได้ไหม (คีย์ระดับร้าน — สาขาตรวจจากแถวพนักงานจริงอีกครั้งใน service) */
export function canRequestStockCharge(v: StockViewer | null | undefined): boolean {
  return !!v && evaluate(membershipOf(v), { module: "hr", action: "hr.payadjust.request" });
}
/** ตัดสต็อกได้ไหม */
export function canTakeStock(v: StockViewer | null | undefined): boolean {
  return !!v && evaluate(membershipOf(v), { module: "inventory", action: "inventory.movement.consume" });
}

type EmpRow = { id: string; name: string; unitId: string | null; active: boolean; employmentStatus: string | null; linkedUserId: string | null };
const EMP_SELECT = { id: true, name: true, unitId: true, active: true, employmentStatus: true, linkedUserId: true } as const;
/** พนักงานในขอบเขตสาขาของผู้ดู (ไม่พบ/นอกขอบเขต/ข้ามร้าน = null) */
async function employeeInScope(ctx: Ctx, v: StockViewer, employeeId: string, at: Date): Promise<EmpRow | null> {
  if (!employeeId) return null;
  const scope = hrScopeOf({ role: v.role, unitAccess: v.unitAccess });
  const e = await tenantDb(ctx).hrEmployee.findFirst({ where: { AND: [{ id: employeeId, tenantId: ctx.tenantId, systemId: ctx.systemId }, unitWhere(scope, at)] }, select: EMP_SELECT });
  return e ? { ...e, employmentStatus: e.employmentStatus ? String(e.employmentStatus) : null } : null;
}

// ═══════════════════════════ ยื่น (R4–R6) ═══════════════════════════
export type RequestStockChargeResult =
  | { ok: true; chargeId: string; adjustmentId: string; movementId: string | null; periodKey: string; amountSatang: number; replayed: boolean }
  | Fail;
type ChargeRow = {
  id: string;
  employeeId: string;
  kind: string;
  adjustmentId: string;
  inventorySystemId: string | null;
  itemId: string | null;
  description: string | null;
  qty: number | null;
  unitCostSatang: number | null;
  amountSatang: number;
  movementId: string | null;
  consentRef: string;
  consentAt: Date;
  takeStock: boolean;
};
type Norm = {
  key: string;
  employeeId: string;
  kind: StockChargeKind;
  invSysId: string | null;
  itemId: string | null;
  itemName: string | null;
  description: string | null;
  qty: number | null;
  unitCostSatang: number | null;
  override: number | null;
  amountSatang: number;
  take: boolean;
  consentRef: string;
  consentAt: string;
};
/** คำขอเดิมด้วยคีย์เดิม = ข้อมูลเดียวกันไหม (ยอดคิดจากต้นทุนเทียบเฉพาะเมื่อระบุยอดเอง — ต้นทุนเปลี่ยนภายหลังไม่ทำให้ลองใหม่ล้ม) */
function sameRequest(c: ChargeRow, n: Norm): boolean {
  const amountOk = n.override !== null ? c.amountSatang === n.override : c.qty !== null && c.unitCostSatang !== null && c.amountSatang === c.qty * c.unitCostSatang;
  return (
    c.employeeId === n.employeeId &&
    c.kind === n.kind &&
    (c.itemId ?? null) === n.itemId &&
    (c.inventorySystemId ?? null) === (n.itemId ? n.invSysId : null) &&
    (c.qty ?? null) === n.qty &&
    (c.description ?? null) === n.description &&
    c.takeStock === n.take &&
    c.consentRef === n.consentRef &&
    dayOf(c.consentAt) === n.consentAt &&
    amountOk
  );
}
const CHARGE_SELECT = {
  id: true, employeeId: true, kind: true, adjustmentId: true, inventorySystemId: true, itemId: true, description: true, qty: true,
  unitCostSatang: true, amountSatang: true, movementId: true, consentRef: true, consentAt: true, takeStock: true,
} as const;

/**
 * ยื่นรายการหักค่าของ/ค่าเสียหาย — ตรวจทุกอย่างก่อนเขียน (คีย์ · ชนิด · ด่านพนักงาน · สถานะการจ้าง · สินค้า/รายละเอียด · จำนวน · ยอด · หนังสือยินยอม · สิทธิ์ตัดสต็อก)
 * → ตัดสต็อก (ถ้ามี) → tx เดียวของ HR · คีย์เดิม + ข้อมูลเดิม = คืนผลเดิม (replayed) · คีย์เดิม + ข้อมูลอื่น = replayDiff
 */
export async function requestStockCharge(ctx: Ctx, viewer: StockViewer, input: StockChargeInput, opts: { now?: Date } = {}): Promise<RequestStockChargeResult> {
  const now = nowOf(opts);
  const inp = (input && typeof input === "object" ? input : {}) as StockChargeInput;
  const key = str(inp.requestKey);
  if (!KEY_RE.test(key)) return refuse(T.key);
  if (inp.kind !== "ISSUE" && inp.kind !== "DAMAGE") return refuse(T.kind);
  const kind = inp.kind as StockChargeKind;
  const uid = uidOf(viewer);
  if (!viewer || !uid) return refuse(T.noAccess);
  const m = membershipOf(viewer);
  // ด่านพนักงาน: ขอบเขตสาขา + คีย์ยื่น (สาขาของพนักงาน) — ไม่ผ่าน = ข้อความเดียวกันทุกกรณี
  const emp = await employeeInScope(ctx, viewer, str(inp.employeeId), now);
  if (!emp || !evaluate(m, { module: "hr", action: "hr.payadjust.request", ...unitQ(emp.unitId) })) return refuse(T.noAccess);
  if (emp.linkedUserId && emp.linkedUserId === uid) return refuse(T.self);
  // ค่าที่ส่งมา (ยังไม่อ่านฐาน) — ใช้เทียบ "ข้อมูลเดียวกัน" กับคีย์เดิม
  const invSysId = str(inp.inventorySystemId) || null;
  const itemId = str(inp.itemId) || null;
  const description = str(inp.description);
  const c = inp.consent && typeof inp.consent === "object" ? inp.consent : null;
  const consentRef = str(c?.ref);
  const consentAt = str(c?.at);
  const take = !!itemId && inp.takeStock !== false;
  const raw: Norm = {
    key, employeeId: emp.id, kind, invSysId: itemId ? invSysId : null, itemId, itemName: null, description: description || null,
    qty: itemId && typeof inp.qty === "number" ? inp.qty : null, unitCostSatang: null,
    override: typeof inp.amountSatang === "number" ? inp.amountSatang : null, amountSatang: 0, take, consentRef, consentAt,
  };
  const db = tenantDb(ctx);
  // r4 F1/F2: คีย์ที่เคยมีแถวแล้ว — ตอบผลเดิม/ทำต่อจากแถวจอง ก่อนตรวจใด ๆ ที่ล้มได้เพราะเวลาผ่านไป (สต็อก · ต้นทุน · งวด · สถานะการจ้าง)
  {
    const prior = await db.hrStockCharge.findFirst({ where: { tenantId: ctx.tenantId, requestKey: key }, select: { ...CHARGE_SELECT, systemId: true, claimOpen: true, requestedById: true } });
    if (prior) return continueExisting(ctx, prior, raw, uid, m, now);
  }

  // ── คีย์ใหม่เท่านั้น: ตรวจครบก่อนเขียน ──
  if (!emp.active || emp.employmentStatus === "ENDED") return refuse(T.ended);
  // ระบบคลังต้องเป็น INVENTORY ของร้านนี้ (ข้ามร้าน/ไม่ใช่คลัง = noAccess)
  let invCtx: Ctx | null = null;
  if (invSysId) {
    const sys = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findFirst({ where: { id: invSysId, tenantId: ctx.tenantId, type: "INVENTORY" }, select: { id: true } });
    if (!sys) return refuse(T.noAccess);
    invCtx = { tenantId: ctx.tenantId, systemId: sys.id };
  }
  // สินค้า (สินค้าจริงของคลังนี้ ไม่ใช่บริการ) หรือรายละเอียด
  let item: { id: string; name: string; costSatang: number } | null = null;
  if (itemId) {
    if (!invCtx) return refuse(T.item);
    const it = await getItem(invCtx, itemId);
    if (!it || String(it.kind) !== "PRODUCT") return refuse(T.item);
    item = { id: it.id, name: it.name, costSatang: it.costSatang };
  }
  if (!item ? chars(description) < 1 || chars(description) > 120 : chars(description) > 120) return refuse(T.desc);
  let qty: number | null = null;
  if (item) {
    const q = inp.qty;
    if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > 999) return refuse(T.qty);
    qty = q;
  }
  // ยอด (สตางค์จำนวนเต็ม · ไม่ปัด): ระบุเอง หรือ จำนวน × ต้นทุนต่อหน่วย ณ ตอนนี้
  const ov = inp.amountSatang;
  let override: number | null = null;
  let amount: number;
  if (ov !== undefined && ov !== null) {
    if (typeof ov !== "number" || !Number.isSafeInteger(ov) || ov < 1 || ov > STOCK_MAX_SATANG) return refuse(T.amount);
    override = ov;
    amount = ov;
  } else if (!item || qty === null) {
    return refuse(T.amount);
  } else if (!(item.costSatang > 0)) {
    return refuse(T.noCost);
  } else {
    amount = qty * item.costSatang;
    if (!Number.isSafeInteger(amount) || amount > STOCK_MAX_SATANG) return refuse(T.amount);
  }
  // หนังสือยินยอม (Q5): ติ๊กยืนยัน · เลขที่/ที่เก็บ 1–80 · วันที่ลงนามไม่เกินวันนี้ (เวลาไทย)
  if (!c || c.confirmed !== true || chars(consentRef) < 1 || chars(consentRef) > 80 || !validDay(consentAt) || consentAt > thaiDateKey(now)) return refuse(T.consent);
  if (take && !evaluate(m, { module: "inventory", action: "inventory.movement.consume" })) return refuse(T.invAccess);
  // r2 m7: ตัดได้เฉพาะคลังในขอบเขตสาขาของผู้ยื่น (คลังที่ผูกสาขา) — สต็อกพอไหม ตรวจใต้ล็อกสินค้าตอนตัด (r4 D1)
  if (take && invCtx && !(await inventoryInScope(ctx.tenantId, invCtx.systemId, viewer))) return refuse(T.invAccess);
  // r2 m3: งวดที่รับรายการได้ — ตรวจก่อนตัดสต็อก (ตรวจซ้ำใต้ล็อกตอนเขียน)
  if (!(await stockChargeTargetPeriod(ctx, monthOf(now)))) return refuse(T.noPeriod);

  const n: Norm = {
    key, employeeId: emp.id, kind, invSysId: item ? invSysId : null, itemId: item?.id ?? null, itemName: item?.name ?? null,
    description: description || null, qty, unitCostSatang: item ? item.costSatang : null, override, amountSatang: amount, take, consentRef, consentAt,
  };
  // (1) จองคีย์ (ล็อก hr:stock:<ร้าน>:<คีย์>) — มีคนจองก่อนระหว่างตรวจ = ทำแบบคีย์เดิม · คีย์ unique ทั้งร้าน: ระบบ HR อื่นใช้คีย์นี้แล้ว = P2002 ⇒ replayDiff
  let claim: { id: string } | { prior: Parameters<typeof continueExisting>[1] };
  try {
    claim = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, keyLock(ctx, key));
      const ex = await tx.hrStockCharge.findFirst({ where: { tenantId: ctx.tenantId, requestKey: key }, select: { ...CHARGE_SELECT, systemId: true, claimOpen: true, requestedById: true } });
      if (ex) return { prior: ex };
      return tx.hrStockCharge.create({
        data: {
          tenantId: ctx.tenantId, systemId: ctx.systemId, employeeId: emp.id, kind, requestKey: key, adjustmentId: `claim:${ctx.tenantId}:${key}`,
          inventorySystemId: n.invSysId, itemId: n.itemId, itemName: n.itemName, description: n.description, qty, unitCostSatang: n.unitCostSatang,
          amountSatang: amount, movementId: null, consentRef, consentAt: dbDate(consentAt), consentRecordedById: uid, requestedById: uid, takeStock: take, claimOpen: true,
        },
        select: { id: true },
      });
    }, TX_OPTS);
  } catch (e) {
    if ((e as { code?: unknown })?.code === "P2002") return refuse(T.replayDiff);
    return refuse(T.failed, "CLAIM_FAILED");
  }
  if ("prior" in claim) return continueExisting(ctx, claim.prior, raw, uid, m, now);
  return completeClaim(ctx, claim.id, uid, now, true);
}

const keyLock = (ctx: Ctx, key: string) => `hr:stock:${ctx.tenantId}:${key}`;
const itemLock = (inventorySystemId: string, itemId: string) => `hr:stock-item:${inventorySystemId}:${itemId}`;

/** คีย์ที่มีแถวแล้ว: ข้อมูลอื่น = replayDiff · จบแล้ว = ผลเดิม · แถวจองค้าง = ทำต่อได้เฉพาะผู้ยื่นเดิม หรือเจ้าของร้าน (r4 F3) */
async function continueExisting(
  ctx: Ctx,
  prior: ChargeRow & { systemId: string; claimOpen: boolean; requestedById: string },
  raw: Norm,
  uid: string,
  m: MembershipCtx,
  now: Date,
): Promise<RequestStockChargeResult> {
  if (prior.systemId !== ctx.systemId || !sameRequest(prior, raw)) return refuse(T.replayDiff);
  if (!prior.claimOpen) return replayOf(ctx, prior);
  if (prior.requestedById !== uid && m.role !== "OWNER") return refuse(T.retryOther);
  return completeClaim(ctx, prior.id, uid, now, false);
}

/**
 * ทำแถวจองให้จบ: (2) ตัดสต็อกใต้ล็อกสินค้า hr:stock-item:<คลัง>:<สินค้า> (ตรวจสต็อกพอ ⇒ ตัด ⇒ จด movementId ลงแถวจอง) ·
 *   (3) tx ของ HR ใต้ล็อกคีย์: รายการหัก PENDING (ผู้ยื่น = ผู้ยื่นเดิมเสมอ) + ปิดแถวจอง + outbox
 * ลำดับล็อก: คีย์ (จอง · ปล่อยแล้ว) → สินค้า (ล็อกเดียวที่ถือ ขณะคลังล็อกแถวสินค้าของมันเองในอีก connection) → คีย์ (ขั้นสุดท้าย) —
 *   HR ไม่ถือล็อกคีย์กับล็อกสินค้าพร้อมกัน และคลังไม่เคยรอล็อกของ HR ⇒ ไม่มีวงรอ
 * firstAttempt = คีย์ใหม่ (ตรวจสต็อกพอ · ไม่พอ = ลบแถวจองแล้วตอบสต็อกไม่พอ) · ทำต่อ = ข้ามการตรวจสต็อก (movement ของคีย์นี้อาจมีแล้ว — consumeBatch คืนอันเดิม)
 */
async function completeClaim(ctx: Ctx, claimId: string, actorUid: string, now: Date, firstAttempt: boolean): Promise<RequestStockChargeResult> {
  const db = tenantDb(ctx);
  const sc = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const row = await db.hrStockCharge.findFirst({
    where: { ...sc, id: claimId },
    select: { ...CHARGE_SELECT, requestKey: true, itemName: true, claimOpen: true, requestedById: true },
  });
  if (!row) return refuse(T.failed, "CLAIM_GONE");
  if (!row.claimOpen) return replayOf(ctx, row);
  const key = row.requestKey;
  let movementId = row.movementId;
  if (row.takeStock && !movementId && row.inventorySystemId && row.itemId && row.qty !== null) {
    const invCtx = { tenantId: ctx.tenantId, systemId: row.inventorySystemId };
    const itemId = row.itemId;
    const qty = row.qty;
    let step: { movementId: string } | { refuse: string } | { done: true };
    try {
      step = await db.$transaction(async (t) => {
        const tx = t as unknown as Tx;
        await lock(tx, itemLock(invCtx.systemId, itemId));
        const cur = await tx.hrStockCharge.findFirst({ where: { ...sc, id: claimId }, select: { claimOpen: true, movementId: true } });
        if (!cur || !cur.claimOpen) return { done: true as const };
        if (cur.movementId) return { movementId: cur.movementId };
        if (firstAttempt) {
          const it = await getItem(invCtx, itemId);
          const why = !it || String(it.kind) !== "PRODUCT" ? T.item : Number(it.onHand) < qty ? T.stock : null;
          if (why) {
            await tx.hrStockCharge.deleteMany({ where: { ...sc, id: claimId, claimOpen: true, movementId: null } });
            return { refuse: why };
          }
        }
        const r = await consumeBatch(invCtx, { sourceModule: "HR", refType: "HrStockCharge", refId: key, parts: [{ itemId, qty, idempotencyKey: `hr-stock:${ctx.systemId}:${key}` }] });
        if (r.skipped.length > 0 || !r.movementIds[0]) {
          await tx.hrStockCharge.deleteMany({ where: { ...sc, id: claimId, claimOpen: true, movementId: null } });
          return { refuse: T.item };
        }
        await tx.hrStockCharge.updateMany({ where: { ...sc, id: claimId, claimOpen: true }, data: { movementId: r.movementIds[0] } });
        return { movementId: r.movementIds[0] };
      }, { maxWait: 20_000, timeout: 60_000 });
    } catch {
      return refuse(T.failed, "STOCK_STEP_FAILED");
    }
    if ("refuse" in step) return refuse(step.refuse);
    if ("done" in step) {
      const again = await db.hrStockCharge.findFirst({ where: { ...sc, id: claimId }, select: CHARGE_SELECT });
      return again ? replayOf(ctx, again) : refuse(T.failed, "CLAIM_GONE");
    }
    movementId = step.movementId;
  }
  // (3) tx เดียวของ HR: ล็อกคีย์ → แถวจองยังเปิด? → รายการหัก PENDING (payroll.ts) + ปิดแถวจอง + outbox
  let res: { chargeId: string; adjustmentId: string; periodKey: string; replayed: boolean };
  try {
    res = await db.$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, keyLock(ctx, key));
      const cur = await tx.hrStockCharge.findFirst({ where: { ...sc, id: claimId }, select: { ...CHARGE_SELECT, claimOpen: true, requestedById: true, itemName: true } });
      if (!cur) throw new StockRefusal(T.failed);
      if (!cur.claimOpen) {
        const a = await tx.hrPayAdjustment.findFirst({ where: { ...sc, id: cur.adjustmentId }, select: { periodKey: true } });
        return { chargeId: cur.id, adjustmentId: cur.adjustmentId, periodKey: a?.periodKey ?? "", replayed: true };
      }
      const note = `${cur.kind === "ISSUE" ? "เบิกของ" : "ค่าเสียหาย"}: ${cur.itemName ?? cur.description ?? ""}${cur.qty !== null ? ` ×${cur.qty}` : ""}`;
      const w = await writeStockChargeAdjustmentInTx(tx, ctx, {
        employeeId: cur.employeeId, amountSatang: cur.amountSatang, note, requestedById: cur.requestedById, fromPeriod: monthOf(now),
        source: { sourceType: "INVENTORY_ISSUE", sourceRef: `hrstock:${key}` },
      });
      if (!w.ok) throw new StockRefusal(w.code === "EMPLOYEE" ? T.ended : w.code === "DUPLICATE" ? T.replayDiff : w.code === "NO_PERIOD" ? T.noPeriod : T.amount);
      const done = await tx.hrStockCharge.updateMany({ where: { ...sc, id: claimId, claimOpen: true }, data: { adjustmentId: w.id, movementId: cur.movementId ?? movementId, claimOpen: false } });
      if (done.count !== 1) throw new StockRefusal(T.failed);
      await emitOutbox(tx, { tenantId: ctx.tenantId, type: EV, idempotencyKey: `${EV}#${claimId}`, payload: { chargeId: claimId, employeeId: cur.employeeId }, systemId: ctx.systemId });
      return { chargeId: claimId, adjustmentId: w.id, periodKey: w.periodKey, replayed: false };
    }, TX_OPTS);
  } catch (e) {
    if (e instanceof StockRefusal) return refuse(e.message);
    // r4 F4: ฐานข้อมูลล้มในขั้นของ HR — ตอบรหัส + ข้อความไทยคงที่ (แถวจองค้าง · ยื่นซ้ำด้วยคีย์เดิมแล้วจบ)
    return refuse(T.failed, "HR_STEP_FAILED");
  }
  if (!res.replayed) {
    await writeAudit({
      tenantId: ctx.tenantId, actorId: actorUid, action: "hr.stock_charge.request", targetType: "HrStockCharge", targetId: res.chargeId,
      after: { chargeId: res.chargeId, employeeId: row.employeeId, adjustmentId: res.adjustmentId, movementId: movementId ?? null },
    });
  }
  return { ok: true, chargeId: res.chargeId, adjustmentId: res.adjustmentId, movementId: movementId ?? null, periodKey: res.periodKey, amountSatang: row.amountSatang, replayed: res.replayed };
}

/** คลังนี้อยู่ในขอบเขตสาขาของผู้ยื่นไหม — คลังที่ไม่ผูกสาขา = ของทั้งร้าน (ทุกคนที่มีคีย์ตัดได้) · ผูกสาขา = ผู้ดูแลทุกสาขา หรือสาขาที่ตรงกัน */
async function inventoryInScope(tenantId: string, inventorySystemId: string, v: StockViewer): Promise<boolean> {
  const scope = hrScopeOf({ role: v.role, unitAccess: v.unitAccess });
  if (scope.unitIds === "*") return true;
  const links = await tenantDb({ tenantId }).appSystemUnit.findMany({ where: { tenantId, systemId: inventorySystemId }, select: { unitId: true }, take: 200 });
  return links.length === 0 || links.some((l) => (scope.unitIds as string[]).includes(l.unitId));
}

async function replayOf(ctx: Ctx, c: ChargeRow): Promise<RequestStockChargeResult> {
  const a = await tenantDb(ctx).hrPayAdjustment.findFirst({ where: { id: c.adjustmentId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { periodKey: true } });
  return { ok: true, chargeId: c.id, adjustmentId: c.adjustmentId, movementId: c.movementId, periodKey: a?.periodKey ?? "", amountSatang: c.amountSatang, replayed: true };
}

// ═══════════════════════════ ถอน / คืนเงิน (R7 · มติผู้คุม Q8 ทาง 2) ═══════════════════════════
export type WithdrawOutcome = "REJECTED" | "CANCELLED" | "REFUND_OWED" | "NOOP";
export type WithdrawStockChargeResult = { ok: true; outcome: WithdrawOutcome; refundOwedSatang?: number } | Fail;

type Gate = { charge: { id: string; employeeId: string; adjustmentId: string; requestedById: string }; emp: EmpRow; m: MembershipCtx; uid: string } | Fail;
/** ด่านของแถวที่มีอยู่: แถว + พนักงานในขอบเขต + คีย์ (ยื่น หรือ อนุมัติ) · ไม่ผ่าน = noAccess · แถวของตัวเอง = self */
async function chargeGate(ctx: Ctx, viewer: StockViewer, chargeId: unknown, at: Date): Promise<Gate> {
  const id = str(chargeId);
  const uid = uidOf(viewer);
  if (!id || !viewer || !uid) return refuse(T.noAccess);
  const ch = await tenantDb(ctx).hrStockCharge.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId, claimOpen: false }, select: { id: true, employeeId: true, adjustmentId: true, requestedById: true } });
  if (!ch) return refuse(T.noAccess);
  const emp = await employeeInScope(ctx, viewer, ch.employeeId, at);
  const m = membershipOf(viewer);
  if (!emp) return refuse(T.noAccess);
  const key = evaluate(m, { module: "hr", action: "hr.payadjust.request", ...unitQ(emp.unitId) }) || evaluate(m, { module: "hr", action: "hr.payadjust.approve", ...unitQ(emp.unitId) });
  if (!key) return refuse(T.noAccess);
  if (emp.linkedUserId && emp.linkedUserId === uid) return refuse(T.self);
  return { charge: ch, emp, m, uid };
}

/**
 * ถอนรายการ: ผู้ยื่นขณะยังรออนุมัติ หรือผู้อนุมัติรายการเงินเดือน — tx เดียวใต้ล็อก hr:stock:<ระบบ>:<chargeId>
 *   รออนุมัติ ⇒ REJECTED · อนุมัติแล้วยังไม่เข้ารอบ ⇒ ยกเลิกในที่ (CANCELLED) · รอบร่าง ⇒ ทางลบเดิม (CANCELLED) ·
 *   รอบอนุมัติ/จ่ายแล้ว ⇒ ค้างคืนนอกเงินเดือน (REFUND_OWED · เงินเดือนไม่ถูกแตะ) · ไม่อนุมัติ/ถูกลบไปแล้ว ⇒ NOOP · ถอนซ้ำ = withdrawn
 */
export async function withdrawStockCharge(ctx: Ctx, viewer: StockViewer, chargeId: unknown, opts: { now?: Date; reason?: unknown } = {}): Promise<WithdrawStockChargeResult> {
  const now = nowOf(opts);
  const g = await chargeGate(ctx, viewer, chargeId, now);
  if (!("charge" in g)) return g;
  const reason = str(opts.reason);
  if (chars(reason) > 120) return refuse(T.reason);
  const { charge, emp, m, uid } = g;
  const approver = isPayApprover(m, emp.unitId);
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  type Step = { outcome: WithdrawOutcome | "CANCELLING"; refund?: number };
  let step: Step;
  try {
    step = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, `hr:stock:${ctx.systemId}:${charge.id}`);
      const cur = await tx.hrStockCharge.findFirst({ where: { ...scope, id: charge.id }, select: { withdrawnAt: true, withdrawOutcome: true, amountSatang: true, adjustmentId: true, requestedById: true } });
      if (!cur) throw new StockRefusal(T.noAccess);
      // CANCELLING = ถอนค้างกลางทาง (ล้มหลังขั้นแรก) — ลองใหม่ได้เมื่อค้างเกิน 2 นาที · ถอนซ้อนกันพร้อมกัน = "ถอนไปแล้ว" (ลบรอบร่างครั้งเดียว)
      const resuming = cur.withdrawOutcome === "CANCELLING" && !!cur.withdrawnAt && now.getTime() - cur.withdrawnAt.getTime() > 120_000;
      if (cur.withdrawnAt && !resuming) throw new StockRefusal(T.withdrawn);
      const adj = await tx.hrPayAdjustment.findFirst({ where: { ...scope, id: cur.adjustmentId }, select: { id: true, status: true, runId: true, periodKey: true } });
      const requesterPending = cur.requestedById === uid && adj?.status === "PENDING" && !adj.runId;
      if (!approver && !requesterPending) throw new StockRefusal(T.withdrawPerm);
      const mark = async (outcome: Step["outcome"], extra: Prisma.HrStockChargeUpdateManyMutationInput = {}) => {
        const n = await tx.hrStockCharge.updateMany({
          where: { ...scope, id: charge.id, ...(resuming ? { withdrawOutcome: "CANCELLING" } : { withdrawnAt: null }) },
          data: { withdrawnAt: now, withdrawnById: uid, withdrawOutcome: outcome, refundReason: reason || null, ...extra },
        });
        if (n.count !== 1) throw new StockRefusal(T.withdrawn);
      };
      if (resuming) return { outcome: "CANCELLING" as const };
      // ทางเขียนของ payroll.ts: ยังไม่เข้ารอบ = ไม่อนุมัติ/ยกเลิกในที่ · รอบร่าง = ทางลบเดิมหลัง commit · รอบอนุมัติ/จ่าย = ไม่แตะเงินเดือน
      const r = await cancelStockChargeAdjustmentInTx(tx, ctx, cur.adjustmentId, { userId: uid, onlyPending: !approver }, now);
      switch (r.outcome) {
        case "NONE":
          await mark("NOOP");
          return { outcome: "NOOP" as const };
        case "REJECTED":
        case "CANCELLED":
          await mark(r.outcome);
          return { outcome: r.outcome };
        case "DRAFT_BOUND":
          await mark("CANCELLING");
          return { outcome: "CANCELLING" as const };
        case "RUN_LOCKED":
          // รอบอนุมัติ/จ่าย (หรือกลับรายการ) แล้ว — ค้างคืนนอกเงินเดือน = ยอดที่หักไป
          await mark("REFUND_OWED", { refundOwedSatang: cur.amountSatang, refundRunId: r.runId ?? null });
          return { outcome: "REFUND_OWED" as const, refund: cur.amountSatang };
        default:
          throw new StockRefusal(T.changed);
      }
    }, TX_OPTS);
  } catch (e) {
    if (e instanceof StockRefusal) return refuse(e.message);
    throw e;
  }
  if (step.outcome === "CANCELLING") {
    const fin = await finishDraftCancel(ctx, charge.id, charge.adjustmentId, uid, m.role === "OWNER", now);
    if (!fin.ok) return fin;
    step = fin.step;
  }
  await writeAudit({
    tenantId: ctx.tenantId, actorId: uid, action: "hr.stock_charge.withdraw", targetType: "HrStockCharge", targetId: charge.id,
    after: { chargeId: charge.id, employeeId: charge.employeeId, adjustmentId: charge.adjustmentId, outcome: step.outcome },
  });
  const outcome = step.outcome as WithdrawOutcome;
  return outcome === "REFUND_OWED" ? { ok: true, outcome, refundOwedSatang: step.refund ?? 0 } : { ok: true, outcome };
}

/** รอบร่าง: ลบรายการด้วยทางเดิมของรอบร่าง (payroll.ts → คำนวณรอบร่างใหม่) แล้วปิดสถานะ · รอบเพิ่งอนุมัติระหว่างนั้น = ค้างคืนแทน · ล้ม = คง CANCELLING ให้ลองใหม่ */
async function finishDraftCancel(ctx: Ctx, chargeId: string, adjustmentId: string, uid: string, isOwner: boolean, now: Date): Promise<{ ok: true; step: { outcome: WithdrawOutcome; refund?: number } } | Fail> {
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const del = await cancelStockChargeDraftAdjustment(ctx, adjustmentId, { userId: uid, isOwner });
  return tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    await lock(tx, `hr:stock:${ctx.systemId}:${chargeId}`);
    const cur = await tx.hrStockCharge.findFirst({ where: { ...scope, id: chargeId }, select: { withdrawOutcome: true, amountSatang: true, refundOwedSatang: true } });
    if (!cur) return refuse(T.noAccess);
    if (cur.withdrawOutcome === "CANCELLED") return { ok: true as const, step: { outcome: "CANCELLED" as const } };
    if (cur.withdrawOutcome === "REFUND_OWED") return { ok: true as const, step: { outcome: "REFUND_OWED" as const, refund: cur.refundOwedSatang ?? cur.amountSatang } };
    if (cur.withdrawOutcome !== "CANCELLING") return refuse(T.withdrawn);
    if (del.ok) {
      await tx.hrStockCharge.updateMany({ where: { ...scope, id: chargeId, withdrawOutcome: "CANCELLING" }, data: { withdrawOutcome: "CANCELLED", withdrawnAt: now } });
      return { ok: true as const, step: { outcome: "CANCELLED" as const } };
    }
    if (del.runLocked) {
      await tx.hrStockCharge.updateMany({ where: { ...scope, id: chargeId, withdrawOutcome: "CANCELLING" }, data: { withdrawOutcome: "REFUND_OWED", refundOwedSatang: cur.amountSatang, refundRunId: del.runId ?? null, withdrawnAt: now } });
      return { ok: true as const, step: { outcome: "REFUND_OWED" as const, refund: cur.amountSatang } };
    }
    // r2 m4: ทางลบรอบร่างปฏิเสธด้วยเหตุอื่น (ไม่ใช่สถานะรอบ) — คืนแถวเป็นสถานะก่อนถอน (ไม่ค้าง CANCELLING) + บอกเหตุผลให้ผู้ดูแลตรวจ
    await tx.hrStockCharge.updateMany({ where: { ...scope, id: chargeId, withdrawOutcome: "CANCELLING" }, data: { withdrawOutcome: null, withdrawnAt: null, withdrawnById: null, refundReason: null } });
    return refuse(T.draftRefused);
  }, TX_OPTS);
}

/** บันทึกว่าคืนเงินที่ค้างคืนแล้ว (นอกเงินเดือน) — เจ้าของ/ผู้อนุมัติรายการเงินเดือนเท่านั้น · กดซ้ำ = ผลเดิม (replayed) */
export async function markStockRefundRepaid(
  ctx: Ctx,
  viewer: StockViewer,
  chargeId: unknown,
  input: { ref?: unknown } = {},
  opts: { now?: Date } = {},
): Promise<{ ok: true; repaidAt: string; replayed: boolean } | Fail> {
  const now = nowOf(opts);
  const g = await chargeGate(ctx, viewer, chargeId, now);
  if (!("charge" in g)) return g;
  const { charge, emp, m, uid } = g;
  if (!isPayApprover(m, emp.unitId)) return refuse(T.repayPerm);
  const ref = str(input?.ref);
  if (chars(ref) < 1 || chars(ref) > 80) return refuse(T.repayRef);
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  let out: { repaidAt: Date; replayed: boolean };
  try {
    out = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Tx;
      await lock(tx, `hr:stock:${ctx.systemId}:${charge.id}`);
      const cur = await tx.hrStockCharge.findFirst({ where: { ...scope, id: charge.id }, select: { withdrawOutcome: true, refundOwedSatang: true, repaidAt: true } });
      if (!cur || cur.withdrawOutcome !== "REFUND_OWED" || cur.refundOwedSatang === null) throw new StockRefusal(T.notOwed);
      if (cur.repaidAt) return { repaidAt: cur.repaidAt, replayed: true };
      const n = await tx.hrStockCharge.updateMany({ where: { ...scope, id: charge.id, repaidAt: null }, data: { repaidAt: now, repaidById: uid, repaidRef: ref } });
      if (n.count !== 1) throw new StockRefusal(T.changed);
      return { repaidAt: now, replayed: false };
    }, TX_OPTS);
  } catch (e) {
    if (e instanceof StockRefusal) return refuse(e.message);
    throw e;
  }
  if (!out.replayed) {
    await writeAudit({
      tenantId: ctx.tenantId, actorId: uid, action: "hr.stock_charge.repaid", targetType: "HrStockCharge", targetId: charge.id,
      after: { chargeId: charge.id, employeeId: charge.employeeId },
    });
  }
  return { ok: true, repaidAt: out.repaidAt.toISOString(), replayed: out.replayed };
}

// ═══════════════════════════ อ่าน (R8) ═══════════════════════════
type StatusSrc = { withdrawOutcome: string | null; repaidAt: Date | null };
function statusOf(c: StatusSrc, adj: { status: string; runId: string | null } | undefined, runStatus: string | undefined): StockChargeStatus {
  switch (c.withdrawOutcome) {
    case "REFUND_OWED":
      return c.repaidAt ? "REPAID" : "REFUND_OWED";
    case "CANCELLED":
      return "CANCELLED";
    case "CANCELLING":
      return "CANCELLING";
    case "REJECTED":
      return "WITHDRAWN";
    default:
      break;
  }
  if (!adj) return "REMOVED";
  if (adj.status === "PENDING") return "PENDING";
  if (adj.status === "REJECTED") return "REJECTED";
  return runStatus === "PAID" ? "PAID" : "APPROVED";
}
export type StockRefundInfo = {
  owedSatang: number;
  decidedByName: string | null;
  decidedAt: string | null;
  reason: string | null;
  repaidAt: string | null;
  repaidByName: string | null;
  repaidRef: string | null;
  /** r2 M1: รายการหักตอนนี้อยู่ที่ไหน — ผูกรอบ (งวด · สถานะ) หรือยังไม่ผูก (รอรอบถัดไป) · ถูกลบไปแล้ว = null */
  adjustment: { runPeriodKey: string | null; runStatus: string | null; bound: boolean } | null;
  /** r2 M1: รอบเดิมถูกกลับรายการ แล้วรายการหักกลับเข้ารอบเงินเดือน (ยังไม่ผูก หรือผูกกับรอบที่สร้างหลังบันทึกค้างคืน) */
  returnedAfterReversal: boolean;
};
export type StockChargeItem = {
  id: string;
  kind: StockChargeKind;
  employeeId: string;
  employeeName: string;
  itemName: string | null;
  description: string | null;
  qty: number | null;
  unitCostSatang: number | null;
  amountSatang: number;
  periodKey: string | null;
  status: StockChargeStatus;
  movementId: string | null;
  consentRef: string;
  consentAt: string;
  requestedByName: string | null;
  createdAt: string;
  refund: StockRefundInfo | null;
  /** ยอด > 10 % ของเงินเดือนรายเดือน (ธงเตือนเท่านั้น · ไม่มีเงินเดือนรายเดือน = null) */
  overCap: boolean | null;
};

const LIST_SELECT = {
  id: true, kind: true, employeeId: true, adjustmentId: true, itemName: true, description: true, qty: true, unitCostSatang: true, amountSatang: true,
  movementId: true, consentRef: true, consentAt: true, requestedById: true, createdAt: true, withdrawnAt: true, withdrawnById: true, withdrawOutcome: true,
  refundOwedSatang: true, refundReason: true, refundRunId: true, repaidAt: true, repaidById: true, repaidRef: true,
} as const;

/** รายการหักค่าของ — ผู้ดูเงินเดือนเท่านั้น (อื่น = null) · ขอบเขตสาขาจากแถวพนักงาน · ใหม่สุดก่อน (≤ 200) */
export async function listStockCharges(ctx: Ctx, viewer: StockViewer, filter: { employeeId?: string; periodKey?: string } = {}): Promise<{ items: StockChargeItem[] } | null> {
  if (!canSeeStockCharges(viewer)) return null;
  const scope = hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess });
  const db = tenantDb(ctx);
  const sc = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const empId = str(filter?.employeeId);
  const rows = await db.hrStockCharge.findMany({
    where: { ...sc, claimOpen: false, ...(empId ? { employeeId: empId } : {}), employee: { is: payScopeWhere(scope) } }, // HR PRIV-2 ▸ R6/N2: เงินหักค่าของ = สาขาประจำในขอบเขตเท่านั้น (ยืมตัวไม่นับ · ทุกสาขา = เดิม) ◂
    select: LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  if (rows.length === 0) return { items: [] };
  const adjs = await db.hrPayAdjustment.findMany({ where: { ...sc, id: { in: rows.map((r) => r.adjustmentId) } }, select: { id: true, status: true, runId: true, periodKey: true } });
  const adjById = new Map(adjs.map((a) => [a.id, { ...a, status: String(a.status) }]));
  const runIds = [...new Set(adjs.map((a) => a.runId).filter((x): x is string => !!x))];
  const runs = runIds.length ? await db.hrPayrollRun.findMany({ where: { ...sc, id: { in: runIds } }, select: { id: true, status: true, periodKey: true, createdAt: true } }) : [];
  const runStatus = new Map(runs.map((r) => [r.id, String(r.status)]));
  const runById = new Map(runs.map((r) => [r.id, r]));
  const empIds = [...new Set(rows.map((r) => r.employeeId))];
  const [emps, profiles] = await Promise.all([
    db.hrEmployee.findMany({ where: { ...sc, id: { in: empIds } }, select: { id: true, name: true } }),
    db.hrSalaryProfile.findMany({ where: { ...sc, employeeId: { in: empIds } }, select: { employeeId: true, baseSalarySatang: true, payType: true } }),
  ]);
  const nameOf = new Map(emps.map((e) => [e.id, e.name]));
  const baseOf = new Map(profiles.filter((p) => String(p.payType ?? "MONTHLY") === "MONTHLY" && p.baseSalarySatang > 0).map((p) => [p.employeeId, p.baseSalarySatang]));
  const userIds = [...new Set(rows.flatMap((r) => [r.requestedById, r.withdrawnById, r.repaidById]).filter((x): x is string => !!x))];
  const users = new Map((await tenantDb({ tenantId: ctx.tenantId }).user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const period = str(filter?.periodKey);
  const items: StockChargeItem[] = rows.map((r) => {
    const a = adjById.get(r.adjustmentId);
    const base = baseOf.get(r.employeeId);
    return {
      id: r.id,
      kind: r.kind as StockChargeKind,
      employeeId: r.employeeId,
      employeeName: nameOf.get(r.employeeId) ?? "",
      itemName: r.itemName,
      description: r.description,
      qty: r.qty,
      unitCostSatang: r.unitCostSatang,
      amountSatang: r.amountSatang,
      periodKey: a?.periodKey ?? null,
      status: statusOf(r, a, a?.runId ? runStatus.get(a.runId) : undefined),
      movementId: r.movementId,
      consentRef: r.consentRef,
      consentAt: dayOf(r.consentAt) ?? "",
      requestedByName: users.get(r.requestedById) ?? null,
      createdAt: r.createdAt.toISOString(),
      refund:
        r.refundOwedSatang !== null
          ? {
              owedSatang: r.refundOwedSatang,
              decidedByName: r.withdrawnById ? (users.get(r.withdrawnById) ?? null) : null,
              decidedAt: r.withdrawnAt ? r.withdrawnAt.toISOString() : null,
              reason: r.refundReason,
              repaidAt: r.repaidAt ? r.repaidAt.toISOString() : null,
              repaidByName: r.repaidById ? (users.get(r.repaidById) ?? null) : null,
              repaidRef: r.repaidRef,
              adjustment: a ? { runPeriodKey: a.runId ? (runById.get(a.runId)?.periodKey ?? null) : null, runStatus: a.runId ? (runStatus.get(a.runId) ?? null) : null, bound: !!a.runId } : null,
              returnedAfterReversal: !!a && !!r.refundRunId && a.runId !== r.refundRunId,
            }
          : null,
      overCap: base === undefined ? null : r.amountSatang * 10 > base, // จำนวนเต็มล้วน: amount > base/10 ⇔ amount×10 > base
    };
  });
  return { items: period ? items.filter((i) => i.periodKey === period) : items };
}

/**
 * Q10 ธงรวมต่องวด (เตือนเท่านั้น ไม่บล็อก): รายการหัก/เบิกล่วงหน้าที่ยังมีผล (รอ/อนุมัติ) ของพนักงานในงวดเดียวกัน รวมกัน > 1/5 ของเงินเดือนรายเดือน
 * → id ของรายการหักค่าของในงวดนั้น · ผู้ดูเงินเดือนเท่านั้น (อื่น = null) · จำนวนเต็มล้วน (Σ×5 > ฐาน)
 */
export async function stockPeriodCapFlags(ctx: Ctx, viewer: StockViewer, items: readonly Pick<StockChargeItem, "id" | "employeeId" | "periodKey" | "status">[]): Promise<Set<string> | null> {
  if (!canSeeStockCharges(viewer)) return null;
  const live0 = items.filter((i) => i.periodKey && (i.status === "PENDING" || i.status === "APPROVED" || i.status === "PAID")); // HR PRIV-2 ◂
  if (live0.length === 0) return new Set(); // HR PRIV-2 ◂
  const sc = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const db = tenantDb(ctx);
  // HR PRIV-2 ▸ R6/N2: ผู้ดูที่จำกัดสาขา — ไม่มีธงของพนักงานนอกขอบเขตค่าจ้าง (ธงบอกสัดส่วนต่อเงินเดือน) · ทุกสาขา = เดิม ◂
  const scope = hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess }); // HR PRIV-2 ◂
  const payIds = isAllBranches(scope) ? null : new Set((await db.hrEmployee.findMany({ where: { ...sc, id: { in: [...new Set(live0.map((i) => i.employeeId))] }, ...payScopeWhere(scope) }, select: { id: true } })).map((e) => e.id)); // HR PRIV-2 ◂
  const live = payIds ? live0.filter((i) => payIds.has(i.employeeId)) : live0; // HR PRIV-2 ◂
  if (live.length === 0) return new Set(); // HR PRIV-2 ◂
  const empIds = [...new Set(live.map((i) => i.employeeId))];
  const periods = [...new Set(live.map((i) => i.periodKey as string))];
  const [adjs, profiles] = await Promise.all([
    db.hrPayAdjustment.findMany({ where: { ...sc, employeeId: { in: empIds }, periodKey: { in: periods }, kind: { in: ["DEDUCTION", "ADVANCE"] }, status: { in: ["PENDING", "APPROVED"] } }, select: { employeeId: true, periodKey: true, amountSatang: true }, take: 5_000 }),
    db.hrSalaryProfile.findMany({ where: { ...sc, employeeId: { in: empIds } }, select: { employeeId: true, baseSalarySatang: true, payType: true } }),
  ]);
  const base = new Map(profiles.filter((p) => String(p.payType ?? "MONTHLY") === "MONTHLY" && p.baseSalarySatang > 0).map((p) => [p.employeeId, p.baseSalarySatang]));
  const sum = new Map<string, number>();
  for (const a of adjs) sum.set(`${a.employeeId}|${a.periodKey}`, (sum.get(`${a.employeeId}|${a.periodKey}`) ?? 0) + a.amountSatang);
  return new Set(live.filter((i) => {
    const b = base.get(i.employeeId);
    return b !== undefined && (sum.get(`${i.employeeId}|${i.periodKey}`) ?? 0) * 5 > b;
  }).map((i) => i.id));
}

export type MyStockCharge = { id: string; kind: StockChargeKind; itemName: string | null; description: string | null; qty: number | null; amountSatang: number; periodKey: string | null; status: StockChargeStatus; consentAt: string; createdAt: string };
/** รายการของตัวเอง (พนักงานหาจากบัญชีที่ผูก — ไม่รับ id จาก client) · ไม่ผูก = [] (Q14: หน้าจอมากับ H2.10) */
export async function myStockCharges(who: { tenantId: string; userId: string }): Promise<MyStockCharge[]> {
  const me = await employeeOfUser(who?.tenantId ?? "", who?.userId ?? "");
  if (!me) return [];
  const ctx = { tenantId: who.tenantId, systemId: me.systemId };
  const sc = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const db = tenantDb(ctx);
  const rows = await db.hrStockCharge.findMany({
    where: { ...sc, employeeId: me.employeeId, claimOpen: false },
    select: { id: true, kind: true, adjustmentId: true, itemName: true, description: true, qty: true, amountSatang: true, consentAt: true, createdAt: true, withdrawOutcome: true, repaidAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  if (rows.length === 0) return [];
  const adjs = await db.hrPayAdjustment.findMany({ where: { ...sc, id: { in: rows.map((r) => r.adjustmentId) } }, select: { id: true, status: true, runId: true, periodKey: true } });
  const adjById = new Map(adjs.map((a) => [a.id, { ...a, status: String(a.status) }]));
  const runIds = [...new Set(adjs.map((a) => a.runId).filter((x): x is string => !!x))];
  const runStatus = new Map((runIds.length ? await db.hrPayrollRun.findMany({ where: { ...sc, id: { in: runIds } }, select: { id: true, status: true } }) : []).map((r) => [r.id, String(r.status)]));
  return rows.map((r) => {
    const a = adjById.get(r.adjustmentId);
    return {
      id: r.id,
      kind: r.kind as StockChargeKind,
      itemName: r.itemName,
      description: r.description,
      qty: r.qty,
      amountSatang: r.amountSatang,
      periodKey: a?.periodKey ?? null,
      status: statusOf(r, a, a?.runId ? runStatus.get(a.runId) : undefined),
      consentAt: dayOf(r.consentAt) ?? "",
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// ═══════════════════════════ คำขอของฉัน (ผู้ยื่นที่ไม่ใช่ผู้ดูเงินเดือน) ═══════════════════════════
export type MyFiledStockCharge = { id: string; kind: StockChargeKind; employeeName: string; itemName: string | null; description: string | null; qty: number | null; periodKey: string; createdAt: string };
/** รายการที่ "ฉันยื่น" ซึ่งยังรออนุมัติ (ถอนได้) — ผู้ถือคีย์ยื่นเท่านั้น (อื่น = null) · ขอบเขตสาขา · ไม่มียอดเงิน/ต้นทุน/เงินเดือน */
export async function myFiledStockCharges(ctx: Ctx, viewer: StockViewer): Promise<MyFiledStockCharge[] | null> {
  const uid = uidOf(viewer);
  if (!uid || !canRequestStockCharge(viewer)) return null;
  const scope = hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess });
  const sc = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const db = tenantDb(ctx);
  const rows = await db.hrStockCharge.findMany({
    where: { ...sc, requestedById: uid, withdrawnAt: null, claimOpen: false, employee: { is: unitWhere(scope) } },
    select: { id: true, kind: true, employeeId: true, adjustmentId: true, itemName: true, description: true, qty: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  if (rows.length === 0) return [];
  const pending = new Map(
    (await db.hrPayAdjustment.findMany({ where: { ...sc, id: { in: rows.map((r) => r.adjustmentId) }, status: "PENDING", runId: null }, select: { id: true, periodKey: true } })).map((a) => [a.id, a.periodKey]),
  );
  const names = new Map((await db.hrEmployee.findMany({ where: { ...sc, id: { in: [...new Set(rows.map((r) => r.employeeId))] } }, select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  return rows
    .filter((r) => pending.has(r.adjustmentId))
    .map((r) => ({
      id: r.id, kind: r.kind as StockChargeKind, employeeName: names.get(r.employeeId) ?? "", itemName: r.itemName, description: r.description, qty: r.qty,
      periodKey: pending.get(r.adjustmentId) ?? "", createdAt: r.createdAt.toISOString(),
    }));
}

// ═══════════════════════════ ต้องตรวจ (r2 · หนี้ D1 แบบมองเห็นได้) ═══════════════════════════
export type OpenStockClaim = { id: string; employeeName: string; itemName: string | null; description: string | null; qty: number | null; takeStock: boolean; createdAt: string };
/** แถวจองที่ค้าง > 10 นาที (ตัดสต็อกแล้วหรือยังไม่รู้ แต่ยังไม่มีรายการหัก) — ผู้ดูเงินเดือนเท่านั้น (อื่น = null) · ยื่นซ้ำด้วยคีย์เดิมจะจบให้เอง */
export async function openStockClaims(ctx: Ctx, viewer: StockViewer, opts: { now?: Date } = {}): Promise<OpenStockClaim[] | null> {
  if (!canSeeStockCharges(viewer)) return null;
  const scope = hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess });
  const sc = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const before = new Date(nowOf(opts).getTime() - 10 * 60_000);
  const rows = await tenantDb(ctx).hrStockCharge.findMany({
    where: { ...sc, claimOpen: true, createdAt: { lt: before }, employee: { is: payScopeWhere(scope) } }, // HR PRIV-2 ▸ R11: ผู้ดูเงินเดือนที่จำกัดสาขา = สาขาประจำเท่านั้น (ทุกสาขา = เดิม) ◂
    select: { id: true, employeeId: true, itemName: true, description: true, qty: true, takeStock: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const names = new Map((await tenantDb(ctx).hrEmployee.findMany({ where: { ...sc, id: { in: [...new Set(rows.map((r) => r.employeeId))] } }, select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  return rows.map((r) => ({ id: r.id, employeeName: names.get(r.employeeId) ?? "", itemName: r.itemName, description: r.description, qty: r.qty, takeStock: r.takeStock, createdAt: r.createdAt.toISOString() }));
}

// ═══════════════════════════ ต้องตรวจ: พนักงานที่สิ้นสุดการจ้าง (r4 F5 · ธงเท่านั้น — ตัดสินเงิน = นักบัญชี A14) ═══════════════════════════
export type StockAttentionItem = { id: string; employeeName: string; itemName: string | null; description: string | null; qty: number | null; reason: "STUCK" | "ENDED_PENDING" | "ENDED_UNBOUNDABLE"; at: string };
/**
 * ผู้ดูเงินเดือนเท่านั้น (อื่น = null): แถวจองค้าง > 10 นาที · รายการรออนุมัติของพนักงานที่สิ้นสุดการจ้างแล้ว ·
 * รายการอนุมัติแล้วที่ไม่มีวันเข้ารอบ (วันสิ้นสุดงานก่อนวันแรกของงวดของรายการ — รอบจ่ายไม่รวมคนนี้)
 */
export async function stockAttention(ctx: Ctx, viewer: StockViewer, opts: { now?: Date } = {}): Promise<StockAttentionItem[] | null> {
  const stuck = await openStockClaims(ctx, viewer, opts);
  if (!stuck) return null;
  const scope = hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess });
  const sc = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const db = tenantDb(ctx);
  const rows = await db.hrStockCharge.findMany({
    where: { ...sc, claimOpen: false, withdrawnAt: null, employee: { is: { AND: [payScopeWhere(scope), { OR: [{ active: false }, { employmentStatus: "ENDED" }, { endDate: { not: null } }] }] } } }, // HR PRIV-2 ▸ R11 ◂
    select: { id: true, employeeId: true, adjustmentId: true, itemName: true, description: true, qty: true, createdAt: true },
    take: 200,
  });
  const out: StockAttentionItem[] = stuck.map((x) => ({ id: x.id, employeeName: x.employeeName, itemName: x.itemName, description: x.description, qty: x.qty, reason: "STUCK" as const, at: x.createdAt }));
  if (rows.length === 0) return out;
  const [adjs, emps] = await Promise.all([
    db.hrPayAdjustment.findMany({ where: { ...sc, id: { in: rows.map((r) => r.adjustmentId) } }, select: { id: true, status: true, runId: true, periodKey: true } }),
    db.hrEmployee.findMany({ where: { ...sc, id: { in: [...new Set(rows.map((r) => r.employeeId))] } }, select: { id: true, name: true, active: true, employmentStatus: true, endDate: true } }),
  ]);
  const adjById = new Map(adjs.map((a) => [a.id, a]));
  const empById = new Map(emps.map((e) => [e.id, e]));
  for (const r of rows) {
    const a = adjById.get(r.adjustmentId);
    const e = empById.get(r.employeeId);
    if (!a || !e) continue;
    const ended = !e.active || String(e.employmentStatus ?? "") === "ENDED";
    const end = dayOf(e.endDate);
    let reason: StockAttentionItem["reason"] | null = null;
    if (String(a.status) === "PENDING" && ended) reason = "ENDED_PENDING";
    else if (String(a.status) === "APPROVED" && !a.runId && end !== null && end < `${a.periodKey}-01`) reason = "ENDED_UNBOUNDABLE";
    if (reason) out.push({ id: r.id, employeeName: e.name, itemName: r.itemName, description: r.description, qty: r.qty, reason, at: r.createdAt.toISOString() });
  }
  return out;
}

// ═══════════════════════════ ตัวเลือกของฟอร์ม (ชื่อเท่านั้น — ไม่มีต้นทุน/เงินเดือน) ═══════════════════════════
export type StockFormOptions = {
  employees: { id: string; name: string }[];
  /** ระบบคลังที่ผู้ยื่นอ่านได้ (canReadInventory) และอยู่ในขอบเขตสาขา — อ่านไม่ได้ = [] (ยื่นได้เฉพาะค่าเสียหายแบบไม่ระบุสินค้า) */
  inventories: { id: string; name: string }[];
  /** คลังที่เลือก + สินค้าของคลังนั้นเท่านั้น (ชื่อ · SKU — ไม่มีต้นทุน) */
  selected: { id: string; items: { id: string; name: string; sku: string | null }[] } | null;
};
/** ผู้ยื่นได้เท่านั้น (อื่น = null): พนักงานที่ยังทำงานในขอบเขตสาขา (ชื่อ) · คลัง + สินค้าของคลังที่เลือก (ค้นผ่าน facade ของคลัง) */
export async function stockFormOptions(ctx: Ctx, viewer: StockViewer, pick: { q?: string; inventorySystemId?: string } = {}): Promise<StockFormOptions | null> {
  if (!canRequestStockCharge(viewer)) return null;
  const scope = hrScopeOf({ role: viewer.role, unitAccess: viewer.unitAccess });
  const uid = uidOf(viewer);
  const emps = await tenantDb(ctx).hrEmployee.findMany({
    where: { AND: [{ tenantId: ctx.tenantId, systemId: ctx.systemId, active: true }, unitWhere(scope)] },
    select: { id: true, name: true, employmentStatus: true, linkedUserId: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  const employees = emps.filter((e) => String(e.employmentStatus ?? "") !== "ENDED" && e.linkedUserId !== uid).map((e) => ({ id: e.id, name: e.name }));
  if (!canReadInventory(membershipOf(viewer))) return { employees, inventories: [], selected: null };
  const systems = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findMany({ where: { tenantId: ctx.tenantId, type: "INVENTORY" }, select: { id: true, name: true }, orderBy: { createdAt: "asc" }, take: 20 });
  const inventories: { id: string; name: string }[] = [];
  for (const sys of systems) if (await inventoryInScope(ctx.tenantId, sys.id, viewer)) inventories.push(sys);
  const chosen = inventories.find((x) => x.id === str(pick.inventorySystemId)) ?? inventories[0] ?? null;
  if (!chosen) return { employees, inventories, selected: null };
  const ic = { tenantId: ctx.tenantId, systemId: chosen.id };
  const query = str(pick.q).slice(0, 60);
  const rows = query ? await searchItems(ic, query, 50) : await listItems(ic, 200);
  return { employees, inventories, selected: { id: chosen.id, items: rows.filter((i) => String(i.kind) === "PRODUCT").map((i) => ({ id: i.id, name: i.name, sku: i.sku ?? null })) } };
}

/** r2 m8: หนังสือยินยอมของรายการหักค่าของ ตามรหัสรายการหัก — ให้ผู้อนุมัติเห็นที่แถวที่กดอนุมัติ · ผู้ดูเงินเดือนเท่านั้น (อื่น = แผนที่ว่าง) */
export async function stockConsentByAdjustment(ctx: Ctx, viewer: StockViewer, adjustmentIds: string[]): Promise<Map<string, { ref: string; at: string; employeeEnded: boolean }>> {
  if (!canSeeStockCharges(viewer) || adjustmentIds.length === 0) return new Map();
  const rows = await tenantDb(ctx).hrStockCharge.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, adjustmentId: { in: adjustmentIds.slice(0, 500) } },
    select: { adjustmentId: true, consentRef: true, consentAt: true, employee: { select: { active: true, employmentStatus: true } } },
  });
  // r4 F5: พนักงานสิ้นสุดการจ้างแล้ว = คำเตือนให้ผู้อนุมัติ (ไม่บล็อก — ทวงจากค่าจ้างงวดสุดท้ายหรือตัดหนี้ = นักบัญชี A14)
  return new Map(rows.map((r) => [r.adjustmentId, { ref: r.consentRef, at: dayOf(r.consentAt) ?? "", employeeEnded: !r.employee.active || String(r.employee.employmentStatus ?? "") === "ENDED" }]));
}

// ═══════════════════════════ event (R10) ═══════════════════════════
/** ตัวรับ hr.stock_charge.requested — แจ้งพนักงาน (บัญชีที่ผูก) ในแอปครั้งเดียวต่อรายการ (notifiedAt ใต้ล็อก ⇒ ส่งซ้ำไม่แจ้งซ้ำ) · ไม่มียอด/ชื่อของ */
export async function notifyStockChargeRequested(evt: { tenantId: string; systemId?: string | null; payload?: unknown }): Promise<void> {
  const p = (evt?.payload ?? {}) as { chargeId?: unknown };
  const chargeId = typeof p.chargeId === "string" ? p.chargeId : "";
  const systemId = typeof evt?.systemId === "string" ? evt.systemId : "";
  if (!chargeId || !systemId || !evt.tenantId) return;
  const ctx = { tenantId: evt.tenantId, systemId };
  const sc = { tenantId: ctx.tenantId, systemId };
  await tenantDb(ctx).$transaction(async (t) => {
    const tx = t as unknown as Tx;
    await lock(tx, `hr:stock-notify:${chargeId}`);
    const ch = await tx.hrStockCharge.findFirst({ where: { ...sc, id: chargeId, notifiedAt: null }, select: { id: true, employeeId: true } });
    if (!ch) return;
    const emp = await tx.hrEmployee.findFirst({ where: { ...sc, id: ch.employeeId }, select: { linkedUserId: true } });
    if (emp?.linkedUserId) {
      await tx.appNotification.create({ data: { tenantId: ctx.tenantId, recipientUserId: emp.linkedUserId, title: T.notify, body: "รายการนี้ยังไม่ถูกหักจนกว่าผู้อนุมัติรายการเงินเดือนจะอนุมัติ — สอบถามผู้ดูแลร้านได้" } });
    }
    await tx.hrStockCharge.updateMany({ where: { ...sc, id: ch.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
  }, TX_OPTS);
}
