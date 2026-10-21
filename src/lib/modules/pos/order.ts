// order.ts — ออเดอร์ทุกช่องทาง (จอ 09) ฝั่งเซิร์ฟเวอร์ · POS P2.8 S (R1–R11 · มติผู้คุมงาน 1–16 · CD 1–24 ของข้อสอบ)
// สัญญา = scripts/qc-pos-p2.8.mts · โน้ต ledger/wo-notes/pos-P2.8.md (ตารางชื่อ = ledger/wo-notes/pos-P2.8-oracle.md)
//
// 🔴 ผู้เขียนเดียวของ PosOrder / PosOrderLine / PosOrderEvent (ข้อสอบ ST3) และของคอลัมน์รับออเดอร์ 4 ตัวของ SalesChannel
//    (autoAccept · prepMinutes · pausedUntil · adapterConfig — channel.ts ยังเป็นผู้เขียนคอลัมน์อื่นทั้งหมดของ P2.1 · channel.ts ห้ามแตะใน P2.8 มติ 3)
// 🔴 ประตูรับเดียว: ingestOrder (พนักงานคีย์ MANUAL/CHAT/ช่องทางกำหนดเอง) + ingestInTx (ประตูระบบ — เว็บร้านเรียกในธุรกรรมของตัวเอง)
//    idempotency X1: (ช่องทาง, เลขแพลตฟอร์ม) หรือคีย์ เดิม = ออเดอร์เดิม duplicated:true ไม่เขียนอะไร · บรรทัดต่าง = IDEMPOTENCY_CONFLICT
// 🔴 ทุกการเปลี่ยนสถานะ = UPDATE … WHERE status = จาก AND version = v (ผู้ชนะคนเดียว · ผู้แพ้ = ORDER_STATE_CHANGED + แถวสด)
//    + PosOrderEvent 1 แถว + outbox pos.order.* (คีย์ pos.order.<ชนิด>#<id> · ชนิดละครั้งต่อออเดอร์) ในธุรกรรมเดียว
// 🔴 บิล (มติ 2): ช่องทาง payout PLATFORM = บิลตอนรับ "ในธุรกรรมเดียวกับการรับ" (xmin เดียว · มติ 7) · DIRECT = บิลตอนจ่าย (payOrder)
//    หรือบิล ECOM ของเว็บร้านเอง (ผูกผ่านตัวรับ shop.order.paid) · ไม่สร้างบิลตอนรับเข้า/ตอนส่งมอบ · createSale จุดเดียว = orderCreateSale
//    ตัดสต็อก/ระบายคิวหลัง commit แบบเดียวกับ register.ts (createSale ใน tx ของผู้เรียกไม่ตัดเอง)
// 🔴 ทุกฟังก์ชันผู้ใช้รับ (ctx, actor, input) แล้ว "คืน" {ok:false, code, message ไทย, lineIndex?} ไม่ throw ·
//    id ของร้านอื่น/สาขาอื่น/มั่ว = ORDER_NOT_FOUND (404 ไม่ใช่ 403)
// 🔴 POS ไม่ import shop/chat/restaurant (มติ 1 · 5 · 6) — เว็บร้านเรียกเข้ามาผ่าน facade `orders` · ตัวรับคิวอยู่ที่ composition root
import type { PosOrder, PosOrderLine, Prisma, PrismaClient, SalesChannel } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { scheduleDrain } from "@/lib/outbox-consumers";
import { prisma } from "./db";
import { afterSaleCommitted, createSale, posDayStart, posSystemForSale, PosSaleError, type CreateSaleInput } from "./service";
import { callerTx } from "@/lib/core/caller-tx"; // HF-TX ▸ มุมมองธุรกรรมของผู้เรียก (แทน proxy เฉพาะที่ของ P2.8) ◂
import { ensureUnitChannels, withInactiveQrOrderAllowed } from "./channel"; // POS P2.7 ▸ fix3 G1: + withInactiveQrOrderAllowed ◂
import { channelCommission, channelNet } from "./channel-shared";
import { quoteRegisterCart, registerVisibleProductIds } from "./register"; // POS P2.14 ▸ ORD-1 ◂
import { registerShiftStatus, isShiftDeviceId, resolveApiSaleShift } from "./shift"; // POS P2.14 ▸ fix1 F7: + resolveApiSaleShift ◂
import { voidSaleByActor } from "./bills";
import { effectiveTrackStock, menuSoldOutIds, rowAvailable } from "./catalog";
import { loadRowRecipes } from "./recipe";
import { expandRecipe } from "./recipe-shared";
import { loadPriceBook, priceOf } from "./price";
import type { PriceSource } from "./price-shared";
import { ORDER_ADAPTERS } from "./order-adapters";
import { autoAcceptBlockedInTx, kitchenPausedForUnit, roundForOrderInTx } from "./kds"; // POS P2.6 ▸ รอบครัวในธุรกรรมรับ · พักครัว/คิวค้าง (R4 R13 · CD3) ◂
import { REGISTER_MAX_PAY_METHODS, REGISTER_PAY_TYPES, REGISTER_REFERENCE_MAX, type RegisterActor, type RegisterCtx } from "./register-shared";
import { REGISTER_MANUAL_MANAGER_MESSAGE, REGISTER_MANUAL_METHODS } from "./register-shared"; // POS HF-PP2 ▸ ด่านผู้จัดการชุดเดียวกับหน้าขาย ◂
import { isPaymentIntentId, parsePosIntentSettings, PAYMENT_INTENT_CONSUME_WINDOW_MS } from "./payment-intent-shared"; // POS HF-PP2 ▸ ตัวอ่านค่าตั้งเดียวกับ HF-PP ◂
// POS P2.7 ▸ จ่ายก่อน (QR_ORDER): ใบขอรับเงินของออเดอร์ (ผู้เขียนเดียว payment-intent.ts) · โทเคนหน้าสถานะ 12 ตัว (ตัวสร้างของใบเสร็จออนไลน์) · ops ◂
import { cancelOrderIntentInTx, consumeSaleIntents, createIntentForOrderInTx, expireOrderIntentInTx, lockSaleIntents, type PreparedOrderIntent } from "./payment-intent";
import { newReceiptToken } from "./receipt-token";
import { logOps } from "@/lib/core/ops";
import { randomBytes } from "node:crypto";
import {
  ORDER_PREP_DEFAULT_MIN,
  ORDER_PREP_MAX,
  ORDER_PREP_MIN,
  ORDER_REJECT_REASONS,
  ORDER_STATUSES,
  ORDER_KEY_RE,
  ORDER_HAS_REFUNDS_MESSAGE,
  ORDER_SALE_VOIDED_MESSAGE,
  ORDER_WEB_PAID_MESSAGE,
  acceptRemainingSec,
  canTransition,
  isOrderClosed,
  maskPhone,
  orderCode,
  orderColumnOf,
  orderLateMinutes,
  orderLinesFingerprint,
  parseChannelOrderSettings,
  parseIngestInput,
  ORDER_ACCEPT_WINDOW_SEC,
  type ChannelOrderSettingsResult,
  type ChannelOrderSettingsView,
  type GetOrderResult,
  type IngestInTxResult,
  type IngestInput,
  type IngestOrderResult,
  type ListOrdersResult,
  type OrderActionResult,
  type OrderCard,
  type OrderColumn,
  type OrderDaySummary,
  type OrderDetail,
  type OrderLineOption,
  type OrderLineView,
  type OrderRefusal,
  type OrderRefusalCode,
  type OrderStatus,
  type PayOrderResult,
  type SourceCancelledResult,
} from "./order-shared";

type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;

// ═══════════ คำปฏิเสธ ═══════════
const MSG: Partial<Record<OrderRefusalCode, string>> = {
  NOT_FOUND: "ไม่พบสาขานี้ หรือบัญชีนี้เข้าสาขานี้ไม่ได้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน",
  VALIDATION: "ข้อมูลที่ส่งมาไม่ถูกต้อง — ยังไม่ได้บันทึกอะไร",
  INTERNAL: "ระบบออเดอร์ขัดข้องชั่วคราว — ลองอีกครั้ง ระบบจะไม่สร้างออเดอร์/บิลซ้ำ",
  ORDER_NOT_FOUND: "ไม่พบออเดอร์นี้ในสาขานี้",
  ORDER_STATE_INVALID: "ออเดอร์อยู่ในสถานะที่ทำรายการนี้ไม่ได้",
  ORDER_STATE_CHANGED: "ออเดอร์นี้เพิ่งถูกเปลี่ยนจากอีกเครื่อง — ดูสถานะล่าสุดก่อน",
  ORDER_UNPAID: "ออเดอร์นี้ยังไม่ได้รับเงิน — รับเงินก่อนส่งมอบ",
  CHANNEL_PAUSED: "ช่องทางนี้ปิดรับออเดอร์ชั่วคราว",
  CHANNEL_INVALID: "ช่องทางขายนี้ใช้ไม่ได้ (ไม่พบ ปิดอยู่ เก็บแล้ว หรือเป็นของสาขาอื่น) — ยังไม่ได้บันทึกอะไร",
  CHANNEL_PAY_MISMATCH: "วิธีชำระไม่ตรงกับช่องทาง — ช่องทางที่ร้านเก็บเงินเองใช้ \"แพลตฟอร์ม\" ไม่ได้",
  IDEMPOTENCY_CONFLICT: "มีออเดอร์ของเลขนี้/รหัสรายการนี้อยู่แล้วแต่รายการไม่ตรงกัน — ตรวจออเดอร์เดิมก่อน",
  PAYMENT_MISMATCH: "ยอดชำระไม่ตรงกับยอดออเดอร์",
  SHIFT_REQUIRED: "รับเงินสดต้องทำที่เครื่องที่เปิดกะอยู่ — เปิดกะก่อน",
  SHIFT_CLOSED: "กะของเครื่องนี้ปิดแล้ว — เปิดกะใหม่ก่อน",
  STOCK_INSUFFICIENT: "สินค้าในสต็อกไม่พอ — ออเดอร์ยังเป็นออเดอร์ใหม่",
  SPLIT_INVALID: `แบ่งจ่ายได้ไม่เกิน ${REGISTER_MAX_PAY_METHODS} รายการ`,
  UNIT_SYSTEM_MISMATCH: "สาขานี้ไม่ได้ผูกกับจุดขายนี้",
  PRODUCT_UNAVAILABLE: "สินค้านี้ปิดขายที่สาขานี้อยู่",
  PRODUCT_NOT_FOUND: "มีสินค้าที่ไม่ได้ขายที่สาขานี้",
};
function refuse(code: OrderRefusalCode, message?: string, extra: { lineIndex?: number; order?: OrderCard; requestId?: string } = {}): OrderRefusal {
  return { ok: false, code, message: message ?? MSG[code] ?? "ทำรายการไม่สำเร็จ", ...extra };
}
const isRefusal = (v: unknown): v is OrderRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k) || o[k] === undefined);
const isUniqueViolation = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002";

/** ยกเลิกธุรกรรมพร้อมคำปฏิเสธ (rollback ทั้งก้อน · ไม่มีแถวค้าง) */
class OrderAbort extends Error {
  constructor(readonly refusal: OrderRefusal) {
    super(refusal.code);
  }
}
/** แพ้การแข่งเปลี่ยนสถานะ (UPDATE … WHERE version ได้ 0 แถว) */
class OrderRaced extends Error {
  constructor(readonly orderId: string) {
    super("ORDER_STATE_CHANGED");
  }
}

/** ขอบของทุกฟังก์ชันผู้ใช้ — error ที่ไม่คาดคิด = INTERNAL (คืน ไม่ throw) */
async function guard<T>(name: string, body: () => Promise<T>): Promise<T | OrderRefusal> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof OrderAbort) return e.refusal;
    console.error(`[pos/order] ${name} INTERNAL`, e);
    return refuse("INTERNAL");
  }
}

/** คำปฏิเสธของ createSale → รหัสของออเดอร์ (ไม่ใช่ข้อผิดพลาดของ createSale = โยนต่อ → INTERNAL) */
function saleRefusal(e: unknown): OrderRefusal | null {
  if (e instanceof PosSaleError) {
    if (e.code === "HAS_REFUNDS") return refuse("ORDER_STATE_INVALID", e.message);
    return refuse(e.code as OrderRefusalCode, e.message);
  }
  const m = /^(PAYMENT_MISMATCH|STOCK_INSUFFICIENT)\b/.exec(String((e as Error)?.message ?? ""));
  if (m) return refuse(m[1] as OrderRefusalCode);
  return null;
}

/**
 * ธุรกรรมของออเดอร์ — createSale ในธุรกรรมนี้ถือล็อกแถวสินค้า (BLOCK) + ตัวนับใบเสร็จ · ลองใหม่เมื่อชน unique ที่ไม่ใช่ของออเดอร์
 * (แถวตัวนับใบเสร็จเดือนใหม่ที่สองบิลสร้างพร้อมกัน — createSale ลองใหม่เองเฉพาะตอนเป็นเจ้าของ tx) · คำปฏิเสธ/แพ้แข่ง ไม่ลองใหม่
 */
async function runTx<T>(fn: (tx: Tx) => Promise<T>, opts: { retryUnique?: boolean } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction((tx) => fn(tx), { timeout: 30_000, maxWait: 15_000 });
    } catch (e) {
      if (opts.retryUnique && attempt < 2 && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}

// ═══════════ ขอบเขต + สิทธิ์ ═══════════
type Scope = { tenantId: string; systemId: string; unitId: string; deviceId: string | null; actor: RegisterActor };
type Need = "read" | "create" | "accept" | "reject";
const NEED_ACTIONS: Record<Need, readonly string[]> = {
  read: ["pos.sale.read", "pos.sale.create"],
  create: ["pos.sale.create"],
  accept: ["pos.order.accept"],
  reject: ["pos.order.reject"],
};

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}
const can = (actor: RegisterActor, action: string, unitId: string) => evaluate(actor, { module: "pos", action, unitId });

/**
 * ctx ผิดรูป / ระบบไม่ใช่ POS ที่เปิดใช้ของร้าน / สาขาเก็บถาวร / บิลของสาขานี้ไม่ได้ลง POS นี้ (posSystemForSale — สาขาเว็บร้านที่ไม่ผูก POS
 * ใช้ POS แรกของร้าน · มติ 10) / เข้าสาขาไม่ได้ = NOT_FOUND · actor ผิดรูปหรือไม่มีสิทธิ์ตาม need = PERMISSION_DENIED
 */
async function scopeOf(db: Db, ctx: unknown, actorRaw: unknown, need: Need): Promise<Scope | OrderRefusal> {
  if (!isRecord(ctx) || !isId(ctx.tenantId) || !isId(ctx.systemId) || !isId(ctx.unitId)) return refuse("NOT_FOUND");
  const { tenantId, systemId, unitId } = ctx as RegisterCtx;
  let deviceId: string | null = null;
  if (ctx.deviceId !== undefined && ctx.deviceId !== null) {
    if (!isShiftDeviceId(ctx.deviceId)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    deviceId = ctx.deviceId;
  }
  const actor = actorOf(actorRaw);
  if (!actor) return refuse("PERMISSION_DENIED");
  const [sys, unit] = await Promise.all([
    db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS", active: true }, select: { id: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }),
  ]);
  if (!sys || !unit) return refuse("NOT_FOUND");
  const pos = await posSystemForSale(tenantId, unitId, systemId, db);
  if (!pos.ok) return refuse("NOT_FOUND");
  if (!canAccessUnit(actor, unitId)) return refuse("NOT_FOUND");
  if (!NEED_ACTIONS[need].some((a) => can(actor, a, unitId))) return refuse("PERMISSION_DENIED");
  return { tenantId, systemId, unitId, deviceId, actor };
}

/** ออเดอร์ของร้าน + ระบบ + สาขานี้ตาม id — อื่น = null (ORDER_NOT_FOUND) */
async function orderInScope(db: Db, s: { tenantId: string; systemId: string; unitId: string }, id: unknown): Promise<PosOrder | null> {
  if (!isId(id)) return null;
  return db.posOrder.findFirst({ where: { id, tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId } });
}

/** อินพุต {id, …} คีย์ตายตัว */
function idInput(input: unknown, keys: readonly string[]): Record<string, unknown> | OrderRefusal {
  if (!isRecord(input) || !onlyKeys(input, ["id", ...keys])) return refuse("VALIDATION");
  return input;
}

// ═══════════ ช่องทาง ═══════════
/** MANUAL = พนักงานคีย์จากแท็บเล็ตแพลตฟอร์ม (รับบนแท็บเล็ตแล้ว) ⇒ สถานะเริ่มปริยาย ACCEPTED · รับอัตโนมัติไม่ใช้กับ MANUAL (มติ CD2 · CD11) */
const isManual = (adapter: string) => adapter === "MANUAL";
/** พักรับ (pausedUntil > ตอนนี้) ปฏิเสธเฉพาะช่องทางที่ลูกค้า/ระบบส่งเข้ามาเอง — WEB · CHAT · API (R3: MANUAL ได้ · ช่องทางกำหนดเองที่พนักงานคีย์ได้) */
const pauseRefuses = (adapter: string) => adapter === "WEB" || adapter === "CHAT" || adapter === "API";
const isPaused = (ch: { pausedUntil: Date | null }, now: Date) => !!ch.pausedUntil && ch.pausedUntil.getTime() > now.getTime();
// POS P2.6 ▸ R13: ข้อความของเหตุผลที่สอง (ครัวหยุดรับทั้งสาขา) ◂
const KITCHEN_PAUSED_MESSAGE = "ครัวหยุดรับออเดอร์ชั่วคราว — ออนไลน์และ QR ถูกพักไว้";

async function channelOfUnit(db: Db, s: { tenantId: string; systemId: string; unitId: string }, by: { channelId: string | null; channelCode: string | null }): Promise<SalesChannel | null> {
  if (by.channelId) return db.salesChannel.findFirst({ where: { id: by.channelId, tenantId: s.tenantId, unitId: s.unitId, archivedAt: null } });
  const rows = await ensureUnitChannels(db, s);
  const hit = rows.filter((r) => r.code === by.channelCode && r.archivedAt === null);
  return hit.find((r) => r.kind === "BUILTIN") ?? hit[0] ?? null;
}

function channelSettingsView(c: SalesChannel): ChannelOrderSettingsView {
  const cfg = isRecord(c.adapterConfig) && typeof c.adapterConfig.version === "number" ? (c.adapterConfig as { version: number; note?: string }) : null;
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    adapter: c.adapter,
    payout: c.payout,
    autoAccept: c.autoAccept,
    prepMinutes: c.prepMinutes,
    pausedUntil: c.pausedUntil ? c.pausedUntil.toISOString() : null,
    adapterConfig: cfg ? { version: cfg.version, ...(typeof cfg.note === "string" ? { note: cfg.note } : {}) } : null,
  };
}

// ═══════════ บรรทัด ═══════════
type ResolvedLine = {
  productId: string | null;
  name: string;
  qty: number;
  unitPriceSatang: number;
  listPriceSatang: number | null;
  priceSource: PriceSource | null;
  priceRuleId: string | null;
  options: OrderLineOption[];
  note: string | null;
};
const lineTotal = (l: { unitPriceSatang: number; qty: number }) => l.unitPriceSatang * l.qty;

function optionsOf(v: unknown): OrderLineOption[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (o): o is OrderLineOption =>
      isRecord(o) && typeof o.choiceId === "string" && typeof o.groupId === "string" && typeof o.groupName === "string" && typeof o.choiceName === "string" && Number.isInteger(o.priceDeltaSatang),
  );
}

/** ลายนิ้วมือของคำขอ (ประตูพนักงาน: สินค้า|จำนวน|ตัวเลือก · ประตูระบบ: + ราคาต้นทาง) */
function requestFingerprint(lines: IngestInput["lines"], source: boolean): string {
  return orderLinesFingerprint(
    lines.map((l) =>
      l.kind === "catalog"
        ? { productId: l.productId, name: null, qty: l.qty, unitPriceSatang: source ? 0 : null, choiceIds: l.choiceIds }
        : l.kind === "priced"
          ? { productId: l.productId, name: null, qty: l.qty, unitPriceSatang: source ? l.unitPriceSatang : null, choiceIds: [] }
          : { productId: null, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, choiceIds: [] },
    ),
  );
}
function storedFingerprint(lines: PosOrderLine[], source: boolean, catalogPriced: Set<string>): string {
  return orderLinesFingerprint(
    lines.map((l) =>
      l.productId
        ? { productId: l.productId, name: null, qty: l.qty, unitPriceSatang: source ? (catalogPriced.has(l.id) ? 0 : l.unitPriceSatang) : null, choiceIds: optionsOf(l.options).map((o) => o.choiceId) }
        : { productId: null, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, choiceIds: [] },
    ),
  );
}

// ═══════════ ตัวช่วยเขียน (ผู้เขียนเดียว) ═══════════
const OUTBOX_OF: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "pos.order.accepted",
  READY: "pos.order.ready",
  HANDED: "pos.order.completed",
  REJECTED: "pos.order.rejected",
  CANCELLED: "pos.order.cancelled",
};
const EVENT_TYPE_OF: Record<OrderStatus, string> = {
  NEW: "received",
  ACCEPTED: "accepted",
  PREPARING: "preparing",
  READY: "ready",
  HANDED: "completed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

/** outbox ของออเดอร์ — payload ⊇ {orderId, channelId, channelCode, status} · ไม่มีชื่อ/เบอร์ลูกค้า (PII) · คีย์ pos.order.<ชนิด>#<id> */
async function emitOrderEvent(tx: Tx, o: PosOrder, type: string, status: OrderStatus): Promise<void> {
  await emitOutbox(tx, {
    tenantId: o.tenantId,
    type,
    idempotencyKey: `${type}#${o.id}`,
    systemId: o.systemId,
    unitId: o.unitId,
    payload: {
      orderId: o.id,
      channelId: o.channelId,
      channelCode: o.channelCode,
      status,
      unitId: o.unitId,
      adapter: o.adapter,
      externalRef: o.externalRef,
      shopOrderId: o.shopOrderId,
      saleId: o.saleId,
      paymentState: o.paymentState, // POS P2.7 ▸ R5: payload + paymentState (PENDING_PAYMENT ตอนรับเข้าของออเดอร์จ่ายก่อน) ◂
    },
  });
}

async function addEvent(tx: Tx, o: { id: string; tenantId: string; systemId: string }, e: { type: string; from: OrderStatus | null; to: OrderStatus; actorUserId: string | null; payload?: unknown; at?: Date }): Promise<void> {
  await tx.posOrderEvent.create({
    data: {
      tenantId: o.tenantId,
      systemId: o.systemId,
      orderId: o.id,
      type: e.type,
      fromStatus: e.from,
      toStatus: e.to,
      actorUserId: e.actorUserId,
      ...(e.payload !== undefined ? { payload: e.payload as Prisma.InputJsonValue } : {}),
      at: e.at ?? new Date(),
    },
  });
}

/**
 * เปลี่ยนสถานะ (R2): UPDATE … WHERE id AND status = จาก AND version = v → 0 แถว = OrderRaced (ผู้เรียกคืน ORDER_STATE_CHANGED) ·
 * + PosOrderEvent + outbox ของสถานะปลาย (PREPARING ไม่มี outbox) — ในธุรกรรมของผู้เรียก
 */
async function transition(
  tx: Tx,
  o: PosOrder,
  to: OrderStatus,
  patch: Prisma.PosOrderUpdateManyMutationInput,
  ev: { actorUserId: string | null; payload?: unknown; at?: Date },
): Promise<PosOrder> {
  if (!canTransition(o.status, to)) throw new OrderAbort(refuse("ORDER_STATE_INVALID"));
  const n = await tx.posOrder.updateMany({
    where: { id: o.id, tenantId: o.tenantId, status: o.status, version: o.version },
    data: { ...patch, status: to, version: { increment: 1 } },
  });
  if (n.count !== 1) throw new OrderRaced(o.id);
  await addEvent(tx, o, { type: EVENT_TYPE_OF[to], from: o.status, to, actorUserId: ev.actorUserId, payload: ev.payload, at: ev.at });
  const after = await tx.posOrder.findUniqueOrThrow({ where: { id: o.id } });
  const ob = OUTBOX_OF[to];
  if (ob) await emitOrderEvent(tx, after, ob, to);
  return after;
}

/** แก้ฟิลด์ที่ไม่ใช่สถานะ (เวลาเตรียม · ผูกบิล · สถานะชำระ) — มีเวอร์ชัน + บันทึก 1 แถว (from = to = สถานะเดิม) · ไม่มี outbox */
async function touch(tx: Tx, o: PosOrder, patch: Prisma.PosOrderUpdateManyMutationInput, ev: { type: string; actorUserId: string | null; payload?: unknown }): Promise<PosOrder> {
  const n = await tx.posOrder.updateMany({ where: { id: o.id, tenantId: o.tenantId, status: o.status, version: o.version }, data: { ...patch, version: { increment: 1 } } });
  if (n.count !== 1) throw new OrderRaced(o.id);
  await addEvent(tx, o, { type: ev.type, from: o.status, to: o.status, actorUserId: ev.actorUserId, payload: ev.payload });
  return tx.posOrder.findUniqueOrThrow({ where: { id: o.id } });
}

// ═══════════ POS P2.6 ▸ ครัวขับสถานะออเดอร์ออนไลน์ (R11 · CD7 · มติ 13) ═══════════
/**
 * เรียกจาก pos/kds.ts ในธุรกรรมเดียวกับการเลื่อนตั๋วของรอบที่ผูกออเดอร์: ล็อกออเดอร์ FOR UPDATE · ตั๋วแรกออกจาก NEW ⇒ ACCEPTED → PREPARING ·
 * ทุกรายการ READY/SERVED ⇒ PREPARING → READY (ACCEPTED ผ่าน PREPARING ก่อน — ไม่มีทางลัด) · ผู้กระทำ = ระบบ (actor null · payload source KDS) ·
 * PosOrderEvent 1 แถวต่อการเปลี่ยน · outbox pos.order.ready ครั้งเดียว (คีย์ต่อออเดอร์) · ดึงกลับไม่ถอยสถานะ · ออเดอร์ปิดแล้ว/สถานะอื่น = ไม่ทำอะไร ◂
 */
export async function kitchenProgressInTx(tx: Tx, i: { tenantId: string; posOrderId: string; started: boolean; allReady: boolean }): Promise<{ changed: boolean; status: OrderStatus | null }> {
  await tx.$queryRaw`SELECT id FROM "PosOrder" WHERE id = ${i.posOrderId} AND "tenantId" = ${i.tenantId} FOR UPDATE`;
  let o = await tx.posOrder.findFirst({ where: { id: i.posOrderId, tenantId: i.tenantId } });
  if (!o) return { changed: false, status: null };
  let changed = false;
  if (o.status === "ACCEPTED" && (i.started || i.allReady)) {
    o = await transition(tx, o, "PREPARING", {}, { actorUserId: null, payload: { source: "KDS" } });
    changed = true;
  }
  if (o.status === "PREPARING" && i.allReady) {
    o = await transition(tx, o, "READY", { readyAt: new Date() }, { actorUserId: null, payload: { source: "KDS" } });
    changed = true;
  }
  return { changed, status: o.status as OrderStatus };
}
// ◂ POS P2.6

// ═══════════ บิล (R6 · มติ 2 10 · CD7) ═══════════
/**
 * บรรทัดบิลจากสำเนาของออเดอร์ (ราคาไม่คิดใหม่ · CD3) + ของปัจจุบันของแคตตาล็อก: itemId = สินค้าที่นับสต็อกจริง (C2 · effectiveTrackStock) ·
 * serviceId = บริการ · components = expandRecipe ของสูตร "ปัจจุบัน" + ตัวเลือกที่เลือก (P2.3 · มติ 24) · ตัวเลือกสำเนาลงบิล
 */
async function saleLinesOf(tx: Tx, s: { tenantId: string; systemId: string; unitId: string }, lines: PosOrderLine[]): Promise<CreateSaleInput["lines"]> {
  const ids = [...new Set(lines.map((l) => l.productId).filter((x): x is string => !!x))];
  const rows = ids.length ? await tx.posProduct.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, id: { in: ids } } }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const invIds = [...new Set(rows.map((r) => r.invItemId).filter((x): x is string => !!x))];
  const items = invIds.length ? await tx.invItem.findMany({ where: { tenantId: s.tenantId, id: { in: invIds } }, select: { id: true, onHand: true } }) : [];
  const itemById = new Map(items.map((i) => [i.id, i]));
  // AUTO ที่ onHand 0 ต้องรู้ว่าเคยเคลื่อนไหวไหม (กติกาเดียวกับหน้าขาย)
  const needMove = rows.filter((r) => r.trackStock === null && r.kind === "PRODUCT" && !!r.invItemId && itemById.get(r.invItemId)?.onHand === 0).map((r) => r.invItemId as string);
  const moved = needMove.length
    ? new Set((await tx.invMovement.findMany({ where: { tenantId: s.tenantId, itemId: { in: needMove } }, select: { itemId: true }, distinct: ["itemId"] })).map((m) => m.itemId))
    : new Set<string>();
  const recipes = await loadRowRecipes(tx, s.tenantId, rows);
  return lines.map((l) => {
    const options = optionsOf(l.options);
    const base = {
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      ...(l.note ? { note: l.note } : {}),
      ...(l.priceSource ? { priceSource: l.priceSource } : {}),
      ...(l.priceRuleId ? { priceRuleId: l.priceRuleId } : {}),
      ...(l.listPriceSatang !== null ? { listPriceSatang: l.listPriceSatang } : {}),
    };
    const row = l.productId ? byId.get(l.productId) : undefined;
    if (!row) return { ...base, ...(l.productId ? { productId: l.productId } : {}) };
    const inv = row.invItemId ? itemById.get(row.invItemId) : undefined;
    const ts = effectiveTrackStock(row, inv ? { hasMovement: moved.has(inv.id), onHand: inv.onHand } : null);
    const itemId = row.kind === "PRODUCT" && row.invItemId && ts.trackStock ? row.invItemId : undefined;
    const serviceId = row.kind === "SERVICE" && row.invItemId ? row.invItemId : undefined;
    const rc = recipes.get(row.id);
    let components: { invItemId: string; qty: number }[] = [];
    if (rc?.live) {
      const x = expandRecipe({ lines: rc.lines, choiceLines: rc.choiceLines, choiceIds: options.map((o) => o.choiceId) });
      if (!x.ok) throw new OrderAbort(refuse("VALIDATION", x.message));
      components = x.components;
    }
    return {
      ...base,
      productId: row.id,
      ...(itemId ? { itemId } : {}),
      ...(serviceId ? { serviceId } : {}),
      ...(options.length ? { options } : {}),
      ...(components.length ? { components } : {}),
    };
  });
}

/** จุดเดียวที่ออเดอร์สร้างบิล (มติ 3 · ทะเบียน qc-pos-p1.6) — ในธุรกรรมของออเดอร์เสมอ (ไม่ซ้อน · callerTx) */
// POS P2.8 ▸ HF-TX: switched — proxy เฉพาะที่ของ P2.8 ถูกลบ ใช้ callerTx กลาง (core/caller-tx) · งานหลัง commit = afterSaleCommit → afterSaleCommitted ◂
function orderCreateSale(tx: Tx, input: CreateSaleInput) {
  return createSale(input, callerTx(tx));
}

/** ฐานของบิลออเดอร์: sourceModule POS · sourceId = ออเดอร์ · คีย์ posorder-<id> · ช่องทาง + เลขอ้างอิง · ไม่มีค่าบริการ/ทิป/ส่วนลด (P2.1 CD8) */
function saleBase(o: PosOrder, lines: CreateSaleInput["lines"], payMethods: CreateSaleInput["payMethods"], who: { soldByUserId: string | null; shiftId: string | null | undefined /* POS P2.13 ▸ undefined = กติกา "ทางอื่น" (REST) ◂ */ }): CreateSaleInput {
  return {
    tenantId: o.tenantId,
    unitId: o.unitId,
    systemId: o.systemId,
    sourceModule: "POS",
    sourceId: o.id,
    idempotencyKey: `posorder-${o.id}`,
    lines,
    payMethods,
    channelId: o.channelId,
    channelRef: o.externalRef ?? o.code,
    shiftId: who.shiftId,
    ...(who.soldByUserId ? { soldByUserId: who.soldByUserId } : {}),
    ...(o.note ? { note: o.note.slice(0, 500) } : {}),
  };
}

/** กะที่เปิดอยู่ของเครื่อง (อ่านอย่างเดียว · กะค้างเกินเวลา = ไม่มี) — ไม่มีเครื่อง = null */
async function deviceShift(db: PrismaClient, s: { tenantId: string; systemId: string; unitId: string }, deviceId: string | null): Promise<{ shiftId: string | null; required: boolean }> {
  const st = await registerShiftStatus(db, s, deviceId ?? undefined);
  return { shiftId: st.shift?.id ?? null, required: st.required };
}

// POS HF-TX ▸ afterSaleCommit ส่งต่อ afterSaleCommitted (ตัวกลาง · เพิ่ม scheduleDrain — ผู้เรียกระบายซ้ำได้ ไม่มีผล) ◂
/** งานหลัง commit ของบิล: afterSaleCommitted (ตัดสต็อกบรรทัดผูกคลัง/ส่วนประกอบ + ระบายคิว) — ชุดเดียวกับ createSale ตอนเป็นเจ้าของ tx */
async function afterSaleCommit(tenantId: string, unitId: string, saleId: string | null, lines: CreateSaleInput["lines"] | null): Promise<void> {
  if (saleId && lines) await afterSaleCommitted({ tenantId, unitId, lines }, saleId);
}

// POS HF-FU ▸ a fix2 (hunter H1): ข้อความของคู่ payout ↔ paymentState ที่ไม่ตรง (รหัสเดิม CHANNEL_PAY_MISMATCH · จอใช้ errors.channelPayMismatch) ◂
const ORDER_PAYOUT_STATE_MISMATCH = "ช่องทางของออเดอร์นี้เปลี่ยนวิธีรับเงินหลังรับเข้า (แพลตฟอร์ม ↔ ร้านเก็บเอง) — รับออเดอร์นี้ไม่ได้ ตรวจกับแพลตฟอร์ม/ลูกค้าแล้วปฏิเสธหรือสร้างใหม่";
/**
 * รับออเดอร์ในธุรกรรมของผู้เรียก (R5 R6): NEW → ACCEPTED (acceptedAt · ผู้รับ · เวลาเตรียม) + ช่องทาง PLATFORM ⇒ บิลในธุรกรรมเดียวกัน
 * (PLATFORM แถวเดียวเต็มยอด · กะ = กะของเครื่องที่รับ ไม่มี = null — ไม่ใช่เงินสด ไม่เคย SHIFT_REQUIRED · มติ 10) · บิลถูกปฏิเสธ = OrderAbort (rollback)
 */
async function acceptInTx(
  tx: Tx,
  o: PosOrder,
  ch: SalesChannel,
  who: { actorUserId: string | null; shiftId: string | null; prepMinutes: number; auto: boolean },
): Promise<{ order: PosOrder; saleId: string | null; saleLines: CreateSaleInput["lines"] | null }> {
  // POS P2.7 ▸ มติ 8: ออเดอร์จ่ายก่อนที่ยังไม่มีเงินเข้า = รับไม่ได้ (ORDER_UNPAID · ไม่เขียนอะไร) · PREPAID = บิลใช้ใบขอรับเงินในธุรกรรมนี้ (ด้านล่าง) ◂
  if (o.paymentState === "PENDING_PAYMENT") throw new OrderAbort(refuse("ORDER_UNPAID", PREORDER_UNPAID_MESSAGE));
  // POS HF-FU ▸ a fix2 (hunter H1): เงินของการรับตัดสินจากคู่ payout ของช่องทาง ↔ paymentState ของออเดอร์ — ไม่ตรง (เจ้าของเปลี่ยน payout หลังรับเข้า) =
  //   ปฏิเสธก่อนแตะอะไร (ไม่มีบิล ไม่มีรอบ · ตัวกวาด = held sale_refused · พนักงาน = CHANNEL_PAY_MISMATCH) ◂
  if ((ch.payout === "PLATFORM") !== (o.paymentState === "PLATFORM_PAID")) throw new OrderAbort(refuse("CHANNEL_PAY_MISMATCH", ORDER_PAYOUT_STATE_MISMATCH));
  let after = await transition(tx, o, "ACCEPTED", { acceptedAt: new Date(), acceptedByUserId: who.actorUserId, prepMinutes: who.prepMinutes }, { actorUserId: who.actorUserId, payload: who.auto ? { auto: true } : undefined });
  // POS P2.6 ▸ R4 CD3: ทุกทางเข้า ACCEPTED (รับ · รับอัตโนมัติ · รับเข้าเป็น ACCEPTED) สร้างรอบครัวในธุรกรรมเดียวกัน (xmin เดียว · ไม่ขึ้นกับการจ่าย · รับซ้ำ = รอบเดิม) ◂
  await roundForOrderInTx(tx, after, ch);
  // POS P2.7 ▸ S4 มติ 5 (CD3): PREPAID — ในธุรกรรมรับ: lockSaleIntents → orderCreateSale (จุดเดิม) PROMPTPAY ref pi_ เต็มยอด → consumeSaleIntents → PAID ·
  //   กะ = กะของเครื่องที่รับ (รับอัตโนมัติ = null · ไม่ใช่เงินสด · P2.8 มติ 10) · ใบใช้ไม่ได้/บิลถูกปฏิเสธ (BLOCK · PRICE_NOT_SET …) = OrderAbort ⇒ rollback ทั้งก้อน (ยัง NEW/PREPAID) ◂
  if (o.paymentState === "PREPAID") {
    if (!o.paymentIntentId) throw new OrderAbort(refuse("ORDER_STATE_INVALID"));
    const lk = await lockSaleIntents(tx, { tenantId: o.tenantId, unitId: o.unitId }, [{ intentId: o.paymentIntentId, payType: "PROMPTPAY", amountSatang: o.totalSatang }], new Date(), { orderId: o.id }); // POS P2.7 ▸ fix2 H1: ใบของออเดอร์นี้เอง ◂
    if (!lk.ok) throw new OrderAbort(refuse(lk.code as OrderRefusalCode));
    const plines = await tx.posOrderLine.findMany({ where: { tenantId: o.tenantId, orderId: o.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    const psaleLines = await saleLinesOf(tx, o, plines);
    let psaleId: string;
    try {
      // POS P2.7 ▸ fix3 R2 G1: ช่องทาง QR_ORDER ที่ร้านปิดหลังลูกค้าจ่าย ยังรับได้ — เฉพาะบิลนี้ (บริบท async ของการเรียกนี้) ◂
      const pbase = saleBase(after, psaleLines, [{ type: "PROMPTPAY", amountSatang: o.totalSatang, reference: o.paymentIntentId as string }], { soldByUserId: who.actorUserId, shiftId: who.shiftId });
      const r = await withInactiveQrOrderAllowed(() => orderCreateSale(tx, pbase));
      psaleId = r.saleId;
    } catch (e) {
      const rf = saleRefusal(e);
      if (rf) throw new OrderAbort(rf);
      throw e;
    }
    await consumeSaleIntents(tx, { tenantId: o.tenantId, unitId: o.unitId }, psaleId, lk.notes);
    await tx.posOrder.updateMany({ where: { id: o.id, tenantId: o.tenantId }, data: { saleId: psaleId, paymentState: "PAID" } });
    after = await tx.posOrder.findUniqueOrThrow({ where: { id: o.id } });
    return { order: after, saleId: psaleId, saleLines: psaleLines };
  }
  // ◂ POS P2.7
  if (ch.payout !== "PLATFORM") return { order: after, saleId: null, saleLines: null };
  const lines = await tx.posOrderLine.findMany({ where: { tenantId: o.tenantId, orderId: o.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const saleLines = await saleLinesOf(tx, o, lines);
  let saleId: string;
  try {
    const r = await orderCreateSale(tx, saleBase(after, saleLines, [{ type: "PLATFORM", amountSatang: o.totalSatang }], { soldByUserId: who.actorUserId, shiftId: who.shiftId }));
    saleId = r.saleId;
  } catch (e) {
    const rf = saleRefusal(e);
    if (rf) throw new OrderAbort(rf);
    throw e;
  }
  // ผูกบิลในธุรกรรมเดียวกัน (xmin เดียวกับการรับ · มติ 7) — ไม่เพิ่มเวอร์ชัน (เป็นส่วนหนึ่งของการรับครั้งเดียว)
  await tx.posOrder.updateMany({ where: { id: o.id, tenantId: o.tenantId }, data: { saleId } });
  after = await tx.posOrder.findUniqueOrThrow({ where: { id: o.id } });
  return { order: after, saleId, saleLines };
}

// ═══════════ รับเข้า (R3 R4 · มติ 12 16) ═══════════
type IngestPlan = {
  s: { tenantId: string; systemId: string; unitId: string };
  ch: SalesChannel;
  input: IngestInput;
  lines: ResolvedLine[];
  createdByUserId: string | null;
  acceptor: { actorUserId: string | null; deviceShiftId: string | null };
  source: boolean;
};
type IngestDone = { orderId: string; duplicated: boolean; saleId: string | null; saleLines: CreateSaleInput["lines"] | null; accepted: "none" | "user" | "auto" };

/** ออเดอร์เดิมของ (ช่องทาง, เลข) หรือคีย์ → ผลซ้ำ / IDEMPOTENCY_CONFLICT · ไม่มี = null */
async function existingOrder(db: Db, plan: Pick<IngestPlan, "s" | "ch" | "input" | "source">): Promise<IngestDone | OrderRefusal | null> {
  const { s, ch, input } = plan;
  const hit =
    (input.externalRef ? await db.posOrder.findFirst({ where: { tenantId: s.tenantId, channelId: ch.id, externalRef: input.externalRef } }) : null) ??
    (await db.posOrder.findFirst({ where: { tenantId: s.tenantId, idempotencyKey: input.idempotencyKey } }));
  if (!hit) return null;
  const conflict = refuse("IDEMPOTENCY_CONFLICT");
  if (hit.channelId !== ch.id || hit.unitId !== s.unitId) return conflict;
  // คีย์เดิมกับเลขแพลตฟอร์มอื่น = คำขอคนละใบ
  if (hit.idempotencyKey === input.idempotencyKey && (hit.externalRef ?? null) !== (input.externalRef ?? null)) return conflict;
  const stored = await db.posOrderLine.findMany({ where: { tenantId: s.tenantId, orderId: hit.id } });
  const catalogPriced = new Set(plan.source ? stored.filter((l) => l.productId && isCatalogPricedLine(l)).map((l) => l.id) : []);
  if (storedFingerprint(stored, plan.source, catalogPriced) !== requestFingerprint(input.lines, plan.source)) return conflict;
  return { orderId: hit.id, duplicated: true, saleId: hit.saleId, saleLines: null, accepted: "none" };
}
/** บรรทัดที่ประตูระบบตั้งราคาจากแคตตาล็อกเอง (ไม่ใช่ราคาจากต้นทาง) — ประตูระบบเขียน listPriceSatang เฉพาะบรรทัดชนิดนี้ (ราคาต้นทาง = null) */
function isCatalogPricedLine(l: PosOrderLine): boolean {
  return l.listPriceSatang !== null;
}

/**
 * เขียนออเดอร์ (ภายในธุรกรรม · ล็อกเรียงลำดับ: เลขแพลตฟอร์ม → คีย์ → ตัวนับรหัสของสาขา) · คำขอซ้ำที่บรรทัดต่าง = คืนคำปฏิเสธ "ก่อนเขียน" ·
 * หลังเริ่มเขียนแล้ว ข้อผิดพลาดใด ๆ (บิลถูกปฏิเสธตอนรับทันที ฯลฯ) = throw ⇒ ธุรกรรมของผู้เรียกจบทั้งก้อน (ไม่มีแถวค้างครึ่ง ๆ)
 */
async function ingestInsideTx(tx: Tx, plan: IngestPlan): Promise<IngestDone | OrderRefusal> {
  const { s, ch, input } = plan;
  if (input.externalRef) await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`${s.tenantId}:posorder-ref:${ch.id}:${input.externalRef}`}))) l`;
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`${s.tenantId}:posorder-key:${input.idempotencyKey}`}))) l`;
  const dup = await existingOrder(tx, plan);
  if (dup) return dup;
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`${s.tenantId}:posorder-code:${s.unitId}`}))) l`;
  const now = new Date();
  const dayStart = posDayStart(now);
  const seq = (await tx.posOrder.count({ where: { tenantId: s.tenantId, unitId: s.unitId, receivedAt: { gte: dayStart } } })) + 1;
  const start: "NEW" | "ACCEPTED" = input.startStatus ?? (isManual(ch.adapter) ? "ACCEPTED" : "NEW");
  const paymentState = ch.payout === "PLATFORM" ? "PLATFORM_PAID" : (input.paymentState ?? "UNPAID");
  const total = input.lines.length ? plan.lines.reduce((t, l) => t + lineTotal(l), 0) : 0;
  const order = await tx.posOrder.create({
    data: {
      tenantId: s.tenantId,
      systemId: s.systemId,
      unitId: s.unitId,
      channelId: ch.id,
      channelCode: ch.code,
      adapter: ch.adapter,
      externalRef: input.externalRef,
      code: orderCode(seq),
      idempotencyKey: input.idempotencyKey,
      status: "NEW",
      paymentState,
      fulfilment: input.fulfilment,
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      memberId: input.customer.memberId,
      partyId: input.customer.partyId,
      address: input.address,
      note: input.note,
      chatConversationId: input.chatConversationId,
      shopOrderId: input.shopOrderId,
      totalSatang: total,
      prepMinutes: input.prepMinutes,
      receivedAt: now,
      createdByUserId: plan.createdByUserId,
      version: 1,
    },
  });
  await tx.posOrderLine.createMany({
    data: plan.lines.map((l, i) => ({
      tenantId: s.tenantId,
      systemId: s.systemId,
      orderId: order.id,
      productId: l.productId,
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      listPriceSatang: l.listPriceSatang,
      priceSource: l.priceSource,
      priceRuleId: l.priceRuleId,
      options: l.options as unknown as Prisma.InputJsonValue,
      note: l.note,
      lineTotalSatang: lineTotal(l),
      sortOrder: i,
    })),
  });
  await addEvent(tx, order, { type: "received", from: null, to: "NEW", actorUserId: plan.createdByUserId, payload: input.payload === null || input.payload === undefined ? undefined : input.payload, at: now });
  await emitOrderEvent(tx, order, "pos.order.received", start);
  // รับทันที: สถานะเริ่ม ACCEPTED (พนักงาน) หรือรับอัตโนมัติของช่องทาง (ไม่ใช่ MANUAL · มติ 11 · ผู้รับ = null)
  // POS P2.6 ▸ R13 มติ 10: ครัวหยุดรับ หรือมีสถานีที่ตั๋วค้าง ≥ autoAcceptMaxOpen ⇒ ไม่รับอัตโนมัติ (ออเดอร์อยู่ NEW รอคนรับ) ◂
  // POS HF-FU ▸ a: รับอัตโนมัติไม่ได้ "เพราะครัว" (พัก/คิวค้าง) ⇒ บันทึก held (NEW→NEW · reason paused|backlog) ให้ตัวกวาด releaseHeldOrders รับต่อเมื่อครัวว่าง ◂
  // POS P2.14 ▸ ORD-3 (O2): รับอัตโนมัติของ ingest ถือล็อกเดียวกับตัวกวาด (posorder-release ต่อสาขา) ก่อนตรวจเพดาน — ingest ‖ ตัวกวาด ไม่เกิน autoAcceptMaxOpen ·
  //   ลำดับล็อก: ref → key → code → release (ตัวกวาดถือแค่ release ⇒ ไม่มีวงล็อก) ◂
  const autoCand = start === "NEW" && ch.autoAccept && !isManual(ch.adapter);
  if (autoCand) await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`posorder-release:${s.tenantId}:${s.unitId}`}))) l`;
  const held = autoCand && (await autoAcceptBlockedInTx(tx, s));
  if (held) await addEvent(tx, order, { type: "held", from: "NEW", to: "NEW", actorUserId: null, payload: { reason: (await kitchenPausedForUnit(tx, s.tenantId, s.unitId)) ? "paused" : "backlog" } });
  const auto = start === "NEW" && ch.autoAccept && !isManual(ch.adapter) && !held;
  if (start !== "ACCEPTED" && !auto) return { orderId: order.id, duplicated: false, saleId: null, saleLines: null, accepted: "none" };
  const prep = input.prepMinutes ?? ch.prepMinutes ?? ORDER_PREP_DEFAULT_MIN;
  const who = auto ? { actorUserId: null, shiftId: null, prepMinutes: prep, auto: true } : { actorUserId: plan.acceptor.actorUserId, shiftId: plan.acceptor.deviceShiftId, prepMinutes: prep, auto: false };
  // เวลาของบันทึก "รับ" หลังบันทึก "รับเข้า" เสมอ (เรียงตาม at เดียวกันได้)
  const r = await acceptInTx(tx, order, ch, who);
  return { orderId: order.id, duplicated: false, saleId: r.saleId, saleLines: r.saleLines, accepted: auto ? "auto" : "user" };
}

/** ผลหลัง commit ของการรับเข้า: ตัดสต็อกของบิล (ถ้ามี) · audit · ระบายคิว */
async function afterIngest(plan: IngestPlan, done: IngestDone, actorUserId: string | null): Promise<void> {
  if (done.duplicated) return;
  await afterSaleCommit(plan.s.tenantId, plan.s.unitId, done.saleId, done.saleLines);
  await writeAudit({ tenantId: plan.s.tenantId, actorId: actorUserId, actorType: actorUserId ? "USER" : "SYSTEM", action: "pos.order.received", targetType: "PosOrder", targetId: done.orderId, after: { orderId: done.orderId, channelCode: plan.ch.code, adapter: plan.ch.adapter, lines: plan.lines.length } });
  if (done.accepted !== "none")
    await writeAudit({ tenantId: plan.s.tenantId, actorId: done.accepted === "auto" ? null : actorUserId, actorType: done.accepted === "auto" ? "SYSTEM" : "USER", action: "pos.order.accept", targetType: "PosOrder", targetId: done.orderId, after: { orderId: done.orderId, auto: done.accepted === "auto", saleId: done.saleId } });
  scheduleDrain();
}

/** ตรวจลูกค้าที่ผูก (สมาชิก/ผู้ติดต่อ/ห้องแชท) — ของร้านนี้เท่านั้น (มติ 5 · ไม่ import แชท) */
async function assertCustomerLinks(db: Db, tenantId: string, input: IngestInput): Promise<OrderRefusal | null> {
  const [m, p, c] = await Promise.all([
    input.customer.memberId ? db.customer.findFirst({ where: { id: input.customer.memberId, tenantId }, select: { id: true } }) : Promise.resolve(true),
    input.customer.partyId ? db.party.findFirst({ where: { id: input.customer.partyId, tenantId }, select: { id: true } }) : Promise.resolve(true),
    input.chatConversationId ? db.chatConversation.findFirst({ where: { id: input.chatConversationId, tenantId }, select: { id: true } }) : Promise.resolve(true),
  ]);
  // POS HF-FU ▸ l2: คีย์ข้อความต่อกรณี (จอใช้ messageKey ก่อนข้อความไทยของบริการ) ◂
  if (!m) return { ...refuse("VALIDATION", "ไม่พบสมาชิกนี้ในร้าน"), messageKey: "orders.errors.memberNotFound" };
  if (!p) return { ...refuse("VALIDATION", "ไม่พบผู้ติดต่อนี้ในร้าน"), messageKey: "orders.errors.partyNotFound" };
  if (!c) return { ...refuse("VALIDATION", "ไม่พบห้องแชทนี้ในร้าน"), messageKey: "orders.errors.conversationNotFound" };
  return null;
}

/**
 * R3 — พนักงานคีย์ออเดอร์ (MANUAL แพลตฟอร์ม · CHAT · ช่องทางกำหนดเอง) · สิทธิ์ pos.sale.create (รวม startStatus ACCEPTED · มติ CD8) ·
 * บรรทัดกำหนดเองต้องมี pos.sale.priceOverride (มติ 8) · ราคา/ตัวเลือก/86/ไม่ขายในช่องทาง = ตัวคิดราคาเดียวกับหน้าขาย (quoteRegisterCart บนช่องทางนี้ ·
 * แช่แข็งลงบรรทัด · CD3) · พักรับ (pausedUntil > ตอนนี้) = CHANNEL_PAUSED เว้นช่องทางคีย์เอง · ไม่จองสต็อก (CD5)
 */
export async function ingestOrder(ctx: RegisterCtx, actor: RegisterActor, input: unknown): Promise<IngestOrderResult> {
  return guard("ingestOrder", async (): Promise<IngestOrderResult> => {
    const s = await scopeOf(prisma, ctx, actor, "create");
    if (isRefusal(s)) return s;
    const parsed = parseIngestInput(input);
    if (!parsed.ok) return refuse("VALIDATION", parsed.message, parsed.lineIndex !== undefined ? { lineIndex: parsed.lineIndex } : {});
    const inp = parsed.value;
    const ch = await channelOfUnit(prisma, s, inp);
    // ประตูพนักงาน: ช่องทางแพลตฟอร์ม/กำหนดเอง + แชท · หน้าร้าน/QR/เว็บร้าน (ShopOrder เป็นต้นทาง) ไม่ใช่ออเดอร์ที่คีย์
    if (!ch || !ch.active || (ch.kind === "BUILTIN" && ch.code !== "CHAT")) return refuse("CHANNEL_INVALID");
    const priced = inp.lines.findIndex((l) => l.kind === "priced");
    if (priced >= 0) return refuse("VALIDATION", "ราคาของสินค้าในแคตตาล็อกมาจากระบบ — ส่งเฉพาะสินค้าและจำนวน", { lineIndex: priced });
    if (ch.payout === "PLATFORM" && inp.paymentState) return refuse("VALIDATION", "ออเดอร์แพลตฟอร์มชำระผ่านแพลตฟอร์มแล้ว — ไม่ต้องระบุสถานะชำระ");
    const custom = inp.lines.findIndex((l) => l.kind === "custom");
    if (custom >= 0 && !can(s.actor, "pos.sale.priceOverride", s.unitId)) return refuse("PERMISSION_DENIED", "รายการกำหนดเองต้องมีสิทธิ์ตั้งราคาเอง — ให้ผู้จัดการทำรายการนี้", { lineIndex: custom });
    const plan0 = { s, ch, input: inp, source: false };
    // คำขอซ้ำ (ไม่ล็อก — ถูกตรวจซ้ำในธุรกรรม) ⇒ ผลเดิมแม้ช่องทางถูกพักทีหลัง · ไม่คิดราคาซ้ำ ไม่เขียนอะไร
    const pre = await existingOrder(prisma, plan0);
    if (pre) return isRefusal(pre) ? pre : { ok: true, orderId: pre.orderId, duplicated: true, saleId: pre.saleId };
    if (isPaused(ch, new Date()) && pauseRefuses(ch.adapter)) return refuse("CHANNEL_PAUSED", `ช่องทาง ${ch.name} ปิดรับออเดอร์ชั่วคราว`);
    // POS P2.6 ▸ R13 มติ 10: ครัวของสาขาหยุดรับ ⇒ ช่องทางที่ไม่ใช่ MANUAL ถูกพักด้วย (เหตุผลที่สอง · รหัสเดียวกัน) · หน้าขาย/โต๊ะไม่ถูกพัก ◂
    if (pauseRefuses(ch.adapter) && (await kitchenPausedForUnit(prisma, s.tenantId, s.unitId))) return refuse("CHANNEL_PAUSED", KITCHEN_PAUSED_MESSAGE);
    const linkBad = await assertCustomerLinks(prisma, s.tenantId, inp);
    if (linkBad) return linkBad;
    // ราคา (ตัวคิดราคาของหน้าขาย บนช่องทางนี้ — สินค้ามองเห็นได้ · 86 · ตัวแปร · ตัวเลือก · ราคาช่องทาง/โปร · ไม่ขาย)
    const q = await quoteRegisterCart({ tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId }, s.actor, {
      channelId: ch.id,
      lines: inp.lines.map((l) =>
        l.kind === "catalog"
          ? { productId: l.productId, qty: l.qty, ...(l.choiceIds.length ? { options: l.choiceIds.map((choiceId) => ({ choiceId })) } : {}), ...(l.note ? { note: l.note } : {}) }
          : { name: (l as { name: string }).name, unitPriceSatang: (l as { unitPriceSatang: number }).unitPriceSatang, qty: l.qty, ...(l.note ? { note: l.note } : {}) },
      ),
    });
    if (!q.ok) return refuse(q.code as OrderRefusalCode, q.message, q.lineIndex !== undefined ? { lineIndex: q.lineIndex } : {});
    const lines = await resolvedFromQuote(prisma, s.tenantId, inp, q.lines);
    const dev = await deviceShift(prisma, s, s.deviceId);
    const plan: IngestPlan = { ...plan0, lines, createdByUserId: s.actor.userId, acceptor: { actorUserId: s.actor.userId, deviceShiftId: dev.shiftId } };
    let done: IngestDone | null = null;
    for (let attempt = 0; !done; attempt++) {
      try {
        done = await runTx(async (tx) => {
          const r = await ingestInsideTx(tx, plan);
          if (isRefusal(r)) throw new OrderAbort(r);
          return r;
        });
      } catch (e) {
        if (e instanceof OrderAbort) return e.refusal;
        if (!isUniqueViolation(e)) throw e;
        // ชนกับคำขอที่ commit ไปก่อน (ล็อกอยู่คนละกุญแจ) — อ่านใหม่แล้วตัดสินจากของจริง · ไม่ใช่ของออเดอร์ (ตัวนับใบเสร็จเดือนใหม่) = ลองใหม่
        const again = await existingOrder(prisma, plan0);
        if (again) return isRefusal(again) ? again : { ok: true, orderId: again.orderId, duplicated: true, saleId: again.saleId };
        if (attempt >= 2) throw e;
      }
    }
    const fin: IngestDone = done;
    await afterIngest(plan, fin, s.actor.userId);
    return { ok: true, orderId: fin.orderId, duplicated: fin.duplicated, saleId: fin.saleId };
  });
}

/** บรรทัดของคำขอ + บรรทัดของ quote (ลำดับเดียวกัน) → สำเนาที่แช่แข็ง (ชื่อสินค้า · ชื่อกลุ่มตัวเลือกจาก DB) */
async function resolvedFromQuote(
  db: Db,
  tenantId: string,
  inp: IngestInput,
  qLines: { productId: string | null; unitPriceSatang: number; options: { choiceId: string; groupId: string; name: string; priceDeltaSatang: number }[]; priceSource?: PriceSource | null; listPriceSatang?: number | null; priceRule?: { id: string } | null }[],
): Promise<ResolvedLine[]> {
  const pids = [...new Set(qLines.map((l) => l.productId).filter((x): x is string => !!x))];
  const gids = [...new Set(qLines.flatMap((l) => l.options.map((o) => o.groupId)))];
  const [prods, groups] = await Promise.all([
    pids.length ? db.posProduct.findMany({ where: { tenantId, id: { in: pids } }, select: { id: true, name: true } }) : Promise.resolve([]),
    gids.length ? db.menuOptionGroup.findMany({ where: { tenantId, id: { in: gids } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const nameOf = new Map(prods.map((p) => [p.id, p.name]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  return inp.lines.map((l, i) => {
    const q = qLines[i]!;
    return {
      productId: q.productId,
      name: q.productId ? (nameOf.get(q.productId) ?? "") : (l as { name: string }).name,
      qty: l.qty,
      unitPriceSatang: q.unitPriceSatang,
      listPriceSatang: q.listPriceSatang ?? null,
      priceSource: q.priceSource ?? null,
      priceRuleId: q.priceRule?.id ?? null,
      options: q.options.map((o) => ({ choiceId: o.choiceId, groupId: o.groupId, groupName: groupName.get(o.groupId) ?? "", choiceName: o.name, priceDeltaSatang: o.priceDeltaSatang })),
      note: l.note,
    };
  });
}

/**
 * ประตูระบบ (R4 · มติ CD1 13): adapter/เว็บร้านเรียกใน "ธุรกรรมของตัวเอง" — scope {tenantId, unitId} · ระบบ POS แก้แบบ posSystemForSale ·
 * ไม่มี POS (หรือหลาย POS ที่สาขาไม่ผูก) = {ok:true, skipped:true} ไม่ throw · ช่องทางตาม channelCode (builtin ของสาขาก่อน) หรือ channelId ·
 * บรรทัดราคาต้นทาง {productId?, name, unitPriceSatang, qty} (สำเนาจากต้นทาง เช่น ShopOrderLine) หรือสินค้าแคตตาล็อก (ราคาช่องทาง ณ ตอนนี้ · ไม่มีตัวเลือก) ·
 * 86 = PRODUCT_UNAVAILABLE + lineIndex (มติ 16) · พัก = CHANNEL_PAUSED (มติ 12 — ผู้เรียกตัดสินว่าจะโยนอะไร) ·
 * ช่องทาง PLATFORM ผ่านประตูนี้ไม่รับทันที (บิลต้องตัดสต็อกหลัง commit ของผู้เรียก — P3 follow-up) · ไม่เขียน audit/ไม่ระบายคิว (ผู้เรียกเรียก afterCommit)
 */
export async function ingestInTx(tx: Tx, scope: { tenantId: string; unitId: string }, input: unknown): Promise<IngestInTxResult> {
  if (!isRecord(scope) || !isId(scope.tenantId) || !isId(scope.unitId)) return refuse("VALIDATION");
  const pos = await posSystemForSale(scope.tenantId, scope.unitId, undefined, tx);
  if (!pos.ok) return { ok: true, skipped: true };
  const s = { tenantId: scope.tenantId, systemId: pos.systemId, unitId: scope.unitId };
  const parsed = parseIngestInput(input, { source: true });
  if (!parsed.ok) return refuse("VALIDATION", parsed.message, parsed.lineIndex !== undefined ? { lineIndex: parsed.lineIndex } : {});
  const inp = parsed.value;
  const ch = await channelOfUnit(tx, s, inp);
  if (!ch) return refuse("CHANNEL_INVALID");
  if (isPaused(ch, new Date()) && pauseRefuses(ch.adapter)) return refuse("CHANNEL_PAUSED", `ช่องทาง ${ch.name} ปิดรับออเดอร์ชั่วคราว`);
  if (pauseRefuses(ch.adapter) && (await kitchenPausedForUnit(tx, s.tenantId, s.unitId))) return refuse("CHANNEL_PAUSED", KITCHEN_PAUSED_MESSAGE); // POS P2.6 ▸ R13 มติ 10 ◂
  if (ch.payout === "PLATFORM" && inp.startStatus === "ACCEPTED") return refuse("VALIDATION", "ออเดอร์แพลตฟอร์มผ่านประตูระบบต้องเริ่มเป็นออเดอร์ใหม่ (รับที่จอออเดอร์)");
  // สินค้าของบรรทัด (POS นี้) + 86 ที่สาขา (ตัวอ่านเดียวกับหน้าขาย)
  const pids = [...new Set(inp.lines.flatMap((l) => (l.kind === "custom" ? [] : [l.productId])))];
  const rows = pids.length ? await tx.posProduct.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, id: { in: pids }, archivedAt: null } }) : [];
  const rowById = new Map(rows.map((r) => [r.id, r]));
  // POS P2.8 fix รอบ 2 (รีวิว F3): ตัวแปรที่แม่ถูกเก็บถาวร = ขายไม่ได้ (กติกาเดียวกับหน้าขาย) · การมองเห็นตามคลังของสาขา (C3) = P2.14
  const parentIds = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))];
  const liveParents = new Set(
    parentIds.length ? (await tx.posProduct.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, id: { in: parentIds }, archivedAt: null }, select: { id: true } })).map((x) => x.id) : [],
  );
  const soldOut = await menuSoldOutIds(s.tenantId, rows, tx);
  // POS P2.14 ▸ ORD-1 (O5): การมองเห็นตามคลังของสาขา (C3) + กติกาเดียวกับหน้าขาย (regVisibleWhere) — มองไม่เห็นที่สาขานี้ = PRODUCT_NOT_FOUND (บรรทัดนั้น) ◂
  // POS P2.14 ▸ ORD-1b (fix1 · CD-B5/H1): สาขาที่ไม่ผูกระบบคลังเลย = กติกาเดิมก่อน P2.14 (ไม่กรอง C3 — ทุกแถวที่พบถือว่ามองเห็น) ·
  //   ผูกคลังแล้ว = กรองตามหน้าขาย (มองไม่เห็น = PRODUCT_NOT_FOUND → เว็บร้าน throw ไม่สร้าง ShopOrder) ◂
  const invLinked = rows.length ? !!(await tx.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId: s.tenantId, unitId: s.unitId, type: "INVENTORY" } }, select: { systemId: true } })) : false;
  const visible = !rows.length ? new Set<string>() : invLinked ? await registerVisibleProductIds(tx, s, rows.map((r) => r.id)) : new Set(rows.map((r) => r.id)); // POS P2.14 ▸ ORD-1b ◂
  const book = inp.lines.some((l) => l.kind === "catalog") ? await loadPriceBook(tx, s, rows, new Date()) : null;
  const lines: ResolvedLine[] = [];
  for (let i = 0; i < inp.lines.length; i++) {
    const l = inp.lines[i]!;
    if (l.kind === "custom") {
      lines.push({ productId: null, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, listPriceSatang: null, priceSource: "CUSTOM", priceRuleId: null, options: [], note: l.note });
      continue;
    }
    const row = rowById.get(l.productId);
    if (!row) return refuse("PRODUCT_NOT_FOUND", undefined, { lineIndex: i });
    if (row.parentId && !liveParents.has(row.parentId)) return refuse("PRODUCT_UNAVAILABLE", undefined, { lineIndex: i }); // แม่เก็บถาวร = ขายไม่ได้ (คำตอบเดิม)
    if (!visible.has(row.id)) return refuse("PRODUCT_NOT_FOUND", undefined, { lineIndex: i }); // POS P2.14 ▸ ORD-1 ◂
    if (!rowAvailable(row, s.unitId, soldOut)) return refuse("PRODUCT_UNAVAILABLE", undefined, { lineIndex: i });
    if (l.kind === "priced") {
      // ราคาต้นทาง = ราคาของช่องทางนี้ ณ ตอนลูกค้าสั่ง (เว็บร้าน: ราคาหน้าเว็บที่ลูกค้าเห็น)
      // POS P2.8 fix รอบ 3 (H5): ที่มาของราคาจากต้นทาง (เว็บร้าน = ชั้น WEB ของ webPricesForShop) · ไม่ส่ง = CHANNEL
      lines.push({ productId: row.id, name: l.name ?? row.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, listPriceSatang: l.listPriceSatang, priceSource: l.priceSource ?? "CHANNEL", priceRuleId: l.priceRuleId, options: [], note: l.note });
      continue;
    }
    if (l.choiceIds.length) return refuse("VALIDATION", "ประตูระบบยังไม่รับตัวเลือกของสินค้า — ส่งราคาต้นทางแทน", { lineIndex: i });
    const rp = priceOf(book!, row, ch.code);
    if (!rp.ok) return refuse(rp.code, undefined, { lineIndex: i });
    lines.push({ productId: row.id, name: row.name, qty: l.qty, unitPriceSatang: rp.unitPriceSatang, listPriceSatang: rp.listPriceSatang ?? rp.priceSatang, priceSource: rp.source, priceRuleId: rp.ruleId, options: [], note: l.note });
  }
  const plan: IngestPlan = { s, ch, input: inp, lines, createdByUserId: null, acceptor: { actorUserId: null, deviceShiftId: null }, source: true };
  // ช่องทาง PLATFORM ผ่านประตูนี้: ไม่รับอัตโนมัติ (ดูหัวฟังก์ชัน)
  const planCh = ch.payout === "PLATFORM" ? { ...ch, autoAccept: false } : ch;
  const done = await ingestInsideTx(tx, { ...plan, ch: planCh });
  if (isRefusal(done)) return done;
  return { ok: true, orderId: done.orderId, duplicated: done.duplicated, saleId: done.saleId };
}

/** หลัง commit ของผู้เรียกประตูระบบ (เว็บร้าน) — ระบายคิว pos.order.* ทันที (ไม่รอ cron) */
export async function afterCommit(): Promise<void> {
  scheduleDrain();
}

/**
 * R4 — ต้นทางยกเลิก (เว็บร้านยกเลิกออเดอร์รอชำระ) ในธุรกรรมของผู้เรียก: ออเดอร์ที่ยังไม่ปิด → CANCELLED (+ outbox cancelled) ·
 * ไม่พบ/ปิดแล้ว = {changed:false} · ไม่ throw ยกเว้นข้อผิดพลาดของฐาน (ธุรกรรมของผู้เรียกจบเอง)
 */
export async function sourceCancelledInTx(tx: Tx, scope: { tenantId: string; unitId: string }, input: { shopOrderId: string; reason?: string | null }): Promise<SourceCancelledResult> {
  if (!isRecord(scope) || !isId(scope.tenantId) || !isRecord(input) || !isId(input.shopOrderId)) return { ok: true, orderId: null, changed: false };
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 300) : "ต้นทางยกเลิก";
  // POS P2.8 fix รอบ 3 (H4): แพ้การแข่ง (เช่น ร้านกดรับพร้อมกัน) = อ่านใหม่แล้วลองอีกครั้งในธุรกรรมเดียวกัน (READ COMMITTED เห็นเวอร์ชันใหม่) — ไม่ทิ้ง
  //   ShopOrder CANCELLED คู่กับออเดอร์ที่ยังเปิดอยู่ · ปิดแล้ว (เช่น ถูกปฏิเสธ) = ไม่เปลี่ยน
  for (let attempt = 0; attempt < 5; attempt++) {
    const o = await tx.posOrder.findFirst({ where: { tenantId: scope.tenantId, shopOrderId: input.shopOrderId, ...(isId(scope.unitId) ? { unitId: scope.unitId } : {}) } });
    if (!o) return { ok: true, orderId: null, changed: false };
    if (!canTransition(o.status, "CANCELLED")) return { ok: true, orderId: o.id, changed: false };
    try {
      await transition(tx, o, "CANCELLED", { closedAt: new Date() }, { actorUserId: null, payload: { source: "SHOP", reason } });
      return { ok: true, orderId: o.id, changed: true };
    } catch (e) {
      if (e instanceof OrderRaced) continue;
      if (e instanceof OrderAbort) return { ok: true, orderId: o.id, changed: false };
      throw e;
    }
  }
  throw new Error("[pos/order] sourceCancelledInTx: แข่งกันเกิน 5 รอบ");
}

// ═══════════ POS P2.8 fix รอบ 3 (H1) ▸ การรับเงินของเว็บร้านสะท้อนเข้าออเดอร์ในธุรกรรมของเว็บร้านเอง (ไม่พึ่งคิว) ◂ ═══════════
export type WebClaimResult = { ok: true; orderId: string | null; changed: boolean } | { ok: false; code: "ORDER_CLOSED"; orderId: string; status: OrderStatus };
async function webOrderForUpdate(tx: Tx, shopOrderId: string, tenantId?: string): Promise<PosOrder | null> {
  // POS HF-FU ▸ h2: ล็อกเฉพาะแถวของร้านนี้เมื่อผู้เรียกส่งร้านมา (เดิมล็อกตาม shopOrderId ทุกร้าน) ◂
  const t = tenantId ?? null;
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PosOrder" WHERE "shopOrderId" = ${shopOrderId} AND (${t}::text IS NULL OR "tenantId" = ${t}) ORDER BY id FOR UPDATE`;
  if (!rows.length) return null;
  const o = await tx.posOrder.findFirst({ where: { id: rows[0]!.id, ...(tenantId ? { tenantId } : {}) } });
  return o;
}
/**
 * เว็บร้านยืนยันรับเงิน (ในธุรกรรม claim ของ confirmOrderPaid): ล็อกออเดอร์ FOR UPDATE · REJECTED/CANCELLED ⇒ {ok:false, code ORDER_CLOSED}
 * (เว็บร้านต้องไม่รับเงินออเดอร์ที่ร้านปฏิเสธ/ยกเลิกแล้ว) · ไม่มีออเดอร์ (ร้านไม่มี POS ตอนสั่ง) ⇒ ok · อื่น ⇒ PAID + เวอร์ชัน + บันทึก paid
 * ⇒ ปฏิเสธ/ยกเลิกของร้านเรียงคิวกับการยืนยันที่แถวเดียวกัน (ผู้แพ้ได้ ORDER_STATE_CHANGED / ORDER_CLOSED)
 */
export async function webClaimInTx(tx: Tx, shopOrderId: string, scope?: { tenantId: string }): Promise<WebClaimResult> {
  if (!isId(shopOrderId)) return { ok: true, orderId: null, changed: false };
  const o = await webOrderForUpdate(tx, shopOrderId, scope?.tenantId);
  if (!o) return { ok: true, orderId: null, changed: false };
  if (o.status === "REJECTED" || o.status === "CANCELLED") return { ok: false, code: "ORDER_CLOSED", orderId: o.id, status: o.status };
  if (o.paymentState === "PAID") return { ok: true, orderId: o.id, changed: false };
  await touch(tx, o, { paymentState: "PAID" }, { type: "paid", actorUserId: null, payload: { source: "SHOP" } });
  return { ok: true, orderId: o.id, changed: true };
}
/** ผูกบิล ECOM ของเว็บร้านกับออเดอร์ (ในธุรกรรมที่เว็บร้านเขียน posSaleId) — ผูกแล้ว/ไม่มีออเดอร์ = ไม่ทำอะไร */
export async function webSaleBoundInTx(tx: Tx, shopOrderId: string, saleId: string, scope?: { tenantId: string }): Promise<{ ok: true; orderId: string | null; changed: boolean }> {
  if (!isId(shopOrderId) || !isId(saleId)) return { ok: true, orderId: null, changed: false };
  const o = await webOrderForUpdate(tx, shopOrderId, scope?.tenantId);
  if (!o || o.saleId === saleId) return { ok: true, orderId: o?.id ?? null, changed: false };
  if (o.saleId) {
    console.error(`[pos/order] webSaleBoundInTx: ออเดอร์ ${o.id} ผูกบิลอื่นอยู่แล้ว — ไม่เขียนทับ`);
    return { ok: true, orderId: o.id, changed: false };
  }
  await touch(tx, o, { saleId, ...(o.paymentState === "PAID" ? {} : { paymentState: "PAID" }) }, { type: "sale_bound", actorUserId: null, payload: { source: "SHOP", saleId } });
  return { ok: true, orderId: o.id, changed: true };
}
/** เว็บร้านคืนการ claim (บิลไม่เกิด) — ออเดอร์ที่ PAID จากการ claim นั้นและยังไม่มีบิล ⇒ UNPAID (ไม่ให้ค้างสถานะจ่ายแล้วโดยไม่มีเงิน) */
export async function webClaimRevertInTx(tx: Tx, shopOrderId: string, scope?: { tenantId: string }): Promise<{ ok: true; changed: boolean }> {
  if (!isId(shopOrderId)) return { ok: true, changed: false };
  const o = await webOrderForUpdate(tx, shopOrderId, scope?.tenantId);
  if (!o || o.paymentState !== "PAID" || o.saleId) return { ok: true, changed: false };
  await touch(tx, o, { paymentState: "UNPAID" }, { type: "paid_reverted", actorUserId: null, payload: { source: "SHOP" } });
  return { ok: true, changed: true };
}

// ═══════════ วงจร (R5) ═══════════
/** แพ้การแข่ง → ORDER_STATE_CHANGED พร้อมการ์ดสด (มติ 7) */
async function racedRefusal(s: { tenantId: string; systemId: string; unitId: string }, orderId: string): Promise<OrderRefusal> {
  const fresh = await prisma.posOrder.findFirst({ where: { id: orderId, tenantId: s.tenantId } });
  return refuse("ORDER_STATE_CHANGED", undefined, fresh ? { order: (await cardsOf(prisma, s.tenantId, [fresh], new Date()))[0] } : {});
}

/** ห่อการเปลี่ยนสถานะของผู้ใช้: ธุรกรรม · แข่งแพ้ = ORDER_STATE_CHANGED · คำปฏิเสธในธุรกรรม = rollback */
async function mutate<T>(s: Scope, orderId: string, fn: (tx: Tx) => Promise<T>): Promise<T | OrderRefusal> {
  try {
    return await runTx(fn, { retryUnique: true });
  } catch (e) {
    if (e instanceof OrderAbort) return e.refusal;
    if (e instanceof OrderRaced) return racedRefusal(s, orderId);
    throw e;
  }
}
async function cardOk(s: { tenantId: string }, o: PosOrder, extra: { saleId?: string | null } = {}): Promise<OrderActionResult> {
  return { ok: true, order: (await cardsOf(prisma, s.tenantId, [o], new Date()))[0]!, ...extra };
}
const stateInvalid = async (s: { tenantId: string }, o: PosOrder, message?: string, messageKey?: string): Promise<OrderRefusal> =>
  refuse("ORDER_STATE_INVALID", message, { order: (await cardsOf(prisma, s.tenantId, [o], new Date()))[0], ...(messageKey ? { messageKey } : {}) });
/** POS P2.8 fix รอบ 2 (รีวิว F1): ออเดอร์เว็บร้านที่ร้านยืนยันรับเงินแล้ว — ปฏิเสธ/ยกเลิกที่จอ POS ไม่ได้ (ShopOrder + บิล ECOM ต้องคืนเงินที่หน้าเว็บร้าน) */
const isPaidWeb = (o: PosOrder) => o.adapter === "WEB" && o.paymentState === "PAID";
const webPaidRefusal = (s: { tenantId: string }, o: PosOrder) => stateInvalid(s, o, ORDER_WEB_PAID_MESSAGE, "orders.errors.webPaid");

/**
 * รับออเดอร์ (pos.order.accept): NEW → ACCEPTED · เวลาเตรียม = ที่ส่งมา (1..180) ?? ของช่องทาง ?? 15 · ช่องทาง PLATFORM = บิลในธุรกรรมเดียวกัน
 * (กะของเครื่องที่รับ · บิลถูกปฏิเสธเช่น STOCK_INSUFFICIENT = ออเดอร์ยัง NEW ไม่มีอะไรถูกเขียน · มติ 11) · แข่งกันรับ = ผู้ชนะคนเดียว
 */
export async function acceptOrder(ctx: RegisterCtx, actor: RegisterActor, input: { id: string; prepMinutes?: number }): Promise<OrderActionResult> {
  return guard("acceptOrder", async (): Promise<OrderActionResult> => {
    const s = await scopeOf(prisma, ctx, actor, "accept");
    if (isRefusal(s)) return s;
    const inp = idInput(input, ["prepMinutes"]);
    if (isRefusal(inp)) return inp;
    if (inp.prepMinutes !== undefined && !isInt(inp.prepMinutes, ORDER_PREP_MIN, ORDER_PREP_MAX)) return refuse("VALIDATION", `เวลาเตรียมต้องเป็น ${ORDER_PREP_MIN}–${ORDER_PREP_MAX} นาที`);
    const o = await orderInScope(prisma, s, inp.id);
    if (!o) return refuse("ORDER_NOT_FOUND");
    if (!canTransition(o.status, "ACCEPTED")) return stateInvalid(s, o);
    const ch = await prisma.salesChannel.findFirst({ where: { id: o.channelId, tenantId: s.tenantId } });
    if (!ch) return refuse("CHANNEL_INVALID");
    const prep = (inp.prepMinutes as number | undefined) ?? ch.prepMinutes ?? ORDER_PREP_DEFAULT_MIN;
    const shift = ch.payout === "PLATFORM" || o.paymentState === "PREPAID" /* POS P2.7 ▸ PREPAID = บิลตอนรับ ลงกะของเครื่อง (PY6) ◂ */ ? (await deviceShift(prisma, s, s.deviceId)).shiftId : null;
    const r = await mutate(s, o.id, (tx) => acceptInTx(tx, o, ch, { actorUserId: s.actor.userId, shiftId: shift, prepMinutes: prep, auto: false }));
    if (isRefusal(r)) return r;
    await afterSaleCommit(s.tenantId, s.unitId, r.saleId, r.saleLines);
    await ORDER_ADAPTERS[r.order.adapter]?.accept?.({ orderId: o.id, externalRef: o.externalRef, prepMinutes: prep });
    await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.order.accept", targetType: "PosOrder", targetId: o.id, after: { orderId: o.id, prepMinutes: prep, saleId: r.saleId, auto: false } });
    scheduleDrain();
    return cardOk(s, r.order, { saleId: r.saleId });
  });
}

// ═══════════ POS HF-FU ▸ a: ตัวกวาดออเดอร์ที่ครัวพักไว้ (held) — รับอัตโนมัติเมื่อครัวว่าง (มติ 1) ◂ ═══════════
const RELEASE_LIMIT_MAX = 20;
/** POS HF-FU ▸ a fix2 (hunter H1): ช่องทางที่ตัวกวาดรับแทนได้ — ใช้ทั้งตอนเลือกผู้สมัครและตรวจซ้ำในธุรกรรม (archivedAt อยู่ในเงื่อนไขของ query) ◂ */
const sweepLive = (c: SalesChannel, now: Date) => c.active && c.autoAccept && !isManual(c.adapter) && !isPaused(c, now);
/**
 * ออเดอร์ NEW ของสาขาที่มีบันทึก held (ไม่ใช่ sale_refused) · รับเข้าตั้งแต่ต้นวันไทย (posDayStart · ของวันก่อนคงไว้ให้พนักงาน) · ช่องทางยัง
 * active + autoAccept + ไม่ใช่ MANUAL + ไม่พักรับ · เก่าสุดก่อน (receivedAt, id) · ทีละธุรกรรม: ตรวจ autoAcceptBlockedInTx ซ้ำ — ติดเมื่อไรหยุดทั้งรอบ ·
 * ไม่ติด = acceptInTx(auto) (CAS ของ PosOrder = ผู้ชนะคนเดียวเมื่อแข่งกับพนักงาน/ตัวกวาดอีกตัว · แพ้ = ข้าม) · บิลถูกปฏิเสธ = ข้าม + held {reason:"sale_refused"}
 * ครั้งเดียว (ไม่ลองซ้ำ — พนักงานรับเอง) · หลัง commit เหมือนรับเข้า (ตัดสต็อก · adapter accept · audit pos.order.accept {auto, swept} ผู้กระทำระบบ · ระบายคิว) ·
 * ไม่ throw ให้ผู้เรียก (ทางอ่านเรียกก่อนอ่าน — ล้ม = WARN แล้วอ่านต่อ)
 */
// POS P2.14 ▸ QR-1b (Q2 · CD-3): ออเดอร์ที่ครัวพักไว้ข้ามเที่ยงคืนถูกกวาดด้วย (เดิมจำกัดต้นวันไทย ⇒ ค้าง NEW) — ย้อนได้ 7 วัน (ไม่สแกนทั้งประวัติ) ◂
const RELEASE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
export async function releaseHeldOrders(tenantId: string, unitId: string, opts: { limit?: number } = {}): Promise<{ accepted: string[]; swept: boolean }> {
  const accepted: string[] = [];
  // POS P2.14 ▸ ORD-2 (O1): ทางอ่าน (listOrders/kdsBoard ทุกจอ) ไม่จอดรอล็อกของตัวกวาด — pg_try_advisory_xact_lock · ไม่ว่าง = หยุดรอบนี้ (swept:false · ตัวกวาดอีกตัวกำลังทำ) ◂
  let swept = true;
  try {
    if (!isId(tenantId) || !isId(unitId)) return { accepted, swept };
    const limit = Math.max(1, Math.min(RELEASE_LIMIT_MAX, Math.floor(opts?.limit ?? RELEASE_LIMIT_MAX)));
    const now = new Date();
    const rows = await prisma.posOrder.findMany({ where: { tenantId, unitId, status: "NEW", receivedAt: { gte: new Date(now.getTime() - RELEASE_LOOKBACK_MS) } }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: 500 }); // POS P2.14 ▸ Q2 ◂
    if (!rows.length) return { accepted, swept };
    const evs = await prisma.posOrderEvent.findMany({ where: { tenantId, orderId: { in: rows.map((o) => o.id) }, type: "held" }, select: { orderId: true, payload: true } });
    const heldIds = new Set(evs.map((e) => e.orderId));
    const refusedIds = new Set(evs.filter((e) => isRecord(e.payload) && e.payload.reason === "sale_refused").map((e) => e.orderId));
    const cand = rows.filter((o) => heldIds.has(o.id) && !refusedIds.has(o.id) && !isManual(o.adapter));
    if (!cand.length) return { accepted, swept };
    const chs = new Map((await prisma.salesChannel.findMany({ where: { tenantId, unitId, id: { in: [...new Set(cand.map((o) => o.channelId))] }, archivedAt: null } })).map((c) => [c.id, c]));
    const live = cand.filter((o) => {
      const c = chs.get(o.channelId);
      return !!c && sweepLive(c, now); // POS HF-FU ▸ a fix2: เงื่อนไขเดียวกับที่ตรวจซ้ำในธุรกรรม ◂
    });
    for (const o of live.slice(0, limit)) {
      const ch = chs.get(o.channelId)!;
      const prep = o.prepMinutes ?? ch.prepMinutes ?? ORDER_PREP_DEFAULT_MIN;
      let r: Awaited<ReturnType<typeof acceptInTx>> | "blocked" | "skip" | "busy";
      try {
        r = await runTx(
          async (tx) => {
            // POS HF-FU ▸ a fix1 (R1 F2): ตัวกวาดของสาขาเดียวกันเรียงคิวกันก่อนตรวจเพดาน (ทางอ่าน listOrders/kdsBoard ทุกจอ) — ผู้ถัดไปเห็นรอบครัวของผู้ก่อน
            //   ⇒ ตั๋วค้างไม่เกิน autoAcceptMaxOpen จากตัวกวาด · ล็อกแรกของธุรกรรม (ก่อนแถว PosOrder) ◂
            // POS P2.14 ▸ ORD-2: try-lock — ผู้ถือล็อก (ตัวกวาด/ingest รับอัตโนมัติอีกตัว) ทำอยู่ ⇒ "busy" ไม่รอ (connection ไม่ถูกจอด) ◂
            const got = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`posorder-release:${tenantId}:${unitId}`})) AS ok`;
            if (got[0]?.ok !== true) return "busy" as const;
            if (await autoAcceptBlockedInTx(tx, { tenantId, unitId })) return "blocked" as const;
            const fresh = await tx.posOrder.findFirst({ where: { id: o.id, tenantId, unitId } });
            if (!fresh || fresh.status !== "NEW") return "skip" as const;
            // POS HF-FU ▸ a fix2 (hunter H1): แถวช่องทางจากก่อนธุรกรรมอาจเก่า (ออเดอร์ถูกพักเป็นนาที–ชั่วโมง · เจ้าของเปลี่ยน payout/ปิดรับอัตโนมัติ/พักรับ/เก็บช่องทาง) ⇒
            //   อ่านซ้ำด้วย tx หลังล็อกต่อสาขา + ตรวจ live ซ้ำ · ไม่ live = ข้าม (คง NEW · ไม่บันทึกอะไร — พนักงานตัดสิน) · acceptInTx ได้แถวสด (คู่ payout ↔ paymentState ตรวจที่นั่น) ◂
            // POS P2.14 ▸ ORD-6: ล็อกแถวช่องทาง FOR SHARE ก่อนอ่านซ้ำ — การแก้ช่องทาง (payout/รับอัตโนมัติ/พักรับ/เก็บ) ที่กำลังเขียนต้องรอธุรกรรมนี้ หรือธุรกรรมนี้เห็นค่าหลังแก้ ◂
            await tx.$queryRaw`SELECT id FROM "SalesChannel" WHERE id = ${o.channelId} AND "tenantId" = ${tenantId} FOR SHARE`;
            const chNow = await tx.salesChannel.findFirst({ where: { id: o.channelId, tenantId, unitId, archivedAt: null } });
            if (!chNow || !sweepLive(chNow, new Date())) return "skip" as const;
            return acceptInTx(tx, fresh, chNow, { actorUserId: null, shiftId: null, prepMinutes: prep, auto: true });
          },
          { retryUnique: true },
        );
      } catch (e) {
        if (e instanceof OrderRaced) continue; // พนักงาน/ตัวกวาดอีกตัวรับไปก่อน
        if (e instanceof OrderAbort) {
          // บิลถูกปฏิเสธ (เช่น STOCK_INSUFFICIENT) — คงเป็น NEW · บันทึก sale_refused ครั้งเดียว (ล็อกแถวออเดอร์ · ตรวจซ้ำในธุรกรรม)
          try {
            await runTx(async (tx) => {
              const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "PosOrder" WHERE id = ${o.id} AND "tenantId" = ${tenantId} FOR UPDATE`;
              if (locked[0]?.status !== "NEW") return;
              const had = await tx.posOrderEvent.findMany({ where: { tenantId, orderId: o.id, type: "held" }, select: { payload: true } });
              if (had.some((x) => isRecord(x.payload) && x.payload.reason === "sale_refused")) return;
              await addEvent(tx, o, { type: "held", from: "NEW", to: "NEW", actorUserId: null, payload: { reason: "sale_refused" } });
            });
          } catch (me) {
            console.warn(`[pos/order] releaseHeldOrders: บันทึก sale_refused ของ ${o.id} ล้ม`, me); // POS HF-FU ▸ a fix1 (R1 F3) ◂
          }
          console.warn(`[pos/order] releaseHeldOrders: ออเดอร์ ${o.id} บิลถูกปฏิเสธ (${e.refusal.code}) — คงเป็นออเดอร์ใหม่ให้พนักงานรับเอง`);
          continue;
        }
        // POS HF-FU ▸ a fix1 (R1 F3): ข้อผิดพลาดอื่นของผู้สมัครตัวนี้ (ธุรกรรม rollback แล้ว) = WARN แล้วไปตัวถัดไป — ไม่โยนออกจากวง
        //   (เดิมโยน ⇒ ตัวนี้ถูกลองก่อนทุกรอบอ่านและบังตัวหลังทั้งหมด) ◂
        console.warn(`[pos/order] releaseHeldOrders: ออเดอร์ ${o.id} รับอัตโนมัติไม่สำเร็จ — ข้ามไปตัวถัดไป`, e);
        continue;
      }
      if (r === "busy") {
        swept = false; // POS P2.14 ▸ ORD-2 ◂
        break;
      }
      if (r === "blocked") break;
      if (r === "skip") continue;
      accepted.push(o.id);
      // POS HF-FU ▸ a fix1 (R1 F3): หลัง commit แต่ละขั้นห่อ try/WARN ของตัวเอง — การรับที่ commit แล้วได้ลอง audit swept เสมอ · ตัวถัดไปยังกวาดต่อ ◂
      const saleId = r.saleId;
      const saleLines = r.saleLines;
      const adapter = r.order.adapter;
      const steps: [string, () => Promise<unknown>][] = [
        ["afterSaleCommit", () => afterSaleCommit(tenantId, unitId, saleId, saleLines)],
        ["adapter.accept", async () => ORDER_ADAPTERS[adapter]?.accept?.({ orderId: o.id, externalRef: o.externalRef, prepMinutes: prep })],
        ["audit", () => writeAudit({ tenantId, actorId: null, actorType: "SYSTEM", action: "pos.order.accept", targetType: "PosOrder", targetId: o.id, after: { orderId: o.id, auto: true, swept: true, saleId } })],
      ];
      for (const [name, run] of steps) {
        try {
          await run();
        } catch (se) {
          console.warn(`[pos/order] releaseHeldOrders: ${name} ของ ${o.id} ล้ม (รับแล้ว · ไม่ย้อน)`, se);
        }
      }
    }
  } catch (e) {
    console.warn("[pos/order] releaseHeldOrders ล้ม (ไม่กระทบผู้เรียก)", e);
  }
  if (accepted.length) {
    try {
      scheduleDrain();
    } catch (e) {
      console.warn("[pos/order] releaseHeldOrders: scheduleDrain ล้ม", e); // POS HF-FU ▸ a fix1 (R1 F3) ◂
    }
  }
  return { accepted, swept };
}

/** ปฏิเสธ (pos.order.reject): NEW เท่านั้น → REJECTED + เหตุผล (OUT_OF_STOCK CLOSING TOO_BUSY OTHER) · เว็บร้าน = ตัวรับคิวยกเลิก ShopOrder (มติ 13) */
export async function rejectOrder(ctx: RegisterCtx, actor: RegisterActor, input: { id: string; reasonCode: string; note?: string }): Promise<OrderActionResult> {
  return guard("rejectOrder", async (): Promise<OrderActionResult> => {
    const s = await scopeOf(prisma, ctx, actor, "reject");
    if (isRefusal(s)) return s;
    const inp = idInput(input, ["reasonCode", "note"]);
    if (isRefusal(inp)) return inp;
    if (!(ORDER_REJECT_REASONS as readonly unknown[]).includes(inp.reasonCode)) return refuse("VALIDATION", "เลือกเหตุผลที่ปฏิเสธ");
    const note = inp.note === undefined || inp.note === null ? null : typeof inp.note === "string" && inp.note.length <= 300 ? inp.note.trim() || null : undefined;
    if (note === undefined) return refuse("VALIDATION", "หมายเหตุยาวได้ไม่เกิน 300 ตัวอักษร");
    const o = await orderInScope(prisma, s, inp.id);
    if (!o) return refuse("ORDER_NOT_FOUND");
    if (isPaidWeb(o)) return webPaidRefusal(s, o);
    if (o.status !== "NEW") return stateInvalid(s, o, "ปฏิเสธได้เฉพาะออเดอร์ใหม่ — ออเดอร์ที่รับแล้วใช้ยกเลิกออเดอร์");
    const reason = `${inp.reasonCode as string}${note ? `: ${note}` : ""}`;
    const r = await mutate(s, o.id, async (tx) => {
      const after = await transition(tx, o, "REJECTED", { rejectReason: reason, closedAt: new Date() }, { actorUserId: s.actor.userId, payload: { reasonCode: inp.reasonCode, note } });
      // POS P2.7 ▸ ยังไม่จ่าย = ปิดใบขอรับเงินในธุรกรรมเดียวกัน (เงินเข้าทีหลัง = INTENT_CANCELLED + ops refund_needed เดิม) ◂
      if (o.paymentState === "PENDING_PAYMENT" && o.paymentIntentId) await cancelOrderIntentInTx(tx, o.paymentIntentId);
      if (o.paymentState === "PREPAID") await addRefundNeededInTx(tx, after, "rejected_prepaid"); // POS P2.14 ▸ QR-2: เงินเข้าแล้วแต่ร้านปฏิเสธ = ตัวบอกถาวร ◂
      return after;
    });
    if (isRefusal(r)) return r;
    if (o.paymentState === "PREPAID") await prepaidRefundNeeded(o, "REJECTED"); // POS P2.7 ▸ S5 มติ 5: เงินเข้าแล้วแต่ร้านปฏิเสธ = ops ERROR refund_needed ◂
    await ORDER_ADAPTERS[r.adapter]?.reject?.({ orderId: o.id, externalRef: o.externalRef, reasonCode: inp.reasonCode as string });
    await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.order.reject", targetType: "PosOrder", targetId: o.id, after: { orderId: o.id, reasonCode: inp.reasonCode, note } });
    scheduleDrain();
    return cardOk(s, r);
  });
}

/** POS HF-FU ▸ h1 fix1 (R1 F4): ตัวบอก (identity) ว่าบิลถูก void ระหว่างส่งมอบ — โยนใน mutate ให้ rollback · ผู้เรียกแทนด้วย stateInvalid หลังธุรกรรม ◂ */
const HANDOVER_SALE_VOIDED: OrderRefusal = Object.freeze(refuse("ORDER_STATE_INVALID", ORDER_SALE_VOIDED_MESSAGE));
// POS P2.14 ▸ ORD-5 (O4): บิลของออเดอร์ถูกคืนเงินครบ (REFUNDED) = ส่งมอบไม่ได้ (ของบนบิลคืนเงินแล้ว) — ตัวบอกแบบเดียวกับ voided ◂
const ORDER_SALE_REFUNDED_MESSAGE = "บิลของออเดอร์นี้คืนเงินครบแล้ว — ส่งมอบไม่ได้ ยกเลิกออเดอร์แทน";
const HANDOVER_SALE_REFUNDED: OrderRefusal = Object.freeze(refuse("ORDER_STATE_INVALID", ORDER_SALE_REFUNDED_MESSAGE));
/** ขั้นถัดไปของวงจร (pos.order.accept): ACCEPTED → PREPARING · PREPARING → READY · READY → HANDED (DIRECT ยังไม่จ่าย = ORDER_UNPAID) */
async function step(name: string, ctx: RegisterCtx, actor: RegisterActor, input: { id: string }, to: "PREPARING" | "READY" | "HANDED"): Promise<OrderActionResult> {
  return guard(name, async (): Promise<OrderActionResult> => {
    const s = await scopeOf(prisma, ctx, actor, "accept");
    if (isRefusal(s)) return s;
    const inp = idInput(input, []);
    if (isRefusal(inp)) return inp;
    const o = await orderInScope(prisma, s, inp.id);
    if (!o) return refuse("ORDER_NOT_FOUND");
    if (!canTransition(o.status, to)) return stateInvalid(s, o);
    if (to === "HANDED" && (o.paymentState === "UNPAID" || o.paymentState === "PAY_ON_PICKUP")) return refuse("ORDER_UNPAID", undefined, { order: (await cardsOf(prisma, s.tenantId, [o], new Date()))[0] });
    const now = new Date();
    const patch: Prisma.PosOrderUpdateManyMutationInput = to === "READY" ? { readyAt: now } : to === "HANDED" ? { handedAt: now, closedAt: now } : {};
    const r = await mutate(s, o.id, async (tx) => {
      const after = await transition(tx, o, to, patch, { actorUserId: s.actor.userId });
      // POS P2.8 fix รอบ 3 (H3): บิลของออเดอร์ถูกยกเลิกแล้ว (ตัวรับ pos.sale.voided ยังไม่ถึง/ล้ม) ⇒ ห้ามส่งมอบของบนบิลที่คืนเงินแล้ว
      // POS HF-FU ▸ h1: อ่านสถานะบิลในธุรกรรมเดียวกับการส่งมอบ — ลำดับล็อก: CAS แถว PosOrder ก่อน แล้ว PosSale FOR SHARE (มีร้านกำกับ) ·
      //   void ไม่ล็อก PosOrder ในธุรกรรมของมัน ⇒ ไม่มีวงล็อก · void ที่ commit ระหว่างรอแถว PosOrder ถูกเห็นที่นี่ (คำสั่งใหม่ = snapshot ใหม่) ◂
      if (to === "HANDED" && o.saleId) {
        const sale = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "PosSale" WHERE id = ${o.saleId} AND "tenantId" = ${s.tenantId} FOR SHARE`;
        if (sale[0]?.status === "VOIDED") throw new OrderAbort(HANDOVER_SALE_VOIDED); // POS HF-FU ▸ h1 fix1 (R1 F4): ตัวบอกในธุรกรรม — การ์ดสร้างหลัง rollback ◂
        if (sale[0]?.status === "REFUNDED") throw new OrderAbort(HANDOVER_SALE_REFUNDED); // POS P2.14 ▸ ORD-5 ◂
      }
      return after;
    });
    // POS HF-FU ▸ h1 fix1 (R1 F4): คำปฏิเสธ saleVoided (การ์ดอ่านผ่าน prisma หลัก) สร้างหลังธุรกรรม rollback แล้ว — ไม่ยืม connection ที่สองระหว่างถือแถว PosOrder ◂
    if (r === HANDOVER_SALE_VOIDED) return stateInvalid(s, o, ORDER_SALE_VOIDED_MESSAGE, "orders.errors.saleVoided");
    if (r === HANDOVER_SALE_REFUNDED) return stateInvalid(s, o, ORDER_SALE_REFUNDED_MESSAGE, "orders.errors.saleRefunded"); // POS P2.14 ▸ ORD-5 ◂
    if (isRefusal(r)) return r;
    if (to === "READY") await ORDER_ADAPTERS[r.adapter]?.setReady?.({ orderId: o.id, externalRef: o.externalRef });
    if (to !== "PREPARING") scheduleDrain();
    return cardOk(s, r);
  });
}
export async function markPreparing(ctx: RegisterCtx, actor: RegisterActor, input: { id: string }): Promise<OrderActionResult> {
  return step("markPreparing", ctx, actor, input, "PREPARING");
}
export async function markReady(ctx: RegisterCtx, actor: RegisterActor, input: { id: string }): Promise<OrderActionResult> {
  return step("markReady", ctx, actor, input, "READY");
}
export async function handOver(ctx: RegisterCtx, actor: RegisterActor, input: { id: string }): Promise<OrderActionResult> {
  return step("handOver", ctx, actor, input, "HANDED");
}

/** แก้เวลาเตรียมของออเดอร์ที่ยังไม่ปิด (pos.order.accept · 1..180) */
export async function setPrepMinutes(ctx: RegisterCtx, actor: RegisterActor, input: { id: string; prepMinutes: number }): Promise<OrderActionResult> {
  return guard("setPrepMinutes", async (): Promise<OrderActionResult> => {
    const s = await scopeOf(prisma, ctx, actor, "accept");
    if (isRefusal(s)) return s;
    const inp = idInput(input, ["prepMinutes"]);
    if (isRefusal(inp)) return inp;
    if (!isInt(inp.prepMinutes, ORDER_PREP_MIN, ORDER_PREP_MAX)) return refuse("VALIDATION", `เวลาเตรียมต้องเป็น ${ORDER_PREP_MIN}–${ORDER_PREP_MAX} นาที`);
    const o = await orderInScope(prisma, s, inp.id);
    if (!o) return refuse("ORDER_NOT_FOUND");
    if (isOrderClosed(o.status)) return stateInvalid(s, o);
    if (o.prepMinutes === inp.prepMinutes) return cardOk(s, o);
    const r = await mutate(s, o.id, (tx) => touch(tx, o, { prepMinutes: inp.prepMinutes as number }, { type: "prep_changed", actorUserId: s.actor.userId, payload: { from: o.prepMinutes, to: inp.prepMinutes } }));
    if (isRefusal(r)) return r;
    return cardOk(s, r);
  });
}

/**
 * POS P2.8 fix รอบ 2 (รีวิว F4): คำปฏิเสธของ voidSaleByActor → รหัสของออเดอร์ (ไม่มีรหัสดิบของลิ้นชักบิลหลุดถึงจอ):
 * NO_PERMISSION → PERMISSION_DENIED · SALE_NOT_FOUND/SALE_NOT_VOIDABLE → ORDER_STATE_INVALID · HAS_REFUNDS → ORDER_STATE_INVALID (ข้อความของตัวเอง) ·
 * REASON_REQUIRED → VALIDATION · รหัสที่หน้าขายรู้จักอยู่แล้ว (รออนุมัติ · กะปิด · PIN/โทเคน/เครื่อง · VALIDATION) ผ่านตามเดิม · อื่น/UNKNOWN → INTERNAL
 */
const VOID_PASS = new Set<string>(["VALIDATION", "SHIFT_CLOSED", "PENDING_APPROVAL", "APPROVAL_REQUIRED", "STAFF_TOKEN_INVALID", "PIN_INVALID", "PIN_LOCKED", "DEVICE_REVOKED"]);
async function voidRefusal(s: { tenantId: string }, o: PosOrder, v: { code: string; message?: string; requestId?: unknown }): Promise<OrderRefusal> {
  const extra = typeof v.requestId === "string" ? { requestId: v.requestId } : {};
  if (v.code === "NO_PERMISSION") return refuse("PERMISSION_DENIED", v.message);
  if (v.code === "SALE_NOT_FOUND" || v.code === "SALE_NOT_VOIDABLE") return stateInvalid(s, o, v.message);
  if (v.code === "HAS_REFUNDS") return stateInvalid(s, o, ORDER_HAS_REFUNDS_MESSAGE, "orders.errors.hasRefunds");
  if (v.code === "REASON_REQUIRED") return refuse("VALIDATION", "ใส่เหตุผลที่ยกเลิก");
  if (VOID_PASS.has(v.code)) return refuse(v.code as OrderRefusalCode, v.message, extra);
  return refuse("INTERNAL");
}

/**
 * ยกเลิกออเดอร์ที่รับแล้ว (pos.order.reject + pos.sale.void เมื่อมีบิล PAID · มติ CD8): ACCEPTED|PREPARING|READY → CANCELLED ·
 * มีบิล = ยกเลิกบิลผ่านทางเดียวกับลิ้นชักบิล (voidSaleByActor · กติกาอนุมัติ P1.15 ใช้ — รออนุมัติ = ออเดอร์ยังไม่ถูกยกเลิก) แล้วจึงปิดออเดอร์ (REFUNDED) ·
 * ตัวรับ pos.sale.voided เจอออเดอร์ที่ปิดแล้ว = ไม่ทำซ้ำ (cancelled ครั้งเดียว) · NEW = ORDER_STATE_INVALID (ใช้ปฏิเสธ)
 */
export async function cancelOrder(ctx: RegisterCtx, actor: RegisterActor, input: { id: string; reason: string; idempotencyKey?: string }): Promise<OrderActionResult> {
  return guard("cancelOrder", async (): Promise<OrderActionResult> => {
    const s = await scopeOf(prisma, ctx, actor, "reject");
    if (isRefusal(s)) return s;
    const inp = idInput(input, ["reason", "idempotencyKey"]);
    if (isRefusal(inp)) return inp;
    const reason = typeof inp.reason === "string" ? inp.reason.trim() : "";
    if (!reason || reason.length > 300) return refuse("VALIDATION", "ใส่เหตุผลที่ยกเลิก (ไม่เกิน 300 ตัวอักษร)");
    if (inp.idempotencyKey !== undefined && (typeof inp.idempotencyKey !== "string" || !ORDER_KEY_RE.test(inp.idempotencyKey))) return refuse("VALIDATION", "รหัสรายการ (idempotencyKey) ไม่ถูกต้อง");
    let o = await orderInScope(prisma, s, inp.id);
    if (!o) return refuse("ORDER_NOT_FOUND");
    if (isPaidWeb(o)) return webPaidRefusal(s, o);
    if (o.status === "NEW") return stateInvalid(s, o, "ออเดอร์ใหม่ใช้ปฏิเสธแทนการยกเลิก");
    if (!canTransition(o.status, "CANCELLED")) return stateInvalid(s, o);
    const sale = o.saleId ? await prisma.posSale.findFirst({ where: { id: o.saleId, tenantId: s.tenantId }, select: { id: true, status: true, sourceModule: true } }) : null;
    if (sale && sale.status === "PAID") {
      if (sale.sourceModule !== "POS") return webPaidRefusal(s, o);
      if (!can(s.actor, "pos.sale.void", s.unitId)) return refuse("PERMISSION_DENIED", "ยกเลิกออเดอร์ที่มีบิลแล้วต้องมีสิทธิ์ยกเลิกบิลด้วย — ให้ผู้จัดการทำรายการ");
      const v = await voidSaleByActor({ tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, ...(s.deviceId ? { deviceId: s.deviceId } : {}) }, s.actor, {
        unitId: s.unitId,
        saleId: sale.id,
        idempotencyKey: (inp.idempotencyKey as string | undefined) ?? `posorder-cancel-${o.id}`,
        reason: `ยกเลิกออเดอร์ ${o.externalRef ?? o.code}: ${reason}`,
      });
      if (v.ok !== true) return voidRefusal(s, o, v);
      // ตัวรับ pos.sale.voided อาจปิดออเดอร์ไปก่อนแล้ว (ระบายคิวขนาน) — อ่านใหม่
      o = (await prisma.posOrder.findUnique({ where: { id: o.id } })) ?? o;
    }
    const refunded = !!sale && (sale.status === "PAID" || sale.status === "VOIDED");
    if (o.status !== "CANCELLED") {
      const cur = o;
      const r = await mutate(s, cur.id, (tx) =>
        transition(tx, cur, "CANCELLED", { closedAt: new Date(), ...(refunded ? { paymentState: "REFUNDED" } : {}) }, { actorUserId: s.actor.userId, payload: { reason, saleId: sale?.id ?? null } }),
      );
      if (isRefusal(r)) {
        // แข่งกับตัวรับ pos.sale.voided — ปิดแล้วด้วยเหตุผลเดียวกัน = สำเร็จ
        const now = await prisma.posOrder.findUnique({ where: { id: cur.id } });
        if (now?.status === "CANCELLED") return cardOk(s, now);
        return r;
      }
      o = r;
    }
    await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.order.cancel", targetType: "PosOrder", targetId: o.id, after: { orderId: o.id, reason, saleId: sale?.id ?? null } });
    scheduleDrain();
    return cardOk(s, o);
  });
}

const PAY_KEYS = ["type", "amountSatang", "reference"] as const;
/**
 * รับเงินออเดอร์ช่องทาง DIRECT (pos.sale.create · R6): ACCEPTED|PREPARING|READY ที่ยังไม่จ่าย → บิล POS (sourceId = ออเดอร์ · คีย์ posorder-<id>) +
 * PAID ในธุรกรรมเดียว · วิธีจ่าย = ของหน้าขายลบ PLATFORM (CHANNEL_PAY_MISMATCH) · Σ = ยอด (PAYMENT_MISMATCH) · เงินสดต้องมีเครื่องที่เปิดกะ (SHIFT_REQUIRED · มติ 10) ·
 * คีย์เดิม = บิลเดิม (duplicated) · จ่ายแล้วด้วยคีย์อื่น = ORDER_STATE_INVALID (บิลของออเดอร์มีใบเดียวเสมอ)
 */
export async function payOrder(ctx: RegisterCtx, actor: RegisterActor, input: { id: string; idempotencyKey: string; payMethods: { type: string; amountSatang: number; reference?: string }[]; cashReceivedSatang?: number }): Promise<PayOrderResult> {
  return guard("payOrder", async (): Promise<PayOrderResult> => {
    const s = await scopeOf(prisma, ctx, actor, "create");
    if (isRefusal(s)) return s;
    const inp = idInput(input, ["idempotencyKey", "payMethods", "cashReceivedSatang"]);
    if (isRefusal(inp)) return inp;
    if (typeof inp.idempotencyKey !== "string" || !ORDER_KEY_RE.test(inp.idempotencyKey)) return refuse("VALIDATION", "รหัสรายการ (idempotencyKey) ไม่ถูกต้อง");
    const key = inp.idempotencyKey;
    if (!Array.isArray(inp.payMethods) || inp.payMethods.length < 1) return refuse("VALIDATION", "ไม่มีรายการชำระเงิน");
    if (inp.payMethods.length > REGISTER_MAX_PAY_METHODS) return refuse("SPLIT_INVALID");
    const pays: { type: (typeof REGISTER_PAY_TYPES)[number]; amountSatang: number; reference: string | null }[] = [];
    for (const p of inp.payMethods as unknown[]) {
      if (!isRecord(p) || !onlyKeys(p, PAY_KEYS) || !(REGISTER_PAY_TYPES as readonly unknown[]).includes(p.type) || !isInt(p.amountSatang, 1, 2_000_000_000)) return refuse("VALIDATION", "รายการชำระเงินไม่ถูกต้อง");
      if (p.reference !== undefined && p.reference !== null && (typeof p.reference !== "string" || p.reference.length > REGISTER_REFERENCE_MAX)) return refuse("VALIDATION", "เลขอ้างอิงยาวเกินไป");
      pays.push({ type: p.type as (typeof REGISTER_PAY_TYPES)[number], amountSatang: p.amountSatang, reference: typeof p.reference === "string" && p.reference.trim() ? p.reference.trim() : null });
    }
    // POS P2.9 ▸ CD-P29-1 (b): จอออเดอร์ (09) ยังไม่มีขั้น PIN/เจ้าของเครดิต ⇒ บัตรของขวัญ/เครดิตร้านรับที่หน้าขายเท่านั้น (ออเดอร์ = ใบถัดไป · owner line) ◂
    if (pays.some((p) => p.type === "GIFT_CARD" || p.type === "STORE_CREDIT")) return refuse("VALIDATION", "ออเดอร์ยังรับบัตรของขวัญ/เครดิตร้านไม่ได้ — รับเงินด้วยวิธีอื่น หรือเช็คบิลที่หน้าขาย");
    // POS P2.9b ▸ §1 (P6): มัดจำรับที่หน้าขายเท่านั้น (ออเดอร์/API = P2.13) — REGISTER_PAY_TYPES มี DEPOSIT แล้ว จึงปฏิเสธที่นี่ ◂
    if (pays.some((p) => p.type === "DEPOSIT")) return refuse("VALIDATION", "ออเดอร์ยังรับมัดจำไม่ได้ — เช็คบิลที่หน้าขาย");
    const cashRows = pays.filter((p) => p.type === "CASH");
    let cashReceived: number | null = null;
    if (inp.cashReceivedSatang !== undefined && inp.cashReceivedSatang !== null) {
      if (!isInt(inp.cashReceivedSatang, 0, 2_000_000_000) || cashRows.length !== 1) return refuse("VALIDATION", "เงินที่รับมาใส่ได้เมื่อมีรายการเงินสดรายการเดียว");
      cashReceived = inp.cashReceivedSatang;
    }
    const o = await orderInScope(prisma, s, inp.id);
    if (!o) return refuse("ORDER_NOT_FOUND");
    // จ่ายแล้ว: คีย์เดิม = ผลเดิม · คีย์อื่น = ไม่มีบิลที่สอง
    if (o.paymentState === "PAID" && o.saleId) {
      const paidEv = await prisma.posOrderEvent.findMany({ where: { tenantId: s.tenantId, orderId: o.id, type: "paid" }, select: { payload: true } });
      if (paidEv.some((e) => isRecord(e.payload) && e.payload.idempotencyKey === key)) return { ok: true, saleId: o.saleId, duplicated: true };
      return stateInvalid(s, o, "ออเดอร์นี้รับเงินแล้ว");
    }
    if (o.paymentState === "PLATFORM_PAID") return stateInvalid(s, o, "ออเดอร์แพลตฟอร์มชำระผ่านแพลตฟอร์มแล้ว");
    if (o.adapter === "WEB") return stateInvalid(s, o, "ออเดอร์เว็บร้านยืนยันรับเงินที่หน้าเว็บร้าน");
    if (o.paymentState !== "UNPAID" && o.paymentState !== "PAY_ON_PICKUP") return stateInvalid(s, o);
    if (o.status !== "ACCEPTED" && o.status !== "PREPARING" && o.status !== "READY") return stateInvalid(s, o, "รับเงินได้เมื่อรับออเดอร์แล้วและยังไม่ปิดงาน");
    if (pays.some((p) => p.type === "PLATFORM")) return refuse("CHANNEL_PAY_MISMATCH");
    const sum = pays.reduce((t, p) => t + p.amountSatang, 0);
    if (sum !== o.totalSatang) return refuse("PAYMENT_MISMATCH", `ยอดชำระ ${sum} ไม่เท่ายอดออเดอร์ ${o.totalSatang}`);
    if (cashReceived !== null && cashReceived < cashRows[0]!.amountSatang) return refuse("PAYMENT_MISMATCH", "เงินที่รับมาน้อยกว่ายอดเงินสด");
    // POS P2.13 ▸ CD5 (ขยายถึง orders.pay): คำขอจาก REST (ctx ของเซิร์ฟเวอร์มี apiKeyId · ไม่มีเครื่อง) = ไม่ส่ง shiftId ⇒ createSale ผูกกะตามกติกา
    //   "ทางอื่น" (requiredOtherSources) แทนกะของเครื่อง · หน้าจอ (ไม่มี apiKeyId) = เดิมทุกไบต์ ◂
    const apiPay = isRecord(ctx) && typeof (ctx as { apiKeyId?: unknown }).apiKeyId === "string" && !!(ctx as { apiKeyId?: unknown }).apiKeyId;
    // POS P2.13 ▸ fix1 H3: เงินสดผ่าน REST ลงกะเสมอ (ไม่บันทึกเงินสดนอกกะ แม้ requiredOtherSources ปิด) — ผูกกะเปิดกะเดียวของสาขา ·
    //   ไม่มีกะเปิด / เปิดหลายกะ (ไม่เดา) = SHIFT_REQUIRED ก่อนเขียน · ไม่มีเงินสด = กติกา "ทางอื่น" ของ createSale เหมือนเดิม ◂
    let apiCashShift: string | undefined;
    if (apiPay) {
      // POS P2.14 ▸ fix1 F7: ตัวหากะตัวเดียวกับ POST /sales (shift.ts resolveApiSaleShift) · เงินสดลงกะเสมอ (strictCash — มติ P2.13 fix1 H3 · CONTROLLER-DECISION CD-F7) ◂
      const st = await resolveApiSaleShift(prisma, s, { hasCash: cashRows.length > 0, strictCash: true, caller: "orderPay" }); // POS P2.14 ▸ fix2 G3: + caller ◂
      if (!st.ok) return Object.assign(refuse("SHIFT_REQUIRED", st.message), { messageEn: st.messageEn }); // POS P2.14 ▸ fix2 G3: en ของผู้เรียกนี้ ◂
      apiCashShift = st.shiftId ?? undefined;
    }
    const shift: { shiftId: string | null | undefined; required: boolean } = apiPay ? { shiftId: apiCashShift, required: false } : await deviceShift(prisma, s, s.deviceId);
    if (!apiPay && (cashRows.length > 0 || shift.required) && !shift.shiftId) return refuse("SHIFT_REQUIRED");
    // POS HF-PP2 ▸ (P2.8U R1 F1 · บรีฟ §9 ข้อ 1–2): ด่านเดียวกับ submitRegisterSale (HF-PP) — ร้านตั้ง manualConfirmRequiresManager ⇒ พร้อมเพย์/บัตรที่ไม่อ้าง
    //   ใบขอรับเงินที่จ่ายแล้ว (pi_ ของสาขานี้ · PAID ใน 24 ชม. · ยอดตรงแถว · ไม่ซ้ำ · ยังไม่อยู่บนบิลใด — payOrder ไม่ตัดใบ จึงตรวจของจริง ไม่ใช่แค่รูปแบบ · fix1 F1) ต้องมี pos.shift.manage ·
    //   หลังตรวจแบบอ่านอย่างเดียวทั้งหมด ก่อนเขียนอะไร · ไม่มีวิธีจ่ายแบบนี้ / ผู้กระทำมีสิทธิ์ = ไม่แตะ DB เพิ่ม ◂
    const manual = pays.filter((p) => REGISTER_MANUAL_METHODS.has(p.type));
    // POS P2.13 ▸ fix1 F3/H2 (option b): REST (apiPay) ไม่ผ่านด่านผู้จัดการเสมอ — ต้องอ้าง pi_ ที่จ่ายแล้ว หรือร้านไม่ได้ตั้งให้ผู้จัดการยืนยัน ◂
    if (manual.length > 0 && (apiPay || !can(s.actor, "pos.shift.manage", s.unitId))) {
      const piIds = manual.flatMap((p) => (isPaymentIntentId(p.reference) ? [p.reference] : []));
      const allPi = piIds.length === manual.length && new Set(piIds).size === piIds.length;
      const used = allPi && (await prisma.posPayment.count({ where: { tenantId: s.tenantId, reference: { in: piIds } } })) > 0;
      const pis0 = allPi && !used ? await prisma.posPaymentIntent.findMany({ where: { id: { in: piIds }, tenantId: s.tenantId, unitId: s.unitId, status: "PAID", paidAt: { gte: new Date(Date.now() - PAYMENT_INTENT_CONSUME_WINDOW_MS) } }, select: { id: true, amountSatang: true, orderId: true } }) : [];
      // POS P2.7 ▸ fix2 R1 F2 / hunter H1: ใบของออเดอร์จ่ายก่อนที่ยังเปิดอยู่ไม่นับเป็น "ใบที่จ่ายแล้ว" ของบิลอื่น (กติกาเดียวกับ lockSaleIntents) ◂
      const liveOrders = new Set(
        pis0.some((x) => x.orderId)
          ? (await prisma.posOrder.findMany({ where: { tenantId: s.tenantId, id: { in: pis0.flatMap((x) => (x.orderId ? [x.orderId] : [])) }, status: { notIn: ["CANCELLED", "REJECTED"] } }, select: { id: true } })).map((x) => x.id)
          : [],
      );
      const pis = pis0.filter((x) => !x.orderId || !liveOrders.has(x.orderId));
      const allPaid = manual.every((p) => pis.some((x) => x.id === p.reference && x.amountSatang === p.amountSatang));
      const sys = allPaid ? null : await prisma.appSystem.findFirst({ where: { id: s.systemId, tenantId: s.tenantId }, select: { settings: true } });
      if (sys && parsePosIntentSettings(sys.settings).manualConfirmRequiresManager) return refuse("PERMISSION_DENIED", REGISTER_MANUAL_MANAGER_MESSAGE);
    }
    const r = await mutate(s, o.id, async (tx) => {
      const paid = await touch(tx, o, { paymentState: "PAID" }, { type: "paid", actorUserId: s.actor.userId, payload: { idempotencyKey: key } });
      const lines = await tx.posOrderLine.findMany({ where: { tenantId: o.tenantId, orderId: o.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
      const saleLines = await saleLinesOf(tx, o, lines);
      const payMethods: CreateSaleInput["payMethods"] = pays.map((p) => ({
        type: p.type,
        amountSatang: p.amountSatang,
        ...(p.reference ? { reference: p.reference } : {}),
        ...(p.type === "CASH" && cashReceived !== null ? { cashTenderedSatang: cashReceived } : {}),
      }));
      let saleId: string;
      try {
        saleId = (await orderCreateSale(tx, saleBase(paid, saleLines, payMethods, { soldByUserId: s.actor.userId, shiftId: shift.shiftId }))).saleId;
      } catch (e) {
        const rf = saleRefusal(e);
        if (rf) throw new OrderAbort(rf);
        throw e;
      }
      await tx.posOrder.updateMany({ where: { id: o.id, tenantId: o.tenantId }, data: { saleId } });
      return { saleId, saleLines };
    });
    if (isRefusal(r)) {
      // แข่งกับคำขอจ่ายคีย์เดิม (สองเครื่อง/กดซ้ำ) — ตัดสินจากของจริง
      if (r.code === "ORDER_STATE_CHANGED") {
        const now = await prisma.posOrder.findUnique({ where: { id: o.id } });
        if (now?.paymentState === "PAID" && now.saleId) {
          const ev = await prisma.posOrderEvent.findMany({ where: { tenantId: s.tenantId, orderId: o.id, type: "paid" }, select: { payload: true } });
          if (ev.some((e) => isRecord(e.payload) && e.payload.idempotencyKey === key)) return { ok: true, saleId: now.saleId, duplicated: true };
        }
      }
      return r;
    }
    await afterSaleCommit(s.tenantId, s.unitId, r.saleId, r.saleLines);
    await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.order.pay", targetType: "PosOrder", targetId: o.id, after: { orderId: o.id, saleId: r.saleId, methods: pays.map((p) => p.type) } });
    scheduleDrain();
    return { ok: true, saleId: r.saleId };
  });
}

// ═══════════ ค่าตั้งรับออเดอร์ของช่องทาง (R7) ═══════════
/**
 * ตั้งรับอัตโนมัติ · เวลาเตรียมปริยาย (1..180|null) · พักรับถึงเวลา (≤ ตอนนี้ + 24 ชม.|null) · adapterConfig {version, note?}|null (ห้ามความลับ)
 * สิทธิ์ pos.order.accept ที่สาขา · ช่องทางต้องเป็นของสาขานี้ (อื่น = CHANNEL_INVALID) · ไม่ผ่าน saveChannel (ตัวแกะ P2.1 ไม่ถูกแตะ)
 */
export async function setChannelOrderSettings(ctx: RegisterCtx, actor: RegisterActor, input: unknown): Promise<ChannelOrderSettingsResult> {
  return guard("setChannelOrderSettings", async (): Promise<ChannelOrderSettingsResult> => {
    const s = await scopeOf(prisma, ctx, actor, "accept");
    if (isRefusal(s)) return s;
    const parsed = parseChannelOrderSettings(input, Date.now());
    if (!parsed.ok) return refuse("VALIDATION", parsed.message);
    const v = parsed.value;
    const ch = await prisma.salesChannel.findFirst({ where: { id: v.channelId, tenantId: s.tenantId, unitId: s.unitId, archivedAt: null } });
    if (!ch) return refuse("CHANNEL_INVALID");
    const data: Prisma.SalesChannelUpdateManyMutationInput = {};
    if (v.autoAccept !== undefined) data.autoAccept = v.autoAccept;
    if (v.prepMinutes !== undefined) data.prepMinutes = v.prepMinutes;
    if (v.pausedUntil !== undefined) data.pausedUntil = v.pausedUntil;
    if (v.adapterConfig !== undefined) data.adapterConfig = v.adapterConfig === null ? (null as unknown as Prisma.InputJsonValue) : (v.adapterConfig as unknown as Prisma.InputJsonValue);
    if (!Object.keys(data).length) return { ok: true, channel: channelSettingsView(ch) };
    const n = await prisma.salesChannel.updateMany({ where: { id: ch.id, tenantId: s.tenantId, unitId: s.unitId }, data });
    if (n.count !== 1) return refuse("CHANNEL_INVALID");
    const after = await prisma.salesChannel.findUniqueOrThrow({ where: { id: ch.id } });
    if (v.pausedUntil !== undefined) await ORDER_ADAPTERS[after.adapter]?.setStoreStatus?.({ channelId: ch.id, open: !isPaused(after, new Date()) });
    await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.order.settings", targetType: "SalesChannel", targetId: ch.id, before: channelSettingsView(ch), after: channelSettingsView(after) });
    return { ok: true, channel: channelSettingsView(after) };
  });
}

// ═══════════ ตัวอ่าน (R8 · มติ 16 17) ═══════════
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// POS HF-FU ▸ F3: ตัวอ่านค่าตั้งรับออเดอร์ 3 คอลัมน์ของช่องทางสาขา (ด่านอ่าน pos.sale.read | pos.sale.create · ช่องทางที่ยังไม่เก็บ) —
//   แทนการอ่าน prisma ตรงใน order-ui-actions.ts (P2.8U F3) ◂
export type OrderChannelSettingsItem = { id: string; autoAccept: boolean; prepMinutes: number | null; pausedUntil: string | null };
export async function orderChannelSettings(ctx: RegisterCtx, actor: RegisterActor): Promise<{ ok: true; items: OrderChannelSettingsItem[] } | OrderRefusal> {
  return guard("orderChannelSettings", async (): Promise<{ ok: true; items: OrderChannelSettingsItem[] } | OrderRefusal> => {
    const s = await scopeOf(prisma, ctx, actor, "read");
    if (isRefusal(s)) return s;
    const rows = await prisma.salesChannel.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, archivedAt: null }, select: { id: true, autoAccept: true, prepMinutes: true, pausedUntil: true }, orderBy: { id: "asc" } });
    return { ok: true, items: rows.map((r) => ({ id: r.id, autoAccept: r.autoAccept, prepMinutes: r.prepMinutes, pausedUntil: iso(r.pausedUntil) })) };
  });
}

/** แถว → การ์ด (query เดียวต่อชนิด: ช่องทาง · จำนวนบรรทัด · เลขใบเสร็จ) */
async function cardsOf(db: Db, tenantId: string, rows: PosOrder[], now: Date): Promise<OrderCard[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const chIds = [...new Set(rows.map((r) => r.channelId))];
  const saleIds = [...new Set(rows.map((r) => r.saleId).filter((x): x is string => !!x))];
  const [chs, lines, sales] = await Promise.all([
    db.salesChannel.findMany({ where: { tenantId, id: { in: chIds } }, select: { id: true, code: true, name: true, payout: true, adapter: true } }),
    db.posOrderLine.findMany({ where: { tenantId, orderId: { in: ids } }, select: { orderId: true, qty: true } }),
    saleIds.length ? db.posSale.findMany({ where: { tenantId, id: { in: saleIds } }, select: { id: true, receiptNo: true } }) : Promise.resolve([]),
  ]);
  const chById = new Map(chs.map((c) => [c.id, c]));
  const receipt = new Map(sales.map((x) => [x.id, x.receiptNo]));
  // POS P2.7U ▸ เงินเข้าหลังหมดเวลา (บันทึก late_payment) ของออเดอร์จ่ายก่อน — ฟิลด์อ่านอย่างเดียวของการ์ด (แบนเนอร์จอ 09 · S5) ◂
  const prepayIds = rows.filter((r) => r.payBy || r.paymentIntentId).map((r) => r.id);
  // POS P2.7U fix1 ▸ nit (c): แบนเนอร์เฉพาะเงินที่ยังค้าง (ใบขอรับเงิน PAID · ใช้แล้ว/คืน/ยกเลิก = ไม่แสดง) — ยังอ่านครั้งเดียว (join ใบของ payload.intentId) ◂
  const latePaid = new Set(
    prepayIds.length
      ? (await db.$queryRaw<{ orderId: string }[]>`SELECT e."orderId" AS "orderId" FROM "PosOrderEvent" e JOIN "PosPaymentIntent" i ON i.id = (e.payload->>'intentId') WHERE e."tenantId" = ${tenantId} AND e.type = 'late_payment' AND e."orderId" = ANY(${prepayIds}) AND i."tenantId" = ${tenantId} AND i.status = 'PAID'`).map((e) => e.orderId)
      : [],
  );
  const nLines = new Map<string, number>();
  const nQty = new Map<string, number>();
  for (const l of lines) {
    nLines.set(l.orderId, (nLines.get(l.orderId) ?? 0) + 1);
    nQty.set(l.orderId, (nQty.get(l.orderId) ?? 0) + l.qty);
  }
  const t = now.getTime();
  return rows.map((o) => {
    const ch = chById.get(o.channelId);
    const prepDue = o.acceptedAt ? new Date(o.acceptedAt.getTime() + (o.prepMinutes ?? ORDER_PREP_DEFAULT_MIN) * 60_000) : null;
    return {
      id: o.id,
      channel: { id: o.channelId, code: ch?.code ?? o.channelCode, name: ch?.name ?? o.channelCode, payout: ch?.payout ?? null, adapter: o.adapter },
      ref: o.externalRef ?? o.code,
      code: o.code,
      externalRef: o.externalRef,
      status: o.status,
      paymentState: o.paymentState,
      itemCount: nLines.get(o.id) ?? 0,
      qtyCount: nQty.get(o.id) ?? 0,
      totalSatang: o.totalSatang,
      customerName: o.customerName,
      phoneMasked: maskPhone(o.customerPhone),
      fulfilment: o.fulfilment,
      address: o.address,
      note: o.note,
      receivedAt: o.receivedAt.toISOString(),
      // POS P2.7 ▸ S1: PREPAID นับเวลารับจาก paidAt · PENDING_PAYMENT ไม่มีนาฬิการับ ◂
      acceptBy: new Date((o.paymentState === "PREPAID" && o.paidAt ? o.paidAt : o.receivedAt).getTime() + ORDER_ACCEPT_WINDOW_SEC * 1000).toISOString(),
      acceptRemainingSec: o.status === "NEW" && o.paymentState !== "PENDING_PAYMENT" ? acceptRemainingSec((o.paymentState === "PREPAID" && o.paidAt ? o.paidAt : o.receivedAt).getTime(), t) : null,
      acceptedAt: iso(o.acceptedAt),
      prepMinutes: o.prepMinutes,
      prepDueAt: iso(prepDue),
      lateMinutes: prepDue && (o.status === "ACCEPTED" || o.status === "PREPARING") ? orderLateMinutes(prepDue.getTime(), t) : 0,
      readyAt: iso(o.readyAt),
      handedAt: iso(o.handedAt),
      closedAt: iso(o.closedAt),
      rejectReason: o.rejectReason,
      saleId: o.saleId,
      receiptNo: o.saleId ? (receipt.get(o.saleId) ?? null) : null,
      shopOrderId: o.shopOrderId,
      version: o.version,
      prepay: o.payBy || o.paymentIntentId ? { payBy: iso(o.payBy), paidAt: iso(o.paidAt), claimedAt: iso(o.customerClaimAt), intentId: o.paymentIntentId, ...(latePaid.has(o.id) ? { latePaid: true } : {}) } : null, // POS P2.7 ◂ · POS P2.7U ▸ + latePaid ◂
    };
  });
}

const LIST_KEYS = ["status", "channelId", "since"] as const;
const OPEN_STATUSES: OrderStatus[] = ["NEW", "ACCEPTED", "PREPARING", "READY"];
const ORDER_LIST_SINCE_MAX_MS = 7 * 24 * 3600 * 1000;
/**
 * จอ 09 (pos.sale.read | pos.sale.create): ออเดอร์ของวัน (รับเข้าตั้งแต่ต้นวันไทย หรือ since) + ออเดอร์ที่ยังไม่ปิดของวันก่อน ·
 * counts.byColumn/byChannel + summary คิดจากชุดของวันทั้งหมด (ไม่ขึ้นกับตัวกรอง) · orders = หลังกรอง status/channelId · ไม่มีเบอร์เต็ม
 */
export async function listOrders(ctx: RegisterCtx, actor: RegisterActor, input: { status?: string; channelId?: string; since?: string } = {}): Promise<ListOrdersResult> {
  return guard("listOrders", async (): Promise<ListOrdersResult> => {
    const s = await scopeOf(prisma, ctx, actor, "read");
    if (isRefusal(s)) return s;
    const inp = input ?? {};
    if (!isRecord(inp) || !onlyKeys(inp, LIST_KEYS)) return refuse("VALIDATION");
    if (inp.status !== undefined && !(ORDER_STATUSES as readonly unknown[]).includes(inp.status)) return refuse("VALIDATION", "สถานะไม่ถูกต้อง");
    if (inp.channelId !== undefined && !isId(inp.channelId)) return refuse("VALIDATION", "รหัสช่องทางไม่ถูกต้อง");
    let since: Date | null = null;
    if (inp.since !== undefined) {
      since = typeof inp.since === "string" ? new Date(inp.since) : null;
      if (!since || !Number.isFinite(since.getTime())) return refuse("VALIDATION", "เวลาเริ่มไม่ถูกต้อง");
    }
    await releaseHeldOrders(s.tenantId, s.unitId, { limit: RELEASE_LIMIT_MAX }); // POS HF-FU ▸ a: กวาดก่อนอ่าน (ไม่ throw · ล้ม = WARN) ◂
    await expireDuePreorders({ tenantId: s.tenantId, unitId: s.unitId }); // POS P2.7 ▸ S2: ออเดอร์จ่ายก่อนที่เลยเวลาจ่าย → ยกเลิก (ขี้เกียจ · ไม่ throw) ◂
    const now = new Date();
    // POS P2.8 fix รอบ 2 (รีวิว F5): since ย้อนได้ไม่เกิน 7 วัน (เก่ากว่า = ตัดที่ 7 วัน · ผลบอก since ที่ใช้จริง) · อ่านใหม่สุดก่อน 2000 แถวแล้วกลับลำดับ ⇒ วันยุ่งไม่ทิ้งออเดอร์ล่าสุด
    const floor = new Date(now.getTime() - ORDER_LIST_SINCE_MAX_MS);
    const from = since ? (since.getTime() < floor.getTime() ? floor : since) : posDayStart(now);
    const rows = (
      await prisma.posOrder.findMany({
        where: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, OR: [{ receivedAt: { gte: from } }, { status: { in: OPEN_STATUSES } }] },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: 2000,
      })
    ).reverse();
    const byColumn: Record<OrderColumn, number> = { new: 0, preparing: 0, ready: 0, done: 0 };
    const byChannel: Record<string, number> = {};
    for (const o of rows) {
      const c = o.paymentState === "PENDING_PAYMENT" ? null : orderColumnOf(o.status); // POS P2.7 ▸ S1: รอเงินเข้าไม่นับในคอลัมน์ "ใหม่" (PREPAID นับ) ◂
      if (c) byColumn[c]++;
      byChannel[o.channelId] = (byChannel[o.channelId] ?? 0) + 1;
    }
    const live = rows.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED");
    const accepted = rows.filter((o) => o.acceptedAt);
    const handed = rows.filter((o) => o.status === "HANDED");
    const summary: OrderDaySummary = {
      count: rows.length,
      totalSatang: live.reduce((t, o) => t + o.totalSatang, 0),
      rejectedCancelled: rows.length - live.length,
      avgAcceptSeconds: accepted.length ? Math.max(0, Math.round(accepted.reduce((t, o) => t + (o.acceptedAt!.getTime() - o.receivedAt.getTime()) / 1000, 0) / accepted.length)) : 0,
      onTime: {
        n: handed.filter((o) => o.acceptedAt && o.readyAt && o.readyAt.getTime() <= o.acceptedAt.getTime() + (o.prepMinutes ?? ORDER_PREP_DEFAULT_MIN) * 60_000).length,
        m: handed.length,
      },
    };
    const shown = rows.filter((o) => (inp.status === undefined || o.status === inp.status) && (inp.channelId === undefined || o.channelId === inp.channelId));
    return { ok: true, orders: await cardsOf(prisma, s.tenantId, shown, now), counts: { byColumn, byChannel }, summary, at: now.toISOString(), since: from.toISOString() };
  });
}

/** รายละเอียดออเดอร์ (pos.sale.read | pos.sale.create): การ์ด + บรรทัด/ตัวเลือก/หมายเหตุ + ค่าคอมฯ (channelCommission) + ประวัติลูกค้าที่สาขา + บันทึกสถานะ */
export async function getOrder(ctx: RegisterCtx, actor: RegisterActor, input: { id: string }): Promise<GetOrderResult> {
  return guard("getOrder", async (): Promise<GetOrderResult> => {
    const s = await scopeOf(prisma, ctx, actor, "read");
    if (isRefusal(s)) return s;
    const inp = idInput(input, []);
    if (isRefusal(inp)) return inp;
    const o = await orderInScope(prisma, s, inp.id);
    if (!o) return refuse("ORDER_NOT_FOUND");
    const now = new Date();
    const [card] = await cardsOf(prisma, s.tenantId, [o], now);
    const [lines, ch, events, sale] = await Promise.all([
      prisma.posOrderLine.findMany({ where: { tenantId: s.tenantId, orderId: o.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      prisma.salesChannel.findFirst({ where: { id: o.channelId, tenantId: s.tenantId }, select: { commissionBp: true, commissionFixedSatang: true, commissionVatBp: true, code: true } }),
      prisma.posOrderEvent.findMany({ where: { tenantId: s.tenantId, orderId: o.id }, orderBy: [{ at: "asc" }, { id: "asc" }] }),
      o.saleId ? prisma.posSale.findFirst({ where: { id: o.saleId, tenantId: s.tenantId }, select: { status: true } }) : Promise.resolve(null), // POS HF-FU ▸ n ◂
    ]);
    const rates = ch && ch.code !== "STORE" ? ch : { commissionBp: 0, commissionFixedSatang: 0, commissionVatBp: 0 };
    const c = channelCommission(o.totalSatang, rates);
    const histWhere: Prisma.PosOrderWhereInput | null = o.customerPhone
      ? { customerPhone: o.customerPhone }
      : o.memberId
        ? { memberId: o.memberId }
        : o.partyId
          ? { partyId: o.partyId }
          : null;
    const hist = histWhere ? await prisma.posOrder.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, ...histWhere }, select: { totalSatang: true } }) : [{ totalSatang: o.totalSatang }];
    const lineViews: OrderLineView[] = lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      listPriceSatang: l.listPriceSatang,
      priceSource: l.priceSource as PriceSource | null,
      options: optionsOf(l.options),
      note: l.note,
      lineTotalSatang: l.lineTotalSatang,
    }));
    const order: OrderDetail = {
      ...card!,
      lines: lineViews,
      commission: { commissionSatang: c.commissionSatang, commissionVatSatang: c.commissionVatSatang, netSatang: channelNet(o.totalSatang, c.commissionSatang, c.commissionVatSatang) },
      history: { count: hist.length, avgSatang: hist.length ? Math.round(hist.reduce((t, h) => t + h.totalSatang, 0) / hist.length) : 0 },
      memberId: o.memberId,
      partyId: o.partyId,
      chatConversationId: o.chatConversationId,
      saleStatus: sale ? (sale.status as OrderDetail["saleStatus"]) : null, // POS HF-FU ▸ n: จอปลดปุ่มยกเลิกเมื่อบิล VOIDED (ตัวรับคิวยังไม่ถึง) ◂
      events: events.map((e) => ({ type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, actorUserId: e.actorUserId, at: e.at.toISOString() })),
    };
    return { ok: true, order };
  });
}

// ═══════════ ตัวรับคิว (เรียกจาก composition root · idempotent · มติ 13) ═══════════
/**
 * shop.order.paid → ออเดอร์เว็บของ ShopOrder นั้น: saleId = posSaleId · PAID (ครั้งเดียว · เล่นซ้ำ = ไม่เปลี่ยนเวอร์ชัน)
 * ช่องทางของบิล ECOM = WEB ของสาขาเดียวกัน (resolveSaleChannel ปริยาย) = ช่องทางของออเดอร์
 */
export async function onShopOrderPaid(tenantId: string, payload: unknown): Promise<void> {
  // POS P2.8 fix รอบ 3 (H1): ตัวยืนยันเท่านั้น — การรับเงินถูกสะท้อนในธุรกรรมของเว็บร้านแล้ว (webClaimInTx / webSaleBoundInTx) ·
  //   ไม่เขียน PAID ลงออเดอร์ที่ปิดแล้ว (ปฏิเสธ/ยกเลิก) หรือบิลที่ถูกยกเลิก — บันทึกบรรทัดเตือนแทน · ช่วยเฉพาะ event ที่ค้างมาก่อนรอบนี้ (ยังไม่ PAID/ยังไม่ผูก)
  const p = isRecord(payload) ? payload : {};
  if (!isId(tenantId) || !isId(p.orderId) || !isId(p.posSaleId)) return;
  const o = await prisma.posOrder.findFirst({ where: { tenantId, shopOrderId: p.orderId } });
  if (!o || (o.paymentState === "PAID" && o.saleId === p.posSaleId)) return;
  if (o.status === "REJECTED" || o.status === "CANCELLED") {
    console.warn(`[pos/order] onShopOrderPaid: ออเดอร์ ${o.id} ปิดแล้ว (${o.status}) แต่เว็บร้านรับเงิน ShopOrder ${p.orderId} — ต้องคืนเงินที่หน้าเว็บร้าน`);
    return;
  }
  const sale = await prisma.posSale.findFirst({ where: { id: p.posSaleId as string, tenantId }, select: { status: true } });
  if (sale?.status === "VOIDED") {
    console.warn(`[pos/order] onShopOrderPaid: บิล ${p.posSaleId} ถูกยกเลิกแล้ว — ไม่ผูก PAID กับออเดอร์ ${o.id}`);
    return;
  }
  if (o.saleId && o.saleId !== p.posSaleId) return; // ผูกบิลอื่นไปแล้ว — ไม่เขียนทับ
  try {
    await runTx((tx) => touch(tx, o, { paymentState: "PAID", saleId: p.posSaleId as string }, { type: "paid", actorUserId: null, payload: { source: "SHOP_EVENT", saleId: p.posSaleId } }));
  } catch (e) {
    if (e instanceof OrderRaced) return onShopOrderPaid(tenantId, payload); // เปลี่ยนระหว่างทาง — อ่านใหม่แล้วตัดสินอีกครั้ง
    throw e;
  }
}

/**
 * pos.sale.voided → ออเดอร์ที่ผูกบิลนั้น (บิลของออเดอร์ POS หรือบิล ECOM ของเว็บร้าน): REFUNDED + CANCELLED ถ้ายังไม่ส่งมอบ
 * (outbox cancelled ครั้งเดียว) · ส่งมอบแล้ว = REFUNDED อย่างเดียว · ปิดแล้ว/ไม่มี = ไม่ทำอะไร · คืนเงินบางส่วนไม่แตะสถานะ (ไม่ใช่ event นี้)
 */
export async function onSaleVoided(tenantId: string, payload: unknown): Promise<void> {
  const p = isRecord(payload) ? payload : {};
  if (!isId(tenantId) || !isId(p.saleId)) return;
  const o = await prisma.posOrder.findFirst({ where: { tenantId, saleId: p.saleId } });
  if (!o) return;
  const sale = await prisma.posSale.findFirst({ where: { id: p.saleId, tenantId }, select: { status: true } });
  if (sale?.status !== "VOIDED") return;
  try {
    if (canTransition(o.status, "CANCELLED")) {
      await runTx((tx) => transition(tx, o, "CANCELLED", { closedAt: new Date(), paymentState: "REFUNDED" }, { actorUserId: null, payload: { source: "SALE_VOIDED", saleId: p.saleId } }));
      scheduleDrain();
    } else if (o.paymentState !== "REFUNDED") {
      await runTx((tx) => touch(tx, o, { paymentState: "REFUNDED" }, { type: "refunded", actorUserId: null, payload: { source: "SALE_VOIDED", saleId: p.saleId } }));
    }
  } catch (e) {
    if (e instanceof OrderRaced) return onSaleVoided(tenantId, payload);
    if (e instanceof OrderAbort) return;
    throw e;
  }
}

/** สำเนาราคาของบรรทัดออเดอร์เว็บ (ใช้ตอนเว็บร้านยืนยันรับเงิน — บรรทัดบิลบอกที่มาของราคา · มติ 4) */
export async function webLineSources(tenantId: string, shopOrderId: string): Promise<{ productId: string; unitPriceSatang: number; priceSource: PriceSource | null; priceRuleId: string | null; listPriceSatang: number | null }[]> {
  if (!isId(tenantId) || !isId(shopOrderId)) return [];
  const o = await prisma.posOrder.findFirst({ where: { tenantId, shopOrderId }, select: { id: true } });
  if (!o) return [];
  const ls = await prisma.posOrderLine.findMany({ where: { tenantId, orderId: o.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return ls.filter((l) => l.productId).map((l) => ({ productId: l.productId!, unitPriceSatang: l.unitPriceSatang, priceSource: l.priceSource as PriceSource | null, priceRuleId: l.priceRuleId, listPriceSatang: l.listPriceSatang }));
}

// ═══════════════════ POS P2.7 ▸ สั่งล่วงหน้าจ่ายก่อน (QR_ORDER · S1–S6 · มติ 3 4 5 8 11 13 · CD-O9) ═══════════════════
//   ผู้เขียนเดียวของ PosOrder*/PosOrderLink ยังเป็นไฟล์นี้ (qr-order.ts ประสานงานเท่านั้น) · ใบขอรับเงิน = payment-intent.ts (ตัวช่วยในธุรกรรม)
//   วงจรเงิน: รับเข้า PENDING_PAYMENT + ใบ PENDING (expiresAt = payBy) → เงินเข้า (webhook Beam / ยืนยันเอง) → outbox intent_paid → onIntentPaid → PREPAID
//   (+ รับอัตโนมัติถ้าช่องทางตั้ง) → รับ = บิลใช้ใบในธุรกรรมรับ (acceptInTx) · เลยเวลาจ่าย = CANCELLED (event expired · PAYMENT_EXPIRED) + ใบ EXPIRED ·
//   เงินเข้าหลังยกเลิก = ไม่ฟื้น + ops ERROR pos.order.late_payment ครั้งเดียว · ปฏิเสธ PREPAID = ops ERROR pos.payment.refund_needed (คืนเงินนอกระบบ)
const PREORDER_UNPAID_MESSAGE = "ออเดอร์นี้ลูกค้ายังไม่ได้จ่ายเงิน (รอเงินเข้า) — รับได้หลังเงินเข้า";
const PREORDER_KEY_PREFIX = "qr:";
const OPS_LATE_PAYMENT = "pos.order.late_payment";
const OPS_REFUND_NEEDED = "pos.payment.refund_needed";
const PREORDER_EXPIRE_BATCH = 200;
const bahtText = (satang: number) => (satang / 100).toFixed(2);

/** บรรทัดที่ประตูสาธารณะคิดราคาแล้ว (ราคาช่องทาง QR_ORDER ณ ตอนสั่ง + ตัวเลือก · แช่แข็งลงบรรทัด · CD3) */
export type PreorderLine = {
  productId: string;
  name: string;
  qty: number;
  /** รวมส่วนต่างตัวเลือกแล้ว */
  unitPriceSatang: number;
  listPriceSatang: number | null;
  priceSource: PriceSource;
  priceRuleId: string | null;
  options: OrderLineOption[];
  note: string | null;
};
export type PreorderIngestInput = {
  channelId: string;
  lines: PreorderLine[];
  customer: { name: string; phone: string };
  /** คีย์จากหน้า (หนึ่งต่อตะกร้า) — เก็บเป็น "qr:<คีย์>" แยกจากคีย์ของพนักงาน */
  idempotencyKey: string;
  note: string | null;
  prepared: PreparedOrderIntent;
  chatTagNonce?: string | null; // POS P3.7 R8 fix2 F1: nonce ของแท็ก (ใช้ครั้งเดียว — มีบน PosOrderEvent received ของร้านนี้แล้ว = ไม่ผูกห้อง)
  chatConversationId?: string | null; // POS P3.7 R8 ประตู B: ห้องแชทจากแท็กที่ตรวจแล้ว (ไม่ใช่ห้องของร้านนี้ = ไม่ผูก · ไม่ปฏิเสธ) — รอยต่อบรรทัดเดียวไม่มีลูกศร (ไม่ปิดบล็อก P2.7)
};
export type PreorderIngestResult = { ok: true; orderId: string; publicToken: string; duplicated: boolean } | OrderRefusal;

/** ออเดอร์เดิมของคีย์นี้ (หน้าเดิมส่งซ้ำ) — ช่องทาง/สาขา/บรรทัดเดียวกัน = ผลเดิม · ต่าง = IDEMPOTENCY_CONFLICT · ไม่มี = null */
async function existingPreorder(db: Db, s: { tenantId: string; unitId: string }, channelId: string, key: string, lines: { productId: string; qty: number; options: OrderLineOption[] }[]): Promise<PreorderIngestResult | null> {
  const hit = await db.posOrder.findFirst({ where: { tenantId: s.tenantId, idempotencyKey: PREORDER_KEY_PREFIX + key } });
  if (!hit) return null;
  if (hit.channelId !== channelId || hit.unitId !== s.unitId || !hit.publicToken) return refuse("IDEMPOTENCY_CONFLICT");
  const stored = await db.posOrderLine.findMany({ where: { tenantId: s.tenantId, orderId: hit.id } });
  const want = orderLinesFingerprint(lines.map((l) => ({ productId: l.productId, name: null, qty: l.qty, unitPriceSatang: null, choiceIds: l.options.map((o) => o.choiceId) })));
  if (storedFingerprint(stored, false, new Set()) !== want) return refuse("IDEMPOTENCY_CONFLICT");
  return { ok: true, orderId: hit.id, publicToken: hit.publicToken, duplicated: true };
}

/** ตรวจคีย์ซ้ำก่อนเตรียมใบ (นอกธุรกรรม · ไม่ล็อก — ตรวจซ้ำในธุรกรรม) — หน้าเดิมส่งซ้ำไม่สร้าง charge ของ Beam ใบที่สอง */
export async function findPreorderByKey(s: { tenantId: string; unitId: string }, channelId: string, idempotencyKey: string, lines: { productId: string; qty: number; options: OrderLineOption[] }[]): Promise<PreorderIngestResult | null> {
  return existingPreorder(prisma, s, channelId, idempotencyKey, lines);
}

/**
 * S1 S2 S6 — รับออเดอร์สั่งล่วงหน้าในธุรกรรมของผู้เรียก (ประตูสาธารณะ · ไม่มีผู้กระทำ): ล็อกคีย์ → คำขอซ้ำ = ออเดอร์เดิม (duplicated) → ล็อกตัวนับรหัสของสาขา →
 * PosOrder NEW + PENDING_PAYMENT + PICKUP (payBy = receivedAt + qrExpiryMinutes · publicToken 12 ตัว · paymentIntentId) + บรรทัด + บันทึก received +
 * outbox pos.order.received (paymentState PENDING_PAYMENT) + ใบขอรับเงิน (createIntentForOrderInTx · expiresAt = payBy) · ไม่รับอัตโนมัติ · ไม่มีบิล/รอบครัว/สต็อก
 */
export async function ingestPreorderInTx(tx: Tx, scope: { tenantId: string; systemId: string; unitId: string }, input: PreorderIngestInput): Promise<PreorderIngestResult> {
  const s = scope;
  if (!isId(s.tenantId) || !isId(s.systemId) || !isId(s.unitId) || !isRecord(input) || !isId(input.channelId) || !Array.isArray(input.lines) || !input.lines.length) return refuse("VALIDATION");
  const key = PREORDER_KEY_PREFIX + input.idempotencyKey;
  if (!ORDER_KEY_RE.test(key)) return refuse("VALIDATION");
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`${s.tenantId}:posorder-key:${key}`}))) l`;
  const dup = await existingPreorder(tx, s, input.channelId, input.idempotencyKey, input.lines);
  if (dup) return dup;
  const ch = await tx.salesChannel.findFirst({ where: { id: input.channelId, tenantId: s.tenantId, unitId: s.unitId, archivedAt: null } });
  if (!ch) return refuse("CHANNEL_INVALID");
  // (POS P2.7 fix2) hunter note 1: ตรวจประตูซ้ำในธุรกรรม (ร้านปิด/พักช่องทางระหว่างลูกค้ากดสั่ง) — ปิด = CHANNEL_PAUSED (ประตูสาธารณะตอบ QR_CLOSED)
  if (!ch.active || isPaused(ch, new Date())) return refuse("CHANNEL_PAUSED");
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`${s.tenantId}:posorder-code:${s.unitId}`}))) l`;
  const now = new Date();
  const seq = (await tx.posOrder.count({ where: { tenantId: s.tenantId, unitId: s.unitId, receivedAt: { gte: posDayStart(now) } } })) + 1;
  const payBy = new Date(now.getTime() + input.prepared.qrExpiryMinutes * 60_000);
  const total = input.lines.reduce((t, l) => t + l.unitPriceSatang * l.qty, 0);
  const tagNonce = isId(input.chatConversationId) && typeof input.chatTagNonce === "string" && input.chatTagNonce ? input.chatTagNonce : null; // POS P3.7 R8 fix2 F1
  if (tagNonce) await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`${s.tenantId}:posorder-chattag:${tagNonce}`}))) l`; // POS P3.7 R8 fix2 F1: ใช้แท็กพร้อมกัน = ผู้ชนะคนเดียว
  const tagUsed = tagNonce ? !!(await tx.posOrderEvent.findFirst({ where: { tenantId: s.tenantId, type: "received", payload: { path: ["chatTagNonce"], equals: tagNonce } }, select: { id: true } })) : false; // POS P3.7 R8 fix2 F1
  const chatConv = isId(input.chatConversationId) && tagNonce && !tagUsed ? ((await tx.chatConversation.findFirst({ where: { id: input.chatConversationId, tenantId: s.tenantId }, select: { id: true } }))?.id ?? null) : null; // POS P3.7 R8 (fix2 F1: แท็กใช้แล้ว/ไม่มี nonce = ไม่ผูก)
  const order = await tx.posOrder.create({
    data: {
      tenantId: s.tenantId,
      systemId: s.systemId,
      unitId: s.unitId,
      channelId: ch.id,
      channelCode: ch.code,
      adapter: ch.adapter,
      code: orderCode(seq),
      idempotencyKey: key,
      status: "NEW",
      paymentState: "PENDING_PAYMENT",
      fulfilment: "PICKUP",
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      note: input.note,
      totalSatang: total,
      receivedAt: now,
      createdByUserId: null,
      version: 1,
      payBy,
      paymentIntentId: input.prepared.id,
      publicToken: newReceiptToken(),
      ...(chatConv ? { chatConversationId: chatConv } : {}), // POS P3.7 R8
    },
  });
  await tx.posOrderLine.createMany({
    data: input.lines.map((l, i) => ({
      tenantId: s.tenantId,
      systemId: s.systemId,
      orderId: order.id,
      productId: l.productId,
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      listPriceSatang: l.listPriceSatang,
      priceSource: l.priceSource,
      priceRuleId: l.priceRuleId,
      options: l.options as unknown as Prisma.InputJsonValue,
      note: l.note,
      lineTotalSatang: l.unitPriceSatang * l.qty,
      sortOrder: i,
    })),
  });
  await addEvent(tx, order, { type: "received", from: null, to: "NEW", actorUserId: null, payload: { source: "QR", paymentState: "PENDING_PAYMENT", ...(chatConv && tagNonce ? { chatTagNonce: tagNonce } : {}) }, at: now }); // POS P3.7 R8 fix2 F1: + nonce ของแท็กที่ผูกห้อง
  await emitOrderEvent(tx, order, "pos.order.received", "NEW");
  await createIntentForOrderInTx(tx, { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, orderId: order.id, amountSatang: total, expiresAt: payBy, prepared: input.prepared });
  return { ok: true, orderId: order.id, publicToken: order.publicToken!, duplicated: false };
}

/** หลัง commit ของการรับเข้า (ผู้เรียกประตูสาธารณะ) — audit ผู้กระทำระบบ + ระบายคิว · ซ้ำ = ไม่ทำอะไร */
export async function preorderIngested(tenantId: string, r: PreorderIngestResult): Promise<void> {
  if (!r.ok || r.duplicated) return;
  await writeAudit({ tenantId, actorId: null, actorType: "SYSTEM", action: "pos.order.received", targetType: "PosOrder", targetId: r.orderId, after: { orderId: r.orderId, channelCode: "QR_ORDER", adapter: "QR", paymentState: "PENDING_PAYMENT" } });
  scheduleDrain();
}

/** S5: ปฏิเสธ/ยกเลิกออเดอร์ที่เงินเข้าแล้ว (PREPAID · ยังไม่มีบิล) — ใบยัง PAID ไม่ถูกใช้ (หน้าขายใช้ได้ 24 ชม. หรือคืนเงินนอกระบบ) · ops ERROR ครั้งเดียวต่อการปิด */
async function prepaidRefundNeeded(o: PosOrder, how: "REJECTED" | "CANCELLED"): Promise<void> {
  await logOps("ERROR", "pos.payment", `${OPS_REFUND_NEEDED} — ออเดอร์จ่ายก่อนถูก${how === "REJECTED" ? "ปฏิเสธ" : "ยกเลิก"}หลังเงินเข้า ต้องคืนเงินลูกค้า`, {
    tenantId: o.tenantId,
    detail: `intent ${o.paymentIntentId ?? "-"} · ออเดอร์ ${o.code} (${o.id}) · ยอด ${bahtText(o.totalSatang)} · ${how}`,
  });
}

/** ปิดออเดอร์ที่เลยเวลาจ่าย 1 ใบ (ในธุรกรรม · ล็อกแถว): ใบเงินเข้าแล้ว = ไม่ปิด (ตัวรับ intent_paid ตัดสิน) · อื่น = ใบ EXPIRED + CANCELLED (event expired) */
async function expireOneInTx(tx: Tx, orderId: string, now: Date): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM "PosOrder" WHERE id = ${orderId} FOR UPDATE`;
  const o = await tx.posOrder.findUnique({ where: { id: orderId } });
  if (!o || o.status !== "NEW" || o.paymentState !== "PENDING_PAYMENT" || !o.payBy || o.payBy.getTime() > now.getTime()) return false;
  if (o.paymentIntentId) {
    const st = await expireOrderIntentInTx(tx, o.paymentIntentId);
    if (st === "PAID" || st === "CONSUMED") return false;
  }
  return closeExpiredInTx(tx, o, now);
}
/** (POS P2.7 fix2) hunter H4: แยกจาก expireOneInTx ให้ onIntentPaid ใช้ร่วม — CAS NEW → CANCELLED ของออเดอร์ที่เลยเวลาจ่าย (rejectReason PAYMENT_EXPIRED · event expired · outbox cancelled) — ผู้เรียกถือล็อกแถวแล้ว · ไม่แตะใบ */
async function closeExpiredInTx(tx: Tx, o: PosOrder, now: Date): Promise<boolean> {
  const n = await tx.posOrder.updateMany({ where: { id: o.id, tenantId: o.tenantId, status: "NEW", version: o.version }, data: { status: "CANCELLED", closedAt: now, rejectReason: "PAYMENT_EXPIRED", version: { increment: 1 } } });
  if (n.count !== 1) return false;
  await addEvent(tx, o, { type: "expired", from: "NEW", to: "CANCELLED", actorUserId: null, payload: { reason: "PAYMENT_EXPIRED", payBy: o.payBy ? o.payBy.toISOString() : null }, at: now });
  await emitOrderEvent(tx, await tx.posOrder.findUniqueOrThrow({ where: { id: o.id } }), "pos.order.cancelled", "CANCELLED");
  return true;
}

/** S2 — ตัวกวาดรายชั่วโมง (และผู้อ่านจอ 09 ต่อสาขา): ออเดอร์ PENDING_PAYMENT ที่ payBy ผ่านไปแล้ว → CANCELLED + ใบ EXPIRED · ทีละธุรกรรม · เล่นซ้ำ = 0 */
export async function expirePreorders(tenantId?: string, now: Date = new Date()): Promise<{ expired: number }> {
  return expireDuePreorders(typeof tenantId === "string" && tenantId ? { tenantId } : {}, now);
}
async function expireDuePreorders(where: { tenantId?: string; unitId?: string }, now: Date = new Date()): Promise<{ expired: number }> {
  let expired = 0;
  expired += await expireDuePaidPreorders(where, now); // POS P2.14 ▸ QR-1a: ตัวกวาด PREPAID อยู่ในบล็อก P2.14 ใต้บล็อก P2.7 (บรรทัดนี้ไม่ปิดบล็อก P2.7)
  try {
    const due = await prisma.posOrder.findMany({
      where: { ...where, status: "NEW", paymentState: "PENDING_PAYMENT", payBy: { lt: now } },
      orderBy: [{ payBy: "asc" }, { id: "asc" }],
      select: { id: true },
      take: PREORDER_EXPIRE_BATCH,
    });
    for (const d of due) {
      try {
        if (await runTx((tx) => expireOneInTx(tx, d.id, now))) expired++;
      } catch (e) {
        console.warn(`[pos/order] expirePreorders: ออเดอร์ ${d.id} ปิดไม่สำเร็จ — รอบถัดไปลองใหม่`, e);
      }
    }
  } catch (e) {
    console.warn("[pos/order] expirePreorders ล้ม (ไม่กระทบผู้เรียก)", e);
  }
  if (expired) scheduleDrain();
  return { expired };
}

/** S2 ขี้เกียจ (หน้าสถานะของลูกค้า): ออเดอร์นี้เลยเวลาจ่ายและยังรอเงิน = ปิดตอนนี้ (เขียนครั้งเดียวต่อการหมดเวลา) · ไม่เลย = ไม่เขียน */
export async function expirePreorderIfDue(tenantId: string, orderId: string, now: Date = new Date()): Promise<boolean> {
  if (!isId(tenantId) || !isId(orderId)) return false;
  const o = await prisma.posOrder.findFirst({ where: { id: orderId, tenantId }, select: { status: true, paymentState: true, payBy: true } });
  if (!o || o.status !== "NEW" || o.paymentState !== "PENDING_PAYMENT" || !o.payBy || o.payBy.getTime() > now.getTime()) return false;
  const done = await runTx((tx) => expireOneInTx(tx, orderId, now));
  if (done) scheduleDrain();
  return done;
}

/**
 * S3 — ลูกค้ากด "โอนแล้ว" (QR นิ่ง): บันทึก customer_paid_claim + customerClaimAt เท่านั้น (ไม่มีผลเงิน · จอ 09 ขึ้นชิป "ลูกค้าแจ้งโอนแล้ว · ตรวจยอด") ·
 * กดซ้ำภายใน 2 นาที = ไม่บันทึกซ้ำ · ปิดแล้ว/เลยเวลา = EXPIRED · เงินเข้าแล้ว = ok ไม่บันทึก
 */
export async function claimPreorderPaid(tenantId: string, orderId: string, now: Date = new Date()): Promise<{ ok: true; recorded: boolean } | { ok: false; reason: "EXPIRED" | "NOT_FOUND" }> {
  if (!isId(tenantId) || !isId(orderId)) return { ok: false, reason: "NOT_FOUND" };
  try {
    return await runTx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PosOrder" WHERE id = ${orderId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const o = await tx.posOrder.findFirst({ where: { id: orderId, tenantId } });
      if (!o) return { ok: false as const, reason: "NOT_FOUND" as const };
      if (o.status === "CANCELLED" || o.status === "REJECTED" || (o.paymentState === "PENDING_PAYMENT" && o.payBy && o.payBy.getTime() <= now.getTime())) return { ok: false as const, reason: "EXPIRED" as const };
      if (o.paymentState !== "PENDING_PAYMENT") return { ok: true as const, recorded: false };
      if (o.customerClaimAt && now.getTime() - o.customerClaimAt.getTime() < 2 * 60_000) return { ok: true as const, recorded: false };
      await touch(tx, o, { customerClaimAt: now }, { type: "customer_paid_claim", actorUserId: null, payload: { source: "QR" } });
      return { ok: true as const, recorded: true };
    });
  } catch (e) {
    if (e instanceof OrderRaced) return { ok: true, recorded: false };
    throw e;
  }
}

/**
 * S3 S5 — ตัวรับ outbox pos.payment.intent_paid (composition root · idempotent): ใบของออเดอร์ (orderId) เท่านั้น ·
 * ออเดอร์ NEW + PENDING_PAYMENT ⇒ PREPAID + paidAt + บันทึก paid (version +1) แล้วรับอัตโนมัติถ้าช่องทางตั้ง (ครัวพัก/คิวค้าง = held · บิลถูกปฏิเสธ = held sale_refused) ·
 * ออเดอร์ปิดแล้ว (หมดเวลา/ปฏิเสธ/ยกเลิก) + ใบ PAID ไม่ถูกใช้ ⇒ ไม่ฟื้น · ops ERROR pos.order.late_payment ครั้งเดียว (บันทึก late_payment บนออเดอร์ · ไม่เพิ่มเวอร์ชัน) ·
 * เล่นซ้ำ = ไม่มีผลเพิ่ม (ล็อกแถวออเดอร์ · ตัดสินจากสถานะจริง)
 */
export async function onIntentPaid(intentId: string): Promise<void> {
  if (!isPaymentIntentId(intentId)) return;
  const it = await prisma.posPaymentIntent.findUnique({ where: { id: intentId }, select: { id: true, tenantId: true, orderId: true, status: true, paidAt: true, confirmedVia: true, amountSatang: true } });
  if (!it?.orderId || it.status !== "PAID") return; // (POS P2.7 fix2) hunter H1c: เฉพาะใบที่ยัง PAID (ไม่ถูกใช้ที่อื่น)
  const orderId = it.orderId;
  type Out = { kind: "none" } | { kind: "prepaid"; order: PosOrder } | { kind: "late"; order: PosOrder };
  let out: Out;
  try {
    out = await runTx(async (tx): Promise<Out> => {
      await tx.$queryRaw`SELECT id FROM "PosOrder" WHERE id = ${orderId} AND "tenantId" = ${it.tenantId} FOR UPDATE`;
      const o = await tx.posOrder.findFirst({ where: { id: orderId, tenantId: it.tenantId } });
      if (!o || o.paymentIntentId !== intentId) return { kind: "none" };
      // (POS P2.7 fix2) hunter H4: เงินเข้าหลังเวลาจ่าย (ยังไม่มีใครอ่าน/กวาด) = ปิดออเดอร์ตอนนี้ (expired) แล้วไปทางเงินเข้าหลังปิด — ไม่ใช่ PREPAID
      let cur: PosOrder = o;
      if (o.status === "NEW" && o.paymentState === "PENDING_PAYMENT" && o.payBy && it.paidAt && it.paidAt.getTime() > o.payBy.getTime()) {
        if (await closeExpiredInTx(tx, o, new Date())) cur = await tx.posOrder.findUniqueOrThrow({ where: { id: o.id } });
      }
      if (cur.status === "NEW" && cur.paymentState === "PENDING_PAYMENT") {
        const after = await touch(tx, cur, { paymentState: "PREPAID", paidAt: it.paidAt ?? new Date() }, { type: "paid", actorUserId: null, payload: { intentId, via: it.confirmedVia ?? null } });
        return { kind: "prepaid", order: after };
      }
      if ((cur.status === "CANCELLED" || cur.status === "REJECTED") && cur.paymentState === "PENDING_PAYMENT") {
        const had = await tx.posOrderEvent.findFirst({ where: { tenantId: cur.tenantId, orderId: cur.id, type: "late_payment" }, select: { id: true } });
        if (had) return { kind: "none" };
        await addEvent(tx, cur, { type: "late_payment", from: cur.status, to: cur.status, actorUserId: null, payload: { intentId, amountSatang: it.amountSatang } });
        await addRefundNeededInTx(tx, cur, "late_payment"); // POS P2.14 ▸ QR-2 (Q4): ตัวบอกถาวรของหน้าสถานะ (ไม่ขึ้นกับสถานะใบในภายหลัง) ◂
        return { kind: "late", order: cur };
      }
      return { kind: "none" };
    });
  } catch (e) {
    if (e instanceof OrderRaced) return onIntentPaid(intentId);
    throw e;
  }
  if (out.kind === "late") {
    await logOps("ERROR", "pos.order", `${OPS_LATE_PAYMENT} — เงินเข้าหลังออเดอร์ถูกปิด (${out.order.status === "CANCELLED" ? "หมดเวลาจ่าย/ยกเลิก" : "ปฏิเสธ"}) ไม่ฟื้นออเดอร์ · ใช้เงินนี้ที่หน้าขายได้ใน 24 ชม. หรือคืนเงินลูกค้า`, {
      tenantId: out.order.tenantId,
      detail: `intent ${intentId} · ออเดอร์ ${out.order.code} (${out.order.id}) · ยอด ${bahtText(it.amountSatang)}`,
    });
    return;
  }
  if (out.kind !== "prepaid") return;
  scheduleDrain();
  await autoAcceptPrepaid(out.order);
}

/** รับอัตโนมัติของออเดอร์ที่เพิ่ง PREPAID (ช่องทาง active + autoAccept + ไม่พักรับ) — ล้ม = คงเป็น NEW/PREPAID ให้พนักงานรับ (ไม่ throw) */
async function autoAcceptPrepaid(o: PosOrder): Promise<void> {
  try {
    const ch = await prisma.salesChannel.findFirst({ where: { id: o.channelId, tenantId: o.tenantId, unitId: o.unitId, archivedAt: null } });
    if (!ch || !sweepLive(ch, new Date())) return;
    const s = { tenantId: o.tenantId, unitId: o.unitId };
    const prep = o.prepMinutes ?? ch.prepMinutes ?? ORDER_PREP_DEFAULT_MIN;
    let r: Awaited<ReturnType<typeof acceptInTx>> | "held" | "skip";
    try {
      r = await runTx(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`posorder-release:${s.tenantId}:${s.unitId}`}))) l`;
          const fresh = await tx.posOrder.findFirst({ where: { id: o.id, tenantId: o.tenantId } });
          if (!fresh || fresh.status !== "NEW" || fresh.paymentState !== "PREPAID") return "skip" as const;
          if (await autoAcceptBlockedInTx(tx, s)) {
            await addEvent(tx, fresh, { type: "held", from: "NEW", to: "NEW", actorUserId: null, payload: { reason: (await kitchenPausedForUnit(tx, s.tenantId, s.unitId)) ? "paused" : "backlog" } });
            return "held" as const;
          }
          return acceptInTx(tx, fresh, ch, { actorUserId: null, shiftId: null, prepMinutes: prep, auto: true });
        },
        { retryUnique: true },
      );
    } catch (e) {
      if (e instanceof OrderRaced) return;
      if (e instanceof OrderAbort) {
        await runTx((tx) => addEvent(tx, o, { type: "held", from: "NEW", to: "NEW", actorUserId: null, payload: { reason: "sale_refused" } })).catch(() => {});
        console.warn(`[pos/order] autoAcceptPrepaid: ออเดอร์ ${o.id} บิลถูกปฏิเสธ (${e.refusal.code}) — คงเป็นออเดอร์ใหม่ (จ่ายแล้ว) ให้พนักงานรับเอง`);
        return;
      }
      throw e;
    }
    if (r === "skip" || r === "held") return;
    await afterSaleCommit(o.tenantId, o.unitId, r.saleId, r.saleLines);
    await ORDER_ADAPTERS[r.order.adapter]?.accept?.({ orderId: o.id, externalRef: o.externalRef, prepMinutes: prep });
    await writeAudit({ tenantId: o.tenantId, actorId: null, actorType: "SYSTEM", action: "pos.order.accept", targetType: "PosOrder", targetId: o.id, after: { orderId: o.id, auto: true, prepaid: true, saleId: r.saleId } });
    scheduleDrain();
  } catch (e) {
    console.warn(`[pos/order] autoAcceptPrepaid: ออเดอร์ ${o.id} รับอัตโนมัติไม่สำเร็จ — คงไว้ให้พนักงานรับ`, e);
  }
}

// ── ลิงก์สั่งล่วงหน้า (PosOrderLink · /q/<token> · มติ 11 · CD-O9) — สิทธิ์ pos.channel.manage · ACTIVE ได้ 1 ต่อสาขา (partial unique + ล็อกต่อสาขา) ──
const LINK_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LINK_TOKEN_LEN = 16;
function newLinkToken(): string {
  const b = randomBytes(LINK_TOKEN_LEN);
  let out = "";
  for (let i = 0; i < LINK_TOKEN_LEN; i++) out += LINK_CROCKFORD[b[i]! & 31];
  return out;
}
export type OrderLinkView = { id: string; token: string; status: "ACTIVE" | "REVOKED"; unitId: string; rotatedAt: string | null; createdAt: string };
export type OrderLinkResult = { ok: true; link: OrderLinkView | null } | OrderRefusal;
const linkView = (r: { id: string; token: string; status: string; unitId: string; rotatedAt: Date | null; createdAt: Date }): OrderLinkView => ({
  id: r.id,
  token: r.token,
  status: r.status === "ACTIVE" ? "ACTIVE" : "REVOKED",
  unitId: r.unitId,
  rotatedAt: iso(r.rotatedAt),
  createdAt: r.createdAt.toISOString(),
});
async function linkScope(ctx: RegisterCtx, actor: RegisterActor, input: unknown): Promise<Scope | OrderRefusal> {
  const s = await scopeOf(prisma, ctx, actor, "read");
  if (isRefusal(s)) return s;
  if (!can(s.actor, "pos.channel.manage", s.unitId)) return refuse("PERMISSION_DENIED", "ลิงก์สั่งออนไลน์ต้องมีสิทธิ์จัดการช่องทางขาย — ให้เจ้าของร้าน/ผู้จัดการทำรายการนี้");
  if (input !== undefined && input !== null && (!isRecord(input) || Object.keys(input).length > 0)) return refuse("VALIDATION");
  return s;
}
const lockLinks = (tx: Tx, s: { tenantId: string; unitId: string }) => tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`posorder-link:${s.tenantId}:${s.unitId}`}))) l`;
const activeLink = (db: Db, s: { tenantId: string; systemId: string; unitId: string }) =>
  db.posOrderLink.findFirst({ where: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, status: "ACTIVE" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });

/** ลิงก์ที่ใช้อยู่ของสาขา (null = ยังไม่มี) */
export async function getOrderLink(ctx: RegisterCtx, actor: RegisterActor, input: unknown = {}): Promise<OrderLinkResult> {
  return guard("getOrderLink", async (): Promise<OrderLinkResult> => {
    const s = await linkScope(ctx, actor, input);
    if (isRefusal(s)) return s;
    const r = await activeLink(prisma, s);
    return { ok: true, link: r ? linkView(r) : null };
  });
}
/** สร้างลิงก์ (มีอยู่แล้ว = ลิงก์เดิม · idempotent) */
export async function createOrderLink(ctx: RegisterCtx, actor: RegisterActor, input: unknown = {}): Promise<OrderLinkResult> {
  return guard("createOrderLink", async (): Promise<OrderLinkResult> => {
    const s = await linkScope(ctx, actor, input);
    if (isRefusal(s)) return s;
    const out = await runTx(async (tx) => {
      await lockLinks(tx, s);
      const ex = await activeLink(tx, s);
      if (ex) return { row: ex, created: false };
      return { row: await tx.posOrderLink.create({ data: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, token: newLinkToken(), status: "ACTIVE", createdByUserId: s.actor.userId } }), created: true };
    }, { retryUnique: true });
    if (out.created) await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.order.link_create", targetType: "PosOrderLink", targetId: out.row.id, after: { unitId: s.unitId } });
    return { ok: true, link: linkView(out.row) };
  });
}
/** เปลี่ยนลิงก์: ลิงก์เดิม REVOKED (+ rotatedAt) · ลิงก์ใหม่ ACTIVE — QR/ลิงก์เก่าที่แจกไปใช้ไม่ได้ทันที (TOKEN_INVALID) */
export async function rotateOrderLink(ctx: RegisterCtx, actor: RegisterActor, input: unknown = {}): Promise<OrderLinkResult> {
  return guard("rotateOrderLink", async (): Promise<OrderLinkResult> => {
    const s = await linkScope(ctx, actor, input);
    if (isRefusal(s)) return s;
    const row = await runTx(async (tx) => {
      await lockLinks(tx, s);
      const now = new Date();
      await tx.posOrderLink.updateMany({ where: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, status: "ACTIVE" }, data: { status: "REVOKED", rotatedAt: now } });
      return tx.posOrderLink.create({ data: { tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId, token: newLinkToken(), status: "ACTIVE", createdByUserId: s.actor.userId } });
    }, { retryUnique: true });
    await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.order.link_rotate", targetType: "PosOrderLink", targetId: row.id, after: { unitId: s.unitId } });
    return { ok: true, link: linkView(row) };
  });
}
/** ปิดลิงก์ (ไม่มีลิงก์ใช้อยู่ = ok link null) — สั่งออนไลน์ของสาขานี้ปิดจนกว่าจะสร้างใหม่ */
export async function revokeOrderLink(ctx: RegisterCtx, actor: RegisterActor, input: unknown = {}): Promise<OrderLinkResult> {
  return guard("revokeOrderLink", async (): Promise<OrderLinkResult> => {
    const s = await linkScope(ctx, actor, input);
    if (isRefusal(s)) return s;
    const row = await runTx(async (tx) => {
      await lockLinks(tx, s);
      const ex = await activeLink(tx, s);
      if (!ex) return null;
      await tx.posOrderLink.updateMany({ where: { id: ex.id, tenantId: s.tenantId, status: "ACTIVE" }, data: { status: "REVOKED", rotatedAt: new Date() } });
      return tx.posOrderLink.findUniqueOrThrow({ where: { id: ex.id } });
    });
    if (row) await writeAudit({ tenantId: s.tenantId, actorId: s.actor.userId, action: "pos.order.link_revoke", targetType: "PosOrderLink", targetId: row.id, after: { unitId: s.unitId } });
    return { ok: true, link: row ? linkView(row) : null };
  });
}
// ◂ POS P2.7

// ═══════════════════ POS P2.14 ▸ QR-1a / QR-2 (fix3 U1 CD-U1: ย้ายออกจากบล็อก P2.7 ทั้งก้อน · ไม่เปลี่ยนพฤติกรรม) — ตัวกวาดออเดอร์จ่ายก่อนที่เกินหน้าต่างใบ + ตัวบอก refund_needed ═══════════════════
// POS P2.14 ▸ QR-1a มติ 9 (Q1 Q3): ออเดอร์ NEW + PREPAID ที่ไม่มีใครรับจนเงินเข้าเกินหน้าต่างใช้ใบ (24 ชม.) — รับไม่ได้อีกแล้ว (INTENT_EXPIRED ค้าง) ⇒
//   ปิด CANCELLED (ไม่มี enum ใหม่) + บันทึก expired_paid + refund_needed (ตัวบอกถาวรของหน้าสถานะ) + outbox pos.order.cancelled + ops ERROR pos.payment.refund_needed
//   ครั้งเดียวต่อการปิด (ล็อกแถว · CAS version) · ใบยัง PAID ไม่ถูกใช้ (ร้านคืนเงินนอกระบบ) · เล่นซ้ำ = ไม่มีผล ◂
async function expirePaidOneInTx(tx: Tx, orderId: string, now: Date): Promise<PosOrder | null> {
  await tx.$queryRaw`SELECT id FROM "PosOrder" WHERE id = ${orderId} FOR UPDATE`;
  const o = await tx.posOrder.findUnique({ where: { id: orderId } });
  if (!o || o.status !== "NEW" || o.paymentState !== "PREPAID" || !o.paidAt || now.getTime() - o.paidAt.getTime() < PAYMENT_INTENT_CONSUME_WINDOW_MS) return null;
  const n = await tx.posOrder.updateMany({ where: { id: o.id, tenantId: o.tenantId, status: "NEW", paymentState: "PREPAID", version: o.version }, data: { status: "CANCELLED", closedAt: now, rejectReason: "PREPAID_NOT_ACCEPTED", version: { increment: 1 } } });
  if (n.count !== 1) return null;
  await addEvent(tx, o, { type: "expired_paid", from: "NEW", to: "CANCELLED", actorUserId: null, payload: { reason: "PREPAID_NOT_ACCEPTED", intentId: o.paymentIntentId, paidAt: o.paidAt.toISOString() }, at: now });
  await addRefundNeededInTx(tx, o, "expired_paid", now);
  const after = await tx.posOrder.findUniqueOrThrow({ where: { id: o.id } });
  await emitOrderEvent(tx, after, "pos.order.cancelled", "CANCELLED");
  return after;
}
/** POS P2.14 ▸ QR-2 (Q4): ตัวบอกถาวร "ต้องคืนเงินลูกค้า" = PosOrderEvent refund_needed ครั้งเดียวต่อออเดอร์ (type เป็นข้อความอิสระ · ไม่มี migration) — หน้าสถานะอ่านแถวนี้ ◂ */
async function addRefundNeededInTx(tx: Tx, o: PosOrder, cause: "expired_paid" | "late_payment" | "rejected_prepaid", now: Date = new Date()): Promise<boolean> {
  const had = await tx.posOrderEvent.findFirst({ where: { tenantId: o.tenantId, orderId: o.id, type: "refund_needed" }, select: { id: true } });
  if (had) return false;
  await addEvent(tx, o, { type: "refund_needed", from: o.status, to: o.status === "NEW" ? "CANCELLED" : o.status, actorUserId: null, payload: { cause, intentId: o.paymentIntentId, amountSatang: o.totalSatang }, at: now });
  return true;
}
/** POS P2.14 ▸ QR-2 (Q4): เงินเข้าหลังใบของออเดอร์ถูกยกเลิก (payment-intent INTENT_CANCELLED) — บันทึก refund_needed ครั้งเดียว (ล็อกแถวออเดอร์) · ไม่ throw ◂ */
export async function recordOrderRefundNeeded(tenantId: string, orderId: string, intentId: string): Promise<boolean> {
  if (!isId(tenantId) || !isId(orderId)) return false;
  return runTx(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PosOrder" WHERE id = ${orderId} AND "tenantId" = ${tenantId} FOR UPDATE`;
    const o = await tx.posOrder.findFirst({ where: { id: orderId, tenantId } });
    if (!o || o.paymentIntentId !== intentId || (o.status !== "REJECTED" && o.status !== "CANCELLED")) return false;
    return addRefundNeededInTx(tx, o, "late_payment");
  });
}
async function expireDuePaidPreorders(where: { tenantId?: string; unitId?: string }, now: Date): Promise<number> {
  let closed = 0;
  try {
    const due = await prisma.posOrder.findMany({
      where: { ...where, status: "NEW", paymentState: "PREPAID", paidAt: { lte: new Date(now.getTime() - PAYMENT_INTENT_CONSUME_WINDOW_MS) } },
      orderBy: [{ paidAt: "asc" }, { id: "asc" }],
      take: PREORDER_EXPIRE_BATCH,
    });
    for (const d of due) {
      try {
        const o = await runTx((tx) => expirePaidOneInTx(tx, d.id, now));
        if (!o) continue;
        closed++;
        await logOps("ERROR", "pos.payment", `${OPS_REFUND_NEEDED} — ออเดอร์จ่ายก่อนไม่มีใครรับจนเงินเข้าเกิน 24 ชม. (ใช้เงินที่หน้าขายไม่ได้แล้ว) ปิดออเดอร์ ต้องคืนเงินลูกค้า`, {
          tenantId: o.tenantId,
          detail: `intent ${o.paymentIntentId ?? "-"} · ออเดอร์ ${o.code} (${o.id}) · ยอด ${bahtText(o.totalSatang)} · EXPIRED_PAID`,
        }).catch(() => undefined);
      } catch (e) {
        console.warn(`[pos/order] expirePreorders: ออเดอร์จ่ายก่อน ${d.id} ปิดไม่สำเร็จ — รอบถัดไปลองใหม่`, e);
      }
    }
  } catch (e) {
    console.warn("[pos/order] expirePreorders (PREPAID) ล้ม (ไม่กระทบผู้เรียก)", e);
  }
  return closed;
}
// ◂ POS P2.14 QR-1a / QR-2

// ═══════════════════ POS P3.7 ▸ ประตู A: ขอชำระในแชท (R7 · มติผู้คุม 3 · CD-P5) ═══════════════════
//   ผู้เขียนเดียวของ PosOrder* ยังเป็นไฟล์นี้ — ผู้ประสาน (เตรียมใบนอกธุรกรรม · ส่งข้อความ) อยู่ที่ pos/chat-order.ts + composition root
//   ออเดอร์ช่องทาง CHAT · NEW · UNPAID|PAY_ON_PICKUP · ผูกห้องแชท ⇒ (ล็อกแถว) PENDING_PAYMENT + payBy (ตอนนี้ + อายุ QR) + publicToken (ตัวสร้างของใบเสร็จออนไลน์)
//   + paymentIntentId (createIntentForOrderInTx · expiresAt = payBy) + PosOrderEvent payment_requested (version +1) — จากนี้ = วงจร P2.7 เดิมทั้งหมด
//   (เงินเข้า → PREPAID → รับ = บิลใช้ใบ · เลยเวลา → CANCELLED) · ขอซ้ำ = ใบ/โทเคนเดิม (duplicated · ไม่เขียน) · ปฏิเสธ = คืน (ไม่ throw · ไม่เขียน)
export type ChatPaymentRefusalCode = "ORDER_NOT_FOUND" | "ORDER_STATE_INVALID" | "ORDER_STATE_CHANGED" | "NO_CHAT_LINK";
export type ChatPaymentInTxResult = { ok: true; duplicated: boolean; order: PosOrder; intentId: string } | { ok: false; code: ChatPaymentRefusalCode } | { ok: false; needsIntent: true };
export async function requestChatPaymentInTx(
  tx: Tx,
  s: { tenantId: string; systemId: string; unitId: string },
  input: { orderId: string; prepared: PreparedOrderIntent | null; actorUserId?: string | null; now?: Date },
): Promise<ChatPaymentInTxResult> {
  if (!isId(input.orderId)) return { ok: false, code: "ORDER_NOT_FOUND" };
  await tx.$queryRaw`SELECT id FROM "PosOrder" WHERE id = ${input.orderId} AND "tenantId" = ${s.tenantId} FOR UPDATE`;
  const o = await tx.posOrder.findFirst({ where: { id: input.orderId, tenantId: s.tenantId, systemId: s.systemId, unitId: s.unitId } });
  if (!o) return { ok: false, code: "ORDER_NOT_FOUND" };
  // ขอซ้ำ (ประตูนี้เคยเปิดรอชำระแล้ว) = ใบ/โทเคนเดิม — เฉพาะออเดอร์ที่ยัง NEW (fix round 2 F2: ปฏิเสธ/ยกเลิก/หมดเวลาแล้ว = ORDER_STATE_CHANGED)
  if (o.paymentState === "PENDING_PAYMENT" && o.paymentIntentId) {
    const asked = await tx.posOrderEvent.findFirst({ where: { tenantId: s.tenantId, orderId: o.id, type: "payment_requested" }, select: { id: true } });
    if (asked && o.status === "NEW") return { ok: true, duplicated: true, order: o, intentId: o.paymentIntentId };
    if (asked) return { ok: false, code: "ORDER_STATE_CHANGED" };
  }
  if (o.channelCode !== "CHAT" || o.adapter !== "CHAT" || o.status !== "NEW" || (o.paymentState !== "UNPAID" && o.paymentState !== "PAY_ON_PICKUP")) return { ok: false, code: "ORDER_STATE_INVALID" };
  if (!o.chatConversationId) return { ok: false, code: "NO_CHAT_LINK" };
  // ผ่านทุกด่านแต่ยังไม่มีใบที่เตรียมไว้ = ผู้ประสานไปเตรียมใบ (นอกธุรกรรม) แล้วเรียกใหม่ · ยอดเปลี่ยนระหว่างนั้น = ORDER_STATE_CHANGED
  if (!input.prepared) return { ok: false, needsIntent: true };
  if (input.prepared.amountSatang !== o.totalSatang) return { ok: false, code: "ORDER_STATE_CHANGED" };
  const now = input.now ?? new Date();
  const payBy = new Date(now.getTime() + input.prepared.qrExpiryMinutes * 60_000);
  const it = await createIntentForOrderInTx(tx, { tenantId: s.tenantId, systemId: o.systemId, unitId: o.unitId, orderId: o.id, amountSatang: o.totalSatang, expiresAt: payBy, prepared: input.prepared });
  if (it.id !== input.prepared.id) return { ok: false, code: "ORDER_STATE_INVALID" };
  const after = await touch(
    tx,
    o,
    { paymentState: "PENDING_PAYMENT", payBy, paymentIntentId: it.id, publicToken: o.publicToken ?? newReceiptToken() },
    { type: "payment_requested", actorUserId: input.actorUserId ?? null, payload: { source: "CHAT", intentId: it.id, payBy: payBy.toISOString(), from: o.paymentState } },
  );
  return { ok: true, duplicated: false, order: after, intentId: it.id };
}
// ◂ POS P3.7
