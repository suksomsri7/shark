"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { installTemplate } from "./service";

// ตรวจสิทธิ์ติดตั้งเทมเพลต — OWNER/MANAGER ผ่าน · STAFF ตาม permission
function assertMarketplaceCan(auth: Awaited<ReturnType<typeof requireTenant>>) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "marketplace", action: "marketplace.template.install" },
  );
}

export type InstallState = { status: "idle" | "ok" | "error"; message?: string };

// ── ติดตั้งเทมเพลตธุรกิจ → เดิน pipeline DNA แล้วบันทึก TenantInstall ──
// (รูปแบบ useActionState: รับ prevState + formData)
export async function installTemplateAction(
  _prev: InstallState,
  formData: FormData,
): Promise<InstallState> {
  const auth = await requireTenant();
  assertMarketplaceCan(auth);
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { status: "error", message: "ไม่ได้ระบุเทมเพลต" };
  try {
    await installTemplate({ tenantId: auth.active.tenantId }, key);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "ติดตั้งไม่สำเร็จ" };
  }
  revalidatePath("/app/marketplace");
  revalidatePath("/app");
  return { status: "ok" };
}
