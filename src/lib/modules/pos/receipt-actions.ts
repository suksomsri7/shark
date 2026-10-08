"use server";
// receipt-actions.ts — server action ข้อมูลใบเสร็จ (POS P1.10 · มติ R5) · เปลือกบาง: session → ctx/actor → receipt.receiptPayload
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ receipt.ts / receipt-render.ts (import type)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ร้าน + ผู้ใช้มาจาก SESSION เท่านั้น · systemId/saleId ถูกตรวจซ้ำใน receipt.ts
//    (บิลนอกขอบเขตสาขาของผู้ใช้ = SALE_NOT_FOUND) · สิทธิ์ pos.sale.read (pos.sale.create ได้โดยนัย · มติ CD3)
// 🔴 พิมพ์ซ้ำ (reprintReceiptAction) = copy:true ⇒ ประทับ "สำเนา" + AuditLog pos.receipt.reprint ทุกครั้งที่เรียก
// 🔴 จอแสดงคำปฏิเสธผ่าน receiptRefusalMessageKey(code) (receipt-render.ts) → pos.receipt.errors.* — ไม่แสดง message ไทยของเซิร์ฟเวอร์

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { receiptPayload, type ReceiptPayloadResult } from "./receipt";

/** ด่านสิทธิ์ระดับร้าน: pos.sale.read หรือ pos.sale.create (assertCan · คืน boolean) — ขอบเขตสาขาตัดสินใน receipt.ts */
function canRead(m: MembershipCtx): boolean {
  for (const action of ["pos.sale.read", "pos.sale.create"]) {
    try {
      assertCan(m, { module: "pos", action });
      return true;
    } catch {
      /* ลองสิทธิ์ถัดไป */
    }
  }
  return false;
}

function unexpected(where: string, e: unknown): ReceiptPayloadResult {
  console.error(`[pos/receipt-actions] ${where}`, e);
  return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}

/** ข้อมูลใบเสร็จต้นฉบับ (หลังขาย · พรีวิว) — ไม่เขียน audit · บิลเก่ากว่า 30 นาที บริการยกเป็นสำเนา + audit เอง (F3) */
export async function receiptPayloadAction(args: { systemId: string; saleId: string }): Promise<ReceiptPayloadResult> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    if (!canRead(m)) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ดูบิล/พิมพ์ใบเสร็จ — ขอสิทธิ์จากเจ้าของร้าน" };
    return await receiptPayload(
      { tenantId: auth.active.tenantId, systemId: typeof args?.systemId === "string" ? args.systemId : "" },
      { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
      { saleId: typeof args?.saleId === "string" ? args.saleId : "", copy: false },
    );
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("receiptPayloadAction", e);
  }
}

/** พิมพ์สำเนาใบเสร็จ — copy:true ⇒ "สำเนา" + AuditLog pos.receipt.reprint */
export async function reprintReceiptAction(args: { systemId: string; saleId: string }): Promise<ReceiptPayloadResult> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    if (!canRead(m)) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ดูบิล/พิมพ์ใบเสร็จ — ขอสิทธิ์จากเจ้าของร้าน" };
    return await receiptPayload(
      { tenantId: auth.active.tenantId, systemId: typeof args?.systemId === "string" ? args.systemId : "" },
      { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
      { saleId: typeof args?.saleId === "string" ? args.saleId : "", copy: true },
    );
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("reprintReceiptAction", e);
  }
}
