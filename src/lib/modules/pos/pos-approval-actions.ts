"use server";
// pos-approval-actions.ts — จอรออนุมัติ 21B (POS P1.15U · มติผู้คุมงาน 5): อ่านสถานะคำขอ · ยกเลิกคำขอ (facade cancelRequest)
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดอยู่ที่ register-shared.ts · ร้านมาจาก SESSION · สาขา/ระบบตรวจกับ snapshot ของคำขอ
// 🔴 ด่าน: เข้าสาขาได้ + มีสิทธิ์ขาย/ยกเลิก/คืนเงินที่สาขานั้น (assertCan) · คำขอของสาขาอื่น = ไม่พบ (request null / NOT_FOUND)
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { cancelPosApprovalRequest, posApprovalView } from "./pos-approval";
import type { PosApprovalViewResult, RegisterRefusal } from "./register-shared";

type Target = { systemId: string; unitId: string };
const refuse = (code: RegisterRefusal["code"], message: string): RegisterRefusal => ({ ok: false, code, message });

async function scope(args: unknown): Promise<{ tenantId: string; systemId: string; unitId: string } | RegisterRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  const m = posMembership(auth.active);
  if (!systemId || !unitId || !canAccessUnit(m, unitId)) return refuse("NOT_FOUND", "ไม่พบสาขานี้");
  for (const action of ["pos.sale.create", "pos.sale.void", "pos.sale.refund"]) {
    try {
      assertCan(m, { module: "pos", action, unitId });
      return { tenantId: auth.active.tenantId, systemId, unitId };
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

/** ยกเลิกคำขอที่ยังรอ (ปุ่ม "ยกเลิกคำขอ" ของ 21B) — บิล/บิลพักคงเดิม */
export async function cancelPosApprovalAction(args: Target & { requestId: string }): Promise<{ ok: true } | RegisterRefusal> {
  try {
    const s = await scope(args);
    if ("ok" in s) return s;
    const requestId = typeof args?.requestId === "string" ? args.requestId : "";
    if (!requestId) return refuse("VALIDATION", "ไม่ระบุคำขอ");
    return (await cancelPosApprovalRequest(s, requestId)) ? { ok: true } : refuse("NOT_FOUND", "คำขอนี้ปิดไปแล้วหรือไม่ใช่ของสาขานี้");
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/pos-approval-actions] cancelPosApprovalAction", e);
    return refuse("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}
