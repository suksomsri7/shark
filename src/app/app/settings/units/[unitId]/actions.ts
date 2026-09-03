"use server";

// ตั้งค่าสาขา: ที่อยู่/แผนที่ (WO-CV14 ข · ปิดหนี้ D14)
// แบบเดียวกับ settings/branding/actions.ts:
//   · tenantId ดึงจาก session (requireTenant) เท่านั้น — 🔴 ห้ามรับจาก client แม้แต่ทางเดียว
//   · ตรวจสิทธิ์ผ่าน assertCan (module "systems" · action systems.unit.update)
//   · ตรรกะ/การ validate ทั้งหมดอยู่ที่ `@/lib/units/location` — ที่นี่เป็นแค่ชั้นเชื่อมฟอร์ม

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { saveUnitLocation } from "@/lib/units/location";

export type SaveUnitLocationState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; message: string };

export async function saveUnitLocationAction(
  _prev: SaveUnitLocationState,
  formData: FormData,
): Promise<SaveUnitLocationState> {
  const auth = await requireTenant();
  // 🔴 อ่าน `unitId` **ก่อน** ตรวจสิทธิ์ แล้วส่งเข้า AccessQuery ด้วย
  //    `evaluate()` บังคับ `unitAccess` ผ่าน `canAccessUnit(m, q.unitId)` เท่านั้น ⇒ ไม่ส่ง unitId
  //    = ตรวจแค่ "ระดับร้าน" แปลว่าหัวหน้าที่คุมสาขา A แก้ที่อยู่สาขา B ได้
  //    (ที่อยู่ผิด = ลูกค้าขับรถไปผิดที่ — ความเสียหายที่กู้ไม่ได้ ตามเหตุผลเดียวกับ shopLocationAction)
  const unitId = String(formData.get("unitId") ?? "");
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "systems", action: "systems.unit.update", unitId },
  );

  const res = await saveUnitLocation(
    { tenantId: auth.active.tenantId },
    unitId,
    {
      address: formData.get("address"),
      mapUrl: formData.get("mapUrl"),
      lat: formData.get("lat"),
      lng: formData.get("lng"),
    },
  );
  if (!res.ok) return { status: "error", message: res.error };

  revalidatePath(`/app/settings/units/${unitId}`);
  return { status: "ok" };
}
