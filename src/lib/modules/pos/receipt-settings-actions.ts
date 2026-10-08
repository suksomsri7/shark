"use server";
// receipt-settings-actions.ts — server action ค่าตั้งใบเสร็จของ POS (P1.10 · มติ R4) · เปลือกบาง: session → ctx/actor → receipt-settings.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ receipt-settings-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + บทบาทมาจาก membership ของ SESSION เท่านั้น · systemId จากคำขอถูกตรวจซ้ำ (ระบบ POS ของร้านนี้) ใน receipt-settings.ts
//    อ่าน = ใครก็ได้ที่ขายได้ (pos.sale.create — หน้าขายต้องรู้หัวใบเสร็จ) หรือมี pos.device.manage ·
//    แก้ = pos.device.manage ที่ทุกสาขาที่ผูก POS นี้ (F9 · ค่าตั้งใช้ทั้งระบบ · ตรวจใน service)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { posReceiptSettings, updatePosReceiptSettings } from "./receipt-settings";
import type { PosReceiptSettingsPatch, PosReceiptSettingsResult } from "./receipt-settings-shared";

/** ด่านสิทธิ์ระดับร้าน (assertCan · คืน boolean ไม่โยน) */
function can(m: MembershipCtx, action: string): boolean {
  try {
    assertCan(m, { module: "pos", action });
    return true;
  } catch {
    return false;
  }
}

function unexpected(where: string, e: unknown): PosReceiptSettingsResult {
  console.error(`[pos/receipt-settings-actions] ${where}`, e);
  return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** อ่านค่าตั้งใบเสร็จของระบบ POS นี้ (หน้า 17A · หน้าขาย) */
export async function posReceiptSettingsAction(args: { systemId: string }): Promise<PosReceiptSettingsResult> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    if (!can(m, "pos.sale.create") && !can(m, "pos.device.manage")) {
      return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ดูค่าตั้งใบเสร็จ" };
    }
    const systemId = args && typeof args.systemId === "string" ? args.systemId : "";
    return await posReceiptSettings({ tenantId: auth.active.tenantId, systemId });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("read", e);
  }
}

/** แก้ค่าตั้งใบเสร็จ — pos.device.manage ระดับร้านที่นี่ + ครบทุกสาขาที่ผูก POS นี้ (F9 · ตรวจใน updatePosReceiptSettings) */
export async function updatePosReceiptSettingsAction(args: { systemId: string; patch: PosReceiptSettingsPatch }): Promise<PosReceiptSettingsResult> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    if (!can(m, "pos.device.manage")) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งค่าใบเสร็จ — ขอสิทธิ์จากเจ้าของร้าน" };
    const systemId = args && typeof args.systemId === "string" ? args.systemId : "";
    return await updatePosReceiptSettings(
      { tenantId: auth.active.tenantId, systemId },
      { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
      args?.patch ?? {},
    );
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("update", e);
  }
}
