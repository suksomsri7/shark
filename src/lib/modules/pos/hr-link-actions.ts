"use server";
// hr-link-actions.ts — server action ของ POS ↔ HR (POS P3.5 S · R9 R12) · เปลือกบาง: session → ctx/actor → hr-link / staff-commission
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ hr-link.ts / register-shared.ts
// 🔴 ร้าน (tenantId) + ผู้ใช้ของเครื่อง มาจาก SESSION เท่านั้น · systemId/unitId/deviceId/shiftId จากคำขอถูกตรวจซ้ำในตัวบริการ
// 🔴 ลงเวลา = ตัวเองเท่านั้น (คนในโทเคนผู้ขายของเครื่องนี้ — ไม่รับ userId) · ส่งค่าคอมฯ เข้างวดตอนนี้ = เจ้าของ/ผู้ดูเงินเดือน (มติ 7)
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit, canViewPayroll } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { cookieDeviceId } from "./device-request"; // POS P5.2 ▸ CD-P52-O4b ◂
import { posClockForShift, type PosClockResult } from "./hr-link";
import type { RegisterRefusal } from "./register-shared";

type Session = Awaited<ReturnType<typeof requireTenant>>;
const refusal = (code: RegisterRefusal["code"], message: string): RegisterRefusal => ({ ok: false, code, message });

async function session(where: string): Promise<Session | RegisterRefusal> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    console.error(`[pos/hr-link-actions] ${where} requireTenant`, e);
    return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}

/** R12 — ลงเวลาเข้า/ออกงานของคนในโทเคน หลังเปิด/ปิดกะ (เครื่องที่ล็อกอินต้องขายที่สาขานี้ได้ · ด่านเดียวกับหน้าขาย) */
export async function posClockAction(args: { systemId: string; unitId: string; deviceId: string; kind: "IN" | "OUT"; staffToken: string; shiftId: string }): Promise<PosClockResult> {
  const auth = await session("posClockAction");
  if ("ok" in auth) return auth;
  try {
    const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
    const systemId = typeof a.systemId === "string" ? a.systemId : "";
    const unitId = typeof a.unitId === "string" ? a.unitId : "";
    if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
    const m = posMembership(auth.active);
    if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
    try {
      assertCan(m, { module: "pos", action: "pos.sale.create", unitId });
    } catch {
      return refusal("PERMISSION_DENIED", "บัญชีของเครื่องนี้ยังไม่มีสิทธิ์ขายที่สาขานี้");
    }
    const deviceId = (await cookieDeviceId({ tenantId: auth.active.tenantId, unitId })) ?? ""; // POS P5.2 ▸ CD-P52-O4b: เครื่อง = คุกกี้ลงนามเท่านั้น (device-request.ts · strip) · deviceId ของ client ถูกทิ้ง ◂
    return await posClockForShift(
      { tenantId: auth.active.tenantId, systemId, unitId, deviceId },
      { kind: a.kind as "IN" | "OUT", deviceId, staffToken: typeof a.staffToken === "string" ? a.staffToken : "", shiftId: typeof a.shiftId === "string" ? a.shiftId : "" },
    );
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/hr-link-actions] posClockAction", e);
    return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}

/** R9 — ปุ่ม "ส่งเข้างวดเงินเดือนตอนนี้" (เจ้าของ/ผู้ดูเงินเดือน): ส่งแถว OPEN ของเดือนที่จบแล้วของร้านนี้ทันที (ไม่รอรอบรายชั่วโมง) */
export async function syncStaffCommissionNowAction(): Promise<{ ok: true; sent: number; adjustments: number; noEmployee: number } | RegisterRefusal> {
  const auth = await session("syncStaffCommissionNowAction");
  if ("ok" in auth) return auth;
  try {
    const m = posMembership(auth.active);
    if (!canViewPayroll(m)) return refusal("PERMISSION_DENIED", "เฉพาะเจ้าของร้านหรือผู้ดูเงินเดือน");
    const { syncStaffCommissionToPayroll } = await import("./staff-commission");
    const r = await syncStaffCommissionToPayroll({ tenantId: auth.active.tenantId, now: new Date(), deadline: Date.now() + 20_000 });
    return { ok: true, sent: r.sentRows, adjustments: r.adjustments, noEmployee: r.noEmployee };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/hr-link-actions] syncStaffCommissionNowAction", e);
    return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}
