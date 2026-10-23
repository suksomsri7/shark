"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { CatalogError } from "@/lib/modules/pos";
import { legacyCancelItemSplitGuard, legacyCheckoutSplitGuard, legacyMergeSplitGuard } from "@/lib/modules/pos/table-split"; // POS P2.5 ▸ fix1 มติ 2 (N2): หน้าเดิมไม่เช็คบิล/ยกเลิกรายการของโต๊ะที่แยกบิลอยู่ ◂
import { posLinkedLegacyDoor } from "@/lib/modules/pos/legacy-door"; // POS P2.14 ▸ LEG-2/4 มติ 1: สาขาที่ผูก POS = action เงิน/ครัวของหน้าเดิมปิด ◂

function base(unitSlug: string) {
  return `/app/u/${unitSlug}/restaurant`;
}

// POS P2.14 ▸ LEG-2/4 มติ 1 · มติ 23: สาขาที่ผูก POS ⇒ เช็คบิล/ยืนยันพร้อมเพย์/ยกเลิกรายการ/รวมโต๊ะ/เดิน-ดึงกลับครัวจากหน้าเดิมไม่ได้
//   (กันเก็บเงินซ้ำ/คืนของซ้ำข้ามประตู — ทำที่ POS › โต๊ะ / ครัว) · ค้นไม่ได้ = ปิด (fail-closed) · action ที่คืน void = redirect ?err=POS_LINKED ไปหน้างาน (มีแถบแจ้ง)
const POS_LINKED_REASON = "สาขานี้ใช้ POS แล้ว — ทำรายการนี้ที่ POS (โต๊ะ / จอครัว)";
const POS_LINKED_REFUSAL = { ok: false as const, code: "POS_LINKED" as const, reason: POS_LINKED_REASON };
async function posLinkedUnit(tenantId: string, unitId: string): Promise<boolean> {
  return posLinkedLegacyDoor(tenantId, unitId, { write: true });
}
// ◂

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
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
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
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  const paused = formData.get("paused") === "true";
  const note = String(formData.get("note") ?? "") || undefined;
  await menu.setKitchenPause(tenantId, unitId, paused, note);
  if (!paused) await (await import("@/lib/modules/pos/order")).releaseHeldOrders(tenantId, unitId, { limit: 20 }); // POS HF-FU ▸ a (มติ 1): เลิกพักครัว ⇒ กวาดออเดอร์ที่ครัวพักไว้ (ไม่ throw) ◂
  revalidatePath(base(unitSlug));
  revalidatePath(`${base(unitSlug)}/setup`);
}

// ───────────────────────── Stations ─────────────────────────
export async function createStationAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.station.create");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  const name = String(formData.get("name") ?? "").trim();
  if (name) await menu.createStation(tenantId, unitId, name);
  revalidatePath(`${base(unitSlug)}/setup`);
}

// ───────────────────────── Categories ─────────────────────────
export async function createCategoryAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.category.create");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  const name = String(formData.get("name") ?? "").trim();
  const nameEn = String(formData.get("nameEn") ?? "").trim() || undefined;
  if (name) await menu.createCategory(tenantId, unitId, { name, nameEn }, userId);
  revalidatePath(`${base(unitSlug)}/menu`);
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function archiveCategoryAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.category.archive");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  await menu.archiveCategory(tenantId, unitId, String(formData.get("id") ?? ""), userId);
  revalidatePath(`${base(unitSlug)}/menu`);
}

// ───────────────────────── Option groups ─────────────────────────
export async function createOptionGroupAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.optionGroup.create");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
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
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  await menu.archiveOptionGroup(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/menu/options`);
}

export async function setChoiceStockAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.choice.setStock");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
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
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.item.create");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
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
  }, userId);
  revalidatePath(`${base(unitSlug)}/menu`);
}

export async function setItemStockAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.item.setStock");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  const id = String(formData.get("id") ?? "");
  const data: { isOutOfStock?: boolean; stockQty?: number | null } = {};
  if (formData.has("isOutOfStock")) data.isOutOfStock = formData.get("isOutOfStock") === "true";
  if (formData.has("stockQty")) {
    const v = String(formData.get("stockQty") ?? "");
    data.stockQty = v === "" ? null : Number(v);
  }
  try {
    await menu.setItemStock(tenantId, unitId, id, data, userId);
  } catch (e) {
    // POS P1.1b G11: การปฏิเสธจากแคตตาล็อก (เช่น BUSY ระหว่าง backfill) คืนเป็นข้อมูล (?err=) — ไม่ throw ถึงผู้ใช้
    if (!(e instanceof CatalogError)) throw e;
    // R2 F1: กลับหน้าที่กด (หน้าสต็อกส่ง back=stock · ค่าอื่น = หน้าเมนู) — ทั้งสองหน้าแสดง ?err=
    const back = formData.get("back") === "stock" ? "/menu/stock" : "/menu";
    redirect(`${base(unitSlug)}${back}?err=${encodeURIComponent(e.message)}`);
  }
  revalidatePath(`${base(unitSlug)}/menu`);
  revalidatePath(`${base(unitSlug)}/menu/stock`);
}

export async function duplicateItemAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.item.duplicate");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
  await menu.duplicateItem(tenantId, unitId, String(formData.get("id") ?? ""), userId);
  revalidatePath(`${base(unitSlug)}/menu`);
}

export async function archiveItemAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.item.archive");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  try {
    await menu.archiveItem(tenantId, unitId, String(formData.get("id") ?? ""), userId);
  } catch (e) {
    // POS P1.1b G11: การปฏิเสธจากแคตตาล็อก คืนเป็นข้อมูล (?err=) — ไม่ throw ถึงผู้ใช้
    if (!(e instanceof CatalogError)) throw e;
    redirect(`${base(unitSlug)}/menu?err=${encodeURIComponent(e.message)}`);
  }
  revalidatePath(`${base(unitSlug)}/menu`);
}

export async function resetDailyStockAction(unitSlug: string) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.item.resetStock");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  await menu.resetDailyStock(tenantId, unitId);
  revalidatePath(`${base(unitSlug)}/menu/stock`);
}

// ───────────────────────── Zones / Tables ─────────────────────────
export async function createZoneAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.zone.create");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  const name = String(formData.get("name") ?? "").trim();
  if (name) await table.createZone(tenantId, unitId, name);
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function archiveZoneAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.zone.archive");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  await table.archiveZone(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function createTableAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.table.create");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  const zoneId = String(formData.get("zoneId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const seats = Number(formData.get("seats") ?? 4) || 4;
  if (zoneId && name) await table.createTable(tenantId, unitId, { zoneId, name, seats });
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function archiveTableAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.table.archive");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P5.2 ▸ D11 (ruling 4 · F5): ตัวเขียนตั้งค่า/เมนู/โต๊ะเดิม — สาขาที่ผูก POS ทำที่ POS (ด่านสาขา = ctx → evaluate(…, unitId)) ◂
  await table.archiveTable(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/setup`);
}

export async function setTableStatusAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.table.setStatus");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
  const parsed = z.nativeEnum(TableStatus).safeParse(formData.get("status"));
  if (parsed.success) {
    await table.updateTable(tenantId, unitId, String(formData.get("id") ?? ""), { status: parsed.data });
  }
  revalidatePath(`${base(unitSlug)}/setup`);
  revalidatePath(base(unitSlug));
}

export async function rotateQrAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.table.rotateQr");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
  await table.rotateQr(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(`${base(unitSlug)}/setup`);
}

// ───────────────────────── Sessions ─────────────────────────
export async function openSessionAction(unitSlug: string, formData: FormData): Promise<void> {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.session.open");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
  const tableId = String(formData.get("tableId") ?? "");
  const guestCount = Number(formData.get("guestCount") ?? 0) || undefined;
  await table.openSession(tenantId, unitId, tableId, { guestCount, openedByUserId: userId });
  revalidatePath(base(unitSlug));
}

export async function closeSessionAction(unitSlug: string, formData: FormData): Promise<void> {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.session.close");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
  await table.closeSession(tenantId, unitId, String(formData.get("sessionId") ?? ""));
  revalidatePath(base(unitSlug));
}

export async function moveSessionAction(unitSlug: string, formData: FormData): Promise<void> {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.session.move");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
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
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2/4 ◂
  // POS P2.5 ▸ fix2 มติ 2 (F2): โต๊ะที่แยกบิลอยู่ (แผน OPEN ฝั่งใดฝั่งหนึ่ง) รวมจากหน้าเดิมไม่ได้ ◂
  const sg = await legacyMergeSplitGuard({ tenantId, unitId, intoSessionId: String(formData.get("intoSessionId") ?? ""), fromSessionId: String(formData.get("fromSessionId") ?? "") });
  if (!sg.ok) redirect(`${base(unitSlug)}?err=${encodeURIComponent(sg.reason)}`);
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
  if (await posLinkedUnit(tenantId, unitId)) return { ok: false as const, reason: POS_LINKED_REASON }; // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
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
  if (await posLinkedUnit(tenantId, unitId)) return { ok: false as const, err: { code: "POS_LINKED" as const, reason: POS_LINKED_REASON } }; // POS P2.14 ▸ LEG-2b (fix1 H3): ไม่สร้างรอบด้วยราคาเมนูเดิมบนโต๊ะ POS ◂
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
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
  await order.confirmOrder(tenantId, unitId, String(formData.get("orderId") ?? ""));
  revalidatePath(`${base(unitSlug)}/orders`);
}

export async function cancelOrderItemAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.order.cancelItem");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2/4 ◂
  const reason = String(formData.get("reason") ?? "") || "ยกเลิกโดยพนักงาน";
  // POS P2.5 ▸ fix1 มติ 2: รายการในแผนแยกบิลที่เปิดอยู่ ยกเลิกจากหน้าเดิมไม่ได้ (แผนจะค้างจ่ายไม่ได้) ◂
  const sg = await legacyCancelItemSplitGuard({ tenantId, unitId, itemId: String(formData.get("itemId") ?? "") });
  if (!sg.ok) redirect(`${base(unitSlug)}?err=${encodeURIComponent(sg.reason)}`);
  await order.cancelOrderItem(tenantId, unitId, String(formData.get("itemId") ?? ""), reason, userId);
  revalidatePath(base(unitSlug));
}

export async function rushOrderAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.order.rush");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
  await order.setOrderRush(tenantId, unitId, String(formData.get("orderId") ?? ""), formData.get("rush") !== "false");
  revalidatePath(base(unitSlug));
}

// ───────────────────────── Service requests ─────────────────────────
export async function ackRequestAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId, userId } = await ctx(unitSlug, "restaurant.request.ack");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
  await order.ackServiceRequest(tenantId, unitId, String(formData.get("id") ?? ""), userId);
  revalidatePath(base(unitSlug));
}

export async function doneRequestAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.request.done");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3) ◂
  await order.doneServiceRequest(tenantId, unitId, String(formData.get("id") ?? ""));
  revalidatePath(base(unitSlug));
}

// ลูกค้าแจ้งจ่ายพร้อมเพย์แล้ว → ร้านกด "ยืนยันรับเงิน" → เช็คบิลด้วย PROMPTPAY (ลงบัญชี/ปิดโต๊ะ) + ปิดคำขอ
// error inline ผ่าน ?err= (pattern เดียวกับ voidCheckoutAction) · idempotent: กดซ้ำ → ไม่มีรายการค้าง → err
export async function confirmPromptpayPaymentAction(unitSlug: string, formData: FormData): Promise<void> {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.checkout.create");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2/4 ◂
  const sessionId = String(formData.get("sessionId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  // POS P2.5 ▸ fix1 มติ 2: โต๊ะที่แยกบิลอยู่ (แผน OPEN) เช็คบิลจากหน้าเดิมไม่ได้ (กันเก็บเงินซ้ำกับใบที่จ่ายแล้ว) ◂
  const sg = await legacyCheckoutSplitGuard({ tenantId, unitId, sessionId });
  if (!sg.ok) redirect(`${base(unitSlug)}?err=${encodeURIComponent(sg.reason)}`);
  const res = await order.checkout({ tenantId, unitId, sessionId, payMethod: "PROMPTPAY" });
  if (res.ok && requestId) await order.doneServiceRequest(tenantId, unitId, requestId);
  revalidatePath(base(unitSlug));
  revalidatePath(`${base(unitSlug)}/checkout/${sessionId}`);
  if (!res.ok) {
    redirect(`${base(unitSlug)}?err=${encodeURIComponent(res.reason)}`);
  }
}

// ───────────────────────── KDS ─────────────────────────
export async function advanceItemAction(unitSlug: string, itemId: string, to: KdsItemStatus) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.kds.advance");
  if (await posLinkedUnit(tenantId, unitId)) return POS_LINKED_REFUSAL; // POS P2.14 ▸ LEG-2/4 ◂
  const res = await kds.advanceItem(tenantId, unitId, itemId, to);
  revalidatePath(`${base(unitSlug)}/kds`);
  return res;
}

export async function recallItemAction(unitSlug: string, formData: FormData) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.kds.recall");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2/4 ◂
  await kds.recallItem(tenantId, unitId, String(formData.get("itemId") ?? ""));
  revalidatePath(`${base(unitSlug)}/kds`);
}

// ───────────────────────── Checkout ─────────────────────────
export async function checkoutAction(
  unitSlug: string,
  args: { sessionId: string; itemIds?: string[]; payMethod?: "CASH" | "TRANSFER" | "PROMPTPAY" },
) {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.checkout.create");
  if (await posLinkedUnit(tenantId, unitId)) return POS_LINKED_REFUSAL; // POS P2.14 ▸ LEG-2/4 ◂
  // POS P2.5 ▸ fix1 มติ 2: โต๊ะที่แยกบิลอยู่ (แผน OPEN) เช็คบิลจากหน้าเดิมไม่ได้ ◂
  const sg = await legacyCheckoutSplitGuard({ tenantId, unitId, sessionId: args.sessionId });
  if (!sg.ok) return sg;
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

// ยกเลิกบิล/คืนเงินหลังชำระ — void PosSale + คืนรายการ + เปิดโต๊ะกลับ · error inline ผ่าน ?err= (pattern เดียวกับ shop.refund)
export async function voidCheckoutAction(unitSlug: string, formData: FormData): Promise<void> {
  const { tenantId, unitId } = await ctx(unitSlug, "restaurant.checkout.void");
  if (await posLinkedUnit(tenantId, unitId)) redirect(`${base(unitSlug)}?err=POS_LINKED`); // POS P2.14 ▸ LEG-2b (fix1 H3): ยกเลิกบิล POS ทำที่ POS › บิล (สิทธิ์ void · อนุมัติ · PIN · กะ) — ไม่ void PosSale จากหน้าเดิม ◂
  const sessionId = String(formData.get("sessionId") ?? "");
  const res = await order.voidCheckout(tenantId, unitId, sessionId);
  revalidatePath(base(unitSlug));
  revalidatePath(`${base(unitSlug)}/tables/${sessionId}`);
  revalidatePath(`${base(unitSlug)}/checkout/${sessionId}`);
  if (!res.ok) {
    redirect(`${base(unitSlug)}?err=${encodeURIComponent(res.reason)}`);
  }
}
