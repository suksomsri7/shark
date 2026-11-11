"use server";
// refund-tender-actions.ts — POS P2.9U ▸ server action ของตัวเลือกคืนเงินเข้าบัตร/เครดิตร้าน (จอ 12 · มติ 8) — เปลือกบางแบบ saleForRefundAction ◂
// 🔴 export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ refund-tenders-shared.ts · คำปฏิเสธคืนเป็นข้อมูล
// 🔴 ร้าน/ผู้ใช้จาก SESSION · สาขาที่เข้าไม่ได้ = SALE_NOT_FOUND · ด่านแรก pos.sale.refund|pos.sale.create ที่สาขา (เหมือน saleForRefundAction) —
//    refund-tenders.ts เรียก saleForRefund ซึ่งตรวจขอบเขต/สิทธิ์จาก DB ซ้ำ

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { refundTenderOptions } from "./refund-tenders";
import type { RefundTenderOptionsResult } from "./refund-tenders-shared";

export async function refundTenderOptionsAction(args: { systemId: string; unitId: string; saleId: string }): Promise<RefundTenderOptionsResult> {
  try {
    const auth = await requireTenant();
    const systemId = typeof args?.systemId === "string" ? args.systemId : "";
    const unitId = typeof args?.unitId === "string" ? args.unitId : "";
    const m = posMembership(auth.active);
    if (!systemId || !unitId || !canAccessUnit(m, unitId)) return { ok: false, code: "SALE_NOT_FOUND", message: "ไม่พบบิลนี้ในสาขานี้" };
    const allowed = ["pos.sale.refund", "pos.sale.create"].some((action) => {
      try {
        assertCan(m, { module: "pos", action, unitId });
        return true;
      } catch {
        return false;
      }
    });
    if (!allowed) return { ok: false, code: "NO_PERMISSION", message: "บัญชีนี้ยังไม่มีสิทธิ์คืนเงิน — ขอให้เจ้าของร้านหรือผู้จัดการทำรายการ" };
    return await refundTenderOptions(
      { tenantId: auth.active.tenantId, systemId, unitId },
      { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
      { saleId: typeof args?.saleId === "string" ? args.saleId : "" },
    );
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/refund-tender-actions] refundTenderOptionsAction", e);
    return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}
