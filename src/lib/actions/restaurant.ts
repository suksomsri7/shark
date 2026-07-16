"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { KdsItemStatus, TableStatus } from "@prisma/client";
import { systemForUnit } from "@/lib/modules/system/service";
import * as member from "@/lib/modules/member/service";
import * as menu from "@/lib/modules/restaurant/menu";
import * as table from "@/lib/modules/restaurant/table";
import * as order from "@/lib/modules/restaurant/order";
import * as kds from "@/lib/modules/restaurant/kds";
import type { CartLine } from "@/lib/modules/restaurant/order";

function base(unitSlug: string) {
  return `/app/u/${unitSlug}/restaurant`;
}

// บริบทหน่วย + ตรวจสิทธิ์ (OWNER/MANAGER ผ่าน · STAFF ตาม permission)
async function ctx(unitSlug: string, action: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "restaurant", action, unitId: unit.id },
  );
  return { tenantId: auth.active.tenantId, unitId: unit.id, userId: auth.user.id };
}

// ───────────────────────── Settings ─────────────────────────
export async function updateSettingAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.setting.update");
  const num = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? undefined : Number(v);
  };
  await menu.updateSetting(tenantId, unitId, {
    serviceChargeBps: num("serviceChargePct") != null ? Math.round((num("serviceChargePct") as number) * 100) : undefined,
    requireApproval: formData.get("requireApproval") === "on",
    lastOrderMins: num("lastOrderMins"),
    kdsWarnMins: num("kdsWarnMins"),
    kdsCriticalMins: num("kdsCriticalMins"),
    pickupEnabled: formData.get("pickupEnabled") === "on",
  });
  const hours = formData.get("serviceHours");
  if (typeof hours === "string" && hours.trim()) {
    try {
      await menu.updateSetting(tenantId, unitId, { serviceHours: JSON.parse(hours) });
    } catch {
      /* ignore bad json */
    }
  }
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function kitchenPauseAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.kitchen.pause");
  const paused = formData.get("paused") === "true";
  const note = String(formData.get("note") ?? "") || undefined;
  await menu.setKitchenPause(tenantId, unitId, paused, note);
  revalidatePath(base(unitSlug));
  revalidatePath(`${base(unitSlug)}/setup`);
}

// ───────────────────────── Stations ─────────────────────────
export async function createStationAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.station.create");
  const name = String(formData.get("name") ?? "").trim();
  if (name) await menu.createStation(tenantId, unitId, name);
  revalidatePath(`${base(unitSlug)}/setup`);
}

// ───────────────────────── Categories ─────────────────────────
export async function createCategoryAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.category.create");
  const name = String(formData.get("name") ?? "").trim();
  const nameEn = String(formData.get("nameEn") ?? "").trim() || undefined;
  if (name) await menu.createCategory(tenantId, unitId, { name, nameEn });
  revalidatePath(`${base(unitSlug)}/menu`);
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function archiveCategoryAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.category.archive");
  await menu.archiveCategory(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/menu`);
}

// ───────────────────────── Option groups ─────────────────────────
export async function createOptionGroupAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.optionGroup.create");
  const name = String(formData.get("name") ?? "").trim();
  const minSelect = Number(formData.get("minSelect") ?? 0) || 0;
  const maxSelect = Number(formData.get("maxSelect") ?? 1) || 1;
  // choices: บรรทัดละ "ชื่อ|ราคาเพิ่ม(บาท)"
  const raw = String(formData.get("choices") ?? "");
  const choices = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [n, p] = l.split("|");
      return { name: n.trim(), priceDelta: Math.round((Number(p) || 0) * 100) };
    });
  if (name && choices.length > 0) {
    await menu.createOptionGroup(tenantId, unitId, { name, minSelect, maxSelect, choices });
  }
  revalidatePath(`${base(unitSlug)}/menu/options`);
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function archiveOptionGroupAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.optionGroup.archive");
  await menu.archiveOptionGroup(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/menu/options`);
}

export async function setChoiceStockAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.choice.setStock");
  await menu.setChoiceStock(tenantId, unitId, String(formData.get("id") ?? ""), formData.get("out") === "true");
  revalidatePath(`${base(unitSlug)}/menu/options`);
}

// ───────────────────────── Items ─────────────────────────
const itemSchema = z.object({
  categoryId: z.string().min(1),
  stationId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  priceBaht: z.coerce.number().min(0).max(1_000_000),
  prepMinutes: z.coerce.number().int().min(0).max(600).optional(),
  stockQty: z.coerce.number().int().min(0).max(100000).optional(),
});

export async function createItemAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.item.create");
  const tags = formData.getAll("tags").map(String);
  const p = itemSchema.safeParse({
    categoryId: formData.get("categoryId"),
    stationId: formData.get("stationId"),
    name: formData.get("name"),
    nameEn: formData.get("nameEn") || undefined,
    description: formData.get("description") || undefined,
    priceBaht: formData.get("priceBaht"),
    prepMinutes: formData.get("prepMinutes") || undefined,
    stockQty: formData.get("stockQty") || undefined,
  });
  if (!p.success) return;
  await menu.createItem(tenantId, unitId, {
    categoryId: p.data.categoryId,
    stationId: p.data.stationId,
    name: p.data.name,
    nameEn: p.data.nameEn,
    description: p.data.description,
    basePrice: Math.round(p.data.priceBaht * 100),
    prepMinutes: p.data.prepMinutes,
    tags,
    stockQty: p.data.stockQty ?? null,
    optionGroupIds: formData.getAll("optionGroupIds").map(String),
  });
  revalidatePath(`${base(unitSlug)}/menu`);
}

export async function setItemStockAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.item.setStock");
  const id = String(formData.get("id") ?? "");
  const data: { isOutOfStock?: boolean; stockQty?: number | null } = {};
  if (formData.has("isOutOfStock")) data.isOutOfStock = formData.get("isOutOfStock") === "true";
  if (formData.has("stockQty")) {
    const v = String(formData.get("stockQty") ?? "");
    data.stockQty = v === "" ? null : Number(v);
  }
  await menu.setItemStock(tenantId, unitId, id, data);
  revalidatePath(`${base(unitSlug)}/menu`);
  revalidatePath(`${base(unitSlug)}/menu/stock`);
}

export async function duplicateItemAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.item.duplicate");
  await menu.duplicateItem(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/menu`);
}

export async function archiveItemAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.item.archive");
  await menu.archiveItem(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/menu`);
}

export async function resetDailyStockAction(unitSlug: string) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.item.resetStock");
  await menu.resetDailyStock(tenantId, unitId);
  revalidatePath(`${base(unitSlug)}/menu/stock`);
}

// ───────────────────────── Zones / Tables ─────────────────────────
export async function createZoneAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.zone.create");
  const name = String(formData.get("name") ?? "").trim();
  if (name) await table.createZone(tenantId, unitId, name);
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function archiveZoneAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.zone.archive");
  await table.archiveZone(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function createTableAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.table.create");
  const zoneId = String(formData.get("zoneId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const seats = Number(formData.get("seats") ?? 4) || 4;
  if (zoneId && name) await table.createTable(tenantId, unitId, { zoneId, name, seats });
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function archiveTableAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.table.archive");
  await table.archiveTable(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function setTableStatusAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.table.setStatus");
  const parsed = z.nativeEnum(TableStatus).safeParse(formData.get("status"));
  if (parsed.success) {
    await table.updateTable(tenantId, unitId, String(formData.get("id") ?? ""), { status: parsed.data });
  }
  revalidatePath(`${base(unitSlug)}/setup`);
  revalidatePath(base(unitSlug));
}

export async function rotateQrAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.table.rotateQr");
  await table.rotateQr(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/setup`);
}

// ───────────────────────── Sessions ─────────────────────────
export async function openSessionAction(unitSlug: string, formData: FormData): Promise<void> {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.session.open");
  const tableId = String(formData.get("tableId") ?? "");
  const guestCount = Number(formData.get("guestCount") ?? 0) || undefined;
  await table.openSession(tenantId, unitId, tableId, { guestCount, openedByUserId: userId });
  revalidatePath(base(unitSlug));
}

export async function closeSessionAction(unitSlug: string, formData: FormData): Promise<void> {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.session.close");
  await table.closeSession(tenantId, unitId, String(formData.get("sessionId") ?? ""));
  revalidatePath(base(unitSlug));
}

export async function moveSessionAction(unitSlug: string, formData: FormData): Promise<void> {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.session.move");
  await table.moveSession(
    tenantId,
    unitId,
    String(formData.get("sessionId") ?? ""),
    String(formData.get("toTableId") ?? ""),
  );
  revalidatePath(base(unitSlug));
}

export async function mergeSessionAction(unitSlug: string, formData: FormData): Promise<void> {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.session.merge");
  await table.mergeSession(
    tenantId,
    unitId,
    String(formData.get("intoSessionId") ?? ""),
    String(formData.get("fromSessionId") ?? ""),
  );
  revalidatePath(base(unitSlug));
}

export async function linkMemberByPhoneAction(unitSlug: string, sessionId: string, phone: string) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.session.linkMember");
  const memberSystemId = await systemForUnit(tenantId, unitId, "MEMBER");
  if (!memberSystemId) return { ok: false as const, reason: "ยังไม่ได้เชื่อมระบบสมาชิก" };
  const customer = await member.findOrCreate({ tenantId, memberSystemId, phone, source: "SELF" });
  await table.linkMember(tenantId, unitId, sessionId, customer.id);
  revalidatePath(`${base(unitSlug)}/tables/${sessionId}`);
  return { ok: true as const, name: customer.name };
}

// ───────────────────────── Orders (staff) ─────────────────────────
export async function createStaffOrderAction(
  unitSlug: string,
  args: { sessionId?: string; type: "DINE_IN" | "TAKEAWAY"; cart: CartLine[]; note?: string; guestName?: string; guestPhone?: string },
) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.order.create");
  const res = await order.createOrder({
    tenantId,
    unitId,
    type: args.type,
    sessionId: args.sessionId,
    cart: args.cart,
    note: args.note,
    guestName: args.guestName,
    guestPhone: args.guestPhone,
    placedByUserId: userId,
  });
  revalidatePath(base(unitSlug));
  if (args.sessionId) revalidatePath(`${base(unitSlug)}/tables/${args.sessionId}`);
  return res;
}

export async function confirmOrderAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.order.confirm");
  await order.confirmOrder(tenantId, unitId, String(formData.get("orderId") ?? ""));
  revalidatePath(`${base(unitSlug)}/orders`);
}

export async function cancelOrderItemAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.order.cancelItem");
  const reason = String(formData.get("reason") ?? "") || "ยกเลิกโดยพนักงาน";
  await order.cancelOrderItem(tenantId, unitId, String(formData.get("itemId") ?? ""), reason, userId);
  revalidatePath(base(unitSlug));
}

export async function rushOrderAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.order.rush");
  await order.setOrderRush(tenantId, unitId, String(formData.get("orderId") ?? ""), formData.get("rush") !== "false");
  revalidatePath(base(unitSlug));
}

// ───────────────────────── Service requests ─────────────────────────
export async function ackRequestAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.request.ack");
  await order.ackServiceRequest(tenantId, unitId, String(formData.get("id") ?? ""), userId);
  revalidatePath(base(unitSlug));
}

export async function doneRequestAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.request.done");
  await order.doneServiceRequest(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(base(unitSlug));
}

// ───────────────────────── KDS ─────────────────────────
export async function advanceItemAction(unitSlug: string, itemId: string, to: KdsItemStatus) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.kds.advance");
  const res = await kds.advanceItem(tenantId, unitId, itemId, to);
  revalidatePath(`${base(unitSlug)}/kds`);
  return res;
}

export async function recallItemAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.kds.recall");
  await kds.recallItem(tenantId, unitId, String(formData.get("itemId") ?? ""));
  revalidatePath(`${base(unitSlug)}/kds`);
}

// ───────────────────────── Checkout ─────────────────────────
export async function checkoutAction(
  unitSlug: string,
  args: { sessionId: string; itemIds?: string[]; payMethod?: "CASH" | "TRANSFER" | "PROMPTPAY" },
) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.checkout.create");
  const res = await order.checkout({
    tenantId,
    unitId,
    sessionId: args.sessionId,
    itemIds: args.itemIds,
    payMethod: args.payMethod,
  });
  revalidatePath(base(unitSlug));
  revalidatePath(`${base(unitSlug)}/checkout/${args.sessionId}`);
  return res;
}
