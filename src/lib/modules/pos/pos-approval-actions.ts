"use server";
// pos-approval-actions.ts — จอรออนุมัติ 21B (POS P1.15U · มติผู้คุมงาน 5): อ่านสถานะคำขอ · ยกเลิกคำขอ (facade cancelRequest)
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดอยู่ที่ register-shared.ts · ร้านมาจาก SESSION · สาขา/ระบบตรวจกับ snapshot ของคำขอ
// 🔴 ด่าน: เข้าสาขาได้ + มีสิทธิ์ขาย/ยกเลิก/คืนเงินที่สาขานั้น (assertCan) · คำขอของสาขาอื่น = ไม่พบ (request null / NOT_FOUND)
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { cancelPosApprovalRequest, posApprovalView } from "./pos-approval";
import { staffActorFromToken } from "./staff-pin";
import type { PosApprovalViewResult, RegisterRefusal } from "./register-shared";

type Target = { systemId: string; unitId: string };
const refuse = (code: RegisterRefusal["code"], message: string): RegisterRefusal => ({ ok: false, code, message });

type Actor = { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
async function scope(args: unknown): Promise<{ tenantId: string; systemId: string; unitId: string; actor: Actor } | RegisterRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  const m = posMembership(auth.active);
  if (!systemId || !unitId || !canAccessUnit(m, unitId)) return refuse("NOT_FOUND", "ไม่พบสาขานี้");
  for (const action of ["pos.sale.create", "pos.sale.void", "pos.sale.refund"]) {
    try {
      assertCan(m, { module: "pos", action, unitId });
      return { tenantId: auth.active.tenantId, systemId, unitId, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
    } catch {
      /* ลองคีย์ถัดไป */
    }
  }
  return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ที่สาขานี้");
}

/** สถานะคำขอ (requestId) หรือคำขอยกเลิก/คืนเงินที่ยังเปิดของบิล (saleId) — จอถามทุก 5 วินาที */
export async function posApprovalStatusAction(args: Target & { requestId?: string; saleId?: string }): Promise<PosApprovalViewResult> {
  try {
    const s = await scope(args);
    if ("ok" in s) return s;
    const requestId = typeof args?.requestId === "string" && args.requestId.length <= 200 ? args.requestId : null;
    const saleId = typeof args?.saleId === "string" && args.saleId.length <= 200 ? args.saleId : null;
    if (!requestId && !saleId) return refuse("VALIDATION", "ไม่ระบุคำขอ");
    return { ok: true, request: await posApprovalView(s, { requestId, saleId }) };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/pos-approval-actions] posApprovalStatusAction", e);
    return refuse("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}

/**
 * ยกเลิกคำขอที่ยังรอ (ปุ่ม "ยกเลิกคำขอ" / หมดอายุของ 21B) — บิล/บิลพักคงเดิม ·
 * fix รอบ 1 F7: staffToken (+ deviceId) = ผู้ยกเลิกคือคนในโทเคน (ผิด = STAFF_TOKEN_INVALID) · ไม่ใช่ผู้ขอและไม่มี pos.staff.manage = PERMISSION_DENIED
 */
export async function cancelPosApprovalAction(args: Target & { requestId: string; staffToken?: string | null; deviceId?: string }): Promise<{ ok: true } | RegisterRefusal> {
  try {
    const s = await scope(args);
    if ("ok" in s) return s;
    const requestId = typeof args?.requestId === "string" ? args.requestId : "";
    if (!requestId) return refuse("VALIDATION", "ไม่ระบุคำขอ");
    let actor: Actor = s.actor;
    if (typeof args?.staffToken === "string") {
      const ta = await staffActorFromToken({ tenantId: s.tenantId, unitId: s.unitId, deviceId: args.deviceId }, args.staffToken);
      if (!ta) return refuse("STAFF_TOKEN_INVALID", "การเข้าใช้งานของพนักงานบนเครื่องนี้หมดอายุหรือไม่ถูกต้อง — ใส่ PIN อีกครั้ง");
      actor = ta;
    }
    const r = await cancelPosApprovalRequest(s, requestId, actor);
    if (r === "PERMISSION_DENIED") return refuse("PERMISSION_DENIED", "ยกเลิกได้เฉพาะผู้ขอ หรือผู้จัดการ");
    return r === "OK" ? { ok: true } : refuse("NOT_FOUND", "คำขอนี้ปิดไปแล้วหรือไม่ใช่ของสาขานี้");
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/pos-approval-actions] cancelPosApprovalAction", e);
    return refuse("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}
