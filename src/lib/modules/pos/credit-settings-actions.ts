"use server";
// credit-settings-actions.ts — server action ของการ์ด "ลูกค้าเครดิต (วางบิล)" + "สมาชิกบนบิลออเดอร์" (POS P3.6U ▸ CD-P36U-2 ◂) · เปลือกบาง: session → ctx/actor → credit-settings.ts
//
// 🔴 "use server" export ได้เฉพาะ async function · ชนิดอยู่ที่ credit-settings.ts (import type)
// 🔴 ไม่มีคำสั่งโยนในไฟล์นี้ (กฎ P1.6-R2) — ด่านสิทธิ์ใช้ assertCan ห่อเป็น boolean · ล้มที่ไม่คาดคิด = {ok:false, code:"UNKNOWN"}
// 🔴 ร้าน/บทบาทจาก membership ของ SESSION เท่านั้น · ตัวเขียนตรวจซ้ำ (เจ้าของร้านเท่านั้น · ระบบ POS ของร้านนี้)
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { updatePosCreditSettings, type PosCreditSettingsPatch, type PosCreditSettingsResult } from "./credit-settings";

const UNKNOWN = (): PosCreditSettingsResult => ({ ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" });

/** ด่านสิทธิ์ (assertCan · คืน boolean ไม่โยน — กฎ P1.6-R2) */
function can(m: MembershipCtx, action: string): boolean {
  try {
    assertCan(m, { module: "pos", action });
    return true;
  } catch {
    return false;
  }
}

/** บันทึกค่าตั้งวางบิล/สมาชิกบนบิลออเดอร์ — เจ้าของร้านเท่านั้น (ตรวจในตัวเขียน) */
export async function updatePosCreditSettingsAction(args: { systemId: string; patch: PosCreditSettingsPatch }): Promise<PosCreditSettingsResult> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    if (!can(m, "pos.credit.manage")) return { ok: false, code: "PERMISSION_DENIED", message: "ค่าตั้งวางบิล เจ้าของร้านเท่านั้นที่แก้ได้" };
    const systemId = args && typeof args.systemId === "string" ? args.systemId : "";
    return await updatePosCreditSettings({ tenantId: auth.active.tenantId, systemId }, { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions }, args?.patch);
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/credit-settings-actions] update", e);
    return UNKNOWN();
  }
}
