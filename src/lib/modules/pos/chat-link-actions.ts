"use server";
// chat-link-actions.ts — server actions ของ POS ↔ แชท (P3.7 S) · เปลือกบาง: session → ctx/actor → chat-link / composition root
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · ไม่ throw (ด่าน qc-pos-p1.6 R2) — ด่านสิทธิ์เป็น boolean (can) · ทุกตัวมี catch
// 🔴 ร้าน + บทบาท + สิทธิ์มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำในตัวเขียน/ผู้ประสาน
// 🔴 ส่งลิงก์ชำระในแชท = composition root (`@/lib/pos-chat-bridges` · โหลดตอนใช้ — POS ไม่ import แชท · แบบ receipt-send.ts)
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { posChatSettingsOf, setPosChatSettings, type PosChatSettingsResult } from "./chat-link";

async function session() {
  const auth = await requireTenant();
  const m = posMembership(auth.active);
  return { tenantId: auth.active.tenantId, m, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}
/** ด่านแรกระดับร้าน (boolean · แบบ settings-actions.gate) — ผ่านถ้ามีอย่างน้อยหนึ่งคีย์ · ด่านจริงต่อสาขาอยู่ในตัวเขียน/ผู้ประสาน */
function can(m: Awaited<ReturnType<typeof session>>["m"], actions: string[]): boolean {
  for (const action of actions) {
    try {
      assertCan(m, { module: "pos", action });
      return true;
    } catch {
      // ลองคีย์ถัดไป
    }
  }
  return false;
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const DENIED = { ok: false as const, code: "PERMISSION_DENIED" as const, message: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้" };
function unexpected(where: string, e: unknown) {
  console.error(`[pos/chat-link-actions] ${where}`, e instanceof Error ? e.name : "Error");
  return { ok: false as const, code: "UNKNOWN" as const, message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** อ่านค่าตั้งแชทของ POS (การ์ดแชท · ผู้มีสิทธิ์ตั้งค่า/ขาย อ่านได้ · เขียน = เจ้าของร้าน) */
export async function posChatSettingsAction(args: { systemId: string }): Promise<PosChatSettingsResult> {
  try {
    const s = await session();
    if (!can(s.m, ["pos.settings.manage", "pos.sale.create"])) return DENIED;
    const chat = await posChatSettingsOf({ tenantId: s.tenantId, systemId: str(args?.systemId) });
    return chat ? { ok: true, chat } : { ok: false, code: "NOT_FOUND", message: "ไม่พบจุดขายนี้" };
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("settings", e);
  }
}

/** R3 — ตั้งค่าแชท (เจ้าของร้านเท่านั้น · ตรวจในตัวเขียน) */
export async function setPosChatSettingsAction(args: { systemId: string; patch: unknown }): Promise<PosChatSettingsResult> {
  try {
    const s = await session();
    if (!can(s.m, ["pos.settings.manage"])) return DENIED; // ด่านแรก · เจ้าของร้านเท่านั้นตรวจในตัวเขียน (มติ 1)
    return await setPosChatSettings({ tenantId: s.tenantId, systemId: str(args?.systemId) }, s.actor, args?.patch);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("setSettings", e);
  }
}

/** R7 ประตู A — "ส่งลิงก์ชำระในแชท" (pos.sale.create ∧ pos.order.accept · ตรวจซ้ำต่อสาขาในผู้ประสาน) */
export async function requestChatPaymentAction(args: { systemId: string; unitId: string; deviceId?: string; orderId: string }) {
  try {
    const s = await session();
    if (!can(s.m, ["pos.order.accept"])) return DENIED;
    const ctx = { tenantId: s.tenantId, systemId: str(args?.systemId), unitId: str(args?.unitId), ...(args?.deviceId ? { deviceId: str(args.deviceId) } : {}) };
    const root = await import("@/lib/pos-chat-bridges");
    return await root.requestChatPayment(ctx, s.actor, { orderId: str(args?.orderId) });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("requestChatPayment", e);
  }
}
