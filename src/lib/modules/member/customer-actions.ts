"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { updateCustomer } from "./service";

// Member customer actions — ตรวจสิทธิ์โมดูล member
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

export type UpdateCustomerState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

// ── แก้ไขข้อมูลสมาชิกในหน้า /app/members/[id] ──
export async function updateCustomerAction(
  _prev: UpdateCustomerState,
  formData: FormData,
): Promise<UpdateCustomerState> {
  const auth = await requireTenant();
  assertMemberCan(auth, "member.customer.update");

  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) return { status: "error", message: "ไม่พบสมาชิก" };

  const name = String(formData.get("name") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const email = String(formData.get("email") ?? "");
  const marketingConsent = formData.get("marketingConsent") != null;

  try {
    await updateCustomer({ tenantId: auth.active.tenantId }, customerId, {
      name,
      phone,
      email,
      marketingConsent,
    });
    revalidatePath(`/app/members/${customerId}`);
    return { status: "ok" };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "แก้ไขไม่สำเร็จ" };
  }
}
