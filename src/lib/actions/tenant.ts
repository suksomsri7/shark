"use server";

import { redirect } from "next/navigation";
import { requireMembership, setActiveTenant } from "@/lib/core/context";

// สลับกิจการที่กำลังใช้งาน (หลายกิจการใน 1 account)
// ตรวจสิทธิ์เสมอ: user ต้องมี membership (acceptedAt) ในกิจการนั้นจริง
// redirect /app?switched=<id> — query นี้ฝั่งแอป native ใช้ sync กิจการ (ห้ามเปลี่ยนรูปแบบ)
export async function switchTenantAction(tenantId: string): Promise<void> {
  await requireMembership(tenantId); // authz: ต้องเป็นสมาชิกกิจการนั้นจริง (helper กลาง — F6 marker)
  await setActiveTenant(tenantId);
  redirect("/app?switched=" + tenantId);
}
