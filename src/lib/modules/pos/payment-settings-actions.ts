"use server";
// payment-settings-actions.ts — server action ตั้งค่าการชำระเงินของ POS (P1.6 · O19/O20) · เปลือกบาง: session → ctx/actor → payment-settings.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ payment-settings.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + บทบาทมาจาก membership ของ SESSION เท่านั้น · systemId จากคำขอถูกตรวจซ้ำ (ระบบ POS ของร้านนี้) ใน payment-settings.ts

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { posMembership } from "./access";
import {
  posPaymentSettings,
  updatePosPaymentSettings,
  type PosPaymentSettingsPatch,
  type PosPaymentSettingsResult,
} from "./payment-settings";

function unexpected(where: string, e: unknown): PosPaymentSettingsResult {
  console.error(`[pos/payment-settings-actions] ${where}`, e);
  return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** อ่านค่าตั้งการชำระเงินของระบบ POS นี้ (สมาชิกของร้านอ่านได้ — หน้าขายใช้แสดงค่าบริการ/ทิป) */
export async function posPaymentSettingsAction(args: { systemId: string }): Promise<PosPaymentSettingsResult> {
  try {
    const auth = await requireTenant();
    const systemId = args && typeof args.systemId === "string" ? args.systemId : "";
    return await posPaymentSettings({ tenantId: auth.active.tenantId, systemId });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("read", e);
  }
}

/** แก้ค่าตั้งการชำระเงิน — เจ้าของร้านเท่านั้น (ตรวจใน updatePosPaymentSettings) */
export async function updatePosPaymentSettingsAction(args: { systemId: string; patch: PosPaymentSettingsPatch }): Promise<PosPaymentSettingsResult> {
  try {
    const auth = await requireTenant();
    const systemId = args && typeof args.systemId === "string" ? args.systemId : "";
    const m = posMembership(auth.active);
    return await updatePosPaymentSettings(
      { tenantId: auth.active.tenantId, systemId },
      { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
      args?.patch ?? {},
    );
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("update", e);
  }
}
