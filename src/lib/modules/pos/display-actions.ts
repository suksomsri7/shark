"use server";
// display-actions.ts — server action จอลูกค้า (POS P2.10 · มติ 2 4 5) · เปลือกบาง: session → ctx/actor → display.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ display-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + ผู้ใช้มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำใน display.ts
//    เปิด/ยกเลิก/ค่าตั้ง/สถานะ = pos.device.manage (หน้าตั้งค่าเครื่อง) · publish = pos.sale.create (หน้าขาย)
// 🔴 การจับคู่ฝั่งจอ (pairCustomerDisplay) + การอ่าน (readCustomerDisplay) ไม่มี session — อยู่ที่ action ของหน้า src/app/(store)/d/

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { customerDisplayStatus, enableCustomerDisplay, publishDisplayState, revokeCustomerDisplay, updateCustomerDisplaySettings } from "./display";
import type {
  CustomerDisplayStatusResult,
  DisplayLocale,
  DisplayRefusal,
  DisplayState,
  EnableCustomerDisplayResult,
  PublishDisplayStateResult,
} from "./display-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Target = { systemId: string; unitId: string };

function refusal(code: DisplayRefusal["code"], message: string): DisplayRefusal {
  return { ok: false, code, message };
}
function unexpected(where: string, e: unknown): DisplayRefusal {
  console.error(`[pos/display-actions] ${where}`, e);
  return refusal("INTERNAL", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}

/** session → ขอบเขต + ผู้ใช้ · เข้าสาขาไม่ได้ = NOT_FOUND · ไม่มีสิทธิ์ = PERMISSION_DENIED (display.ts ตรวจซ้ำกับ DB) */
async function sessionScope(args: unknown, action: "pos.device.manage" | "pos.sale.create"): Promise<{ ctx: RegisterCtx; actor: RegisterActor } | DisplayRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  try {
    assertCan(m, { module: "pos", action, unitId });
  } catch {
    return refusal("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน");
  }
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** เปิดจอลูกค้าของเครื่อง (ออกรหัสจับคู่ใหม่ 10 นาที) */
export async function enableCustomerDisplayAction(args: Target & { deviceId: string }): Promise<EnableCustomerDisplayResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    return await enableCustomerDisplay(s.ctx, s.actor, { deviceId: str(args?.deviceId) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("enableCustomerDisplayAction", e);
  }
}

/** ยกเลิกการจับคู่จอของเครื่อง */
export async function revokeCustomerDisplayAction(args: Target & { deviceId: string }): Promise<CustomerDisplayStatusResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    return await revokeCustomerDisplay(s.ctx, s.actor, { deviceId: str(args?.deviceId) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("revokeCustomerDisplayAction", e);
  }
}

/** ค่าตั้งของจอ (แสดงแต้ม · ข้อความหน้าพัก · ภาษา) — ส่งเฉพาะฟิลด์ที่แก้ */
export async function updateCustomerDisplaySettingsAction(
  args: Target & { deviceId: string; showPoints?: boolean; idleText?: string | null; locale?: DisplayLocale | null },
): Promise<CustomerDisplayStatusResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    const patch: { deviceId: string; showPoints?: boolean; idleText?: string | null; locale?: DisplayLocale | null } = { deviceId: str(args?.deviceId) };
    if (args?.showPoints !== undefined) patch.showPoints = args.showPoints;
    if (args?.idleText !== undefined) patch.idleText = args.idleText;
    if (args?.locale !== undefined) patch.locale = args.locale;
    return await updateCustomerDisplaySettings(s.ctx, s.actor, patch);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("updateCustomerDisplaySettingsAction", e);
  }
}

/** สถานะจอของเครื่อง (จับคู่ · รหัสที่รอ · ออนไลน์ · ค่าตั้ง) */
export async function customerDisplayStatusAction(args: Target & { deviceId: string }): Promise<CustomerDisplayStatusResult> {
  try {
    const s = await sessionScope(args, "pos.device.manage");
    if ("ok" in s) return s;
    return await customerDisplayStatus(s.ctx, s.actor, { deviceId: str(args?.deviceId) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("customerDisplayStatusAction", e);
  }
}

/** หน้าขายส่งภาพบิลให้จอ — paired:false = เครื่องนี้ไม่มีจอที่จับคู่ (หน้าขายหยุดส่ง) */
export async function publishDisplayStateAction(args: Target & { deviceCode: string; seq: number; state: DisplayState }): Promise<PublishDisplayStateResult> {
  try {
    const s = await sessionScope(args, "pos.sale.create");
    if ("ok" in s) return s;
    return await publishDisplayState(s.ctx, s.actor, { deviceCode: str(args?.deviceCode), seq: args?.seq, state: args?.state });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("publishDisplayStateAction", e);
  }
}
