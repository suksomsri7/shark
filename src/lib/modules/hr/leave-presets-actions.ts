"use server";
// HR H2.12 ▸ F1 — server action "เพิ่มประเภทการลาตามกฎหมาย" (1 รายการต่อการกด) — ด่านเดียวกับ createLeavePolicyAction:
//   ระบบ HR ของร้านนี้จากฟอร์ม · คีย์ hr.employee.create ระดับร้าน (OWNER ผ่านเสมอ) · service ตรวจซ้ำ (ประเภททั้งร้าน ⇒ ผู้ดูแลทุกสาขา) ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { tenantDb } from "@/lib/core/db";
import { hrViewerOf } from "./privacy";
import { SETTINGS_TEXT, type SettingsResult } from "./settings";
import { addLeavePreset } from "./leave-presets-service";

export async function addLeavePresetAction(formData: FormData): Promise<SettingsResult> {
  const auth = await requireTenant();
  const systemId = String(formData.get("systemId") ?? "").trim();
  const sys = systemId ? await tenantDb({ tenantId: auth.active.tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } }) : null;
  if (!sys) return { ok: false, reason: "ไม่พบระบบพนักงานนี้" };
  try {
    assertCan({ role: auth.active.role, unitAccess: (Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess : []) as string[], permissions: (auth.active.permissions ?? {}) as Record<string, unknown> }, { module: "hr", action: "hr.employee.create" });
  } catch {
    return { ok: false, reason: SETTINGS_TEXT.noPermission };
  }
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const ctx = { tenantId: auth.active.tenantId, systemId: sys.id };
  const r = await addLeavePreset(ctx, hrViewerOf(auth), {
    key: str("preset"),
    name: str("name"),
    quotaDays: str("quotaDays"),
    paid: str("paid"),
    minServiceDays: str("minServiceDays"),
    attachmentAfterDays: str("attachmentAfterDays"),
  });
  if (r.ok) revalidatePath(`/app/sys/${ctx.systemId}/hr/settings`);
  return r;
}
// ◂ HR H2.12
