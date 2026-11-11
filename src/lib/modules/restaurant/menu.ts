import { prisma, tenantDb } from "@/lib/core/db";
import type { MenuItemStatus, Prisma } from "@prisma/client";
// POS P1.1b ▸ คำสั่งเขียนเมนู/หมวด/กลุ่มตัวเลือก ย้ายไป catalog-legacy (ผู้เขียนแคตตาล็อกคนที่สอง · G1/G2) — ตรวจ/ข้อความ/รูปผลลัพธ์อยู่ที่นี่ตามเดิม
//   ทุกประตูที่เขียนเปิดธุรกรรมเอง แล้วส่ง tx ให้ catalog-legacy (ตารางเดิม + PosProduct ในธุรกรรมเดียว) · error = ธุรกรรมจบ ไม่จับต่อ (G11)
import * as legacy from "@/lib/modules/pos/catalog-legacy";
import "./scope";

// ───────────────────────── Settings ─────────────────────────
// 1:1 ต่อ unit — get-or-create ค่าเริ่มต้น
export async function getSetting(tenantId: string, unitId: string) {
  const existing = await prisma.restaurantSetting.findUnique({ where: { unitId } });
  if (existing) return existing;
  return prisma.restaurantSetting.create({ data: { tenantId, unitId } });
}

export async function updateSetting(
  tenantId: string,
  unitId: string,
  data: {
    serviceChargeBps?: number;
    requireApproval?: boolean;
    serviceHours?: unknown;
    specialClosures?: unknown;
    lastOrderMins?: number;
    kdsWarnMins?: number;
    kdsCriticalMins?: number;
    pickupEnabled?: boolean;
    pickupSlotMins?: number;
    pickupLeadMins?: number;
  },
) {
  await getSetting(tenantId, unitId); // ensure row
  const db = tenantDb({ tenantId, unitId });
  const patch: Prisma.RestaurantSettingUpdateInput = {};
  if (data.serviceChargeBps !== undefined) patch.serviceChargeBps = data.serviceChargeBps;
  if (data.requireApproval !== undefined) patch.requireApproval = data.requireApproval;
  if (data.lastOrderMins !== undefined) patch.lastOrderMins = data.lastOrderMins;
  if (data.kdsWarnMins !== undefined) patch.kdsWarnMins = data.kdsWarnMins;
  if (data.kdsCriticalMins !== undefined) patch.kdsCriticalMins = data.kdsCriticalMins;
  if (data.pickupEnabled !== undefined) patch.pickupEnabled = data.pickupEnabled;
  if (data.pickupSlotMins !== undefined) patch.pickupSlotMins = data.pickupSlotMins;
  if (data.pickupLeadMins !== undefined) patch.pickupLeadMins = data.pickupLeadMins;
  if (data.serviceHours !== undefined) patch.serviceHours = data.serviceHours as Prisma.InputJsonValue;
  if (data.specialClosures !== undefined) patch.specialClosures = data.specialClosures as Prisma.InputJsonValue;
  return db.restaurantSetting.update({ where: { unitId }, data: patch });
}

export async function setKitchenPause(
  tenantId: string,
  unitId: string,
  paused: boolean,
  note?: string,
) {
  await getSetting(tenantId, unitId);
  const db = tenantDb({ tenantId, unitId });
  return db.restaurantSetting.update({
    where: { unitId },
    data: { kitchenPaused: paused, kitchenPausedNote: note || null },
  });
}

// ───────────────────────── KDS stations ─────────────────────────
// seed 2 สถานีเริ่มต้น (idempotent) — เรียกตอนเข้าหน้า setup ครั้งแรก
export async function ensureDefaultStations(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  const count = await db.kdsStation.count({ where: { archivedAt: null } });
  if (count > 0) return;
  await db.kdsStation.create({ data: { tenantId, unitId, name: "ครัว", nameEn: "Kitchen", sortOrder: 0 } });
  await db.kdsStation.create({ data: { tenantId, unitId, name: "เครื่องดื่ม", nameEn: "Drinks", sortOrder: 1 } });
}

export async function listStations(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.kdsStation.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createStation(tenantId: string, unitId: string, name: string) {
  const db = tenantDb({ tenantId, unitId });
  const dup = await db.kdsStation.findFirst({ where: { name, archivedAt: null } });
  if (dup) return { ok: false as const, reason: "มีสถานีชื่อนี้แล้ว" };
  await db.kdsStation.create({ data: { tenantId, unitId, name } });
  return { ok: true as const };
}

// ───────────────────────── Categories ─────────────────────────
export async function listCategories(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.menuCategory.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { items: { where: { archivedAt: null } } } } },
  });
}

export async function createCategory(
  tenantId: string,
  unitId: string,
  input: { name: string; nameEn?: string; availableFrom?: string; availableTo?: string },
  actorUserId?: string, // POS P1.1b R2 F9: ผู้กระทำจริง → audit ของแคตตาล็อก (ไม่บังคับ — ผู้เรียกเดิมไม่ต้องแก้)
) {
  const db = tenantDb({ tenantId, unitId });
  const dup = await db.menuCategory.findFirst({ where: { name: input.name, archivedAt: null } });
  if (dup) return { ok: false as const, reason: "มีหมวดชื่อนี้แล้ว" };
  const cat = await prisma.$transaction((tx) =>
    legacy.createMenuCategory(tx, { tenantId, unitId }, {
      name: input.name,
      nameEn: input.nameEn || null,
      availableFrom: input.availableFrom || null,
      availableTo: input.availableTo || null,
    }, actorUserId),
  );
  return { ok: true as const, id: cat.id };
}

export async function archiveCategory(tenantId: string, unitId: string, id: string, actorUserId?: string) {
  const db = tenantDb({ tenantId, unitId });
  const items = await db.menuItem.count({ where: { categoryId: id, archivedAt: null } });
  if (items > 0) return { ok: false as const, reason: "ยังมีเมนูในหมวดนี้ — ย้าย/ลบเมนูก่อน" };
  await prisma.$transaction((tx) => legacy.archiveMenuCategory(tx, { tenantId, unitId }, id, actorUserId));
  return { ok: true as const };
}

// ───────────────────────── Option groups ─────────────────────────
export async function listOptionGroups(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.menuOptionGroup.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      choices: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } },
      _count: { select: { items: true } },
    },
  });
}

export async function createOptionGroup(
  tenantId: string,
  unitId: string,
  input: {
    name: string;
    nameEn?: string;
    minSelect: number;
    maxSelect: number;
    choices: { name: string; priceDelta: number; isDefault?: boolean }[];
  },
) {
  const db = tenantDb({ tenantId, unitId });
  const dup = await db.menuOptionGroup.findFirst({ where: { name: input.name, archivedAt: null } });
  if (dup) return { ok: false as const, reason: "มีกลุ่มตัวเลือกชื่อนี้แล้ว" };
  const group = await prisma.$transaction((tx) =>
    legacy.createMenuOptionGroup(
      tx,
      { tenantId, unitId },
      { name: input.name, nameEn: input.nameEn || null, minSelect: input.minSelect, maxSelect: Math.max(input.maxSelect, input.minSelect || 1) },
      input.choices.map((c) => ({ name: c.name, priceDelta: c.priceDelta, isDefault: !!c.isDefault })),
    ),
  );
  return { ok: true as const, id: group.id };
}

export async function archiveOptionGroup(tenantId: string, unitId: string, id: string) {
  await prisma.$transaction((tx) => legacy.archiveMenuOptionGroup(tx, { tenantId, unitId }, id));
  return { ok: true as const };
}

export async function setChoiceStock(
  tenantId: string,
  unitId: string,
  choiceId: string,
  isOutOfStock: boolean,
) {
  await prisma.$transaction((tx) => legacy.setMenuChoiceStock(tx, { tenantId, unitId }, choiceId, isOutOfStock));
}

// ───────────────────────── Items ─────────────────────────
export async function listItems(
  tenantId: string,
  unitId: string,
  opts?: { categoryId?: string; includeArchived?: boolean },
) {
  const db = tenantDb({ tenantId, unitId });
  return db.menuItem.findMany({
    where: {
      ...(opts?.includeArchived ? {} : { archivedAt: null }),
      ...(opts?.categoryId ? { categoryId: opts.categoryId } : {}),
    },
    orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      category: true,
      station: true,
      optionGroups: { include: { group: { include: { choices: { where: { archivedAt: null } } } } } },
    },
  });
}

export async function getItem(tenantId: string, unitId: string, id: string) {
  const db = tenantDb({ tenantId, unitId });
  return db.menuItem.findFirst({
    where: { id },
    include: {
      category: true,
      station: true,
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { group: { include: { choices: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } } },
      },
    },
  });
}

export async function createItem(
  tenantId: string,
  unitId: string,
  input: {
    categoryId: string;
    stationId: string;
    name: string;
    nameEn?: string;
    description?: string;
    basePrice: number; // สตางค์
    prepMinutes?: number;
    tags?: string[];
    images?: string[];
    optionGroupIds?: string[];
    stockQty?: number | null;
    dailyStockQty?: number | null;
  },
  actorUserId?: string, // POS P1.1b R2 F9: ผู้กระทำจริง → audit ของแคตตาล็อก (ไม่บังคับ — ผู้เรียกเดิมไม่ต้องแก้)
) {
  const db = tenantDb({ tenantId, unitId });
  const cat = await db.menuCategory.findFirst({ where: { id: input.categoryId, archivedAt: null } });
  if (!cat) return { ok: false as const, reason: "ไม่พบหมวด" };
  const station = await db.kdsStation.findFirst({ where: { id: input.stationId, archivedAt: null } });
  if (!station) return { ok: false as const, reason: "ไม่พบสถานี KDS" };
  const item = await prisma.$transaction((tx) =>
    legacy.createMenuItem(
      tx,
      { tenantId, unitId },
      {
      categoryId: input.categoryId,
      stationId: input.stationId,
      name: input.name,
      nameEn: input.nameEn || null,
      description: input.description || null,
      basePrice: input.basePrice,
      prepMinutes: input.prepMinutes ?? null,
      tags: input.tags ?? [],
      images: input.images ?? [],
      stockQty: input.stockQty ?? null,
      dailyStockQty: input.dailyStockQty ?? null,
      },
      (input.optionGroupIds ?? []).map((groupId, i) => ({ groupId, sortOrder: i })),
      actorUserId,
    ),
  );
  return { ok: true as const, id: item.id };
}

export async function updateItem(
  tenantId: string,
  unitId: string,
  id: string,
  data: {
    categoryId?: string;
    stationId?: string;
    name?: string;
    nameEn?: string | null;
    description?: string | null;
    basePrice?: number;
    prepMinutes?: number | null;
    tags?: string[];
    status?: MenuItemStatus;
  },
  actorUserId?: string, // POS P1.1b R2 F9: ผู้กระทำจริง → audit ของแคตตาล็อก (ไม่บังคับ — ผู้เรียกเดิมไม่ต้องแก้)
) {
  return prisma.$transaction((tx) => legacy.updateMenuItem(tx, { tenantId, unitId }, id, data, actorUserId));
}

export async function setItemOptionGroups(
  tenantId: string,
  unitId: string,
  itemId: string,
  groupIds: string[],
  actorUserId?: string, // POS P1.1b R2 F9: ผู้กระทำจริง → audit ของแคตตาล็อก (ไม่บังคับ — ผู้เรียกเดิมไม่ต้องแก้)
) {
  await prisma.$transaction((tx) => legacy.setMenuItemOptionGroups(tx, { tenantId, unitId }, itemId, groupIds, actorUserId));
}

export async function duplicateItem(tenantId: string, unitId: string, id: string, actorUserId?: string) {
  const item = await getItem(tenantId, unitId, id);
  if (!item) return { ok: false as const, reason: "ไม่พบเมนู" };
  const copy = await prisma.$transaction((tx) =>
    legacy.createMenuItem(
      tx,
      { tenantId, unitId },
      {
      categoryId: item.categoryId,
      stationId: item.stationId,
      name: `${item.name} (สำเนา)`,
      nameEn: item.nameEn,
      description: item.description,
      basePrice: item.basePrice,
      prepMinutes: item.prepMinutes,
      tags: item.tags as string[],
      images: item.images as string[],
      },
      item.optionGroups.map((og) => ({ groupId: og.groupId, sortOrder: og.sortOrder })),
      actorUserId,
    ),
  );
  return { ok: true as const, id: copy.id };
}

export async function archiveItem(tenantId: string, unitId: string, id: string, actorUserId?: string) {
  await prisma.$transaction((tx) => legacy.archiveMenuItem(tx, { tenantId, unitId }, id, actorUserId));
}

// ───────────────────────── 86 / สต็อก ─────────────────────────
export async function setItemStock(
  tenantId: string,
  unitId: string,
  id: string,
  data: { isOutOfStock?: boolean; stockQty?: number | null; dailyStockQty?: number | null },
  actorUserId?: string, // POS P1.1b R2 F9: ผู้กระทำจริง → audit ของแคตตาล็อก (ไม่บังคับ — ผู้เรียกเดิมไม่ต้องแก้)
) {
  return prisma.$transaction((tx) => legacy.setMenuItemStock(tx, { tenantId, unitId }, id, data, actorUserId));
}

// เมนูรูปแบบ lite สำหรับหน้าคีย์ออเดอร์ (staff/public) — serializable ส่งให้ client ได้
export type OrderingMenuChoice = { id: string; name: string; priceDelta: number; isOutOfStock: boolean };
export type OrderingMenuGroup = { groupId: string; name: string; minSelect: number; maxSelect: number; choices: OrderingMenuChoice[] };
export type OrderingMenuItem = { id: string; name: string; basePrice: number; isOutOfStock: boolean; groups: OrderingMenuGroup[] };
export type OrderingMenuCat = { id: string; name: string; items: OrderingMenuItem[] };

export async function orderingMenu(
  tenantId: string,
  unitId: string,
  opts?: { forPublic?: boolean },
): Promise<OrderingMenuCat[]> {
  const db = tenantDb({ tenantId, unitId });
  const [cats, items] = await Promise.all([
    db.menuCategory.findMany({
      where: { archivedAt: null, ...(opts?.forPublic ? { isVisible: true } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.menuItem.findMany({
      where: {
        archivedAt: null,
        status: opts?.forPublic ? "ACTIVE" : { not: "ARCHIVED" },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          include: { group: { include: { choices: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } } },
        },
      },
    }),
  ]);
  const byCat = new Map<string, OrderingMenuItem[]>();
  for (const it of items) {
    const arr = byCat.get(it.categoryId) ?? [];
    arr.push({
      id: it.id,
      name: it.name,
      basePrice: it.basePrice,
      isOutOfStock: it.isOutOfStock || (it.stockQty != null && it.stockQty <= 0),
      groups: it.optionGroups.map((link) => ({
        groupId: link.group.id,
        name: link.group.name,
        minSelect: link.group.minSelect,
        maxSelect: link.group.maxSelect,
        choices: link.group.choices.map((c) => ({ id: c.id, name: c.name, priceDelta: c.priceDelta, isOutOfStock: c.isOutOfStock })),
      })),
    });
    byCat.set(it.categoryId, arr);
  }
  return cats.map((c) => ({ id: c.id, name: c.name, items: byCat.get(c.id) ?? [] })).filter((c) => c.items.length > 0);
}

// reset stockQty จาก dailyStockQty (เรียกตอนร้านเปิด / cron รายวัน — P1 เรียกจาก setup manual ได้)
export async function resetDailyStock(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  const items = await db.menuItem.findMany({
    where: { archivedAt: null, dailyStockQty: { not: null } },
    select: { id: true, dailyStockQty: true },
  });
  // ทีละเมนู (ขอบธุรกรรมเดิม = คำสั่งเดี่ยวต่อเมนู) · ตัวนับสด — ไม่ mirror (G8)
  for (const it of items) {
    await prisma.$transaction((tx) => legacy.resetMenuItemDailyStock(tx, { tenantId, unitId }, it));
  }
  return items.length;
}
