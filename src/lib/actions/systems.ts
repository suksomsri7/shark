"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SystemType } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { createSystem, linkUnit } from "@/lib/modules/system/service";
import { createReward, removeReward } from "@/lib/modules/reward/service";

const PATH = "/app/settings/systems";

export async function createSystemAction(formData: FormData) {
  const auth = await requireTenant();
  const type = z.nativeEnum(SystemType).safeParse(formData.get("type"));
  const name = String(formData.get("name") ?? "").trim();
  if (!type.success || name.length < 1) return;
  await createSystem(auth.active.tenantId, type.data, name);
  revalidatePath(PATH);
}

export async function linkUnitAction(formData: FormData) {
  const auth = await requireTenant();
  const systemId = String(formData.get("systemId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  if (!systemId || !unitId) return;
  await linkUnit(auth.active.tenantId, systemId, unitId);
  revalidatePath(PATH);
}

export async function addRewardAction(formData: FormData) {
  const auth = await requireTenant();
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
  revalidatePath(PATH);
}

export async function removeRewardAction(formData: FormData) {
  const auth = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (id) await removeReward(auth.active.tenantId, id);
  revalidatePath(PATH);
}
