"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SystemType, UnitType } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { slugify } from "@/lib/slug";
import {
  systemDef,
  AVAILABLE_BUSINESS,
  AVAILABLE_FEATURE,
  isFixedPageSystem,
  FIXED_PAGE_SYSTEMS,
} from "@/lib/systems";
import { createSystemAutoLink, linkUnit } from "@/lib/modules/system/service";
import {
  createReward,
  removeReward,
  redeem,
  resolvePointSystemId,
  fulfillRedemption,
  cancelRedemption,
} from "@/lib/modules/reward/service";
import { setPointSettings, adjustPoints } from "@/lib/modules/point/service";
import { randomUUID } from "crypto";

export type AddSystemState = { status: "idle" } | { status: "error"; message: string };

// ตรวจสิทธิ์ระดับร้าน (tenant admin) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
function assertSystemsCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "systems", action },
  );
}

// สร้าง "ระบบ" — ประเภทไหนก็ได้จาก 14 (business → BusinessUnit, feature → AppSystem)
export async function addSystemAction(
  _prev: AddSystemState,
  formData: FormData,
): Promise<AddSystemState> {
  const auth = await requireTenant();
  assertSystemsCan(auth, "systems.system.create");
  const tenantId = auth.active.tenantId;
  const code = String(formData.get("code") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const def = systemDef(code);
  if (!def || def.status !== "available") {
    return { status: "error", message: "ระบบนี้ยังไม่เปิดให้บริการ" };
  }
  // ระบบ "หน้า fixed" (เช่น คลังความรู้) ไม่ได้สร้างเป็น instance — พาไปหน้าโดยตรงแทน
  if (isFixedPageSystem(code)) {
    redirect(FIXED_PAGE_SYSTEMS[code]);
  }
  if (name.length < 2) return { status: "error", message: "ตั้งชื่อระบบอย่างน้อย 2 ตัวอักษร" };

  if (def.kind === "business") {
    if (!AVAILABLE_BUSINESS.has(code as UnitType)) {
      return { status: "error", message: "ระบบนี้ยังไม่เปิดให้บริการ" };
    }
    const count = await prisma.businessUnit.count({
      where: { tenantId, status: { not: "ARCHIVED" } },
    });
    const limits = auth.active.tenant.limits as { maxUnits?: number };
    if (count >= (limits?.maxUnits ?? 10)) {
      return { status: "error", message: "สร้างระบบได้สูงสุดตามแพ็กเกจ" };
    }
    const base = slugify(name, "unit");
    let slug = base;
    for (let i = 0; i < 6; i++) {
      const exists = await prisma.businessUnit.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      if (!exists) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 5)}`;
    }
    const unit = await prisma.businessUnit.create({
      data: { tenantId, type: code as UnitType, name, slug, sortOrder: count },
    });
    redirect(`/app/u/${unit.slug}`);
  }

  if (!AVAILABLE_FEATURE.has(code as SystemType)) {
    return { status: "error", message: "ระบบนี้ยังไม่เปิดให้บริการ" };
  }
  const sys = await createSystemAutoLink(tenantId, code as SystemType, name);
  redirect(`/app/sys/${sys.id}`);
}

// เชื่อมระบบ business ↔ ระบบ feature (1 ระบบ business เชื่อม 1 ระบบต่อประเภท)
export async function linkUnitAction(formData: FormData) {
  const auth = await requireTenant();
  assertSystemsCan(auth, "systems.link.create");
  const systemId = String(formData.get("systemId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const back = String(formData.get("back") ?? "/app");
  if (systemId && unitId) await linkUnit(auth.active.tenantId, systemId, unitId);
  revalidatePath(back);
  revalidatePath("/app");
}

// ยกเลิกการเชื่อม
export async function unlinkUnitAction(formData: FormData) {
  const auth = await requireTenant();
  assertSystemsCan(auth, "systems.link.delete");
  const systemId = String(formData.get("systemId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  const back = String(formData.get("back") ?? "/app");
  if (systemId && unitId) {
    await prisma.appSystemUnit.deleteMany({
      where: { tenantId: auth.active.tenantId, systemId, unitId },
    });
  }
  revalidatePath(back);
  revalidatePath("/app");
}

export async function addRewardAction(formData: FormData) {
  const auth = await requireTenant();
  assertSystemsCan(auth, "systems.reward.create");
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const pointsCost = Number(formData.get("pointsCost") ?? 0);
  const stockRaw = String(formData.get("stock") ?? "").trim();
  if (!systemId || name.length < 1 || pointsCost <= 0) return;
  await createReward({
    tenantId: auth.active.tenantId,
    systemId,
    name,
    pointsCost,
    stock: stockRaw ? Number(stockRaw) : null,
  });
  revalidatePath(`/app/sys/${systemId}`);
}

export async function removeRewardAction(formData: FormData) {
  const auth = await requireTenant();
  assertSystemsCan(auth, "systems.reward.delete");
  const id = String(formData.get("id") ?? "");
  const systemId = String(formData.get("systemId") ?? "");
  if (id) await removeReward(auth.active.tenantId, id);
  revalidatePath(`/app/sys/${systemId}`);
}

// ── ระบบแลกรางวัลจริง (WO Wave1-A) — assertCan module "reward" ──
function assertRewardCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "reward", action },
  );
}

export type RedeemState =
  | { status: "idle" }
  | { status: "ok"; code: string; rewardName?: string }
  | { status: "error"; message: string };

// แลกรางวัลแทนลูกค้า (พนักงานหน้าร้านกดให้) → คืนโค้ดรับของ หรือ error inline
export async function redeemRewardAction(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const auth = await requireTenant();
  assertRewardCan(auth, "reward.redemption.create");
  const tenantId = auth.active.tenantId;
  const systemId = String(formData.get("systemId") ?? "").trim();
  const rewardId = String(formData.get("rewardId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!systemId) return { status: "error", message: "ไม่พบระบบรางวัล" };
  if (!rewardId) return { status: "error", message: "เลือกรางวัลที่จะแลกก่อน" };
  if (!customerId) return { status: "error", message: "เลือกสมาชิกที่จะแลกให้ก่อน" };

  const pointSystemId = await resolvePointSystemId(tenantId, systemId);
  if (!pointSystemId) {
    return {
      status: "error",
      message: "ระบบรางวัลนี้ยังไม่ได้เชื่อมกับระบบแต้ม — เชื่อมกิจการเดียวกันกับระบบแต้มก่อน",
    };
  }
  const res = await redeem({ tenantId, rewardSystemId: systemId, pointSystemId, rewardId, customerId });
  if (!res.ok) return { status: "error", message: res.reason };
  revalidatePath(`/app/sys/${systemId}`);
  return { status: "ok", code: res.code };
}

// ── ระบบแต้ม (WO Wave1-D): ตั้งอัตราสะสม + ปรับ/แจกแต้มมือ — assertCan module "point" ──
function assertPointCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "point", action },
  );
}

export type PointSettingsState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

// ตั้งอัตราสะสม — UI รับเป็น "บาทต่อ 1 แต้ม" → แปลง ×100 เป็นสตางค์ + เปิด/ปิดสะสม
export async function setPointSettingsAction(
  _prev: PointSettingsState,
  formData: FormData,
): Promise<PointSettingsState> {
  const auth = await requireTenant();
  assertPointCan(auth, "point.settings.update");
  const systemId = String(formData.get("systemId") ?? "").trim();
  const bahtRaw = String(formData.get("bahtPerPoint") ?? "").trim();
  const baht = Number(bahtRaw);
  if (!Number.isFinite(baht) || baht < 0.01) {
    return { status: "error", message: "ใส่จำนวนบาทต่อ 1 แต้ม อย่างน้อย 0.01 บาท" };
  }
  const satangPerPoint = Math.round(baht * 100);
  const active = formData.get("active") === "on";
  try {
    await setPointSettings(auth.active.tenantId, { satangPerPoint, active });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
  revalidatePath(`/app/sys/${systemId}`);
  return { status: "ok" };
}

export type AdjustPointsState =
  | { status: "idle" }
  | { status: "ok"; balance: number }
  | { status: "error"; message: string };

// ปรับ/แจกแต้มมือให้สมาชิก — mode grant(+)/deduct(-) · idempotencyKey ใหม่ทุกครั้ง (แต่ละครั้ง = รายการใหม่)
export async function adjustPointsAction(
  _prev: AdjustPointsState,
  formData: FormData,
): Promise<AdjustPointsState> {
  const auth = await requireTenant();
  assertPointCan(auth, "point.adjust.create");
  const systemId = String(formData.get("systemId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const mode = String(formData.get("mode") ?? "grant");
  const amount = Number(String(formData.get("amount") ?? "").trim());
  const reason = String(formData.get("reason") ?? "").trim();
  if (!systemId) return { status: "error", message: "ไม่พบระบบแต้ม" };
  if (!customerId) return { status: "error", message: "เลือกสมาชิกก่อน" };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { status: "error", message: "ใส่จำนวนแต้มเป็นจำนวนเต็มมากกว่า 0" };
  }
  const delta = mode === "deduct" ? -amount : amount;
  try {
    const res = await adjustPoints({
      tenantId: auth.active.tenantId,
      systemId,
      customerId,
      delta,
      reason: reason || undefined,
      idempotencyKey: `manual-${systemId}-${customerId}-${randomUUID()}`,
    });
    revalidatePath(`/app/sys/${systemId}`);
    return { status: "ok", balance: res.balance };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "ปรับแต้มไม่สำเร็จ" };
  }
}

// ทำเครื่องหมาย "รับของแล้ว"
export async function fulfillRedemptionAction(formData: FormData) {
  const auth = await requireTenant();
  assertRewardCan(auth, "reward.redemption.fulfill");
  const systemId = String(formData.get("systemId") ?? "").trim();
  const redemptionId = String(formData.get("redemptionId") ?? "").trim();
  if (systemId && redemptionId) {
    await fulfillRedemption(auth.active.tenantId, systemId, redemptionId);
  }
  revalidatePath(`/app/sys/${systemId}`);
}

// ยกเลิก + คืนแต้ม + คืนสต็อก
export async function cancelRedemptionAction(formData: FormData) {
  const auth = await requireTenant();
  assertRewardCan(auth, "reward.redemption.cancel");
  const systemId = String(formData.get("systemId") ?? "").trim();
  const redemptionId = String(formData.get("redemptionId") ?? "").trim();
  if (systemId && redemptionId) {
    await cancelRedemption(auth.active.tenantId, systemId, redemptionId);
  }
  revalidatePath(`/app/sys/${systemId}`);
}
