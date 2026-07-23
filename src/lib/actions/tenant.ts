"use server";

import { redirect } from "next/navigation";
import { requireAuth, setActiveTenant } from "@/lib/core/context";

// สลับกิจการที่กำลังใช้งาน (หลายกิจการใน 1 account)
// ตรวจสิทธิ์เสมอ: user ต้องมี membership (acceptedAt) ในกิจการนั้นจริง
// redirect /app?switched=<id> — query นี้ฝั่งแอป native ใช้ sync กิจการ (ห้ามเปลี่ยนรูปแบบ)
export async function switchTenantAction(tenantId: string): Promise<void> {
  const auth = await requireAuth();
  // membership ใน getAuth กรอง acceptedAt != null มาแล้ว → เจอ = มีสิทธิ์จริง
  const member = auth.memberships.find((m) => m.tenantId === tenantId);
  if (!member) throw new Error("ไม่พบสิทธิ์ในกิจการนี้");
  await setActiveTenant(tenantId);
  redirect("/app?switched=" + tenantId);
}
