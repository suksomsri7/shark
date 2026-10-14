"use server";
// tip-ledger-actions.ts — POS P2.9U ▸ อ่านบัญชีของสมุดที่เชื่อมกับ POS นี้ ให้ตัวเลือกบัญชีพักทิป (มติ 6) — เปลือกบางแบบ posPaymentSettingsAction ◂
// 🔴 export ได้เฉพาะ async function · ชนิดข้อมูลอยู่ที่ tip-ledger-shared.ts · คำปฏิเสธคืนเป็นข้อมูล
// 🔴 สิทธิ์ = pos.settings.payment (ด่านเดียวกับ posPaymentSettingsAction) · ร้านจาก SESSION · ระบบ POS ต้องเป็นของร้านนี้
// 🔴 อ่านอย่างเดียว · ความถูกต้องของบัญชีที่เลือก (หนี้สิน · สมุดที่เชื่อม · ไม่เก็บ) ตัดสินที่ updatePosPaymentSettings (tipLedgerOk)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { prisma } from "./db";
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
    const tenantId = auth.active.tenantId;
    const systemId = typeof args?.systemId === "string" ? args.systemId : "";
    const pos = systemId ? await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } }) : null;
    if (!pos) return { ok: false, code: "NOT_FOUND", message: "ไม่พบจุดขายนี้" };
    // สมุดที่เชื่อมกับ POS นี้ (เงื่อนไขเดียวกับ payment-settings.tipLedgerOk)
    const link = await prisma.accountSystemLink.findFirst({ where: { tenantId, linkedKind: "POS", linkedId: pos.id, archivedAt: null, enabled: true }, select: { systemId: true } });
    if (!link) return { ok: true, linked: false, ledgers: [] };
    const rows = await prisma.accountLedger.findMany({
      where: { tenantId, systemId: link.systemId, archivedAt: null },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
      take: 500,
    });
    return { ok: true, linked: true, ledgers: rows.map((r) => ({ id: r.id, code: r.code, name: r.name, type: String(r.type) })) };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/tip-ledger-actions] posTipLedgersAction", e);
    return { ok: false, code: "UNKNOWN", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}
