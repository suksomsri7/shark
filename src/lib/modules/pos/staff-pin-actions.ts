"use server";
// staff-pin-actions.ts — server action ของ PIN พนักงาน / จอล็อก (POS P1.15 R1 R2 R8) · เปลือกบาง: session → ctx/actor → staff-pin.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ register-shared.ts
// 🔴 ร้าน (tenantId) + ผู้ใช้ของเครื่อง มาจาก SESSION เท่านั้น · systemId/unitId/deviceId จากคำขอถูกตรวจซ้ำใน staff-pin.ts
// 🔴 verify/list: เครื่องที่ล็อกอินอยู่ต้องเข้าสาขานี้และขายที่สาขานี้ได้ (ด่านเดียวกับหน้าขาย) — PIN คือการสลับ "คนขาย" บนเครื่องนั้น
// 🔴 issueStaffToken ไม่มี action (ออกโทเคนได้ทางเดียวคือใส่ PIN ถูก)
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { listStaffForDevice, setOwnStaffPin, setStaffPin, unlockStaffPin, verifyStaffPin, type StaffPinCtx } from "./staff-pin";
import type { ListStaffForDeviceResult, RegisterActor, RegisterRefusal, StaffPinOk, VerifyStaffPinOk } from "./register-shared";

type Target = { systemId: string; unitId: string; deviceId?: string };
type Session = Awaited<ReturnType<typeof requireTenant>>;

const refusal = (code: RegisterRefusal["code"], message: string): RegisterRefusal => ({ ok: false, code, message });

async function scoped(where: string, args: unknown): Promise<{ ctx: StaffPinCtx; actor: RegisterActor } | RegisterRefusal> {
  let auth: Session;
  try {
    auth = await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    console.error(`[pos/staff-pin-actions] ${where} requireTenant`, e);
    return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
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
  const deviceId = typeof a.deviceId === "string" ? a.deviceId : undefined;
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  };
}

function unexpected(where: string, e: unknown): RegisterRefusal {
  console.error(`[pos/staff-pin-actions] ${where}`, e);
  return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}

/** ตั้ง/เปลี่ยน PIN (ตัวเอง หรือผู้มี pos.staff.manage ตั้งให้คนในสาขา) */
export async function setStaffPinAction(args: Target & { userId: string; pin: string }): Promise<StaffPinOk | RegisterRefusal> {
  try {
    const s = await scoped("setStaffPinAction", args);
    if ("ok" in s) return s;
    return await setStaffPin(s.ctx, s.actor, { userId: typeof args?.userId === "string" ? args.userId : "", pin: args?.pin });
  } catch (e) {
    return unexpected("setStaffPinAction", e);
  }
}

/** POS P1.15U ▸ fix รอบ 1 F1: ตั้ง PIN ครั้งแรกของ "ผู้ใช้ session เอง" (จอล็อก) — ไม่รับ userId · มีแล้ว = ALREADY_SET ◂ */
export async function setOwnStaffPinAction(args: Target & { pin: string }): Promise<StaffPinOk | RegisterRefusal> {
  try {
    const s = await scoped("setOwnStaffPinAction", args);
    if ("ok" in s) return s;
    return await setOwnStaffPin(s.ctx, s.actor, { pin: args?.pin });
  } catch (e) {
    return unexpected("setOwnStaffPinAction", e);
  }
}

/** ใส่ PIN ที่เครื่อง → โทเคนผู้ขาย (userId = คนที่แตะในรายชื่อ ถ้ามี) */
export async function verifyStaffPinAction(args: Target & { deviceId: string; pin: string; userId?: string | null }): Promise<VerifyStaffPinOk | RegisterRefusal> {
  try {
    const s = await scoped("verifyStaffPinAction", args);
    if ("ok" in s) return s;
    return await verifyStaffPin(s.ctx, { unitId: s.ctx.unitId, deviceId: typeof args?.deviceId === "string" ? args.deviceId : "", pin: args?.pin, userId: typeof args?.userId === "string" ? args.userId : null });
  } catch (e) {
    return unexpected("verifyStaffPinAction", e);
  }
}

/** ปลดล็อก PIN ที่ถูกล็อก (pos.staff.manage) */
export async function unlockStaffPinAction(args: Target & { userId: string }): Promise<StaffPinOk | RegisterRefusal> {
  try {
    const s = await scoped("unlockStaffPinAction", args);
    if ("ok" in s) return s;
    return await unlockStaffPin(s.ctx, s.actor, { userId: typeof args?.userId === "string" ? args.userId : "" });
  } catch (e) {
    return unexpected("unlockStaffPinAction", e);
  }
}

/** รายชื่อพนักงานของสาขา (คอลัมน์ขวาของจอล็อก 13B) */
export async function listStaffForDeviceAction(args: Target): Promise<ListStaffForDeviceResult> {
  try {
    const s = await scoped("listStaffForDeviceAction", args);
    if ("ok" in s) return s;
    return await listStaffForDevice(s.ctx, { unitId: s.ctx.unitId });
  } catch (e) {
    return unexpected("listStaffForDeviceAction", e);
  }
}
