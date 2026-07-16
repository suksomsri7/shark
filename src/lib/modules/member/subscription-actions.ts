"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import {
  cancelSubscription,
  createPlan,
  setPlanActive,
  subscribe,
  type Ctx,
} from "./subscription";

// Subscription actions — ตรวจสิทธิ์โมดูล member (system-scoped)
// convention action = "member.<entity>.<verb>" (F6 ratchet บังคับให้ไฟล์ action เรียก assertCan)
function assertMemberCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "member", action },
  );
}

const revalidate = (systemId: string) => revalidatePath(`/app/sys/${systemId}`);

// รับเป็นบาท → สตางค์ (ราคาแพ็กเกจ) — ปฏิเสธค่าติดลบ/ไม่ใช่ตัวเลข → 0
const bahtToSatang = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

// จำนวนวันของรอบ — preset (30/365) หรือกำหนดเอง
const toPeriodDays = (formData: FormData): number => {
  const preset = String(formData.get("period") ?? "").trim();
  const raw = preset === "custom" ? formData.get("customDays") : preset;
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
};

// ── สร้างแพ็กเกจสมาชิก ──
export async function createPlanAction(formData: FormData) {
  const auth = await requireTenant();
  assertMemberCan(auth, "member.plan.create");
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const periodDays = toPeriodDays(formData);
  if (!systemId || !name || periodDays < 1) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createPlan(ctx, {
    name,
    priceSatang: bahtToSatang(formData.get("price")),
    periodDays,
  });
  revalidate(systemId);
}

// ── เปิด/ปิดการขายแพ็กเกจ ──
export async function setPlanActiveAction(formData: FormData) {
  const auth = await requireTenant();
  assertMemberCan(auth, "member.plan.update");
  const systemId = String(formData.get("systemId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!systemId || !planId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await setPlanActive(ctx, planId, active);
  revalidate(systemId);
}

// ── สมัครแพ็กเกจให้ลูกค้า ──
export async function subscribeAction(formData: FormData) {
  const auth = await requireTenant();
  assertMemberCan(auth, "member.subscription.create");
  const systemId = String(formData.get("systemId") ?? "");
  const customerId = String(formData.get("customerId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  if (!systemId || !customerId || !planId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  const startRaw = String(formData.get("startAt") ?? "").trim();
  const startAt = startRaw ? new Date(startRaw) : undefined;
  await subscribe(ctx, {
    customerId,
    planId,
    startAt: startAt && !Number.isNaN(startAt.getTime()) ? startAt : undefined,
  });
  revalidate(systemId);
}

// ── ยกเลิกแพ็กเกจของลูกค้า ──
export async function cancelSubscriptionAction(formData: FormData) {
  const auth = await requireTenant();
  assertMemberCan(auth, "member.subscription.cancel");
  const systemId = String(formData.get("systemId") ?? "");
  const subId = String(formData.get("subId") ?? "");
  if (!systemId || !subId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await cancelSubscription(ctx, subId);
  revalidate(systemId);
}
