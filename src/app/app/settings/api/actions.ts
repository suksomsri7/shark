"use server";

// Server actions ตั้งค่า API key ฝั่งร้าน (WO-0061)
// tenantId ดึงจาก session (requireTenant) เท่านั้น — ห้ามรับจาก client
// ตรวจสิทธิ์ผ่าน assertCan (module "api" · action api.key.create / api.key.revoke)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createApiKey, revokeApiKey } from "@/lib/api-keys/service";

const SETTINGS_PATH = "/app/settings/api";

function assertApiKeyCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string): void {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "api", action },
  );
}

export type CreateKeyState =
  | { status: "idle" }
  | { status: "ok"; rawKey: string; name: string }
  | { status: "error"; message: string };

// สร้างคีย์ใหม่ — คืน rawKey เพื่อให้ UI โชว์ครั้งเดียว (หลังจากนี้ดูไม่ได้อีก)
export async function createKeyAction(
  _prev: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const auth = await requireTenant();
  assertApiKeyCan(auth, "api.key.create");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: "กรุณาตั้งชื่อคีย์ให้จำง่าย เช่น ระบบบัญชี" };
  try {
    const { rawKey } = await createApiKey({ tenantId: auth.active.tenantId }, name);
    revalidatePath(SETTINGS_PATH);
    return { status: "ok", rawKey, name };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "สร้างคีย์ไม่สำเร็จ" };
  }
}

// เพิกถอนคีย์ (ผ่าน ConfirmDialog)
export async function revokeKeyAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  assertApiKeyCan(auth, "api.key.revoke");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await revokeApiKey({ tenantId: auth.active.tenantId }, id);
  revalidatePath(SETTINGS_PATH);
}
