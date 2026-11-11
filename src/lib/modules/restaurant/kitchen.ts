// kitchen.ts — POS P2.6 จอครัวใหม่: ฟังก์ชันของโมดูลร้านอาหารที่ POS (pos/kds.ts) เรียกผ่าน facade `restaurant/index.ts` (มติ 1 · names table แถว 16)
//
// 🔴 โมดูลร้านอาหารเป็นผู้เขียนตาราง Restaurant*/KdsStation/RestaurantSetting ที่เดียว — POS เรียกผ่าน `import("@/lib/modules/restaurant")` เท่านั้น
// 🔴 ไฟล์ใหม่ (ไม่แตะ order.ts/kds.ts เดิม: ลายเซ็น export ตรึงโดย P2.4 L3 · ทางร้อน createOrder/cancelOrderItem ตรึง S2.42 13/6)
// 🔴 ทุกฟังก์ชันรับ client (prisma ของ POS หรือ tx ของผู้เรียก) + tenantId/unitId ชัด ⇒ ทุกคำสั่งกรองร้าน+สาขา · ไม่ import prisma ดิบ (F5.1)
// 🔴 ชื่อ *InTx = ทำงานในธุรกรรมของผู้เรียก · ไม่มี createSale · ไม่ปล่อย outbox event · ไม่เขียน MenuItem (ตัวนับเมนูอยู่ที่ catalog-legacy · F15.1)
// 🔴 รอบครัวของหน้าขาย/ออนไลน์ = เงินไม่แตะ: ราคา 0 · saleId/settledAt null (ทำอาหาร ≠ เก็บเงิน · CD2 — ลิงก์บิลอยู่ที่ RestaurantOrder.posSaleId)
// สัญญา: ledger/pos-briefs/pos-brief-P2.6.md §2 R1–R6 R11–R13 · §9 · §10 · ledger/wo-notes/pos-P2.6-oracle.md

import type { KdsItemStatus, Prisma, PrismaClient, RestOrderStatus } from "@prisma/client";
import { bizDateBkk } from "./scope";
import "./scope";

type Db = Prisma.TransactionClient | PrismaClient;
type Tx = Prisma.TransactionClient;
type Scope = { tenantId: string; unitId: string };

const REF_MAX = 40;

// ═══════════ สถานี · ค่าตั้ง (อ่าน) ═══════════

export type KitchenStationRow = { id: string; name: string; nameEn: string | null; sortOrder: number };
// POS P2.14 ▸ UI-8 (U1): อ่านอย่างเดียว — บรรทัดชุดนี้มีบรรทัดที่เข้าครัวได้ไหม (กติกาเดียวกับ createKitchenRoundInTx: เมนูของสาขา → สถานีของเมนู ·
//   ไม่ใช่เมนู → stationHint · สถานีต้องใช้งานอยู่) — จอปิดบิลใช้ตัดสินว่า "ใบครัวไม่ออก" ควรเตือนไหม ◂
export async function kitchenRoutesForPos(db: Db, s: Scope, lines: { productId: string | null; stationHint: string | null }[]): Promise<boolean> {
  if (!lines.length) return false;
  const stations = new Set((await db.kdsStation.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, archivedAt: null }, select: { id: true } })).map((x) => x.id));
  if (!stations.size) return false;
  const pids = [...new Set(lines.map((l) => l.productId).filter((x): x is string => !!x))];
  const menuOf = new Map<string, string>();
  if (pids.length) {
    const rows = await db.menuItem.findMany({ where: { tenantId: s.tenantId, unitId: s.unitId, posProductId: { in: pids }, archivedAt: null }, select: { stationId: true, posProductId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    for (const m of rows) if (m.posProductId && !menuOf.has(m.posProductId)) menuOf.set(m.posProductId, m.stationId);
  }
  return lines.some((l) => {
    const st = l.productId ? menuOf.get(l.productId) : undefined;
    if (st !== undefined) return stations.has(st);
    return !!l.stationHint && stations.has(l.stationHint);
  });
}
// ◂

/** สถานีที่ใช้งาน (ไม่เก็บถาวร) ของสาขา — ลำดับ sortOrder, createdAt */ // POS P2.14 ▸ fix1 F11 · fix2 G7: JSDoc ติดกับ kitchenStationsForPos (บล็อก UI-8 อยู่ข้างบน) ◂
export async function kitchenStationsForPos(db: Db, s: Scope): Promise<KitchenStationRow[]> {
  return db.kdsStation.findMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, nameEn: true, sortOrder: true },
  });
}

export type KitchenSettingView = { kitchenPaused: boolean; kitchenPausedNote: string | null; kdsCriticalMins: number; autoAcceptMaxOpen: number | null };
/** ค่าตั้งครัวของสาขา (ไม่มีแถว = ค่าปริยายของ schema · ไม่สร้างแถว) */
export async function kitchenSettingForPos(db: Db, s: Scope): Promise<KitchenSettingView> {
  const r = await db.restaurantSetting.findFirst({
    where: { tenantId: s.tenantId, unitId: s.unitId },
    select: { kitchenPaused: true, kitchenPausedNote: true, kdsCriticalMins: true, autoAcceptMaxOpen: true },
  });
  return r ?? { kitchenPaused: false, kitchenPausedNote: null, kdsCriticalMins: 15, autoAcceptMaxOpen: null };
}

/** เพดานครัวค้างของการรับอัตโนมัติ (R13 · CD 7) — upsert แถวค่าตั้งของสาขา (คอลัมน์เดียว) */
export async function kitchenSetAutoAcceptMaxInTx(tx: Tx, s: Scope, maxOpen: number | null): Promise<void> {
  await tx.restaurantSetting.upsert({
    where: { unitId: s.unitId },
    create: { tenantId: s.tenantId, unitId: s.unitId, autoAcceptMaxOpen: maxOpen },
    update: { autoAcceptMaxOpen: maxOpen },
  });
}

// POS P5.2 ▸ D11 (ruling 4): พักครัว/เลิกพักจากจอครัวของ POS — kitchenPauseAction ของหน้าร้านอาหารเดิมปิดบนสาขาที่ผูก POS (POS_LINKED) ·
//   upsert คอลัมน์พักครัวของแถวค่าตั้งสาขา (คอลัมน์เดียวกับ menu.setKitchenPause) ◂
export async function kitchenSetPauseInTx(tx: Tx, s: Scope, paused: boolean, note: string | null): Promise<void> {
  await tx.restaurantSetting.upsert({
    where: { unitId: s.unitId },
    create: { tenantId: s.tenantId, unitId: s.unitId, kitchenPaused: paused, kitchenPausedNote: note },
    update: { kitchenPaused: paused, kitchenPausedNote: note },
  });
}

// ═══════════ สร้างรอบครัว (R3 R4 · CD 2 3 · มติ 3 4) ═══════════

export type KitchenRoundLine = {
  productId: string | null;
  name: string;
  qty: number;
  options: { choiceId: string | null; groupName: string; choiceName: string }[];
  note: string | null;
  /** สถานีของบรรทัดที่ไม่ใช่เมนู (PosProduct.stationId · หรือของแม่) — ต้องเป็นสถานีที่ใช้งานของสาขานี้ ไม่งั้นไม่เข้าครัว */
  stationHint: string | null;
};
export type KitchenRoundInput = Scope & {
  posSaleId?: string | null;
  posOrderId?: string | null;
  type: "TAKEAWAY" | "PICKUP" | "DELIVERY";
  placedByUserId: string | null;
  channelCode?: string | null;
  channelName?: string | null;
  externalRef?: string | null;
  targetMinutes?: number | null;
  guestName?: string | null;
  note?: string | null;
  lines: KitchenRoundLine[];
};
export type KitchenRoundResult = {
  created: boolean;
  orderId: string | null;
  dailyNo: number | null;
  reason: "EXISTS" | "NO_STATIONS" | "NO_KITCHEN_LINES" | null;
  /** บรรทัดเมนูที่เข้าครัว (สำหรับหักตัวนับเมนูแบบไม่ติดลบที่ catalog-legacy — ผู้เรียกทำในธุรกรรมเดียวกัน) */
  menuLines: { menuItemId: string; qty: number }[];
};

/**
 * รอบครัวหนึ่งรอบต่อบิล/ออเดอร์ (ในธุรกรรมของผู้เรียก): ล็อก advisory ต่อบิล/ออเดอร์ → มีแล้ว = created:false (กันซ้ำชั้นที่สอง = partial unique) →
 * สถานีที่ใช้งานของสาขา (0 = ไม่มีครัว) → บรรทัดเมนู = MenuItem ของสาขาที่ผูก productId (สถานีของเมนู) · บรรทัดอื่น = stationHint ที่เป็นสถานีของสาขา ·
 * ไม่เข้าครัวเลย = ไม่มีรอบ → เลขรายวัน → RestaurantOrder (CONFIRMED · ลิงก์ช่องทาง) + รายการ NEW (ราคา 0 · saleId null) + สำเนาตัวเลือก
 */
export async function createKitchenRoundInTx(tx: Tx, input: KitchenRoundInput): Promise<KitchenRoundResult> {
  const { tenantId, unitId } = input;
  const link = input.posOrderId ? { posOrderId: input.posOrderId } : input.posSaleId ? { posSaleId: input.posSaleId } : null;
  if (!link) throw new Error("[restaurant/kitchen] createKitchenRoundInTx: ต้องมี posSaleId หรือ posOrderId");
  const key = "posOrderId" in link ? `o:${link.posOrderId}` : `s:${link.posSaleId}`;
  await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:kds-round:${key}`}))) l`;
  const none = (reason: KitchenRoundResult["reason"], orderId: string | null = null, dailyNo: number | null = null): KitchenRoundResult => ({ created: false, orderId, dailyNo, reason, menuLines: [] });
  const existing = await tx.restaurantOrder.findFirst({ where: { tenantId, ...link }, select: { id: true, dailyNo: true } });
  if (existing) return none("EXISTS", existing.id, existing.dailyNo);
  const stations = new Set((await tx.kdsStation.findMany({ where: { tenantId, unitId, archivedAt: null }, select: { id: true } })).map((x) => x.id));
  if (!stations.size) return none("NO_STATIONS");
  const pids = [...new Set(input.lines.map((l) => l.productId).filter((x): x is string => !!x))];
  const menuOf = new Map<string, { id: string; stationId: string; counted: boolean }>();
  if (pids.length) {
    const rows = await tx.menuItem.findMany({
      where: { tenantId, unitId, posProductId: { in: pids }, archivedAt: null },
      select: { id: true, stationId: true, posProductId: true, stockQty: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const m of rows) if (m.posProductId && !menuOf.has(m.posProductId)) menuOf.set(m.posProductId, { id: m.id, stationId: m.stationId, counted: m.stockQty !== null }); // เก่าสุดก่อน (คงที่ · แบบ createOrderInTx)
  }
  const routed = input.lines.flatMap((l) => {
    const m = l.productId ? menuOf.get(l.productId) : undefined;
    if (m) return stations.has(m.stationId) ? [{ l, menuItemId: m.id as string | null, stationId: m.stationId, counted: m.counted }] : [];
    return l.stationHint && stations.has(l.stationHint) ? [{ l, menuItemId: null, stationId: l.stationHint, counted: false }] : [];
  });
  if (!routed.length) return none("NO_KITCHEN_LINES");
  // fix1 F1 (รีวิว R1 · มติ fix1-1): ล็อกแถวเมนูที่นับสต็อก (เรียง id · ล็อกอย่างเดียว ไม่เขียน) "ก่อน" ตัวนับรายวัน — ลำดับเดียวกับ writeOrderTx เดิม
  //   (MenuItem → ตัวนับ) ⇒ รอบครัวที่หักตัวนับทีหลัง (catalog-legacy) ไม่สลับลำดับล็อกกับ createOrder/รอบโต๊ะ/QR (ไม่มี 40P01)
  const counted = [...new Set(routed.filter((r) => r.counted).map((r) => r.menuItemId as string))].sort();
  if (counted.length) await tx.$queryRaw`SELECT id FROM "MenuItem" WHERE id = ANY(${counted}::text[]) AND "tenantId" = ${tenantId} ORDER BY id FOR UPDATE`;
  const bizDate = bizDateBkk();
  const counter = await tx.restaurantDailyCounter.upsert({
    where: { unitId_bizDate: { unitId, bizDate } },
    create: { tenantId, unitId, bizDate, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  const ord = await tx.restaurantOrder.create({
    data: {
      tenantId,
      unitId,
      type: input.type,
      status: "CONFIRMED",
      sessionId: null,
      bizDate,
      dailyNo: counter.seq,
      placedByUserId: input.placedByUserId,
      guestName: input.guestName?.slice(0, 120) ?? null,
      note: input.note?.slice(0, 500) ?? null,
      pickupStatus: null,
      ...link,
      channelCode: input.channelCode ?? null,
      channelName: input.channelName?.slice(0, 120) ?? null,
      externalRef: input.externalRef ? input.externalRef.slice(0, REF_MAX) : null,
      targetMinutes: input.targetMinutes ?? null,
    },
    select: { id: true, dailyNo: true },
  });
  for (const r of routed) {
    const item = await tx.restaurantOrderItem.create({
      data: {
        tenantId,
        unitId,
        orderId: ord.id,
        menuItemId: r.menuItemId,
        productId: r.l.productId,
        stationId: r.stationId,
        nameSnapshot: r.l.name.slice(0, 200),
        unitPrice: 0,
        optionsTotal: 0,
        qty: r.l.qty,
        lineTotal: 0,
        note: r.l.note?.trim() || null,
        kdsStatus: "NEW",
      },
      select: { id: true },
    });
    if (r.l.options.length)
      await tx.restaurantOrderItemOption.createMany({
        data: r.l.options.map((o) => ({ tenantId, unitId, orderItemId: item.id, choiceId: o.choiceId, groupSnapshot: o.groupName, choiceSnapshot: o.choiceName, priceDelta: 0 })),
      });
  }
  const byMenu = new Map<string, number>();
  for (const r of routed) if (r.menuItemId) byMenu.set(r.menuItemId, (byMenu.get(r.menuItemId) ?? 0) + r.l.qty);
  return { created: true, orderId: ord.id, dailyNo: ord.dailyNo, reason: null, menuLines: [...byMenu.entries()].map(([menuItemId, qty]) => ({ menuItemId, qty })) };
}

// ═══════════ ตั๋ว (อ่าน) ═══════════

const ITEM_SELECT = {
  id: true,
  orderId: true,
  menuItemId: true,
  productId: true,
  stationId: true,
  nameSnapshot: true,
  qty: true,
  note: true,
  kdsStatus: true,
  isRush: true,
  cookingAt: true,
  readyAt: true,
  servedAt: true,
  cancelledAt: true,
  createdAt: true,
  options: { select: { groupSnapshot: true, choiceSnapshot: true }, orderBy: [{ id: "asc" as const }] },
  menuItem: { select: { prepMinutes: true } },
} satisfies Prisma.RestaurantOrderItemSelect;
const ROUND_SELECT = {
  id: true,
  type: true,
  status: true,
  sessionId: true,
  bizDate: true,
  dailyNo: true,
  guestName: true,
  note: true,
  isRush: true,
  placedByUserId: true,
  posSaleId: true,
  posOrderId: true,
  channelCode: true,
  channelName: true,
  externalRef: true,
  targetMinutes: true,
  createdAt: true,
  session: { select: { table: { select: { name: true } } } },
} satisfies Prisma.RestaurantOrderSelect;
export type KitchenItemRow = Prisma.RestaurantOrderItemGetPayload<{ select: typeof ITEM_SELECT }>;
export type KitchenRoundRow = Prisma.RestaurantOrderGetPayload<{ select: typeof ROUND_SELECT }> & { items: KitchenItemRow[] };

/** รอบของสาขาที่เข้าคิวครัวในวันธุรกิจนั้น (CONFIRMED/COMPLETED) พร้อมรายการทุกสถานี — ผู้อ่านบอร์ด/expo/คิวค้าง */
export async function kitchenRoundsForPos(db: Db, s: Scope & { bizDate: string }): Promise<KitchenRoundRow[]> {
  return db.restaurantOrder.findMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, bizDate: s.bizDate, status: { in: ["CONFIRMED", "COMPLETED"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { ...ROUND_SELECT, items: { select: ITEM_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
}

/** รอบเดียวของสาขานี้ (ร้าน/สาขาอื่น/ไม่มี = null) */
export async function kitchenRoundForPos(db: Db, s: Scope & { orderId: string }): Promise<KitchenRoundRow | null> {
  return db.restaurantOrder.findFirst({
    where: { id: s.orderId, tenantId: s.tenantId, unitId: s.unitId },
    select: { ...ROUND_SELECT, items: { select: ITEM_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
}

/** รายการเดียวของสาขานี้ → {orderId, stationId} (ร้าน/สาขาอื่น/ไม่มี = null) */
export async function kitchenItemForPos(db: Db, s: Scope & { itemId: string }): Promise<{ id: string; orderId: string; stationId: string; kdsStatus: KdsItemStatus } | null> {
  return db.restaurantOrderItem.findFirst({ where: { id: s.itemId, tenantId: s.tenantId, unitId: s.unitId }, select: { id: true, orderId: true, stationId: true, kdsStatus: true } });
}

/** รอบของออเดอร์ออนไลน์ (posOrderId) ของร้าน — ความคืบหน้า x/y ของจอ 09 (R11) */
export async function kitchenRoundsOfOrdersForPos(db: Db, s: { tenantId: string; unitId?: string; posOrderIds: string[] }): Promise<{ id: string; posOrderId: string | null; items: { kdsStatus: KdsItemStatus }[] }[]> {
  if (!s.posOrderIds.length) return [];
  return db.restaurantOrder.findMany({
    where: { tenantId: s.tenantId, ...(s.unitId ? { unitId: s.unitId } : {}), posOrderId: { in: s.posOrderIds } },
    select: { id: true, posOrderId: true, items: { select: { kdsStatus: true } } },
  });
}

/** เมนูของสาขาที่ขายไม่ได้ตอนนี้ (86 มือ หรือ ตัวนับ ≤ 0 · กติกาเดียวกับ orderingMenu) — บอร์ด "ของหมด (86)" (R7) */
export async function kitchenSoldOutMenusForPos(db: Db, s: Scope): Promise<{ posProductId: string | null; name: string; isOutOfStock: boolean; stockQty: number | null; updatedAt: Date }[]> {
  return db.menuItem.findMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, archivedAt: null, OR: [{ isOutOfStock: true }, { stockQty: { lte: 0 } }] },
    select: { posProductId: true, name: true, isOutOfStock: true, stockQty: true, updatedAt: true },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
  });
}

// ═══════════ เดินตั๋ว (R6 · CD4 · มติ 13) ═══════════

export type KitchenMoveInput = {
  orderId: string;
  /** ตั๋ว = รอบ × สถานี (ไม่ส่ง = ทั้งรอบ ใช้กับ itemId) */
  stationId?: string;
  itemId?: string;
  from: KdsItemStatus[];
  to: KdsItemStatus;
  /** ดึงกลับ (READY|SERVED → COOKING): ล้าง readyAt/servedAt · รอบ COMPLETED → CONFIRMED */
  recall?: boolean;
  now: Date;
};
/**
 * เลื่อนสถานะแบบมีเงื่อนไขในคำสั่งเดียว (`UPDATE … WHERE kdsStatus IN (from)`) ⇒ แตะพร้อมกัน = มีผลครั้งเดียว · ไม่ล็อกรายการที่ชำระแล้ว (cooking ≠ billing) ·
 * CANCELLED ไม่ขยับ (ไม่อยู่ใน from) · หลังเลื่อน: ทุกรายการ SERVED/CANCELLED ⇒ รอบ COMPLETED (กติกา maybeCompleteOrder เดิม) · ดึงกลับ ⇒ CONFIRMED
 */
export async function kitchenMoveInTx(tx: Tx, s: Scope, m: KitchenMoveInput): Promise<{ changed: number; roundStatus: RestOrderStatus | null }> {
  // fix1 H3/F2 (รีวิว R1 · ล่า H3 · มติ addendum): ล็อกแถวรอบก่อน (ลำดับ รอบ → รายการ → PosOrder) ⇒ การเลื่อนพร้อมกันหลายสถานีของรอบเดียวเรียงกัน ·
  //   ทุกการอ่านหลังจากนี้เห็นสถานีอื่นที่ commit แล้ว (READY ของออนไลน์ไม่ค้าง PREPARING · เสิร์ฟครบพร้อมกันได้ COMPLETED)
  await lockRoundInTx(tx, s.tenantId, m.orderId);
  const data: Prisma.RestaurantOrderItemUpdateManyMutationInput =
    m.recall
      ? { kdsStatus: m.to, readyAt: null, servedAt: null }
      : m.to === "COOKING"
        ? { kdsStatus: "COOKING", cookingAt: m.now }
        : m.to === "READY"
          ? { kdsStatus: "READY", readyAt: m.now }
          : m.to === "SERVED"
            ? { kdsStatus: "SERVED", servedAt: m.now }
            : { kdsStatus: m.to };
  const r = await tx.restaurantOrderItem.updateMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, orderId: m.orderId, ...(m.stationId ? { stationId: m.stationId } : {}), ...(m.itemId ? { id: m.itemId } : {}), kdsStatus: { in: m.from } },
    data,
  });
  const roundStatus = await settleRoundStatus(tx, s, m.orderId, !!m.recall && r.count > 0);
  return { changed: r.count, roundStatus };
}

/** fix1 H3 + fix2 G4: ล็อกแถวรอบ (RestaurantOrder FOR NO KEY UPDATE) — ผู้เขียนรายการครัวทุกตัวของไฟล์นี้ถือก่อนแตะรายการ */
async function lockRoundInTx(tx: Tx, tenantId: string, orderId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "RestaurantOrder" WHERE id = ${orderId} AND "tenantId" = ${tenantId} FOR NO KEY UPDATE`; // fix2 G4: ไม่บล็อก KEY SHARE ของ FK
}
/** P2.6U มติ 15 (R3 H1): ล็อกแถวรอบให้ผู้เรียกฝั่ง POS ถือก่อนอ่านสถานะต้นทาง (kdsRecall) — ลำดับ รอบ → รายการ → PosOrder เดิม · ล็อกซ้ำในธุรกรรมเดียวกัน = ไม่รอ */
export async function kitchenLockRoundInTx(tx: Tx, s: Scope, orderId: string): Promise<void> {
  await lockRoundInTx(tx, s.tenantId, orderId);
}

/** สถานะรอบหลังเลื่อนรายการ: ทุกรายการ SERVED/CANCELLED (มีอย่างน้อย 1 SERVED) = COMPLETED · ดึงกลับจาก COMPLETED = CONFIRMED · ยกเลิกหมด = CANCELLED */
async function settleRoundStatus(tx: Tx, s: Scope, orderId: string, reopened: boolean): Promise<RestOrderStatus | null> {
  const ord = await tx.restaurantOrder.findFirst({ where: { id: orderId, tenantId: s.tenantId, unitId: s.unitId }, select: { status: true } });
  if (!ord) return null;
  if (ord.status !== "CONFIRMED" && ord.status !== "COMPLETED") return ord.status;
  const items = await tx.restaurantOrderItem.findMany({ where: { orderId, tenantId: s.tenantId, unitId: s.unitId }, select: { kdsStatus: true } });
  let want: RestOrderStatus = ord.status;
  if (items.length && items.every((i) => i.kdsStatus === "CANCELLED")) want = "CANCELLED";
  else if (items.length && items.every((i) => i.kdsStatus === "SERVED" || i.kdsStatus === "CANCELLED")) want = "COMPLETED";
  else if (reopened || ord.status === "COMPLETED") want = "CONFIRMED";
  if (want !== ord.status) await tx.restaurantOrder.updateMany({ where: { id: orderId, tenantId: s.tenantId, unitId: s.unitId, status: ord.status }, data: { status: want } });
  return want;
}

/** เร่งทั้งรอบ (กติกา setOrderRush เดิม: รอบ + รายการ NEW/COOKING) */
export async function kitchenRushInTx(tx: Tx, s: Scope, i: { orderId: string; rush: boolean }): Promise<void> {
  await tx.restaurantOrder.updateMany({ where: { id: i.orderId, tenantId: s.tenantId, unitId: s.unitId }, data: { isRush: i.rush } });
  await tx.restaurantOrderItem.updateMany({ where: { orderId: i.orderId, tenantId: s.tenantId, unitId: s.unitId, kdsStatus: { in: ["NEW", "COOKING"] } }, data: { isRush: i.rush } });
}

/**
 * ยกเลิกรายการครัวที่ยังไม่เสิร์ฟของรอบที่ผูกบิล/ออเดอร์ (R11 R12 · CD 18) — ล็อกรายการ FOR UPDATE แล้วเปลี่ยนเฉพาะที่ยัง NEW/COOKING/READY ·
 * SERVED คงเดิม · เล่นซ้ำ = ไม่มีอะไรให้ยกเลิก (คืน []) · คืนรายการที่ถูกยกเลิก (ผู้เรียกคืนตัวนับเมนูเฉพาะที่ยัง NEW)
 */
export async function kitchenCancelInTx(
  tx: Tx,
  s: { tenantId: string; posSaleId?: string | null; posOrderId?: string | null; reason: string; byUserId?: string | null; now: Date },
): Promise<{ orderId: string | null; unitId: string | null; cancelled: { itemId: string; menuItemId: string | null; qty: number; wasNew: boolean; stockTaken: number | null }[] }> {
  const link = s.posOrderId ? { posOrderId: s.posOrderId } : s.posSaleId ? { posSaleId: s.posSaleId } : null;
  if (!link) return { orderId: null, unitId: null, cancelled: [] };
  const ord = await tx.restaurantOrder.findFirst({ where: { tenantId: s.tenantId, ...link }, select: { id: true, unitId: true } });
  if (!ord) return { orderId: null, unitId: null, cancelled: [] };
  await lockRoundInTx(tx, s.tenantId, ord.id); // fix1 H3: รอบ → รายการ (ลำดับเดียวกับ kitchenMoveInTx)
  const rows = await tx.$queryRaw<{ id: string; menuItemId: string | null; qty: number; kdsStatus: string; stockTaken: number | null }[]>`
    SELECT id, "menuItemId", qty, "kdsStatus"::text AS "kdsStatus", "stockTaken" FROM "RestaurantOrderItem"
    WHERE "orderId" = ${ord.id} AND "tenantId" = ${s.tenantId} AND "kdsStatus"::text IN ('NEW', 'COOKING', 'READY')
    ORDER BY id FOR UPDATE`;
  if (rows.length) {
    await tx.restaurantOrderItem.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, tenantId: s.tenantId, kdsStatus: { in: ["NEW", "COOKING", "READY"] } },
      data: { kdsStatus: "CANCELLED", cancelledAt: s.now, cancelReason: s.reason.slice(0, 200), cancelledByUserId: s.byUserId ?? null },
    });
    await settleRoundStatus(tx, { tenantId: s.tenantId, unitId: ord.unitId }, ord.id, false);
  }
  return { orderId: ord.id, unitId: ord.unitId, cancelled: rows.map((r) => ({ itemId: r.id, menuItemId: r.menuItemId, qty: r.qty, wasNew: r.kdsStatus === "NEW", stockTaken: r.stockTaken })) };
}

/**
 * fix1 H1 (มติ addendum): บันทึกจำนวนที่ตัวนับเมนูถูกหักจริงลงรายการของรอบ (ตัวนับหักแบบไม่ติดลบ — อาจได้น้อยกว่า qty) ·
 * แบ่งให้รายการของเมนูเดียวกันตามลำดับสร้าง (รายการละไม่เกิน qty) · ผู้เรียกทำในธุรกรรมเดียวกับการหัก
 */
export async function kitchenSetStockTakenInTx(tx: Tx, s: Scope, i: { orderId: string; taken: { menuItemId: string; taken: number }[] }): Promise<void> {
  if (!i.taken.length) return;
  const items = await tx.restaurantOrderItem.findMany({
    where: { tenantId: s.tenantId, unitId: s.unitId, orderId: i.orderId, menuItemId: { in: i.taken.map((t) => t.menuItemId) } },
    select: { id: true, menuItemId: true, qty: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  for (const t of i.taken) {
    let left = t.taken;
    for (const it of items.filter((x) => x.menuItemId === t.menuItemId)) {
      const mine = Math.min(left, it.qty);
      left -= mine;
      await tx.restaurantOrderItem.updateMany({ where: { id: it.id, tenantId: s.tenantId, unitId: s.unitId }, data: { stockTaken: mine } });
    }
  }
}
