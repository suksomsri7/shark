"use server";

// White label v1 (WO-0064) — server action ตั้งค่าแบรนด์ร้าน (ชื่อ/โลโก้/สี)
// tenantId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client
// ตรวจสิทธิ์ผ่าน assertCan (module "branding" · action branding.setting.update)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { setBranding } from "@/lib/branding/service";

const SETTINGS_PATH = "/app/settings/branding";

export type SaveBrandingState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

export async function saveBrandingAction(
  _prev: SaveBrandingState,
  formData: FormData,
): Promise<SaveBrandingState> {
  const auth = await requireTenant();
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "branding", action: "branding.setting.update" },
  );

  const displayName = String(formData.get("displayName") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const brandColor = String(formData.get("brandColor") ?? "").trim();

  try {
    await setBranding(
      { tenantId: auth.active.tenantId },
      { displayName, logoUrl, brandColor },
    );
    revalidatePath(SETTINGS_PATH);
    return { status: "ok" };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
}
