"use server";

// Dashboard builder v1 (WO-0056) — server action บันทึก layout ของ dashboard
// tenantId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client
// assertCan: dashboard.layout.update (เจ้าของ/ผู้จัดการปรับหน้าแรกได้)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { saveDashboardLayout } from "./widgets";

function membershipOf(auth: Awaited<ReturnType<typeof requireTenant>>): MembershipCtx {
  return {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
}

export type SaveLayoutState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

// บันทึก layout ที่ผู้ใช้จัดในโหมด "ปรับแต่ง" — keys เรียงตามที่จัด
export async function saveDashboardLayoutAction(keys: string[]): Promise<SaveLayoutState> {
  const auth = await requireTenant();
  assertCan(membershipOf(auth), { module: "dashboard", action: "dashboard.layout.update" });
  try {
    await saveDashboardLayout({ tenantId: auth.active.tenantId }, keys);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
  revalidatePath("/app");
  return { status: "ok" };
}
