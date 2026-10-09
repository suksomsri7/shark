"use server";
// receipt-send-actions.ts — server action ส่งใบเสร็จ LINE/อีเมล (POS P1.11 · R7 · มติผู้คุมงาน 1 2 10) · เปลือกบาง: session → ctx/actor → receipt-send.sendReceipt
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ receipt-public-shared.ts / receipt-send.ts (import type)
// 🔴 ร้าน + ผู้ใช้มาจาก SESSION เท่านั้น · systemId/saleId ถูกตรวจซ้ำในบริการ (บิลนอกขอบเขตสาขา = SALE_NOT_FOUND) ·
//    สิทธิ์ pos.sale.read (pos.sale.create ได้โดยนัย) — ไม่มี = PERMISSION_DENIED (มติ 10)
// 🔴 ตัวส่ง LINE จริงมาจาก composition root `@/lib/pos-receipt-bridges` (โมดูล POS ไม่ import แชท · fitness F2) · อีเมลใช้ fetch จริง
// 🔴 จอแสดงคำปฏิเสธผ่าน receiptRefusalMessageKey(code) → pos.receipt.* — ไม่แสดง message ไทยของเซิร์ฟเวอร์

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { sendReceipt } from "./receipt-send";
import type { SendReceiptResult } from "./receipt-public-shared";

/** ด่านสิทธิ์ระดับร้าน: pos.sale.read หรือ pos.sale.create (assertCan · คืน boolean) — ขอบเขตสาขาตัดสินใน receipt-send.ts */
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

/** ส่งใบเสร็จของบิล — args = { systemId, saleId, via: "LINE"|"EMAIL", email? } */
export async function sendReceiptAction(args: { systemId: string; saleId: string; via: "LINE" | "EMAIL"; email?: string | null }): Promise<SendReceiptResult> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    if (!canRead(m)) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ดูบิล/ส่งใบเสร็จ — ขอสิทธิ์จากเจ้าของร้าน" };
    const { posReceiptLineSender } = await import("@/lib/pos-receipt-bridges");
    return await sendReceipt(
      { tenantId: auth.active.tenantId, systemId: typeof args?.systemId === "string" ? args.systemId : "" },
      { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
      {
        saleId: typeof args?.saleId === "string" ? args.saleId : "",
        via: args?.via,
        ...(args?.email !== undefined ? { email: args.email } : {}),
      },
      { deps: { line: posReceiptLineSender } },
    );
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/receipt-send-actions] sendReceiptAction", e instanceof Error ? e.name : "Error");
    return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}
