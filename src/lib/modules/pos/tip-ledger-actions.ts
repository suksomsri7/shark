"use server";
// tip-ledger-actions.ts — POS P2.9U ▸ อ่านบัญชีของสมุดที่เชื่อมกับ POS นี้ ให้ตัวเลือกบัญชีพักทิป (มติ 6) — เปลือกบางแบบ posPaymentSettingsAction ◂
// 🔴 export ได้เฉพาะ async function · ชนิดข้อมูลอยู่ที่ tip-ledger-shared.ts · คำปฏิเสธคืนเป็นข้อมูล
// 🔴 สิทธิ์ = pos.settings.payment (ด่านเดียวกับ posPaymentSettingsAction) · ร้านจาก SESSION · ระบบ POS ต้องเป็นของร้านนี้
// 🔴 ไม่มี prisma ในไฟล์นี้ — ตัวอ่านอยู่ที่ tip-ledger.ts (fix1 L1) · อ่านอย่างเดียว · ความถูกต้องของบัญชีที่เลือก (หนี้สิน · สมุดที่เชื่อม · ไม่เก็บ) ตัดสินที่ updatePosPaymentSettings (tipLedgerOk)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { posTipLedgers } from "./tip-ledger";
import type { PosTipLedgersResult } from "./tip-ledger-shared";

export async function posTipLedgersAction(args: { systemId: string }): Promise<PosTipLedgersResult> {
  try {
    const auth = await requireTenant();
    const m = posMembership(auth.active);
    try {
      assertCan(m, { module: "pos", action: "pos.settings.payment" });
    } catch {
      return { ok: false, code: "PERMISSION_DENIED", message: "เฉพาะเจ้าของร้านเท่านั้นที่ตั้งค่าการชำระเงินได้" };
    }
    return await posTipLedgers({ tenantId: auth.active.tenantId, systemId: typeof args?.systemId === "string" ? args.systemId : "" });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/tip-ledger-actions] posTipLedgersAction", e);
    return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}
